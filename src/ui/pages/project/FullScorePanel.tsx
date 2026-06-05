import { useMemo, useState } from 'react'
import type { Project } from '../../../types'
import { useAppState } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { Modal } from '../../primitives/Modal'
import { useTranslation } from '../../../i18n'
import { memberSectionLabel } from '../../../utils/sectionLabels'

export function FullScorePanel({ project }: { project: Project }) {
  const { addToast } = useAppState()
  const { language, t } = useTranslation()
  const [generated, setGenerated] = useState(false)
  const [exportOpen, setExportOpen] = useState<null | 'musescore' | 'pdf'>(null)

  const sections = useMemo(() => {
    const set = new Set(project.members.map((m) => memberSectionLabel(m, language)))
    return Array.from(set)
  }, [language, project.members])

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-slate-900">{t('fullScore.title')}</div>
        <div className="mt-1 text-sm text-slate-600">
          {t('fullScore.description')}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <div className="text-sm font-semibold text-slate-900">{t('fullScore.selectedVersions')}</div>
          <div className="mt-1 text-sm text-slate-600">
            {t('fullScore.selectedVersionsDescription')}
          </div>

          <div className="mt-4 space-y-2">
            {sections.length === 0 ? (
              <div className="text-sm text-slate-500">{t('fullScore.noSections')}</div>
            ) : (
              sections.map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="text-sm font-medium text-slate-900">{i}</div>
                  <select className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm">
                    <option>{t('fullScore.current')}</option>
                    <option>{t('fullScore.previousCommit')}</option>
                    <option>{t('fullScore.customPick')}</option>
                  </select>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-medium">{t('fullScore.warnings')}</div>
            <ul className="mt-1 list-disc pl-5 text-amber-900/90">
              <li>{t('fullScore.warningOne')}</li>
              <li>{t('fullScore.warningTwo')}</li>
            </ul>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setGenerated(true)
                addToast({ title: t('fullScore.generatedToast') })
              }}
            >
              {t('fullScore.generate')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => addToast({ title: t('fullScore.versionAppliedToast'), message: t('fullScore.versionAppliedMessage') })}
            >
              {t('fullScore.chooseVersion')}
            </Button>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">{t('fullScore.preview')}</div>
              <div className="mt-1 text-sm text-slate-600">
                {t('fullScore.previewDescription')}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setExportOpen('musescore')}>
                {t('fullScore.exportMuseScore')}
              </Button>
              <Button variant="secondary" onClick={() => setExportOpen('pdf')}>
                {t('fullScore.exportPdf')}
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4">
            {!generated ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
                <div className="text-sm font-semibold text-slate-900">{t('fullScore.notGenerated')}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {t('fullScore.notGeneratedDescription')}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success">{t('fullScore.generated')}</Badge>
                  <Badge tone="info">{t('common.branch')}: {project.currentBranchName}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <MockSystemStaff
                    title={t('fullScore.strings')}
                    lines={[t('fullScore.violin'), t('fullScore.viola'), t('fullScore.cello')]}
                  />
                  <MockSystemStaff
                    title={t('fullScore.winds')}
                    lines={[t('fullScore.flute'), t('fullScore.clarinet'), t('fullScore.trumpet')]}
                  />
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
                  {t('fullScore.previewNote')}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Modal
        title={`${t('common.export')} ${exportOpen ?? ''}`}
        open={!!exportOpen}
        onClose={() => setExportOpen(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setExportOpen(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                addToast({ title: t('fullScore.exportComplete'), message: exportOpen === 'musescore' ? '.mscz created' : '.pdf created' })
                setExportOpen(null)
              }}
            >
              {t('common.export')}
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          {t('fullScore.exportDescription')}
        </div>
        {exportOpen === 'musescore' ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            {t('fullScore.museScoreDescription')}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            {t('fullScore.pdfDescription')}
          </div>
        )}
      </Modal>
    </div>
  )
}

function MockSystemStaff({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold text-slate-500">{title}</div>
      <div className="mt-3 space-y-2">
        {lines.map((l) => (
          <div key={l} className="flex items-center gap-2">
            <div className="w-24 text-sm font-medium text-slate-900">{l}</div>
            <div className="h-3 flex-1 rounded bg-slate-200" />
            <div className="h-3 flex-1 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </Card>
  )
}
