import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import api from '@/lib/api'
import { Plus, Edit2, Trash2, Ruler, Upload, Download } from 'lucide-react'

const mappingSchema = z.object({
  customerUOM: z.string().min(1, 'Required'),
  peckoUOM: z.string().min(1, 'Required'),
  conversionFactor: z.coerce.number().positive('Must be positive'),
})

export default function UnitOfMeasure() {
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [mappings, setMappings] = useState([])
  const [modal, setModal] = useState(null) // null | { mode, mapping? }
  const [toast, setToast] = useState('')
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(mappingSchema) })

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  useEffect(() => { api.get('/customers').then(r => setCustomers(r.data)) }, [])
  useEffect(() => {
    if (!selectedCustomer) return setMappings([])
    api.get(`/uom-mappings?customerId=${selectedCustomer}`).then(r => setMappings(r.data))
  }, [selectedCustomer])

  function openCreate() { reset({ customerUOM: '', peckoUOM: '', conversionFactor: 1 }); setModal({ mode: 'create' }) }
  function openEdit(m) { reset({ customerUOM: m.customerUOM, peckoUOM: m.peckoUOM, conversionFactor: m.conversionFactor }); setModal({ mode: 'edit', mapping: m }) }

  async function onSubmit(data) {
    try {
      if (modal.mode === 'create') {
        await api.post('/uom-mappings', { ...data, customerId: selectedCustomer })
        showToast('Mapping added')
      } else {
        await api.put(`/uom-mappings/${modal.mapping.id}`, { ...data, customerId: selectedCustomer })
        showToast('Mapping updated')
      }
      setModal(null)
      api.get(`/uom-mappings?customerId=${selectedCustomer}`).then(r => setMappings(r.data))
    } catch (err) { showToast(err.response?.data?.error || 'Save failed') }
  }

  async function handleDelete(id) {
    await api.delete(`/uom-mappings/${id}`)
    showToast('Mapping deleted')
    setMappings(m => m.filter(x => x.id !== id))
  }

  function downloadTemplate() {
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/uom-mappings/template`
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const formData = new FormData()
    formData.append('file', file)
    formData.append('customerId', selectedCustomer)

    setImporting(true)
    try {
      const r = await api.post('/uom-mappings/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      showToast(`Imported ${r.data.imported} mappings${r.data.skipped ? `, skipped ${r.data.skipped} invalid rows` : ''}`)
      api.get(`/uom-mappings?customerId=${selectedCustomer}`).then(r => setMappings(r.data))
    } catch (err) {
      showToast(err.response?.data?.error || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-5">
      {toast && <div className="fixed top-4 right-4 bg-navy-800 border border-navy-600 text-slate-100 px-4 py-2 rounded-lg shadow-xl text-sm z-50">{toast}</div>}

      <div className="bg-navy-900 border border-navy-700 rounded-xl p-5">
        <label className="block text-sm font-medium text-slate-300 mb-2">Select Customer</label>
        <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}
          className="w-full max-w-sm bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-electric-400">
          <option value="">Choose a customer...</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {selectedCustomer && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-slate-100 font-semibold">
              UOM Mappings
              {mappings.length > 0 && <span className="ml-2 text-xs text-slate-500 font-normal">{mappings.length} entries</span>}
            </h3>
            <div className="flex items-center gap-2">
              <button onClick={downloadTemplate}
                className="flex items-center gap-2 bg-navy-700 hover:bg-navy-600 text-slate-300 px-3 py-2 rounded-lg text-sm">
                <Download size={15} /> Template
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
              <button onClick={() => fileInputRef.current?.click()} disabled={importing}
                className="flex items-center gap-2 bg-navy-700 hover:bg-navy-600 text-slate-300 px-3 py-2 rounded-lg text-sm disabled:opacity-50">
                <Upload size={15} /> {importing ? 'Importing...' : 'Import'}
              </button>
              <button onClick={openCreate}
                className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Plus size={16} /> Add Mapping
              </button>
            </div>
          </div>

          <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
            {!mappings.length ? (
              <div className="p-12 text-center">
                <Ruler size={36} className="mx-auto text-slate-600 mb-3" />
                <p className="text-slate-400 mb-1">No UOM mappings for this customer.</p>
                <p className="text-slate-500 text-xs">Import an Excel/CSV file or add mappings manually.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="bg-navy-800 border-b border-navy-700">
                  {['Customer UOM', 'Pecko UOM', 'Conversion Factor', 'Actions'].map(h =>
                    <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">{h}</th>
                  )}
                </tr></thead>
                <tbody>
                  {mappings.map((m, i) => (
                    <tr key={m.id} className={i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50'}>
                      <td className="px-4 py-3 font-mono text-slate-100">{m.customerUOM}</td>
                      <td className="px-4 py-3 font-mono text-electric-300">{m.peckoUOM}</td>
                      <td className="px-4 py-3 font-mono text-slate-400">{m.conversionFactor}</td>
                      <td className="px-4 py-3 flex gap-2">
                        <button onClick={() => openEdit(m)}><Edit2 size={15} className="text-slate-400 hover:text-electric-300" /></button>
                        <button onClick={() => handleDelete(m.id)}><Trash2 size={15} className="text-slate-400 hover:text-red-400" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-900 border border-navy-700 rounded-xl w-full max-w-sm">
            <div className="p-5 border-b border-navy-700 font-semibold text-slate-100">{modal.mode === 'create' ? 'Add Mapping' : 'Edit Mapping'}</div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
              {[
                { name: 'customerUOM', label: 'Customer UOM', placeholder: 'e.g. EA' },
                { name: 'peckoUOM', label: "Pecko's UOM", placeholder: 'e.g. pcs' },
                { name: 'conversionFactor', label: 'Conversion Factor', type: 'number', step: 'any', placeholder: '1' },
              ].map(({ name, label, ...rest }) => (
                <div key={name}>
                  <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
                  <input {...register(name)} {...rest} className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-electric-400" />
                  {errors[name] && <p className="text-red-400 text-xs mt-1">{errors[name].message}</p>}
                </div>
              ))}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModal(null)} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-electric-500 text-white py-2 rounded-lg text-sm font-medium">{isSubmitting ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
