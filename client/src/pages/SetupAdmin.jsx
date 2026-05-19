import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useState } from 'react'

const schema = z.object({
  username: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export default function SetupAdmin() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  async function onSubmit(data) {
    try {
      await api.post('/setup', data)
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.error || 'Setup failed')
    }
  }

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-mono mb-2">Pecko</p>
          <h1 className="text-2xl font-bold text-slate-100">Create Admin Account</h1>
          <p className="text-slate-400 mt-2 text-sm">First-time setup — this screen appears only once.</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="bg-navy-900 border border-navy-700 rounded-xl p-8 space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}

          {[
            { name: 'username', label: 'Full Name', type: 'text', placeholder: 'Admin Name' },
            { name: 'email', label: 'Email', type: 'email', placeholder: 'admin@pecko.com' },
            { name: 'password', label: 'Password', type: 'password', placeholder: 'Min 8 characters' },
          ].map(({ name, label, type, placeholder }) => (
            <div key={name}>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
              <input {...register(name)} type={type} placeholder={placeholder}
                className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-electric-400" />
              {errors[name] && <p className="text-red-400 text-xs mt-1">{errors[name].message}</p>}
            </div>
          ))}

          <button type="submit" disabled={isSubmitting}
            className="w-full bg-electric-500 hover:bg-electric-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
            {isSubmitting ? 'Creating...' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
