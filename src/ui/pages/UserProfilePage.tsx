import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { useAppState, useRequiredUser } from '../../state/AppState'
import { Badge } from '../primitives/Badge'
import { Avatar } from '../primitives/Avatar'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { memberSectionLabel } from '../../utils/sectionLabels'
import { FolderKanban, Pencil, UserRound } from 'lucide-react'

const MAX_AVATAR_FILE_BYTES = 300 * 1024
const inputClassName =
  'mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100'

export function UserProfilePage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { projects, getMemberDisplayName, addToast } = useAppState()
  const currentUser = useRequiredUser()
  const { user: authUser, updateProfile } = useAuth()

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const profileUser = useMemo(() => {
    if (!userId) return undefined
    if (userId === currentUser.id) return currentUser

    for (const p of projects) {
      const member = p.members.find((m) => m.userId === userId)
      if (member) {
        return {
          id: member.userId,
          name: member.userName,
          role: 'regular' as const,
          intro: '',
          avatarUrl: member.avatarUrl,
        }
      }
    }

    const name = getMemberDisplayName(userId)
    if (name !== userId) {
      return { id: userId, name, role: 'regular' as const, intro: '' }
    }

    return undefined
  }, [userId, currentUser, projects, getMemberDisplayName])

  const isSelf = profileUser?.id === currentUser.id

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState(currentUser.name)
  const [intro, setIntro] = useState(currentUser.intro)
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const participating = useMemo(
    () => projects.filter((p) => p.members.some((m) => m.userId === profileUser?.id)),
    [projects, profileUser?.id],
  )

  function startEditing() {
    setName(currentUser.name)
    setIntro(currentUser.intro)
    setAvatarUrl(currentUser.avatarUrl ?? '')
    setError('')
    setEditing(true)
  }

  function cancelEditing() {
    setName(currentUser.name)
    setIntro(currentUser.intro)
    setAvatarUrl(currentUser.avatarUrl ?? '')
    setError('')
    setEditing(false)
  }

  async function handleAvatarFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Upload an image file (JPEG, PNG, WebP, or GIF).')
      return
    }
    if (file.size > MAX_AVATAR_FILE_BYTES) {
      setError('Image size must be under 300 KB.')
      return
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Could not read image'))
      reader.readAsDataURL(file)
    })

    setAvatarUrl(dataUrl)
    setError('')
  }

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      await updateProfile({
        name: name.trim(),
        intro: intro.trim(),
        avatar_url: avatarUrl.trim() || null,
      })
      addToast({ title: 'Profile updated' })
      setEditing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed. Please try again later.')
    } finally {
      setSaving(false)
    }
  }

  if (!profileUser) {
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-slate-900">User not found</div>
        <div className="mt-2">
          <Button variant="secondary" onClick={() => navigate('/dashboard')}>
            Back home
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
              <UserRound className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-semibold text-slate-950">User profile</div>
              <div className="mt-1 text-sm text-slate-600">
                {isSelf ? 'Manage your profile' : "View this user's public information"}
              </div>
            </div>
          </div>
          {isSelf && !editing && (
            <Button variant="secondary" onClick={startEditing}>
              <Pencil className="size-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <Card className="p-5">
        {editing ? (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar name={name || currentUser.name} src={avatarUrl || undefined} size={64} />
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <label className="text-sm font-medium text-slate-800">Avatar</label>
                  <input
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className={inputClassName}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void handleAvatarFile(file)
                        e.target.value = ''
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Upload image
                    </Button>
                    {avatarUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setAvatarUrl('')}
                      >
                        Remove avatar
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Paste an image URL or upload an image smaller than 300 KB.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-800">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClassName}
                autoComplete="name"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-800">Email</label>
              <input
                value={authUser?.email ?? ''}
                disabled
                className={`${inputClassName} bg-slate-50 text-slate-500`}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-800">Bio</label>
              <textarea
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Share your instrument, rehearsal habits, or collaboration preferences..."
                className={inputClassName}
              />
              <p className="mt-1 text-xs text-slate-500">{intro.length}/1000</p>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleSave()} disabled={saving || !name.trim()}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="secondary" onClick={cancelEditing} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Avatar
                name={profileUser.name}
                src={profileUser.avatarUrl}
                size={48}
              />
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold text-slate-900">
                  {profileUser.name}
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge tone="info">role: {profileUser.role}</Badge>
                </div>
              </div>
            </div>

            {isSelf && authUser?.email && (
              <div className="mt-4">
                <div className="text-sm font-medium text-slate-800">Email</div>
                <div className="mt-1 text-sm text-slate-600">{authUser.email}</div>
              </div>
            )}

            <div className="mt-4">
              <div className="text-sm font-medium text-slate-800">Bio</div>
              <div className="mt-1 text-sm text-slate-600">
                {profileUser.intro.trim() ? profileUser.intro : 'No bio yet.'}
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <FolderKanban className="size-4 text-slate-500" />
          Participating projects
        </div>
        <div className="mt-3 space-y-3">
          {participating.length === 0 ? (
            <div className="text-sm text-slate-500">No projects.</div>
          ) : (
            participating.map((p) => {
              const m = p.members.find((mm) => mm.userId === profileUser.id)
              return (
                <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{p.name}</div>
                      <div className="mt-1 text-sm text-slate-600">{p.description}</div>
                    </div>
                    <Button size="sm" onClick={() => navigate(`/projects/${p.id}`)}>
                      Open
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge>Role: {m?.role ?? '—'}</Badge>
                    <Badge>Section: {m ? memberSectionLabel(m) : '—'}</Badge>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>
    </div>
  )
}
