import { Outlet } from 'react-router-dom'
import { ToastStack } from './ToastStack'

export function PublicLayout() {
  return (
    <div className="min-h-dvh bg-[#f5f6f8] text-slate-900">
      <Outlet />
      <ToastStack />
    </div>
  )
}
