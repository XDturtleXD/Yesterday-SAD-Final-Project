import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useRequiredUser } from '../../state/AppState'
import { useTranslation } from '../../i18n'
import { Avatar } from '../primitives/Avatar'
import { Button } from '../primitives/Button'
import { LogOut } from 'lucide-react'

export function HeaderBar() {
  const currentUser = useRequiredUser()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <header className="app-header sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex items-center justify-end gap-4 px-6 py-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => navigate(`/users/${currentUser.id}`)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-100"
          >
            <Avatar name={currentUser.name} src={currentUser.avatarUrl} size={32} />
            <div className="hidden sm:block">
              <div className="text-sm font-medium text-slate-900">{currentUser.name}</div>
            </div>
          </button>

          <Button
            variant="ghost"
            onClick={() => {
              logout()
              navigate('/')
            }}
          >
            <LogOut className="size-4" />
            {t('common.logout')}
          </Button>
        </div>
      </div>
    </header>
  )
}
