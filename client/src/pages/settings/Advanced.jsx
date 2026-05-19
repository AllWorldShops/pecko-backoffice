import { SlidersHorizontal } from 'lucide-react'

export default function Advanced() {
  return (
    <div className="flex flex-col items-center justify-center min-h-64 text-center">
      <SlidersHorizontal size={48} className="text-slate-600 mb-4" />
      <h2 className="text-xl font-semibold text-slate-200 mb-2">Advanced Settings</h2>
      <p className="text-slate-400 max-w-sm">Additional configuration options will be available here in a future update.</p>
    </div>
  )
}
