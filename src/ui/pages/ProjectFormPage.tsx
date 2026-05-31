import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAppState } from '../../state/AppState'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { ArrowLeft, Save } from 'lucide-react'

const inputClassName =
  'mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100'

export function ProjectFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { projectId } = useParams()
  const {
    createProject,
    getProject,
    loadProjectDetail,
    loadSections,
    sections,
    sectionsLoading,
    updateProjectDraft,
  } = useAppState()
  const navigate = useNavigate()
  const project = projectId ? getProject(projectId) : undefined

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isEdit = mode === 'edit'

  useEffect(() => {
    void loadSections().then((rows) => {
      if (rows.length > 0) setSectionId((prev) => prev || rows[0].id)
    })
  }, [loadSections])

  useEffect(() => {
    if (!isEdit || !projectId) return
    void loadProjectDetail(projectId)
  }, [isEdit, loadProjectDetail, projectId])

  useEffect(() => {
    if (!isEdit || !project) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(project.name)
    setDescription(project.description)
  }, [isEdit, project])

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false
    if (!isEdit && !sectionId) return false
    return true
  }, [isEdit, name, sectionId])

  async function submit() {
    setError('')
    if (!name.trim()) {
      setError('請填寫 Project 名稱')
      return
    }
    if (!isEdit && !sectionId) {
      setError('建立 Project 時必須選擇 manager 所屬聲部')
      return
    }

    setLoading(true)
    try {
      if (isEdit) {
        if (!projectId) return
        updateProjectDraft(projectId, {
          name: name.trim(),
          description: description.trim(),
        })
        navigate(`/projects/${projectId}`)
        return
      }

      const created = await createProject({
        name: name.trim(),
        description: description.trim(),
        sectionId,
      })
      navigate(`/projects/${created.id}?tab=pieces`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '儲存失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-950">
            {isEdit ? 'Edit performance project' : 'Create performance project'}
          </div>
          <div className="mt-1 text-sm text-slate-600">
            Project 代表一場表演；建立者在目前後端角色中會成為 manager（concertmaster）。
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate(isEdit && projectId ? `/projects/${projectId}` : '/projects')}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>

      <Card className="p-5">
        <div className="grid gap-4">
          <div>
            <label className="text-sm font-medium text-slate-800">Project name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="2026 Spring Concert"
              className={inputClassName}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-800">Description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="演出日期、地點或排練備註"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="text-sm font-medium text-slate-800">Manager section</label>
              <select
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
                disabled={sectionsLoading || sections.length === 0}
                className={inputClassName}
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-slate-500">
                後端目前使用 concertmaster 表示 manager；建立成功後會自動加入 Project 成員。
              </div>
            </div>
          )}

          {isEdit && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {/* TODO API contract: PATCH /api/projects/:projectId request { name, description } response ApiProject */}
              編輯 Project 後端 API 尚未實作；此頁目前只更新前端 session 狀態。
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <Button disabled={loading || !canSubmit} onClick={submit}>
              <Save className="size-4" />
              {loading ? 'Saving…' : 'Save project'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
