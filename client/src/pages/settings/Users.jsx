import { forwardRef, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import api from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { Plus, Edit2, Trash2, X, Users as UsersIcon } from 'lucide-react'

const schema = z.object({
  username: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().optional(),
  role: z.enum(['ADMIN', 'USER']),
})

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-900 border border-navy-700 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-navy-700">
          <h3 className="font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// forwardRef is required so that react-hook-form's ref callback reaches the
// underlying <input> DOM element. Without it React 18 silently drops the ref
// and RHF cannot read the field value on submit, producing "Invalid input".
const InputField = forwardRef(function InputField({ label, error, ...props }, ref) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      <input ref={ref} {...props} className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-electric-400" />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
})

export default function Users() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [modal, setModal] = useState(null) // null | { mode: 'create'|'edit', user?: obj }
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toast, setToast] = useState('')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  })

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function load() { setUsers((await api.get('/users')).data) }

  useEffect(() => { load() }, [])

  function openCreate() { reset({ username: '', email: '', password: '', role: 'USER' }); setModal({ mode: 'create' }) }
  function openEdit(u) { reset({ username: u.username, email: u.email, password: '', role: u.role }); setModal({ mode: 'edit', user: u }) }

  async function onSubmit(data) {
    try {
      if (modal.mode === 'create') {
        await api.post('/users', data)
        showToast('User created successfully')
      } else {
        const payload = { ...data }
        if (!payload.password) delete payload.password
        await api.put(`/users/${modal.user.id}`, payload)
        showToast('User updated')
      }
      setModal(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.error || 'Error saving user')
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/users/${deleteTarget.id}`)
      showToast('User deleted')
      setDeleteTarget(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.error || 'Delete failed')
    }
  }

  return (
    <div className="space-y-4">
      {toast && <div className="fixed top-4 right-4 bg-navy-800 border border-navy-600 text-slate-100 px-4 py-2 rounded-lg shadow-xl text-sm z-50">{toast}</div>}

      <div className="flex items-center justify-between">
        <h3 className="text-slate-100 font-semibold">All Users</h3>
        <button onClick={openCreate} className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> New User
        </button>
      </div>

      <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
        {!users.length ? (
          <div className="p-12 text-center"><UsersIcon size={36} className="mx-auto text-slate-600 mb-3" /><p className="text-slate-400">No users yet.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-navy-800 border-b border-navy-700">
              {['Name', 'Email', 'Role', 'Created', 'Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">{h}</th>)}
            </tr></thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50'}>
                  <td className="px-4 py-3 text-slate-100">{u.username}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'ADMIN' ? 'bg-electric-500/20 text-electric-300' : 'bg-navy-700 text-slate-400'}`}>{u.role}</span></td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => openEdit(u)}><Edit2 size={15} className="text-slate-400 hover:text-electric-300" /></button>
                    {u.id !== me?.id && <button onClick={() => setDeleteTarget(u)}><Trash2 size={15} className="text-slate-400 hover:text-red-400" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title={modal.mode === 'create' ? 'New User' : 'Edit User'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <InputField label="Full Name" {...register('username')} error={errors.username?.message} />
            <InputField label="Email" type="email" {...register('email')} error={errors.email?.message} />
            <InputField label={modal.mode === 'edit' ? 'New Password (leave blank to keep)' : 'Password'} type="password" {...register('password')} error={errors.password?.message} />
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
              <select {...register('role')} className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-electric-400">
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="flex-1 bg-electric-500 hover:bg-electric-400 text-white py-2 rounded-lg text-sm font-medium">
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Delete User" onClose={() => setDeleteTarget(null)}>
          <p className="text-slate-300 text-sm mb-4">Delete <strong>{deleteTarget.username}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
            <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-sm font-medium">Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
