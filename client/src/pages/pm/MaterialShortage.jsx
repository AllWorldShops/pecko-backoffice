import { Fragment, useDeferredValue, useMemo, useRef, useState } from 'react'
import api from '@/lib/api'
import { useLang } from '@/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import {
  Upload, Download, Loader2, AlertCircle, AlertTriangle, FileSpreadsheet, CheckCircle2, PackageX,
  ChevronRight, ChevronDown, ChevronLeft, Search,
} from 'lucide-react'

const PAGE_SIZE = 50
const qty = n => (n == null || n === '' ? '' : Number(n).toLocaleString('en-SG', { maximumFractionDigits: 4 }))
const shortageOf = (demand, reserved) => Math.max(0, Math.round((demand - reserved) * 10000) / 10000)

// Server sends a compact payload (see compactReport in server/services/materialShortage.js).
function expand(data) {
  const comp = i => data.components[i]
  const mos = data.mos.map(([mo, state, source, customerPo, product, custPart, description, qtyToProduce, status, shortLines, lines]) => ({
    mo, state, source, customerPo, product, custPart, description, qty: qtyToProduce, status, shortLines,
    lines: lines.map(([c, r, position, demand, reserved]) => {
      const [part, lineCustPart, lineDescription, uom] = comp(c)
      return { reference: data.refs[r], position, part, custPart: lineCustPart, description: lineDescription, uom, demand, reserved, shortage: shortageOf(demand, reserved) }
    }),
  }))
  const parts = data.shortParts.map(([c, demand, reserved, shortage, moCount]) => {
    const [part, custPart, description, uom] = comp(c)
    return { part, custPart, description, uom, demand, reserved, shortage, moCount }
  })
  return { mos, parts, counts: data.counts, unknownMos: data.unknownMos }
}

function FilePick({ step, label, hint, file, onPick }) {
  const { t } = useLang()
  const ref = useRef(null)
  return (
    <div className="bg-navy-900 border border-navy-700 rounded-xl p-5 flex items-center gap-4">
      <div className={cn('w-11 h-11 rounded-lg flex items-center justify-center shrink-0', file ? 'bg-emerald-500/15 text-emerald-300' : 'bg-navy-700 text-slate-400')}>
        {file ? <CheckCircle2 size={20} /> : <FileSpreadsheet size={20} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{step}</p>
        <p className="text-slate-100 font-medium">{label}</p>
        <p className="text-xs text-slate-400 truncate" title={file?.name}>{file ? file.name : hint}</p>
      </div>
      <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f) }} />
      <button onClick={() => ref.current?.click()}
        className="flex items-center gap-2 bg-navy-700 hover:bg-navy-600 text-slate-100 px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0">
        <Upload size={15} /> {file ? t('ms.change') : t('ms.upload')}
      </button>
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div className="bg-navy-900 border border-navy-700 rounded-xl p-4">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className={cn('text-2xl font-bold font-mono mt-1', tone || 'text-slate-100')}>{value.toLocaleString('en-SG')}</p>
    </div>
  )
}

function Pager({ page, pages, total, onPage }) {
  const { t } = useLang()
  if (pages <= 1) return <p className="text-xs text-slate-500 px-4 py-3">{t('ms.rows', { n: total.toLocaleString('en-SG') })}</p>
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-navy-700 text-xs text-slate-400">
      <span>{t('ms.rows', { n: total.toLocaleString('en-SG') })}</span>
      <div className="flex items-center gap-2">
        <button disabled={page === 0} onClick={() => onPage(page - 1)} className="p-1 rounded hover:bg-navy-700 disabled:opacity-30"><ChevronLeft size={16} /></button>
        <span className="font-mono">{t('ms.page', { page: page + 1, pages })}</span>
        <button disabled={page >= pages - 1} onClick={() => onPage(page + 1)} className="p-1 rounded hover:bg-navy-700 disabled:opacity-30"><ChevronRight size={16} /></button>
      </div>
    </div>
  )
}

const STATUS_STYLE = {
  short: 'bg-red-500/15 text-red-300',
  reserved: 'bg-emerald-500/15 text-emerald-300',
  'no-lines': 'bg-amber-500/15 text-amber-300',
}

