import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../../api/client'
import { useAppState } from '../../../state/AppState'
import { useTranslation } from '../../../i18n'
import { sectionLabel } from '../../../utils/sectionLabels'
import { Button } from '../../primitives/Button'
import { Modal } from '../../primitives/Modal'

export function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createProject, loadSections, sections, sectionsLoading } = useAppState()
  const { language, t } = useTranslation()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      loadSections().then((rows) => {
        if (rows.length > 0) {
          setSectionId((prev) => prev || rows[0].id)
        }
      })
    }
  }, [open, loadSections])

  return (
    <Modal
      title={t('projects.create')}
      open={open}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={loading || !name.trim() || !sectionId}
            onClick={async () => {
              setError('')
              setLoading(true)
              try {
                const p = await createProject({
                  name: name.trim(),
                  description: description.trim(),
                  sectionId,
                })
                onClose()
                navigate(`/projects/${p.id}`)
              } catch (err) {
                setError(err instanceof ApiError ? err.message : t('project.createFailed'))
              } finally {
                setLoading(false)
              }
            }}
          >
            {loading ? t('common.creating') : t('common.create')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div>
          <div className="text-sm font-medium text-slate-800">{t('project.name')}</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('project.namePlaceholder')}
            className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          />
        </div>

        <div>
          <div className="text-sm font-medium text-slate-800">{t('project.description')}</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div>
          <div className="text-sm font-medium text-slate-800">{t('profile.section')}</div>
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            disabled={sectionsLoading || sections.length === 0}
            className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {sectionLabel(s, language)}
              </option>
            ))}
          </select>
          <div className="mt-1 text-xs text-slate-500">
            {t('project.managerSectionHelp')}
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
