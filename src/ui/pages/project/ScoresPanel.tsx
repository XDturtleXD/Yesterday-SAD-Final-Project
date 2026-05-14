import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Project, Score, Song } from '../../../types'
import { useAppState } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { Modal } from '../../primitives/Modal'
import {
  ArrowLeft,
  CheckCircle2,
  Edit3,
  ExternalLink,
  History,
  Music2,
  Pin,
  PinOff,
  Trash2,
  Upload,
} from 'lucide-react'

export function ScoresPanel({ project }: { project: Project }) {
  const { currentUser, addToast, deleteScore, toggleSongPin } = useAppState()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<null | Score>(null)
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<'recent' | 'pinned' | 'alpha'>('recent')

  const canDelete = useMemo(() => {
    if (currentUser.role === 'admin') return true
    const me = project.members.find((m) => m.userId === currentUser.id)
    return !!me?.roles.includes('owner')
  }, [currentUser, project.members])

  const songs = useMemo(() => project.songs ?? [], [project.songs])
  const selectedSong = useMemo(
    () => songs.find((s) => s.id === selectedSongId) ?? null,
    [songs, selectedSongId],
  )

  const sortedSongs = useMemo(() => {
    const list = [...songs]
    if (sortMode === 'alpha') {
      list.sort((a, b) => a.title.localeCompare(b.title))
      return list
    }
    if (sortMode === 'pinned') {
      list.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return b.lastPracticedAt.localeCompare(a.lastPracticedAt)
      })
      return list
    }
    // recent
    list.sort((a, b) => b.lastPracticedAt.localeCompare(a.lastPracticedAt))
    return list
  }, [songs, sortMode])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">Scores / Parts</div>
          <div className="mt-1 text-sm text-slate-600">
            This project contains multiple songs. Each song contains multiple parts + a full score.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" />
            Upload score
          </Button>
        </div>
      </div>

      {songs.length === 0 ? (
        <Card className="p-6">
          <div className="text-sm font-semibold text-slate-900">No songs yet</div>
          <div className="mt-1 text-sm text-slate-600">
            In the real workflow, songs appear first, then parts live inside each song.
          </div>
        </Card>
      ) : (
        <>
          {!selectedSong ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">Song list</div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs text-slate-500">Sort:</div>
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                    className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="recent">Recently practiced</option>
                    <option value="pinned">Pinned first</option>
                    <option value="alpha">Alphabetical</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {sortedSongs.map((song) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    currentUserId={currentUser.id}
                    onOpen={() => setSelectedSongId(song.id)}
                    onTogglePin={() => toggleSongPin(project.id, song.id)}
                  />
                ))}
              </div>
            </>
          ) : (
            <SongDetail
              project={project}
              song={selectedSong}
              canDelete={canDelete}
              onBack={() => setSelectedSongId(null)}
              onDeleteScore={(s) => setConfirmDelete(s)}
            />
          )}
        </>
      )}

      <Modal
        title="Upload score (simulated)"
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setUploadOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                addToast({ title: 'Upload complete (simulated)', message: 'MuseScore file placeholder added' })
                setUploadOpen(false)
              }}
            >
              Upload
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          File upload is out of scope. This modal shows where MuseScore import would happen.
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-medium text-slate-900">Supported (prototype UI)</div>
          <ul className="mt-1 list-disc pl-5 text-slate-600">
            <li>MusicXML (.musicxml / .xml) — rendered in-browser</li>
            <li>MuseScore (.mscz) — planned via conversion to MusicXML</li>
          </ul>
        </div>
      </Modal>

      <Modal
        title="Delete score (simulated)"
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!confirmDelete) return
                deleteScore(project.id, confirmDelete.id)
                setConfirmDelete(null)
              }}
            >
              Confirm delete
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          This deletion is simulated and only updates local mock state.
        </div>
        <div className="mt-2 text-sm font-medium text-slate-900">{confirmDelete?.name}</div>
      </Modal>
    </div>
  )
}