export default function MaterialShortage() {
  const { t } = useLang()
  const [moFile, setMoFile] = useState(null)
  const [transferFile, setTransferFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const [tab, setTab] = useState('mos')
  const [status, setStatus] = useState('all')
  const [shortOnly, setShortOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState(() => new Set())
  const query = useDeferredValue(search.trim().toLowerCase())

  function formOf(mo, transfer) {
    const form = new FormData()
    form.append('mo', mo)
    form.append('transfer', transfer)
    return form
  }

  async function run(mo = moFile, transfer = transferFile) {
    if (!mo || !transfer) return
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/material-shortage/process', formOf(mo, transfer))
      setResult(expand(data))
      setPage(0)
      setOpen(new Set())
    } catch (err) {
      setResult(null)
      setError(err.response?.data?.error || t('ms.failed'))
    } finally {
      setLoading(false)
    }
  }

  async function download() {
    setDownloading(true)
    setError('')
    try {
      const res = await api.post('/material-shortage/download', formOf(moFile, transferFile), { responseType: 'blob' })
      const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] || '')?.[1] || 'material-shortage.xlsx'
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      // error bodies arrive as a Blob because of responseType: 'blob'
      let message = t('ms.failed')
      try { message = JSON.parse(await err.response.data.text()).error || message } catch { /* keep default */ }
      setError(message)
    } finally {
      setDownloading(false)
    }
  }

  const pickMo = f => { setMoFile(f); run(f, transferFile) }
  const pickTransfer = f => { setTransferFile(f); run(moFile, f) }

  const filteredMos = useMemo(() => {
    if (!result) return []
    return result.mos.filter(m => {
      if (status !== 'all' && m.status !== status) return false
      if (!query) return true
      return [m.mo, m.product, m.custPart, m.description].some(v => v.toLowerCase().includes(query))
        || m.lines.some(l => l.part.toLowerCase().includes(query) || l.custPart.toLowerCase().includes(query))
    })
  }, [result, status, query])

  const filteredParts = useMemo(() => {
    if (!result) return []
    if (!query) return result.parts
    return result.parts.filter(p => [p.part, p.custPart, p.description].some(v => v.toLowerCase().includes(query)))
  }, [result, query])

  const list = tab === 'mos' ? filteredMos : filteredParts
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const pageRows = list.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  const toggle = mo => setOpen(s => { const n = new Set(s); n.has(mo) ? n.delete(mo) : n.add(mo); return n })
  const setFilter = fn => v => { fn(v); setPage(0) }
  const c = result?.counts

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-400 max-w-4xl">{t('ms.intro')}</p>

      <div className="grid md:grid-cols-2 gap-4">
        <FilePick step={t('ms.step1')} label={t('ms.moFile')} hint={t('ms.moHint')} file={moFile} onPick={pickMo} />
        <FilePick step={t('ms.step2')} label={t('ms.transferFile')} hint={t('ms.transferHint')} file={transferFile} onPick={pickTransfer} />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 size={16} className="animate-spin" /> {t('ms.processing')}</div>
      )}

      {!result && !error && !loading && (
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-12 text-center">
          <PackageX size={36} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400">{t('ms.empty')}</p>
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Stat label={t('ms.statMos')} value={c.mos} />
            <Stat label={t('ms.statShortMos')} value={c.shortMos} tone="text-red-300" />
            <Stat label={t('ms.statReserved')} value={c.reservedMos} tone="text-emerald-300" />
            <Stat label={t('ms.statNoLines')} value={c.noLinesMos} tone="text-amber-300" />
            <Stat label={t('ms.statShortLines')} value={c.shortLines} tone="text-red-300" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {result.unknownMos > 0 ? (
              <p className="text-xs text-slate-500 flex items-center gap-1.5"><AlertTriangle size={13} /> {t('ms.unknownMos', { n: result.unknownMos.toLocaleString('en-SG') })}</p>
            ) : <span />}
            <button onClick={download} disabled={downloading}
              className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {downloading ? t('ms.building') : t('ms.download')}
            </button>
          </div>

          <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-navy-700">
              <div className="flex rounded-lg bg-navy-800 p-0.5 text-sm">
                {[['mos', t('ms.tabMos')], ['parts', t('ms.tabParts', { n: result.parts.length.toLocaleString('en-SG') })]].map(([k, label]) => (
                  <button key={k} onClick={() => { setTab(k); setPage(0) }}
                    className={cn('px-3 py-1.5 rounded-md transition-colors', tab === k ? 'bg-navy-600 text-slate-100' : 'text-slate-400 hover:text-slate-200')}>{label}</button>
                ))}
              </div>
              {tab === 'mos' && (
                <>
                  <select value={status} onChange={e => setFilter(setStatus)(e.target.value)}
                    className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-electric-500">
                    <option value="all">{t('ms.filterAll')}</option>
                    <option value="short">{t('ms.statusShort')}</option>
                    <option value="reserved">{t('ms.statusReserved')}</option>
                    <option value="no-lines">{t('ms.statusNoLines')}</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={shortOnly} onChange={e => setShortOnly(e.target.checked)} className="accent-electric-500" />
                    {t('ms.shortLinesOnly')}
                  </label>
                </>
              )}
              <div className="relative ml-auto">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={search} onChange={e => setFilter(setSearch)(e.target.value)} placeholder={tab === 'mos' ? t('ms.searchMos') : t('ms.searchParts')}
                  className="w-72 bg-navy-800 border border-navy-600 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-electric-500" />
              </div>
            </div>

            <div className="overflow-x-auto">
              {tab === 'mos' ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-navy-800 border-b border-navy-700">
                      {['', t('ms.colMo'), t('ms.colState'), t('ms.colProduct'), t('ms.colCustPart'), t('ms.colDescription'), t('ms.colQty'), t('ms.colLines'), t('ms.colShortLines'), t('ms.colStatus')].map((h, i) => (
                        <th key={i} className="text-left px-3 py-3 text-slate-400 font-medium text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((m, i) => {
                      const isOpen = open.has(m.mo)
                      const lines = shortOnly ? m.lines.filter(l => l.shortage > 0) : m.lines
                      return (
                        <Fragment key={m.mo}>
                          <tr onClick={() => m.lines.length && toggle(m.mo)}
                            className={cn(i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50', m.lines.length && 'cursor-pointer hover:bg-navy-700/50')}>
                            <td className="pl-3 text-slate-500 w-6">{m.lines.length > 0 && (isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />)}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-100 whitespace-nowrap">{m.mo}</td>
                            <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{m.state}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-200 whitespace-nowrap">{m.product}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-300 whitespace-nowrap">{m.custPart}</td>
                            <td className="px-3 py-2.5 text-slate-400 max-w-xs truncate" title={m.description}>{m.description}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-300 text-right">{qty(m.qty)}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-300 text-right">{m.lines.length}</td>
                            <td className={cn('px-3 py-2.5 font-mono text-right', m.shortLines ? 'text-red-300 font-semibold' : 'text-slate-500')}>{m.shortLines}</td>
                            <td className="px-3 py-2.5">
                              <span className={cn('text-xs px-2 py-0.5 rounded-full whitespace-nowrap', STATUS_STYLE[m.status])}>
                                {m.status === 'short' ? t('ms.statusShortN', { n: m.shortLines }) : m.status === 'reserved' ? t('ms.statusReserved') : t('ms.statusNoLines')}
                              </span>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-navy-950/60">
                              <td />
                              <td colSpan={9} className="px-3 py-3">
                                {lines.length === 0 ? <p className="text-xs text-slate-500">{t('ms.noShortLines')}</p> : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-slate-500 uppercase tracking-wide">
                                        {[t('ms.colTransfer'), t('ms.colLine'), t('ms.colComponent'), t('ms.colCustPart'), t('ms.colDescription'), t('ms.colUom'), t('ms.colDemand'), t('ms.colReserved'), t('ms.colShortage')].map((h, j) => (
                                          <th key={j} className={cn('px-2 py-1.5 font-medium whitespace-nowrap', j >= 6 ? 'text-right' : 'text-left')}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lines.map((l, j) => (
                                        <tr key={j} className={cn('border-t border-navy-800', l.shortage > 0 && 'bg-red-500/5')}>
                                          <td className="px-2 py-1.5 font-mono text-slate-400 whitespace-nowrap">{l.reference}</td>
                                          <td className="px-2 py-1.5 font-mono text-slate-500">{l.position}</td>
                                          <td className="px-2 py-1.5 font-mono text-slate-200 whitespace-nowrap">{l.part}</td>
                                          <td className="px-2 py-1.5 font-mono text-slate-300 whitespace-nowrap">{l.custPart}</td>
                                          <td className="px-2 py-1.5 text-slate-400 max-w-xs truncate" title={l.description}>{l.description}</td>
                                          <td className="px-2 py-1.5 text-slate-500">{l.uom}</td>
                                          <td className="px-2 py-1.5 font-mono text-slate-300 text-right">{qty(l.demand)}</td>
                                          <td className="px-2 py-1.5 font-mono text-slate-300 text-right">{qty(l.reserved)}</td>
                                          <td className={cn('px-2 py-1.5 font-mono text-right', l.shortage > 0 ? 'text-red-300 font-semibold' : 'text-slate-500')}>{qty(l.shortage)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-navy-800 border-b border-navy-700">
                      {[t('ms.colComponent'), t('ms.colCustPart'), t('ms.colDescription'), t('ms.colUom'), t('ms.colTotalDemand'), t('ms.colTotalReserved'), t('ms.colTotalShortage'), t('ms.colMosShort')].map((h, i) => (
                        <th key={i} className={cn('px-3 py-3 text-slate-400 font-medium text-xs uppercase tracking-wide whitespace-nowrap', i >= 4 ? 'text-right' : 'text-left')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((p, i) => (
                      <tr key={p.part} className={i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50'}>
                        <td className="px-3 py-2.5 font-mono text-slate-100 whitespace-nowrap">{p.part}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-300 whitespace-nowrap">{p.custPart}</td>
                        <td className="px-3 py-2.5 text-slate-400 max-w-xs truncate" title={p.description}>{p.description}</td>
                        <td className="px-3 py-2.5 text-slate-500">{p.uom}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-300 text-right">{qty(p.demand)}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-300 text-right">{qty(p.reserved)}</td>
                        <td className="px-3 py-2.5 font-mono text-red-300 font-semibold text-right">{qty(p.shortage)}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-200 text-right">{p.moCount.toLocaleString('en-SG')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {pageRows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">{t('ms.noMatches')}</p>}
            </div>
            <Pager page={current} pages={pages} total={list.length} onPage={setPage} />
          </div>
        </>
      )}
    </div>
  )
}
