import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { HeaderBar } from './HeaderBar'
import { ToastStack } from './ToastStack'

export function AppLayout() {
  const location = useLocation()

  const isEditor = /\/(editor|musicxml|pdf)$/.test(location.pathname)

  return (
    <div className="min-h-dvh bg-[#f5f6f8] text-slate-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px]">
        {!isEditor && <Sidebar />}
        <div className="flex min-w-0 flex-1 flex-col">
          {!isEditor && <HeaderBar />}
          <main className={isEditor ? 'flex-1' : 'flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-8'}>
            <Outlet />
          </main>
        </div>
      </div>
      <ToastStack />
    </div>
  )
}
