import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useLang } from '@/i18n/LanguageContext'
import { FileSpreadsheet, Users, Activity, UserCheck, PackageX, AlertCircle } from 'lucide-react'

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-navy-900 border border-navy-700 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${color}`}><Icon size={20} /></div>
      <div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-100 font-mono mt-0.5">{value ?? '—'}</p>
      </div>
    </div>
  )
}

function Table({ title, headers, empty, children, right }) {
  return (
    <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b border-navy-700">
        <h3 className="font-semibold text-slate-100">{title}</h3>
        {right}
      </div>
      {empty ? (
        <div className="p-12 text-center">
          <PackageX size={36} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400">{empty}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-800 border-b border-navy-700">
                {headers.map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function MaterialShortageDashboard() {
  const { t, lang } = useLang()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/material-shortage/stats').then(res => setStats(res.data)).finally(() => setLoading(false))
  }, [])

  const locale = lang === 'zh' ? 'zh-CN' : 'en-SG'
  const fmt = d => new Date(d).toLocaleString(locale)
  const n = v => Number(v).toLocaleString('en-SG')

  if (loading) {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <div key={i} className="bg-navy-900 border border-navy-700 rounded-xl h-24 animate-pulse" />)}
      </div>
    )
  }

  const cards = [
    { label: t('msDash.runsToday'), value: stats.runsToday, icon: FileSpreadsheet, color: 'bg-electric-500/20 text-electric-300' },
    { label: t('msDash.usersToday'), value: stats.usersToday, icon: UserCheck, color: 'bg-purple-500/20 text-purple-300' },
    { label: t('msDash.totalRuns'), value: stats.runsTotal, icon: Activity, color: 'bg-sky-500/20 text-sky-300' },
    { label: t('msDash.totalUsers'), value: stats.totalUsers, icon: Users, color: 'bg-amber-500/20 text-amber-300' },
    { label: t('msDash.mosProcessed'), value: n(stats.mosProcessed), icon: PackageX, color: 'bg-emerald-500/20 text-emerald-300' },
    { label: t('msDash.failed'), value: stats.failedTotal, icon: AlertCircle, color: 'bg-rose-500/20 text-rose-300' },
  ]
  const row = i => (i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50')

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(c => <StatCard key={c.label} {...c} />)}
      </div>

      <Table
        title={t('msDash.byUser')}
        headers={[t('msDash.colUser'), t('msDash.colRuns'), t('msDash.colMos'), t('msDash.colLastUsed')]}
        empty={!stats.users.length && t('msDash.noRuns')}
      >
        {stats.users.map((u, i) => (
          <tr key={u.username} className={row(i)}>
            <td className="px-4 py-3 text-slate-100">{u.username}</td>
            <td className="px-4 py-3 text-slate-200 font-mono">{u.runs}</td>
            <td className="px-4 py-3 text-slate-200 font-mono">{n(u.mos)}</td>
            <td className="px-4 py-3 text-slate-400 font-mono text-xs">{fmt(u.lastUsed)}</td>
          </tr>
        ))}
      </Table>

      <Table
        title={t('msDash.recentRuns')}
        headers={[t('msDash.colFiles'), t('msDash.colUser'), t('msDash.colTime'), t('msDash.colShortMos'), t('msDash.colShortLines'), t('msDash.colStatus')]}
        empty={!stats.recent.length && t('msDash.noRuns')}
        right={<span className="text-xs text-slate-500">{t('msDash.linesProcessed', { n: n(stats.linesProcessed) })}</span>}
      >
        {stats.recent.map((r, i) => (
          <tr key={r.id} className={row(i)}>
            <td className="px-4 py-3 font-mono max-w-xs">
              <p className="text-slate-100 truncate" title={r.moFile}>{r.moFile}</p>
              <p className="text-slate-500 text-xs truncate" title={r.transferFile}>{r.transferFile}</p>
            </td>
            <td className="px-4 py-3 text-slate-300">{r.username}</td>
            <td className="px-4 py-3 text-slate-400 font-mono text-xs whitespace-nowrap">{fmt(r.createdAt)}</td>
            <td className="px-4 py-3 text-slate-200 font-mono whitespace-nowrap">{r.success ? `${n(r.shortMos)} / ${n(r.moCount)}` : '—'}</td>
            <td className="px-4 py-3 text-slate-200 font-mono whitespace-nowrap">{r.success ? `${n(r.shortLines)} / ${n(r.lineCount)}` : '—'}</td>
            <td className="px-4 py-3">
              <span title={r.error || ''} className={`text-xs px-2 py-0.5 rounded-full ${r.success ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                {r.success ? t('msDash.success') : t('msDash.failedOne')}
              </span>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  )
}
