import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAppState } from '../../state/AppState'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { useTranslation } from '../../i18n'
import { sectionLabel } from '../../utils/sectionLabels'
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
  const { language, t } = useTranslation()
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
      setError(t('project.nameRequired'))
      return
    }
    if (!isEdit && !sectionId) {
      setError(t('project.managerSectionRequired'))
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
      setError(err instanceof ApiError ? err.message : t('project.saveFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-950">
            {isEdit ? t('project.editPerformanceProject') : t('project.createPerformanceProject')}
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {t('project.formDescription')}
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate(isEdit && projectId ? `/projects/${projectId}` : '/projects')}>
          <ArrowLeft className="size-4" />
          {t('common.back')}
        </Button>
      </div>

      <Card className="p-5">
        <div className="grid gap-4">
          <div>
            <label className="text-sm font-medium text-slate-800">{t('project.name')}</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('project.namePlaceholder')}
              className={inputClassName}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-800">{t('project.description')}</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder={t('project.descriptionPlaceholder')}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="text-sm font-medium text-slate-800">{t('project.managerSection')}</label>
              <select
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
                disabled={sectionsLoading || sections.length === 0}
                className={inputClassName}
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {sectionLabel(section, language)}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-slate-500">
                {t('project.managerSectionHelp')}
              </div>
            </div>
          )}

          {isEdit && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {/* TODO API contract: PATCH /api/projects/:projectId request { name, description } response ApiProject */}
              {t('project.editBackendPending')}
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
              {loading ? t('common.saving') : t('project.saveProject')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
