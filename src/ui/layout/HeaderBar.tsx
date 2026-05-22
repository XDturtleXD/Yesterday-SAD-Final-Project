import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useRequiredUser } from '../../state/AppState'
import { Avatar } from '../primitives/Avatar'
import { Button } from '../primitives/Button'
import { FolderKanban, LogOut, User } from 'lucide-react'

export function HeaderBar() {
  const currentUser = useRequiredUser()
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-6 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">Yesterday</div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" onClick={() => navigate('/projects')}>
            <FolderKanban className="size-4" />
            Projects
          </Button>

          <div className="flex items-center gap-2">
            <Avatar name={currentUser.name} src={currentUser.avatarUrl} size={32} />
            <div className="hidden sm:block">
              <div className="text-sm font-medium text-slate-900">{currentUser.name}</div>
            </div>
          </div>

          <Button variant="secondary" onClick={() => navigate(`/users/${currentUser.id}`)}>
            <User className="size-4" />
            Profile
          </Button>

          <Button
            variant="ghost"
            onClick={() => {
              logout()
              navigate('/')
            }}
          >
            <LogOut className="size-4" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  )
}
