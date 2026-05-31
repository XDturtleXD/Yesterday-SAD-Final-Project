import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Piece, Project, Section } from '../../../types'
import { useAppState, useRequiredUser } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { sectionLabel } from '../../../utils/sectionLabels'
import { cn } from '../../utils/cn'
import { PieceSectionUploadModal } from './PieceSectionUploadModal'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GripVertical,
  Music2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'

type UploadTarget = {
  piece: Piece
  section: Section
} | null

function moveIdBefore(ids: string[], activeId: string, overId: string) {
  if (activeId === overId) return ids
  const activeIndex = ids.indexOf(activeId)
  const overIndex = ids.indexOf(overId)
  if (activeIndex === -1 || overIndex === -1) return ids

  const next = [...ids]
  const [moved] = next.splice(activeIndex, 1)
  next.splice(overIndex, 0, moved)
  return next
}

function sameOrder(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

export function PiecesPanel({ project }: { project: Project }) {
  const {
    createPiece,
    deletePiece,
    deleteProjectScore,
    getPieces,
    getPieceScore,
    loadProjectDetail,
    loadSections,
    movePiece,
    reorderPieces,
    sections,
    sectionsLoading,
  } = useAppState()
  const navigate = useNavigate()
  const currentUser = useRequiredUser()

  const pieces = getPieces(project.id)
  const [title, setTitle] = useState('')
  const [composer, setComposer] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [expandedPieceId, setExpandedPieceId] = useState<string | null>(null)
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>(null)
  const [deletingScoreId, setDeletingScoreId] = useState<string | null>(null)
  const [dragPieceOrder, setDragPieceOrder] = useState<string[] | null>(null)
  const [draggingPieceId, setDraggingPieceId] = useState<string | null>(null)
  const [dragOverPieceId, setDragOverPieceId] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const committedDragRef = useRef(false)

  const isManager = useMemo(() => {
    if (currentUser.role === 'admin') return true
    return project.members.some(
      (member) => member.userId === currentUser.id && member.role === 'concertmaster',
    )
  }, [currentUser, project.members])

  const myMember = project.members.find((member) => member.userId === currentUser.id)
  const pieceIds = useMemo(() => pieces.map((piece) => piece.id), [pieces])
  const pieceById = useMemo(() => new Map(pieces.map((piece) => [piece.id, piece])), [pieces])
  const visiblePieceIds = dragPieceOrder ?? pieceIds
  const orderedPieces = useMemo(() => {
    const ordered = visiblePieceIds
      .map((pieceId) => pieceById.get(pieceId))
      .filter((piece): piece is Piece => Boolean(piece))
    const orderedIds = new Set(ordered.map((piece) => piece.id))
    return [...ordered, ...pieces.filter((piece) => !orderedIds.has(piece.id))]
  }, [pieceById, pieces, visiblePieceIds])

  useEffect(() => {
    void loadSections()
  }, [loadSections])

  function canUploadSection(sectionId: string) {
    if (isManager) return true
    return myMember?.role === 'principal' && myMember.sectionId === sectionId
  }

  async function submitPiece() {
    setError('')
    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      setError('Piece title is required')
      return
    }
    if (pieces.some((piece) => piece.title.toLowerCase() === normalizedTitle.toLowerCase())) {
      setError('This piece already exists')
      return
    }

    setCreating(true)
    try {
      const piece = await createPiece(project.id, {
        title: normalizedTitle,
        composer: composer.trim(),
      })
      setTitle('')
      setComposer('')
      setExpandedPieceId(piece.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create piece')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeletePiece(pieceId: string) {
    const piece = pieces.find((p) => p.id === pieceId)
    if (!piece) return
    const confirmed = window.confirm(`Delete "${piece.title}" and all section scores?`)
    if (!confirmed) return
    await deletePiece(project.id, pieceId)
    if (expandedPieceId === pieceId) setExpandedPieceId(null)
  }

  async function handleDeleteScore(scoreId: string, scoreTitle: string) {
    const confirmed = window.confirm(`Delete "${scoreTitle}"?`)
    if (!confirmed) return
    setDeletingScoreId(scoreId)
    try {
      await deleteProjectScore(project.id, scoreId)
    } finally {
      setDeletingScoreId(null)
    }
  }

  async function handleMovePiece(pieceId: string, direction: 'up' | 'down') {
    setReordering(true)
    setError('')
    try {
      await movePiece(project.id, pieceId, direction)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder pieces')
    } finally {
      setReordering(false)
    }
  }

  function handlePieceDragStart(event: DragEvent, pieceId: string) {
    if (!isManager || reordering) return
    committedDragRef.current = false
    setDragPieceOrder(pieceIds)
    setDraggingPieceId(pieceId)
    setDragOverPieceId(pieceId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', pieceId)
  }

  function handlePieceDragOver(event: DragEvent, overPieceId: string) {
    if (!isManager || reordering || !draggingPieceId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverPieceId(overPieceId)
    setDragPieceOrder((current) => moveIdBefore(current ?? pieceIds, draggingPieceId, overPieceId))
  }

  async function commitPieceOrder(nextOrder: string[]) {
    if (sameOrder(nextOrder, pieceIds)) {
      setDragPieceOrder(null)
      return
    }

    setReordering(true)
    setError('')
    try {
      await reorderPieces(project.id, nextOrder)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder pieces')
    } finally {
      setDragPieceOrder(null)
      setReordering(false)
    }
  }

  function handlePieceDrop(event: DragEvent, overPieceId: string) {
    if (!isManager || reordering) return
    event.preventDefault()
    const draggedId = draggingPieceId || event.dataTransfer.getData('text/plain')
    if (!draggedId) return

    committedDragRef.current = true
    const nextOrder = moveIdBefore(dragPieceOrder ?? pieceIds, draggedId, overPieceId)
    setDragPieceOrder(nextOrder)
    setDraggingPieceId(null)
    setDragOverPieceId(null)
    void commitPieceOrder(nextOrder)
  }

  function handlePieceDragEnd() {
    if (!committedDragRef.current) {
      setDragPieceOrder(null)
    }
    setDraggingPieceId(null)
    setDragOverPieceId(null)
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-slate-900">Pieces & Parts</div>
        <div className="mt-1 text-sm text-slate-600">
          Create performance pieces first, then expand a piece to upload PDF, MusicXML, XML, or MXL parts for each section.
        </div>
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold text-slate-950">Add performance piece</div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={!isManager || creating}
            placeholder="Piece title, e.g. Dvorak Symphony No. 9"
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
          />
          <input
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            disabled={!isManager || creating}
            placeholder="Composer (optional)"
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
          />
          <Button disabled={!isManager || creating} onClick={() => void submitPiece()}>
            <Plus className="size-4" />
            {creating ? 'Adding...' : 'Add piece'}
          </Button>
        </div>
        {!isManager && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Only managers can add, delete, or reorder pieces.
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </Card>

      {sectionsLoading && (
        <Card className="p-6">
          <div className="text-sm text-slate-600">Loading sections...</div>
        </Card>
      )}

      {!sectionsLoading && pieces.length === 0 && (
        <Card className="p-6">
          <div className="text-sm font-semibold text-slate-900">No pieces yet</div>
          <div className="mt-1 text-sm text-slate-600">Add a performance piece, then expand it to upload section parts.</div>
        </Card>
      )}

      <div className="space-y-3">
        {orderedPieces.map((piece, index) => {
          const expanded = expandedPieceId === piece.id
          const uploadedCount = sections.filter(
            (section) => !!getPieceScore(project.id, piece.id, section.id),
          ).length
          const isDragging = draggingPieceId === piece.id
          const isDragTarget = dragOverPieceId === piece.id && draggingPieceId !== piece.id

          return (
            <Card
              key={piece.id}
              onDragOver={(event) => handlePieceDragOver(event, piece.id)}
              onDrop={(event) => handlePieceDrop(event, piece.id)}
              className={cn(
                'overflow-hidden transition-all duration-200 ease-out',
                isManager && 'group',
                isDragging && 'scale-[0.995] opacity-60 shadow-lg',
                isDragTarget && 'ring-2 ring-sky-300 ring-offset-2',
                reordering && 'pointer-events-none opacity-80',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                {isManager && (
                  <button
                    type="button"
                    draggable={!reordering}
                    onDragStart={(event) => handlePieceDragStart(event, piece.id)}
                    onDragEnd={handlePieceDragEnd}
                    className="grid size-9 shrink-0 cursor-grab place-items-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700 active:cursor-grabbing"
                    aria-label={`Drag ${piece.title} to reorder`}
                    title="Drag to reorder"
                  >
                    <GripVertical className="size-5" />
                  </button>
                )}
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => setExpandedPieceId(expanded ? null : piece.id)}
                >
                  <span className="text-slate-500">
                    {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </span>
                  <div className="grid size-9 place-items-center rounded-md bg-white text-slate-700 shadow-sm">
                    <Music2 className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">
                      {index + 1}. {piece.title}
                    </div>
                    <div className="text-xs text-slate-500">{piece.composer || 'Composer not set'}</div>
                  </div>
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    {uploadedCount}/{sections.length} sections
                  </Badge>
                  {isManager && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={index === 0 || reordering}
                        onClick={() => void handleMovePiece(piece.id, 'up')}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={index === orderedPieces.length - 1 || reordering}
                        onClick={() => void handleMovePiece(piece.id, 'down')}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={reordering}
                        onClick={() => void handleDeletePiece(piece.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {expanded && (
                <div className="divide-y divide-slate-200">
                  {sections.map((section) => {
                    const score = getPieceScore(project.id, piece.id, section.id)
                    const canUpload = canUploadSection(section.id)
                    return (
                      <div
                        key={section.id}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900">{sectionLabel(section)}</div>
                          {score ? (
                            <div className="mt-1 text-xs text-slate-500">
                              {score.originalFilename || score.title} ·{' '}
                              {score.updatedAt.slice(0, 16).replace('T', ' ')}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-slate-500">Not uploaded yet</div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {score ? <Badge tone="success">Ready</Badge> : <Badge>Empty</Badge>}
                          {score && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  navigate(
                                    `/projects/${project.id}/scores/${score.id}/musicxml`,
                                  )
                                }
                              >
                                <ExternalLink className="size-4" />
                                Open
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={deletingScoreId === score.id}
                                onClick={() => void handleDeleteScore(score.id, score.title)}
                              >
                                <Trash2 className="size-4" />
                                {deletingScoreId === score.id ? 'Deleting...' : 'Delete'}
                              </Button>
                            </>
                          )}
                          {!score && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!canUpload}
                              onClick={() => setUploadTarget({ piece, section })}
                            >
                              <Upload className="size-4" />
                              Upload
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {!isManager && myMember?.role !== 'principal' && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-slate-900">Upload permissions</div>
          <div className="mt-1 text-sm text-slate-600">
            Managers can upload every section. Principals can upload their own section. Members cannot upload scores.
          </div>
        </Card>
      )}

      {uploadTarget && (
        <PieceSectionUploadModal
          project={project}
          piece={uploadTarget.piece}
          section={uploadTarget.section}
          open={!!uploadTarget}
          onClose={() => setUploadTarget(null)}
          onUploaded={async () => {
            await loadProjectDetail(project.id, { force: true })
          }}
        />
      )}
    </div>
  )
}
