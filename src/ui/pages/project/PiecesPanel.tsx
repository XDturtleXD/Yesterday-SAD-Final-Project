import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Piece, Project, Section } from '../../../types'
import { useAppState, useRequiredUser } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { PieceSectionUploadModal } from './PieceSectionUploadModal'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Music2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'

type UploadTarget = {
  piece: Piece
  section: Section
} | null

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

  const isManager = useMemo(() => {
    if (currentUser.role === 'admin') return true
    return project.members.some(
      (member) => member.userId === currentUser.id && member.role === 'concertmaster',
    )
  }, [currentUser, project.members])

  const myMember = project.members.find((member) => member.userId === currentUser.id)

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
      setError('曲目名稱為必填')
      return
    }
    if (pieces.some((piece) => piece.title.toLowerCase() === normalizedTitle.toLowerCase())) {
      setError('此曲目已存在')
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
      setError(err instanceof Error ? err.message : '建立曲目失敗')
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

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-slate-900">曲目與分譜管理</div>
        <div className="mt-1 text-sm text-slate-600">
          先建立表演曲目，展開後可為各聲部上傳 PDF、MusicXML、XML 或 MXL 分譜。
        </div>
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold text-slate-950">新增表演曲目</div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={!isManager || creating}
            placeholder="曲目名稱，例如 Dvorak Symphony No. 9"
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
          />
          <input
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            disabled={!isManager || creating}
            placeholder="作曲家（選填）"
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
          />
          <Button disabled={!isManager || creating} onClick={() => void submitPiece()}>
            <Plus className="size-4" />
            {creating ? 'Adding…' : 'Add piece'}
          </Button>
        </div>
        {!isManager && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            只有 manager 可以新增、刪除或排序曲目。
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
          <div className="text-sm text-slate-600">載入聲部中…</div>
        </Card>
      )}

      {!sectionsLoading && pieces.length === 0 && (
        <Card className="p-6">
          <div className="text-sm font-semibold text-slate-900">尚無曲目</div>
          <div className="mt-1 text-sm text-slate-600">請先新增表演曲目，再展開上傳各聲部分譜。</div>
        </Card>
      )}

      <div className="space-y-3">
        {pieces.map((piece, index) => {
          const expanded = expandedPieceId === piece.id
          const uploadedCount = sections.filter(
            (section) => !!getPieceScore(project.id, piece.id, section.id),
          ).length

          return (
            <Card key={piece.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
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
                      {piece.sortOrder}. {piece.title}
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
                        disabled={index === 0}
                        onClick={() => void movePiece(project.id, piece.id, 'up')}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={index === pieces.length - 1}
                        onClick={() => void movePiece(project.id, piece.id, 'down')}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
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
                          <div className="text-sm font-medium text-slate-900">{section.name}</div>
                          {score ? (
                            <div className="mt-1 text-xs text-slate-500">
                              {score.originalFilename || score.title} ·{' '}
                              {score.updatedAt.slice(0, 16).replace('T', ' ')}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-slate-500">尚未上傳</div>
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
                                {deletingScoreId === score.id ? 'Deleting…' : 'Delete'}
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
          <div className="text-sm font-semibold text-slate-900">上傳權限限制</div>
          <div className="mt-1 text-sm text-slate-600">
            目前只有 manager 可以上傳所有聲部，首席只能上傳自己聲部，一般成員不可上傳。
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
