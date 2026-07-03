import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// Restricts a route to one company. Admins are cross-company and always allowed.
export default function CompanyRoute({ company }) {
  const { user } = useAuth()
  const allowed = user?.role === 'ADMIN' || user?.company === company
  return allowed ? <Outlet /> : <Navigate to="/dashboard" replace />
}
