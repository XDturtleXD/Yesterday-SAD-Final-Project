import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppState } from '../../state/AppState'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { Modal } from '../primitives/Modal'
import { Badge } from '../primitives/Badge'
import { cn } from '../utils/cn'
import {
  Pencil,
  Eraser,
  Pipette,
  Hand,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  ArrowLeft,
} from 'lucide-react'

type Tool =
  | 'draw'
  | 'eraser'
  | 'eyedropper'
  | 'pan'
  | 'zoomIn'
  | 'zoomOut'
  | 'undo'
  | 'redo'
  | 'upBow'
  | 'downBow'

export function ScoreEditorPage() {
  const { projectId, scoreId } = useParams()
  const navigate = useNavigate()
  const { getProject, getScore, loadProjectDetail, addToast } = useAppState()

  const project = projectId ? getProject(projectId) : undefined
  const score = projectId && scoreId ? getScore(projectId, scoreId) : undefined

  useEffect(() => {
    if (projectId) loadProjectDetail(projectId)
  }, [projectId, loadProjectDetail])

  const [tool, setTool] = useState<Tool>('draw')
  const [zoom, setZoom] = useState(100)
  const [undoCount, setUndoCount] = useState(2)
  const [redoCount, setRedoCount] = useState(0)
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState('Updated markings (prototype)')
  const [copiedMarking, setCopiedMarking] = useState<null | string>(null)
  const [selectedCell, setSelectedCell] = useState<string | null>(null)

  const measures = useMemo(() => {
    const ids = Array.from({ length: 12 }).map((_, i) => `m-${i + 1}`)
    return ids
  }, [])

  const title = score?.title ?? 'Score editor'

  if (!project || !score) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <div className="text-sm font-semibold text-slate-900">Editor target not found</div>
          <div className="mt-2">
            <Button variant="secondary" onClick={() => navigate('/projects')}>
              Back to projects
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
              <Badge tone="info">{score.fileType}</Badge>
              <Badge>Branch: {project.currentBranchName}</Badge>
              <Badge>Zoom: {zoom}%</Badge>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Prototype editor — no real score rendering. Boxes under “notes” accept mock markings.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => navigate(`/projects/${project.id}?tab=pieces`)}
            >
              <ArrowLeft className="size-4" />
              Back to score list
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                addToast({ title: 'Changes discarded (simulated)' })
                navigate(`/projects/${project.id}?tab=pieces`)
              }}
            >
              <X className="size-4" />
              Discard changes
            </Button>
            <Button onClick={() => setCommitOpen(true)}>
              <Check className="size-4" />
              Confirm changes
            </Button>
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <ToolButton active={tool === 'draw'} onClick={() => setTool('draw')} icon={<Pencil className="size-4" />} label="Draw" />
          <ToolButton active={tool === 'eraser'} onClick={() => setTool('eraser')} icon={<Eraser className="size-4" />} label="Eraser" />
          <ToolButton
            active={tool === 'eyedropper'}
            onClick={() => setTool('eyedropper')}
            icon={<Pipette className="size-4" />}
            label="Eyedropper"
          />
          <ToolButton active={tool === 'pan'} onClick={() => setTool('pan')} icon={<Hand className="size-4" />} label="Drag/Pan" />
          <div className="mx-1 h-6 w-px bg-slate-200" />
          <ToolButton
            active={tool === 'zoomIn'}
            onClick={() => {
              setTool('zoomIn')
              setZoom((z) => Math.min(200, z + 10))
            }}
            icon={<ZoomIn className="size-4" />}
            label="Zoom in"
          />
          <ToolButton
            active={tool === 'zoomOut'}
            onClick={() => {
              setTool('zoomOut')
              setZoom((z) => Math.max(50, z - 10))
            }}
            icon={<ZoomOut className="size-4" />}
            label="Zoom out"
          />
          <ToolButton
            active={tool === 'undo'}
            onClick={() => {
              setTool('undo')
              setUndoCount((c) => Math.max(0, c - 1))
              setRedoCount((c) => c + 1)
            }}
            icon={<Undo2 className="size-4" />}
            label={`Undo (${undoCount})`}
            disabled={undoCount === 0}
          />
          <ToolButton
            active={tool === 'redo'}
            onClick={() => {
              setTool('redo')
              setRedoCount((c) => Math.max(0, c - 1))
              setUndoCount((c) => c + 1)
            }}
            icon={<Redo2 className="size-4" />}
            label={`Redo (${redoCount})`}
            disabled={redoCount === 0}
          />
          <div className="mx-1 h-6 w-px bg-slate-200" />
          <ToolButton
            active={tool === 'upBow'}
            onClick={() => setTool('upBow')}
            icon={<ArrowUp className="size-4" />}
            label="Up-bow"
          />
          <ToolButton
            active={tool === 'downBow'}
            onClick={() => setTool('downBow')}
            icon={<ArrowDown className="size-4" />}
            label="Down-bow"
          />

          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            Active tool: <span className="font-medium text-slate-900">{tool}</span>
            {copiedMarking && <Badge tone="success">Copied: {copiedMarking}</Badge>}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                <div className="font-medium">Same passage detected</div>
                <div className="text-xs text-sky-800">
                  Suggested marking can be auto-filled.
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <div className="font-medium">Warning</div>
                <div className="text-xs text-amber-800">
                  This passage differs from another member’s part.
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500">
              Click a measure cell to select; type markings in the box below it.
            </div>
          </div>

          <Card className="p-4">
            <div
              className="mx-auto max-w-5xl"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}
            >
              <div className="grid gap-3">
                {measures.map((m, idx) => (
                  <MeasureRow
                    key={m}
                    id={m}
                    index={idx + 1}
                    selected={selectedCell === m}
                    onClick={() => {
                      setSelectedCell(m)
                      if (tool === 'eyedropper') setCopiedMarking('↓ bow')
                    }}
                  />
                ))}
              </div>
            </div>
          </Card>
        </div>

        <aside className="hidden w-80 shrink-0 lg:block">
          <Card className="p-4">
            <div className="text-sm font-semibold text-slate-900">Inspector</div>
            <div className="mt-1 text-sm text-slate-600">
              Selected: <span className="font-medium text-slate-900">{selectedCell ?? '—'}</span>
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium text-slate-800">Marking input</div>
              <input
                value={selectedCell ? '↓ bow · fingering 2' : ''}
                readOnly={!selectedCell}
                placeholder={selectedCell ? 'Type here...' : 'Select a measure'}
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                onChange={() => {}}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!selectedCell}
                  onClick={() => addToast({ title: 'Auto-fill applied (simulated)', message: selectedCell ?? '' })}
                >
                  Apply suggestion
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!selectedCell}
                  onClick={() => addToast({ title: 'Ignored suggestion (simulated)', message: selectedCell ?? '' })}
                >
                  Ignore
                </Button>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <Modal
        title="Commit message"
        open={commitOpen}
        onClose={() => setCommitOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCommitOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setCommitOpen(false)
                addToast({ title: 'Changes saved locally', message: commitMessage })
                navigate(`/projects/${project.id}?tab=versions`)
              }}
            >
              Confirm
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          This visually communicates the Git-like history concept. No real version control is used.
        </div>
        <div className="mt-3">
          <div className="text-sm font-medium text-slate-800">Commit message</div>
          <input
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            placeholder="e.g. Updated violin bowing for measures 12–18"
          />
        </div>
      </Modal>
    </div>
  )
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition',
        active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
        disabled && 'opacity-50',
      )}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function MeasureRow({
  id,
  index,
  selected,
  onClick,
}: {
  id: string
  index: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition',
        selected ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white hover:bg-slate-50',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">Measure {index}</div>
        <div className="text-xs text-slate-500">{id}</div>
      </div>
      <div className="mt-3 grid grid-cols-8 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded border border-slate-200 bg-slate-50 p-2"
          >
            <div className="h-6 rounded bg-white" />
            <div className="mt-2 h-8 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
              marking box
            </div>
          </div>
        ))}
      </div>
    </button>
  )
}
