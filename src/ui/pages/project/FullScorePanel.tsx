import { useMemo, useState } from 'react'
import type { Project } from '../../../types'
import { useAppState } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { Modal } from '../../primitives/Modal'

export function FullScorePanel({ project }: { project: Project }) {
  const { addToast } = useAppState()
  const [generated, setGenerated] = useState(false)
  const [exportOpen, setExportOpen] = useState<null | 'musescore' | 'pdf'>(null)

  const sections = useMemo(() => {
    const set = new Set(project.members.map((m) => m.sectionName))
    return Array.from(set)
  }, [project.members])

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-slate-900">Full score generation (planned)</div>
        <div className="mt-1 text-sm text-slate-600">
          Demonstrates combining selected part versions into a full score. This is visual-only in the prototype.
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <div className="text-sm font-semibold text-slate-900">Selected versions</div>
          <div className="mt-1 text-sm text-slate-600">
            Choose which version to apply per instrument (mock).
          </div>

          <div className="mt-4 space-y-2">
            {sections.length === 0 ? (
              <div className="text-sm text-slate-500">No sections with scores yet.</div>
            ) : (
              sections.map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="text-sm font-medium text-slate-900">{i}</div>
                  <select className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm">
                    <option>current</option>
                    <option>previous commit</option>
                    <option>custom pick</option>
                  </select>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-medium">Consistency warnings</div>
            <ul className="mt-1 list-disc pl-5 text-amber-900/90">
              <li>Markings differ between Violin and Cello in measures 12–14.</li>
              <li>Suggested auto-fill available for repeated passages.</li>
            </ul>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setGenerated(true)
                addToast({ title: 'Full score generated (simulated)' })
              }}
            >
              Auto-generate full score
            </Button>
            <Button
              variant="secondary"
              onClick={() => addToast({ title: 'Version applied (simulated)', message: 'Selections saved locally (visual only).' })}
            >
              Choose version to apply
            </Button>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Full score preview</div>
              <div className="mt-1 text-sm text-slate-600">
                Placeholder panel for combined score rendering.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setExportOpen('musescore')}>
                Export MuseScore
              </Button>
              <Button variant="secondary" onClick={() => setExportOpen('pdf')}>
                Export PDF
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4">
            {!generated ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
                <div className="text-sm font-semibold text-slate-900">Not generated yet</div>
                <div className="mt-1 text-sm text-slate-600">
                  Click “Auto-generate full score” to populate a mock preview.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success">Generated</Badge>
                  <Badge tone="info">Branch: {project.currentBranchName}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <MockSystemStaff title="Strings" lines={['Violin', 'Viola', 'Cello']} />
                  <MockSystemStaff title="Winds" lines={['Flute', 'Clarinet', 'Trumpet']} />
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
                  Preview note: real score rendering is out of scope. This box shows where a combined score would display.
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Modal
        title={`Export ${exportOpen ?? ''} (simulated)`}
        open={!!exportOpen}
        onClose={() => setExportOpen(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setExportOpen(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                addToast({ title: 'Export complete (simulated)', message: exportOpen === 'musescore' ? '.mscz created' : '.pdf created' })
                setExportOpen(null)
              }}
            >
              Export
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          No real file export is performed. This shows where export actions would live.
        </div>
        {exportOpen === 'musescore' ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            MuseScore is the primary output format for the prototype.
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            PDF export is shown as available/planned; actual generation is deferred.
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

