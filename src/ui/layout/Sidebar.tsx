import { NavLink } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useRequiredUser } from '../../state/AppState'
import { roleLabel, useTranslation } from '../../i18n'
import { cn } from '../utils/cn'
import { Shield, User, FolderKanban, Home, Music2, Settings } from 'lucide-react'

export function Sidebar() {
  const currentUser = useRequiredUser()
  const { isAdmin } = useAuth()
  const { language, t } = useTranslation()

  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 self-start overflow-hidden border-r border-slate-200 bg-white md:block">
      <div className="flex h-dvh min-h-0 flex-col p-4">
        <div className="mb-5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-slate-950 text-white shadow-sm">
              <Music2 className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Yesterday</div>
              <div className="text-xs text-slate-500">{t('app.scoreWorkspace')}</div>
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto pb-4">
          <div className="mb-1 px-3 text-[11px] font-semibold uppercase text-slate-400">
            {t('nav.workspace')}
          </div>
          <div className="flex flex-col gap-1">
            <SideLink to="/dashboard" icon={<Home className="size-4" />} label={t('nav.home')} />
            <SideLink
              to="/projects"
              icon={<FolderKanban className="size-4" />}
              label={t('nav.projects')}
            />
            <SideLink
              to={`/users/${currentUser.id}`}
              icon={<User className="size-4" />}
              label={t('nav.profile')}
            />
            <SideLink
              to="/settings"
              icon={<Settings className="size-4" />}
              label={t('nav.settings')}
            />
            <SideLink
              to="/admin"
              icon={<Shield className="size-4" />}
              label={t('nav.admin')}
              disabled={!isAdmin}
            />
          </div>
        </nav>

        <div className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="truncate text-sm font-medium">{currentUser.name}</div>
          <div className="text-xs text-slate-500">{roleLabel(currentUser.role, language)}</div>
        </div>
      </div>
    </aside>
  )
}

function SideLink({
  to,
  label,
  icon,
  disabled,
}: {
  to: string
  label: string
  icon: React.ReactNode
  disabled?: boolean
}) {
  if (disabled) {
    return (
      <div className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-400">
        <div className="text-slate-300">{icon}</div>
        {label}
      </div>
    )
  }

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition',
          isActive
            ? 'bg-slate-950 text-white shadow-sm'
            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
