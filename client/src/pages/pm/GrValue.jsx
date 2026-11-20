import { useRef, useState } from 'react'
import api from '@/lib/api'
import { useLang } from '@/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import { Upload, Download, Loader2, AlertCircle, AlertTriangle, FileSpreadsheet, RefreshCw, Receipt, CheckCircle2 } from 'lucide-react'

const REPORT_CURRENCY = 'USD' // matches server/services/grValue.js

function downloadBase64(base64, filename) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const fmt = (n, dp = 2) => (n == null ? '' : Number(n).toLocaleString('en-SG', { minimumFractionDigits: dp, maximumFractionDigits: dp }))

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
        <Upload size={15} /> {file ? t('gr.change') : t('gr.upload')}
      </button>
    </div>
  )
}

export default function GrValue() {
  const { t } = useLang()
  const [receipts, setReceipts] = useState(null)
  const [poLines, setPoLines] = useState(null)
  const [rates, setRates] = useState({}) // currency → text typed by the user
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function run(rec = receipts, po = poLines, rateText = rates, recalc = false) {
    if (!rec || !po) return
    setLoading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('receipts', rec)
      form.append('poLines', po)
      const numeric = Object.fromEntries(Object.entries(rateText).map(([c, v]) => [c, Number(v)]).filter(([, v]) => v > 0))
      form.append('rates', JSON.stringify(numeric))
      if (recalc) form.append('recalc', '1') // rate change only — not logged as a new report
      const { data } = await api.post('/gr-value/process', form)
      setResult(data)
    } catch (err) {
      setResult(null)
      setError(err.response?.data?.error || t('gr.failed'))
    } finally {
      setLoading(false)
    }
  }

  const pickReceipts = f => { setReceipts(f); run(f, poLines) }
  const pickPoLines = f => { setPoLines(f); run(receipts, f) }

  const foreign = result ? result.currencies.filter(c => c !== REPORT_CURRENCY) : []
  const c = result?.counts

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-400 max-w-4xl">{t('gr.intro')}</p>

      <div className="grid md:grid-cols-2 gap-4">
        <FilePick step={t('gr.step1')} label={t('gr.receipts')} hint={t('gr.receiptsHint')} file={receipts} onPick={pickReceipts} />
        <FilePick step={t('gr.step2')} label={t('gr.poLines')} hint={t('gr.poLinesHint')} file={poLines} onPick={pickPoLines} />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {loading && !result && (
        <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 size={16} className="animate-spin" /> {t('gr.processing')}</div>
      )}

      {!result && !error && !loading && (
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-12 text-center">
          <Receipt size={36} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400">{t('gr.empty')}</p>
        </div>
      )}

      {result && (
        <>
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Exchange rates */}
            <div className="bg-navy-900 border border-navy-700 rounded-xl p-5 lg:col-span-2">
              <h3 className="font-semibold text-slate-100">{t('gr.rates')}</h3>
              <p className="text-xs text-slate-400 mt-1 mb-4">{t('gr.ratesHint', { cur: REPORT_CURRENCY })}</p>
              {foreign.length === 0 ? (
                <p className="text-sm text-slate-400">{t('gr.noRatesNeeded', { cur: REPORT_CURRENCY })}</p>
              ) : (
                <form className="flex flex-wrap items-end gap-4" onSubmit={e => { e.preventDefault(); run(receipts, poLines, rates, true) }}>
                  {foreign.map(cur => (
                    <label key={cur} className="text-sm text-slate-300">
                      <span className="block text-xs text-slate-500 mb-1">1 {REPORT_CURRENCY} =</span>
                      <span className="flex items-center gap-2">
                        <input type="number" step="any" min="0" value={rates[cur] ?? ''} placeholder="0.0000"
                          onChange={e => setRates(r => ({ ...r, [cur]: e.target.value }))}
                          className={cn('w-32 bg-navy-800 border rounded-lg px-3 py-2 font-mono text-slate-100 focus:outline-none focus:border-electric-500',
                            result.missingRates.includes(cur) ? 'border-amber-500/60' : 'border-navy-600')} />
                        <span className="font-mono">{cur}</span>
                      </span>
                    </label>
                  ))}
                  <button type="submit" disabled={loading}
                    className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} {t('gr.calculate')}
                  </button>
                </form>
              )}
            </div>

            {/* Total */}
            <div className="bg-navy-900 border border-navy-700 rounded-xl p-5 flex flex-col justify-between gap-4">
              <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{t('gr.total', { cur: REPORT_CURRENCY })}</p>
                <p className="text-3xl font-bold text-slate-100 font-mono mt-1">{fmt(result.totalUsd)}</p>
                <p className="text-xs text-slate-500 mt-1">{t('gr.pricedOf', { priced: c.priced, lines: c.lines })}</p>
              </div>
              <button onClick={() => downloadBase64(result.fileBase64, result.filename)}
                className="flex items-center justify-center gap-2 bg-electric-500 hover:bg-electric-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <Download size={16} /> {t('gr.download')}
              </button>
            </div>
          </div>

          {result.missingRates.length > 0 && (
            <p className="text-sm text-amber-300 flex items-center gap-2">
              <AlertTriangle size={15} /> {t('gr.missingRates', { list: result.missingRates.join(', '), n: c.noRate, cur: REPORT_CURRENCY })}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {Object.entries(result.byCurrency).map(([cur, v]) => (
              <span key={cur} className="px-2.5 py-1 rounded-full bg-navy-700 text-slate-300 font-mono">
                {cur} {fmt(v.value)} → {REPORT_CURRENCY} {v.usd ? fmt(v.usd) : '—'}
              </span>
            ))}
            {c.noMatch > 0 && <span className="px-2.5 py-1 rounded-full bg-red-500/15 text-red-300">{t('gr.noMatch', { n: c.noMatch })}</span>}
            {c.unitConverted > 0 && <span className="px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-300">{t('gr.unitConverted', { n: c.unitConverted })}</span>}
            {c.unitMismatch > 0 && <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300">{t('gr.unitMismatch', { n: c.unitMismatch })}</span>}
          </div>

          <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-800 border-b border-navy-700">
                  {[...result.header, t('gr.colCurrency'), t('gr.colPoPrice'), t('gr.colPoUnit'), t('gr.colUnitPrice'),
                    t('gr.colValue'), t('gr.colRate'), t('gr.colUsd', { cur: REPORT_CURRENCY }), t('gr.colRemarks')].map((h, i) => (
                    <th key={i} className="text-left px-3 py-3 text-slate-400 font-medium text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={i} className={cn(i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50', r.flags.length > 0 && r.usd == null && 'bg-amber-500/5')}>
                    {r.cells.map((cell, j) => <td key={j} className="px-3 py-2.5 whitespace-nowrap text-slate-300">{cell}</td>)}
                    <td className="px-3 py-2.5 font-mono text-slate-300">{r.currency}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-300 text-right">{fmt(r.poPrice, 4)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-400">{r.poUom}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-300 text-right">{fmt(r.unitPrice, 4)}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-200 text-right">{fmt(r.value)}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-400 text-right">{r.rate ? fmt(r.rate, 4) : ''}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-100 font-semibold text-right">{fmt(r.usd)}</td>
                    <td className={cn('px-3 py-2.5 whitespace-nowrap text-xs', r.usd == null ? 'text-amber-300' : 'text-sky-300')}>{r.flags.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
