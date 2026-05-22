import { useNavigate } from 'react-router-dom'
import type { Project } from '../../../types'
import { Badge } from '../../primitives/Badge'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { Edit3, Music2, Upload } from 'lucide-react'

export function ScoresPanel({ project }: { project: Project }) {
  const navigate = useNavigate()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">Scores / Parts</div>
          <div className="mt-1 text-sm text-slate-600">
            依聲部管理的樂譜。上傳功能尚未在此版本啟用。
          </div>
        </div>
        <Button variant="secondary" disabled>
          <Upload className="size-4" />
          Upload score
        </Button>
      </div>

      {project.scores.length === 0 ? (
        <Card className="p-6">
          <div className="text-sm font-semibold text-slate-900">尚無樂譜</div>
          <div className="mt-1 text-sm text-slate-600">
            此專案還沒有上傳任何分譜。
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {project.scores.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="grid size-9 place-items-center rounded-md border border-slate-200 bg-slate-50">
                  <Music2 className="size-4 text-slate-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-950">{s.title}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone="info">{s.fileType}</Badge>
                    {s.originalFilename && <Badge>{s.originalFilename}</Badge>}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Updated {s.updatedAt.slice(0, 10)}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => navigate(`/projects/${project.id}/scores/${s.id}/editor`)}
                >
                  <Edit3 className="size-4" />
                  Open editor
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
