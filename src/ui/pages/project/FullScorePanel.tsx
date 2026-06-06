import { useEffect, useMemo, useRef, useState } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { Download, FileText, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import type { FullScorePart, FullScoreResponse, Project } from '../../../types'
import { useAppState } from '../../../state/AppState'
import { useTranslation } from '../../../i18n'
import { sectionLabel } from '../../../utils/sectionLabels'
import { sanitizeMusicXmlForRender } from '../../utils/musicXml'
import * as scoresApi from '../../../api/scores'
import { ApiError } from '../../../api/client'
import { Badge } from '../../primitives/Badge'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'

type RenderStatus = 'idle' | 'loading' | 'ready' | 'error'

const SIMILAR_NOTE_COLOR = '#d97706' // amber-600: "check bowing consistency here"
const MIN_ZOOM = 25
const MAX_ZOOM = 150
const ZOOM_STEP = 10
const DEFAULT_ZOOM = 60

function fileSafeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'full-score'
}

function downloadMusicXml(filename: string, xml: string) {
  const url = URL.createObjectURL(
    new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function measureRangeText(start: number, end: number) {
  return `m.${start}${end !== start ? `–${end}` : ''}`
}

// Colour the noteheads of every measure that participates in a cross-instrument
// similar passage, mapped back from scoreId → part (via the parts table) → the
// matching staff range in the merged score. Best-effort: OSMD internals are
// untyped, so the whole thing is guarded and never blocks the render.
function colorSimilarMeasures(osmd: OpenSheetMusicDisplay, data: FullScoreResponse, color: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheet: any = (osmd as any).Sheet
    if (!sheet) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instruments: any[] = sheet.Instruments ?? []
    const partStartStaff: number[] = []
    let staffCursor = 0
    for (let i = 0; i < instruments.length; i += 1) {
      partStartStaff[i] = staffCursor
      const staveCount = instruments[i]?.Staves?.length ?? 1
      staffCursor += staveCount > 0 ? staveCount : 1
    }
    const staffIndexToPartIndex = (staffIndex: number) => {
      let partIndex = 0
      for (let i = 0; i < partStartStaff.length; i += 1) {
        if (staffIndex >= partStartStaff[i]) partIndex = i
        else break
      }
      return partIndex
    }

    const scoreIdToPartIndex = new Map(data.parts.map((part) => [part.scoreId, part.partIndex]))
    const partMeasures = new Map<number, Set<number>>()
    const addRange = (scoreId: string, start: number, end: number) => {
      const partIndex = scoreIdToPartIndex.get(scoreId)
      if (partIndex === undefined) return
      const set = partMeasures.get(partIndex) ?? new Set<number>()
      for (let m = Math.min(start, end); m <= Math.max(start, end); m += 1) set.add(m)
      partMeasures.set(partIndex, set)
    }
    data.highlights.forEach((highlight) => {
      addRange(highlight.leftScoreId, highlight.leftStartMeasureNumber, highlight.leftEndMeasureNumber)
      addRange(highlight.rightScoreId, highlight.rightStartMeasureNumber, highlight.rightEndMeasureNumber)
    })
    if (partMeasures.size === 0) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceMeasures: any[] = sheet.SourceMeasures ?? []
    for (const measure of sourceMeasures) {
      const measureNumber: number = measure?.MeasureNumber
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const containers: any[] = measure?.VerticalSourceStaffEntryContainers ?? []
      for (const container of containers) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const staffEntries: any[] = container?.StaffEntries ?? []
        staffEntries.forEach((staffEntry, staffIndex) => {
          if (!staffEntry) return
          const measures = partMeasures.get(staffIndexToPartIndex(staffIndex))
          if (!measures || !measures.has(measureNumber)) return
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const voiceEntries: any[] = staffEntry.VoiceEntries ?? []
          for (const voiceEntry of voiceEntries) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const notes: any[] = voiceEntry?.Notes ?? []
            for (const note of notes) note.NoteheadColor = color
          }
        })
      }
    }
  } catch {
    // ignore — colouring is a hint layer, not load-bearing
  }
}