function SongCard({
  song,
  currentUserId,
  onOpen,
  onTogglePin,
}: {
  song: Song
  currentUserId: string
  onOpen: () => void
  onTogglePin: () => void
}) {
  const my = song.assignments.find((a) => a.userId === currentUserId)

  return (
    <Card className="p-4 transition hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700">
            <Music2 className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-950">{song.title}</div>
            <div className="mt-1 text-sm text-slate-600">Composer: {song.composer}</div>
          </div>
        </div>
        <button
          onClick={onTogglePin}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          title={song.pinned ? 'Unpin' : 'Pin'}
        >
          {song.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          {song.pinned ? 'Pinned' : 'Pin'}
        </button>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs text-slate-500">Your part</div>
          <div className="font-medium">{my?.partName ?? '—'}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs text-slate-500">Your role</div>
          <div className="font-medium">{my?.role ?? '—'}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {song.pinned && <Badge tone="warn">Pinned</Badge>}
          <Badge>Last practiced: {song.lastPracticedAt}</Badge>
        </div>
          <Button size="sm" onClick={onOpen}>
            <ExternalLink className="size-4" />
            Open song
          </Button>
      </div>
    </Card>
  )
}

function SongDetail({
  project,
  song,
  canDelete,
  onBack,
  onDeleteScore,
}: {
  project: Project
  song: Song
  canDelete: boolean
  onBack: () => void
  onDeleteScore: (s: Score) => void
}) {
  const { currentUser, getUser, addToast } = useAppState()
  const navigate = useNavigate()
  const isDvorakSymphony = project.id === 'p-spring' && song.id === 'song-dvorak-9'

  const my = song.assignments.find((a) => a.userId === currentUser.id)
  const primary =
    my?.primaryScoreId
      ? project.scores.find((s) => s.id === my.primaryScoreId) ?? null
      : null

  const songScores = useMemo(() => {
    const set = new Set(song.scoreIds)
    return project.scores.filter((s) => set.has(s.id))
  }, [project.scores, song.scoreIds])

  const otherScores = useMemo(() => {
    const pId = primary?.id
    return songScores.filter((s) => s.id !== pId)
  }, [songScores, primary?.id])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">Song</div>
          <div className="mt-1 truncate text-xl font-semibold text-slate-900">{song.title}</div>
          <div className="mt-1 text-sm text-slate-600">Composer: {song.composer}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Back to song list
          </Button>
          <Button variant="ghost" onClick={() => addToast({ title: 'Marked as practiced (simulated)', message: song.title })}>
            <CheckCircle2 className="size-4" />
            Mark practiced
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-500">Your primary part</div>
            <div className="mt-1 text-sm text-slate-600">
              {my ? (
                <>
                  Your part: <span className="font-medium text-slate-900">{my.partName}</span> · Your role:{' '}
                  <span className="font-medium text-slate-900">{my.role}</span>
                </>
              ) : (
                <>No assignment for your account in this song (prototype data).</>
              )}
            </div>
          </div>
          {primary ? (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  isDvorakSymphony
                    ? navigate(`/projects/${project.id}/songs/${song.id}/musicxml`)
                    : navigate(`/projects/${project.id}/scores/${primary.id}/editor`)
                }
              >
                <Edit3 className="size-4" />
                Edit
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  isDvorakSymphony
                    ? navigate(`/projects/${project.id}/songs/${song.id}/musicxml`)
                    : addToast({ title: 'Opened score (simulated)', message: primary.name })
                }
              >
                <ExternalLink className="size-4" />
                Open
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate(`/projects/${project.id}?tab=versions`)}
              >
                <History className="size-4" />
                View version history
              </Button>
            </div>
          ) : null}
        </div>

        {primary ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">{primary.name}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge tone="info">{primary.instrument === 'full' ? 'Full score' : `Instrument: ${primary.instrument}`}</Badge>
                  <Badge>Type: {primary.fileType}</Badge>
                  <Badge>Version: {primary.currentVersion}</Badge>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Last editor: {getUser(primary.lastEditorUserId)?.name ?? primary.lastEditorUserId} · Updated: {primary.lastUpdatedAt}
                </div>
              </div>
              <Badge tone="success">Pinned for quick access</Badge>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            No primary score linked for this song. (Prototype data can assign a primary part via `primaryScoreId`.)
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">All parts & full score</div>
        <div className="text-xs text-slate-500">{songScores.length} files</div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {otherScores.map((s) => {
          const editor = getUser(s.lastEditorUserId)?.name ?? s.lastEditorUserId
          return (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{s.name}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge tone="info">
                      {s.instrument === 'full' ? 'Full score' : `Instrument: ${s.instrument}`}
                    </Badge>
                    <Badge>Type: {s.fileType}</Badge>
                    <Badge>Version: {s.currentVersion}</Badge>
                  </div>
                </div>
                <Badge>Updated: {s.lastUpdatedAt}</Badge>
              </div>

              <div className="mt-2 text-xs text-slate-500">Last editor: {editor}</div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    isDvorakSymphony
                      ? navigate(`/projects/${project.id}/songs/${song.id}/musicxml?scoreId=${s.id}`)
                      : navigate(`/projects/${project.id}/scores/${s.id}/editor`)
                  }
                >
                  <Edit3 className="size-4" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    isDvorakSymphony
                      ? navigate(`/projects/${project.id}/songs/${song.id}/musicxml?scoreId=${s.id}`)
                      : addToast({ title: 'Opened score (simulated)', message: s.name })
                  }
                >
                  <ExternalLink className="size-4" />
                  Open
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate(`/projects/${project.id}?tab=versions`)}
                >
                  <History className="size-4" />
                  View history
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!canDelete}
                  onClick={() => onDeleteScore(s)}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </div>
              {!canDelete && (
                <div className="mt-1 text-xs text-slate-500">Delete: owner/admin only</div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
