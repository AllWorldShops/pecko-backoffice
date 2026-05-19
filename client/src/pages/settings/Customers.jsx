import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import api from '@/lib/api'
import { Plus, Edit2, Trash2, Building2, ArrowLeft } from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  description: z.string().min(10, 'Please describe the BOM format (minimum 10 characters)'),
})

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [view, setView] = useState('list') // 'list' | 'form'
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toast, setToast] = useState('')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  async function load() { setCustomers((await api.get('/customers')).data) }
  useEffect(() => { load() }, [])

  function openCreate() { reset({ name: '', description: '' }); setEditTarget(null); setView('form') }
  function openEdit(c) { reset({ name: c.name, description: c.description }); setEditTarget(c); setView('form') }

  async function onSubmit(data) {
    try {
      if (editTarget) await api.put(`/customers/${editTarget.id}`, data)
      else await api.post('/customers', data)
      showToast(editTarget ? 'Customer updated' : 'Customer created')
      setView('list')
      load()
    } catch (err) { showToast(err.response?.data?.error || 'Save failed') }
  }

  async function handleDelete() {
    try {
      await api.delete(`/customers/${deleteTarget.id}`)
      showToast('Customer deleted')
      setDeleteTarget(null)
      load()
    } catch (err) { showToast(err.response?.data?.error || 'Delete failed') }
  }

  if (view === 'form') return (
    <div className="max-w-2xl">
      {toast && <div className="fixed top-4 right-4 bg-navy-800 border border-navy-600 text-slate-100 px-4 py-2 rounded-lg shadow-xl text-sm z-50">{toast}</div>}
      <button onClick={() => setView('list')} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm mb-4">
        <ArrowLeft size={16} /> Back to customers
      </button>
      <h3 className="text-lg font-semibold text-slate-100 mb-6">{editTarget ? 'Edit Customer' : 'New Customer'}</h3>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 bg-navy-900 border border-navy-700 rounded-xl p-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Customer Name</label>
          <input {...register('name')} className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-electric-400" />
          {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">BOM Format Instructions</label>
          <p className="text-slate-500 text-xs mb-2">Describe column positions, header row, parent row, and any special rules. This is injected directly into the AI system prompt.</p>
          <textarea {...register('description')} rows={12}
            placeholder={`Example:\nThis customer sends Excel files with 8 columns.\nColumn A = Find No., Column B = Item ID, Column C = Item Name...\nRow 1 is the header. Row 2 is the parent assembly. Row 3+ are child components.`}
            className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-electric-400 resize-y" />
          {errors.description && <p className="text-red-400 text-xs mt-1">{errors.description.message}</p>}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setView('list')} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="flex-1 bg-electric-500 hover:bg-electric-400 text-white py-2 rounded-lg text-sm font-medium">
            {isSubmitting ? 'Saving...' : 'Save Customer'}
          </button>
        </div>
      </form>
    </div>
  )

  return (
    <div className="space-y-4">
      {toast && <div className="fixed top-4 right-4 bg-navy-800 border border-navy-600 text-slate-100 px-4 py-2 rounded-lg shadow-xl text-sm z-50">{toast}</div>}
      <div className="flex items-center justify-between">
        <h3 className="text-slate-100 font-semibold">Customers</h3>
        <button onClick={openCreate} className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={16} /> New Customer
        </button>
      </div>
      <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
        {!customers.length ? (
          <div className="p-12 text-center"><Building2 size={36} className="mx-auto text-slate-600 mb-3" /><p className="text-slate-400">No customers yet.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-navy-800 border-b border-navy-700">
              {['Name', 'Created', 'Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">{h}</th>)}
            </tr></thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={c.id} className={i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50'}>
                  <td className="px-4 py-3 text-slate-100 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => openEdit(c)}><Edit2 size={15} className="text-slate-400 hover:text-electric-300" /></button>
                    <button onClick={() => setDeleteTarget(c)}><Trash2 size={15} className="text-slate-400 hover:text-red-400" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-900 border border-navy-700 rounded-xl p-6 w-full max-w-sm">
            <p className="text-slate-300 text-sm mb-4">Delete customer <strong>{deleteTarget.name}</strong>? All associated UOM mappings and conversion logs will be removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-sm font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