export function FullScorePanel({ project }: { project: Project }) {
  const { addToast } = useAppState()
  const { language, t } = useTranslation()

  const pieces = useMemo(
    () => [...project.pieces].sort((a, b) => a.sortOrder - b.sortOrder),
    [project.pieces],
  )

  const [selectedPieceId, setSelectedPieceId] = useState<string>(pieces[0]?.id ?? '')
  const [status, setStatus] = useState<RenderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [data, setData] = useState<FullScoreResponse | null>(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
  const zoomRef = useRef(zoom)

  // Derive the effective selection so a stale/empty id falls back to the first
  // piece without a setState-in-effect sync (pieces can load after mount).
  const effectivePieceId = pieces.some((piece) => piece.id === selectedPieceId)
    ? selectedPieceId
    : pieces[0]?.id ?? ''

  const partByScoreId = useMemo(() => {
    const map = new Map<string, FullScorePart>()
    data?.parts.forEach((part) => map.set(part.scoreId, part))
    return map
  }, [data])

  const labelForScore = (scoreId: string) => {
    const part = partByScoreId.get(scoreId)
    if (!part) return scoreId.slice(0, 6)
    return sectionLabel({ code: part.sectionCode ?? '', name: part.sectionName ?? '' }, language)
  }

  async function handleGenerate() {
    if (!effectivePieceId) return
    setStatus('loading')
    setError(null)
    setRenderError(null)
    try {
      const result = await scoresApi.getPieceFullScore(project.id, effectivePieceId)
      setData(result)
      setStatus('ready')
    } catch (err) {
      setData(null)
      setStatus('error')
      const message = err instanceof ApiError ? err.message : t('fullScore.generateError')
      setError(message)
      addToast({ title: t('fullScore.generateError'), message })
    }
  }

  // Render the combined score whenever fresh data arrives.
  useEffect(() => {
    const container = containerRef.current
    if (!data || !container) return

    let cancelled = false
    container.innerHTML = ''
    setRenderError(null)

    const run = async () => {
      try {
        const osmd = new OpenSheetMusicDisplay(container, {
          autoResize: true,
          backend: 'svg',
          drawComposer: false,
          drawCredits: false,
          drawTitle: true,
          drawPartNames: true,
          drawMeasureNumbers: true,
          pageBackgroundColor: '#ffffff',
        })
        osmdRef.current = osmd
        await osmd.load(sanitizeMusicXmlForRender(data.xml))
        if (cancelled) return
        colorSimilarMeasures(osmd, data, SIMILAR_NOTE_COLOR)
        osmd.Zoom = zoomRef.current / 100
        osmd.render()
      } catch {
        if (!cancelled) setRenderError(t('fullScore.renderError'))
      }
    }

    void run()

    return () => {
      cancelled = true
    }
    // language excluded on purpose: re-rendering OSMD on a locale flip is wasteful;
    // the canvas has no localized text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // Apply zoom changes without rebuilding OSMD from scratch.
  useEffect(() => {
    zoomRef.current = zoom
    const osmd = osmdRef.current
    if (!osmd || status !== 'ready' || !data) return
    try {
      osmd.Zoom = zoom / 100
      osmd.render()
    } catch {
      // ignore transient render races
    }
  }, [zoom, status, data])

  const handleExportMusicXml = () => {
    if (!data) return
    downloadMusicXml(`${fileSafeName(data.pieceTitle)}-full-score.musicxml`, data.xml)
    addToast({ title: t('fullScore.exported') })
  }

  const handleExportPdf = () => {
    addToast({ title: t('fullScore.exportPdf'), message: t('fullScore.pdfComingSoon') })
  }

  const isLoading = status === 'loading'
  const hasPieces = pieces.length > 0

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-slate-900">{t('fullScore.title')}</div>
        <div className="mt-1 text-sm text-slate-600">{t('fullScore.description')}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <label className="text-sm font-semibold text-slate-900" htmlFor="full-score-piece">
            {t('fullScore.piece')}
          </label>
          {hasPieces ? (
            <select
              id="full-score-piece"
              className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={effectivePieceId}
              disabled={isLoading}
              onChange={(event) => {
                setSelectedPieceId(event.target.value)
                setData(null)
                setStatus('idle')
                setError(null)
              }}
            >
              {pieces.map((piece) => (
                <option key={piece.id} value={piece.id}>
                  {piece.title}
                  {piece.composer ? ` — ${piece.composer}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-2 text-sm text-slate-500">{t('fullScore.noPieces')}</div>
          )}

          <div className="mt-4">
            <Button disabled={!hasPieces || !effectivePieceId || isLoading} onClick={handleGenerate}>
              {status === 'ready' ? <RotateCcw className="size-4" /> : null}
              {isLoading
                ? t('fullScore.generating')
                : status === 'ready'
                  ? t('fullScore.regenerate')
                  : t('fullScore.generate')}
            </Button>
          </div>

          {status === 'error' && error ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          {status === 'ready' && data ? (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">
                  {t('fullScore.similarHints')}
                </div>
                <Badge tone={data.highlights.length ? 'info' : 'neutral'}>
                  {data.highlights.length}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-slate-600">{t('fullScore.similarHintsDescription')}</div>

              {data.highlights.length === 0 ? (
                <div className="mt-3 text-sm text-slate-500">{t('fullScore.noHints')}</div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.highlights.map((highlight, index) => (
                    <li
                      key={`${highlight.leftScoreId}-${highlight.rightScoreId}-${index}`}
                      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {labelForScore(highlight.leftScoreId)} ↔ {labelForScore(highlight.rightScoreId)}
                        </span>
                        <span className="shrink-0 font-semibold">
                          {Math.round(highlight.similarity * 100)}%
                        </span>
                      </div>
                      <div className="mt-0.5 text-amber-800/90">
                        {labelForScore(highlight.leftScoreId)}{' '}
                        {measureRangeText(highlight.leftStartMeasureNumber, highlight.leftEndMeasureNumber)}
                        {'  ·  '}
                        {labelForScore(highlight.rightScoreId)}{' '}
                        {measureRangeText(highlight.rightStartMeasureNumber, highlight.rightEndMeasureNumber)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">{t('fullScore.preview')}</div>
              <div className="mt-1 text-sm text-slate-600">{t('fullScore.previewDescription')}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('fullScore.zoomOut')}
                  disabled={!data || zoom <= MIN_ZOOM}
                  onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))}
                >
                  <ZoomOut className="size-4" />
                </Button>
                <span className="w-10 text-center text-xs tabular-nums text-slate-600">{zoom}%</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('fullScore.zoomIn')}
                  disabled={!data || zoom >= MAX_ZOOM}
                  onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))}
                >
                  <ZoomIn className="size-4" />
                </Button>
              </div>
              <Button variant="secondary" size="sm" disabled={!data} onClick={handleExportMusicXml}>
                <Download className="size-4" />
                {t('fullScore.exportMusicXml')}
              </Button>
              <Button variant="secondary" size="sm" disabled onClick={handleExportPdf}>
                <FileText className="size-4" />
                {t('fullScore.exportPdf')}
              </Button>
            </div>
          </div>

          {data ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.parts.map((part) => (
                <Badge key={part.partId} tone="neutral">
                  {labelForScore(part.scoreId)}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-2">
            {renderError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                {renderError}
              </div>
            ) : isLoading ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
                {t('fullScore.generating')}
              </div>
            ) : data ? (
              <div ref={containerRef} className="max-h-[70vh] overflow-auto" />
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
                <div className="text-sm font-semibold text-slate-900">{t('fullScore.notGenerated')}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {t('fullScore.notGeneratedDescription')}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
