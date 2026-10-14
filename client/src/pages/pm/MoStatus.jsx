import { useRef, useState } from 'react'
import api from '@/lib/api'
import { useLang } from '@/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import { Upload, Download, Loader2, AlertCircle, AlertTriangle, ClipboardList } from 'lucide-react'

// Badge colour per MO status, in priority order (matches server/services/moStatus.js).
const STATUS_STYLES = {
  'in progress': 'bg-electric-500/20 text-electric-300',
  ready: 'bg-emerald-500/15 text-emerald-300',
  'waiting for components': 'bg-amber-500/15 text-amber-300',
  'waiting for another wo': 'bg-purple-500/15 text-purple-300',
  'waiting for another mo': 'bg-purple-500/15 text-purple-300',
  finished: 'bg-navy-700 text-slate-400',
}
const statusStyle = s => STATUS_STYLES[String(s).trim().toLowerCase()] || 'bg-navy-700 text-slate-300'

function downloadBase64(base64, filename) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function MoStatus() {
  const { t } = useLang()
  const fileRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-imported
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post('/mo-status/process', form)
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || t('mo.failed'))
    } finally {
      setLoading(false)
    }
  }

  const statusCol = result ? result.header.length - 1 : 0

  return (
    <div className="space-y-5">
      <div className="bg-navy-900 border border-navy-700 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-slate-400 max-w-3xl">{t('mo.intro')}</p>
        <div className="flex items-center gap-3 shrink-0">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={loading}
            className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {loading ? t('mo.importing') : result ? t('mo.importAnother') : t('mo.import')}
          </button>
          {result && (
            <button onClick={() => downloadBase64(result.fileBase64, result.filename)}
              className="flex items-center gap-2 bg-navy-700 hover:bg-navy-600 text-slate-100 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Download size={16} /> {t('mo.download')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {!result && !error && (
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-12 text-center">
          <ClipboardList size={36} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400">{t('mo.empty')}</p>
        </div>
      )}

      {result && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-300 mr-2">
              {t('mo.summary', { lines: result.workOrderLines, mos: result.rows.length })}
            </span>
            {Object.entries(result.counts).map(([status, n]) => (
              <span key={status} className={cn('text-xs px-2.5 py-1 rounded-full', statusStyle(status))}>
                {status === 'No status' ? t('mo.noStatus') : status} · {n}
              </span>
            ))}
          </div>

          {result.unknownStatuses.length > 0 && (
            <p className="text-xs text-amber-400 flex items-center gap-1.5">
              <AlertTriangle size={12} /> {t('mo.unknown', { list: result.unknownStatuses.join(', ') })}
            </p>
          )}

          <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-800 border-b border-navy-700">
                  {result.header.map((h, i) => (
                    <th key={i} className="text-left px-3 py-3 text-slate-400 font-medium text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, r) => (
                  <tr key={r} className={r % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50'}>
                    {row.map((cell, c) => (
                      <td key={c} className={cn('px-3 py-2.5 whitespace-nowrap', c === 0 ? 'text-slate-100 font-mono' : 'text-slate-300')}>
                        {c === statusCol
                          ? <span className={cn('text-xs px-2 py-0.5 rounded-full', statusStyle(cell))}>{cell || t('mo.noStatus')}</span>
                          : String(cell ?? '')}
                      </td>
                    ))}
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
