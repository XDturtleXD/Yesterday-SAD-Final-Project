import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppState } from '../../state/AppState'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'

export function ScorePdfViewPage() {
  const navigate = useNavigate()
  const { projectId, scoreId } = useParams()
  const { getProject, loadProjectDetail } = useAppState()

  useEffect(() => {
    if (projectId) loadProjectDetail(projectId)
  }, [projectId, loadProjectDetail])

  const project = projectId ? getProject(projectId) : undefined
  const score = project?.scores.find((s) => s.id === scoreId)

  if (!project || !score) {
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-slate-900">Score PDF not found</div>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/projects')}>
            Back to projects
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="text-sm font-semibold text-slate-900">{score.title}</div>
      <div className="mt-1 text-sm text-slate-600">PDF preview is not available for this score yet.</div>
      <div className="mt-4">
        <Button variant="secondary" onClick={() => navigate(`/projects/${project.id}?tab=scores`)}>
          Back to scores
        </Button>
      </div>
    </Card>
  )
}
