import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'
import { FileSpreadsheet, FileCheck, Calendar, TrendingUp } from 'lucide-react'

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-navy-900 border border-navy-700 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-100 font-mono mt-0.5">{value ?? '—'}</p>
      </div>
    </div>
  )
}

const STATUS_COLORS = { SUCCESS: 'text-green-400 bg-green-400/10', FAILED: 'text-red-400 bg-red-400/10' }

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dashboard/stats')
      .then(res => setStats(res.data))
      .finally(() => setLoading(false))
  }, [])

  const today = new Date().toLocaleDateString('en-SG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="bg-navy-900 border border-navy-700 rounded-xl p-6">
        <p className="text-slate-400 text-sm">{today}</p>
        <h2 className="text-2xl font-bold text-slate-100 mt-1">
          Welcome back, {user?.username?.split(' ')[0]} 👋
        </h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-navy-900 border border-navy-700 rounded-xl p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Total BOMs Converted" value={stats?.totalBomsConverted} icon={FileSpreadsheet} color="bg-electric-500/20 text-electric-300" />
          <StatCard label="BOMs This Month" value={stats?.bomsThisMonth} icon={Calendar} color="bg-purple-500/20 text-purple-300" />
          <StatCard label="Total Products Converted" value={stats?.totalProductsConverted} icon={FileCheck} color="bg-emerald-500/20 text-emerald-300" />
          <StatCard label="Products This Month" value={stats?.productsThisMonth} icon={TrendingUp} color="bg-amber-500/20 text-amber-300" />
        </div>
      )}

      <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-navy-700">
          <h3 className="font-semibold text-slate-100">Recent Activity</h3>
        </div>
        {!stats?.recentActivity?.length ? (
          <div className="p-12 text-center">
            <FileSpreadsheet size={40} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400">No conversions yet. Head to <strong>Convert BOM</strong> to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-800 border-b border-navy-700">
                  {['Date/Time', 'Customer', 'Filename', 'Products', 'BOMs', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.recentActivity.map((log, i) => (
                  <tr key={log.id} className={i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50'}>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{new Date(log.createdAt).toLocaleString('en-SG')}</td>
                    <td className="px-4 py-3 text-slate-200">{log.customer.name}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs max-w-[180px] truncate">{log.originalFilename}</td>
                    <td className="px-4 py-3 text-slate-200 font-mono">{log.productsConverted}</td>
                    <td className="px-4 py-3 text-slate-200 font-mono">{log.bomsConverted}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[log.status]}`}>{log.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
