import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import api from '@/lib/api'
import { Plus, Edit2, Trash2, Factory, ArrowRight, Upload, Download } from 'lucide-react'

const mappingSchema = z.object({
  customerManufacturer: z.string().min(1, 'Customer alias is required'),
  peckoManufacturer: z.string().min(1, 'ERP manufacturer name is required'),
})

export default function ManufacturerMappings() {
  const [mappings, setMappings] = useState([])
  const [modal, setModal] = useState(null) // null | { mode, mapping? }
  const [toast, setToast] = useState('')
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(mappingSchema),
  })

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  async function load() {
    const r = await api.get('/manufacturer-mappings')
    setMappings(r.data)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    reset({ customerManufacturer: '', peckoManufacturer: '' })
    setModal({ mode: 'create' })
  }
  function openEdit(m) {
    reset({ customerManufacturer: m.customerManufacturer, peckoManufacturer: m.peckoManufacturer })
    setModal({ mode: 'edit', mapping: m })
  }

  async function onSubmit(data) {
    try {
      if (modal.mode === 'create') {
        await api.post('/manufacturer-mappings', data)
        showToast('Mapping added')
      } else {
        await api.put(`/manufacturer-mappings/${modal.mapping.id}`, data)
        showToast('Mapping updated')
      }
      setModal(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.error || 'Save failed')
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/manufacturer-mappings/${id}`)
      showToast('Mapping deleted')
      setMappings(m => m.filter(x => x.id !== id))
    } catch (err) {
      showToast(err.response?.data?.error || 'Delete failed')
    }
  }

  function downloadTemplate() {
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/manufacturer-mappings/template`
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset so re-selecting same file works

    const formData = new FormData()
    formData.append('file', file)

    setImporting(true)
    try {
      const r = await api.post('/manufacturer-mappings/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      showToast(`Imported ${r.data.imported} mappings${r.data.skipped ? `, skipped ${r.data.skipped} invalid rows` : ''}`)
      load()
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
        <p className="text-slate-300 text-sm font-medium mb-1">Global Manufacturer Name Database</p>
        <p className="text-slate-500 text-xs">
          Mappings here apply to all customers. Column A in the import file = your ERP name, Column B = the alias used in the customer's BOM.
          Matching is case-insensitive — "ZEBRA", "zebra", and "Zebra" all match the same rule.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-slate-100 font-semibold">
          Manufacturer Mappings
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
            <Factory size={36} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400 mb-1">No manufacturer mappings yet.</p>
            <p className="text-slate-500 text-xs">Import an Excel/CSV file or add mappings manually.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-800 border-b border-navy-700">
                <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">Customer BOM Alias</th>
                <th className="px-2 py-3 text-slate-600"></th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">ERP Name (Pecko)</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m, i) => (
                <tr key={m.id} className={i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50'}>
                  <td className="px-4 py-3 font-mono text-amber-300">{m.customerManufacturer}</td>
                  <td className="px-2 py-3 text-slate-600"><ArrowRight size={14} /></td>
                  <td className="px-4 py-3 font-mono text-electric-300">{m.peckoManufacturer}</td>
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

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-900 border border-navy-700 rounded-xl w-full max-w-md">
            <div className="p-5 border-b border-navy-700 font-semibold text-slate-100">
              {modal.mode === 'create' ? 'Add Manufacturer Mapping' : 'Edit Manufacturer Mapping'}
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Customer BOM Alias</label>
                <p className="text-slate-500 text-xs mb-1.5">As it appears in the customer's file — matching is case-insensitive</p>
                <input {...register('customerManufacturer')} placeholder="e.g. TYCO ELECTRONICS"
                  className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-electric-400" />
                {errors.customerManufacturer && <p className="text-red-400 text-xs mt-1">{errors.customerManufacturer.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">ERP Name (Pecko)</label>
                <p className="text-slate-500 text-xs mb-1.5">Exact name as stored in your ERP — case sensitive</p>
                <input {...register('peckoManufacturer')} placeholder="e.g. Amp/Tyco/ TE Connectivity"
                  className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-electric-400" />
                {errors.peckoManufacturer && <p className="text-red-400 text-xs mt-1">{errors.peckoManufacturer.message}</p>}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModal(null)} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-electric-500 text-white py-2 rounded-lg text-sm font-medium">
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
