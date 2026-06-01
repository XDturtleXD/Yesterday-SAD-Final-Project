import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import {
  OpenSheetMusicDisplay,
  PointF2D,
  type GraphicalNote,
} from 'opensheetmusicdisplay'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import * as scoresApi from '../../api/scores'
import { useAppState } from '../../state/AppState'
import type { Score } from '../../types'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { Modal } from '../primitives/Modal'
import { cn } from '../utils/cn'
import {
  ArrowLeft,
  Download,
  Eraser,
  Hand,
  Maximize2,
  MousePointer2,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

type ScoreXmlEntry = {
  title: string
  composer: string
  xmlUrl: string
}

type DynamicMark = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff'
type BowingMark = 'up-bow' | 'down-bow'
type SelectionMode = 'select' | 'pan' | 'slur'

type EditableNoteRef = {
  scoreId: string
  partId: string
  measureNumber: number
  noteIndex: number
}

type SlurDraft = {
  start: EditableNoteRef
  end?: EditableNoteRef
}

type XmlHistory = {
  past: string[]
  future: string[]
}

type IndexedXmlNote = EditableNoteRef & {
  note: Element
}

type RenderStatus = 'idle' | 'loading' | 'ready' | 'error'
type SvgAnchor = { x: number; y: number }

const SCORE_XML_MAP: Record<string, ScoreXmlEntry> = {
  's-canon-v1': {
    title: 'Symphony No.9, Op.95 - Violin II Part',
    composer: 'Antonin Dvorak',
    xmlUrl: '/musicxml/dvorak-sym9-violin2.musicxml',
  },
  's-canon-v2': {
    title: 'Symphony No.9, Op.95 - Violin I Part',
    composer: 'Antonin Dvorak',
    xmlUrl: '/musicxml/dvorak-sym9-violin1.musicxml',
  },
  's-canon-full': {
    title: 'Symphony No.9, Op.95 - Full Score',
    composer: 'Antonin Dvorak',
    xmlUrl: '/musicxml/dvorak-sym9-full-score.musicxml',
  },
}

const DYNAMICS: DynamicMark[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff']
const HIGHLIGHT_COLOR = '#0284c7'
const DEFAULT_MUSIC_COLOR = '#000000'
const SVG_NS = 'http://www.w3.org/2000/svg'
const INSTANT_PREVIEW_LAYER_ATTR = 'data-musicxml-instant-preview-layer'
const INSTANT_PREVIEW_KIND_ATTR = 'data-musicxml-instant-preview-kind'
const OSMD_BACKGROUND_RENDER_DELAY_MS = 650

function parseMusicXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parserError = doc.getElementsByTagName('parsererror')[0]
  if (parserError) {
    throw new Error('MusicXML could not be parsed.')
  }
  return doc
}

function serializeMusicXml(doc: Document) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(doc.documentElement)}\n`
}

function elementChildren(parent: ParentNode, localName?: string) {
  return Array.from(parent.children).filter(
    (child) => !localName || child.localName === localName,
  )
}

function getMeasureNumber(measure: Element, fallback: number) {
  const raw = measure.getAttribute('number')
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

function isGraceNote(note: Element) {
  return elementChildren(note, 'grace').length > 0
}

function buildEditableNoteIndex(doc: Document, scoreId: string): IndexedXmlNote[] {
  const parts = elementChildren(doc.documentElement, 'part')

  return parts.flatMap((part) => {
    const partId = part.getAttribute('id') ?? 'P1'
    const measures = elementChildren(part, 'measure')

    return measures.flatMap((measure, measureIndex) => {
      const measureNumber = getMeasureNumber(measure, measureIndex + 1)
      const notes = elementChildren(measure, 'note').filter((note) => !isGraceNote(note))

      return notes.map((note, noteIndex) => ({
        scoreId,
        partId,
        measureNumber,
        noteIndex,
        note,
      }))
    })
  })
}

function refsEqual(a: EditableNoteRef | null | undefined, b: EditableNoteRef | null | undefined) {
  return (
    !!a &&
    !!b &&
    a.scoreId === b.scoreId &&
    a.partId === b.partId &&
    a.measureNumber === b.measureNumber &&
    a.noteIndex === b.noteIndex
  )
}

function noteRefKey(ref: EditableNoteRef) {
  return `${ref.scoreId}::${ref.partId}::${ref.measureNumber}::${ref.noteIndex}`
}

function compareRefs(a: EditableNoteRef, b: EditableNoteRef) {
  if (a.partId !== b.partId) return a.partId.localeCompare(b.partId)
  if (a.measureNumber !== b.measureNumber) return a.measureNumber - b.measureNumber
  return a.noteIndex - b.noteIndex
}

function findXmlNote(doc: Document, ref: EditableNoteRef) {
  return (
    buildEditableNoteIndex(doc, ref.scoreId).find((item) => refsEqual(item, ref))?.note ??
    null
  )
}

function ensureChild(parent: Element, localName: string) {
  const existing = elementChildren(parent, localName)[0]
  if (existing) return existing

  const child = parent.ownerDocument.createElement(localName)
  parent.appendChild(child)
  return child
}

function removeElementIfEmpty(element: Element | null | undefined) {
  if (element && element.children.length === 0 && !element.textContent?.trim()) {
    element.remove()
  }
}

function isDynamicDirection(direction: Element) {
  return elementChildren(direction, 'direction-type').some(
    (directionType) => elementChildren(directionType, 'dynamics').length > 0,
  )
}

function removeDynamicBeforeNote(note: Element) {
  const previous = note.previousElementSibling
  if (previous?.localName === 'direction' && isDynamicDirection(previous)) {
    previous.remove()
    return true
  }

  return false
}

function createDynamicDirection(doc: Document, mark: DynamicMark) {
  const direction = doc.createElement('direction')
  direction.setAttribute('placement', 'below')

  const directionType = doc.createElement('direction-type')
  const dynamics = doc.createElement('dynamics')
  dynamics.appendChild(doc.createElement(mark))
  directionType.appendChild(dynamics)
  direction.appendChild(directionType)

  return direction
}

function replaceDynamic(xml: string, ref: EditableNoteRef, mark: DynamicMark) {
  const doc = parseMusicXml(xml)
  const note = findXmlNote(doc, ref)
  if (!note?.parentElement) throw new Error('Could not find the selected note in MusicXML.')

  removeDynamicBeforeNote(note)

  note.parentElement.insertBefore(createDynamicDirection(doc, mark), note)
  return serializeMusicXml(doc)
}

function removeBowingFromNote(note: Element) {
  const technical = elementChildren(note, 'notations')
    .flatMap((notations) => elementChildren(notations, 'technical'))[0]
  if (!technical) return false

  const bowings = elementChildren(technical).filter(
    (child) => child.localName === 'up-bow' || child.localName === 'down-bow',
  )
  bowings.forEach((child) => child.remove())
  removeElementIfEmpty(technical)
  elementChildren(note, 'notations').forEach(removeElementIfEmpty)

  return bowings.length > 0
}

function replaceBowing(xml: string, ref: EditableNoteRef, mark: BowingMark) {
  const doc = parseMusicXml(xml)
  const note = findXmlNote(doc, ref)
  if (!note) throw new Error('Could not find the selected note in MusicXML.')

  removeBowingFromNote(note)
  const notations = ensureChild(note, 'notations')
  const technical = ensureChild(notations, 'technical')

  technical.appendChild(doc.createElement(mark))
  return serializeMusicXml(doc)
}

function getSlurElements(note: Element) {
  return elementChildren(note, 'notations').flatMap((notations) =>
    elementChildren(notations, 'slur'),
  )
}

function getSlurNumber(slur: Element) {
  return slur.getAttribute('number') || '1'
}

function collectSlurRanges(doc: Document, scoreId: string, partId: string) {
  const ranges = new Map<
    string,
    { start?: EditableNoteRef; stop?: EditableNoteRef; slurs: Element[] }
  >()

  buildEditableNoteIndex(doc, scoreId)
    .filter((item) => item.partId === partId)
    .forEach((item) => {
      getSlurElements(item.note).forEach((slur) => {
        const number = getSlurNumber(slur)
        const current = ranges.get(number) ?? { slurs: [] }
        current.slurs.push(slur)
        if (slur.getAttribute('type') === 'start') current.start = item
        if (slur.getAttribute('type') === 'stop') current.stop = item
        ranges.set(number, current)
      })
    })

  return ranges
}

function rangesIntersect(
  aStart: EditableNoteRef,
  aEnd: EditableNoteRef,
  bStart: EditableNoteRef,
  bEnd: EditableNoteRef,
) {
  return compareRefs(aStart, bEnd) <= 0 && compareRefs(bStart, aEnd) <= 0
}

function removeSlurElements(slurs: Set<Element>) {
  if (slurs.size === 0) return false

  slurs.forEach((slur) => {
    const notations = slur.parentElement
    slur.remove()
    removeElementIfEmpty(notations)
  })

  return true
}

function removeSlursInRange(doc: Document, start: EditableNoteRef, end: EditableNoteRef) {
  const slurs = new Set<Element>()
  collectSlurRanges(doc, start.scoreId, start.partId).forEach((range) => {
    const rangeStart = range.start
    const rangeStop = range.stop
    if (!rangeStart || !rangeStop) return
    if (rangesIntersect(start, end, rangeStart, rangeStop)) {
      range.slurs.forEach((slur) => slurs.add(slur))
    }
  })

  return removeSlurElements(slurs)
}

function removeSlursContainingNote(doc: Document, ref: EditableNoteRef) {
  const slurs = new Set<Element>()
  collectSlurRanges(doc, ref.scoreId, ref.partId).forEach((range) => {
    const rangeStart = range.start
    const rangeStop = range.stop
    if (
      rangeStart &&
      rangeStop &&
      compareRefs(rangeStart, ref) <= 0 &&
      compareRefs(ref, rangeStop) <= 0
    ) {
      range.slurs.forEach((slur) => slurs.add(slur))
      return
    }
    if (refsEqual(rangeStart, ref) || refsEqual(rangeStop, ref)) {
      range.slurs.forEach((slur) => slurs.add(slur))
    }
  })

  return removeSlurElements(slurs)
}

function nextSlurNumber(doc: Document) {
  const used = Array.from(doc.getElementsByTagName('slur'))
    .map((slur) => Number.parseInt(slur.getAttribute('number') ?? '0', 10))
    .filter((value) => Number.isFinite(value) && value > 0)

  return Math.max(0, ...used) + 1
}

function addSlurEndpoint(note: Element, type: 'start' | 'stop', number: number) {
  const notations = ensureChild(note, 'notations')
  const slur = note.ownerDocument.createElement('slur')
  slur.setAttribute('type', type)
  slur.setAttribute('number', String(number))
  notations.appendChild(slur)
}

function addSlur(xml: string, start: EditableNoteRef, end: EditableNoteRef) {
  if (start.scoreId !== end.scoreId || start.partId !== end.partId) {
    throw new Error('Slurs must begin and end in the same part.')
  }

  if (compareRefs(start, end) >= 0) {
    throw new Error('Choose a later note as the slur endpoint.')
  }

  const doc = parseMusicXml(xml)
  const startNote = findXmlNote(doc, start)
  const endNote = findXmlNote(doc, end)
  if (!startNote || !endNote) {
    throw new Error('Could not find the selected slur notes in MusicXML.')
  }

  removeSlursInRange(doc, start, end)
  const number = nextSlurNumber(doc)
  addSlurEndpoint(startNote, 'start', number)
  addSlurEndpoint(endNote, 'stop', number)

  return serializeMusicXml(doc)
}

function eraseSupportedMarkings(xml: string, ref: EditableNoteRef) {
  const doc = parseMusicXml(xml)
  const note = findXmlNote(doc, ref)
  if (!note) throw new Error('Could not find the selected note in MusicXML.')

  const changed = [
    removeDynamicBeforeNote(note),
    removeBowingFromNote(note),
    removeSlursContainingNote(doc, ref),
  ].some(Boolean)

  if (!changed) return xml
  return serializeMusicXml(doc)
}

function noteLabel(ref: EditableNoteRef | null) {
  if (!ref) return '-'
  return `${ref.partId} · m.${ref.measureNumber} · note ${ref.noteIndex + 1}`
}

function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: 'application/vnd.recordare.musicxml+xml' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function fileSafeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function getEditableRefFromGraphicalNote(
  note: GraphicalNote,
  scoreId: string,
): EditableNoteRef | null {
  const sourceNote = note.sourceNote
  const sourceMeasure = sourceNote.SourceMeasure
  const staff = sourceNote.ParentStaff
  const staffIndex = staff.idInMusicSheet
  const entries = sourceMeasure.getEntriesPerStaff(staffIndex) ?? []
  let noteIndex = 0

  for (const entry of entries) {
    for (const voiceEntry of entry.VoiceEntries) {
      for (const sourceEntryNote of voiceEntry.Notes) {
        if (!sourceEntryNote.IsGraceNote) {
          if (sourceEntryNote === sourceNote) {
            return {
              scoreId,
              partId: staff.ParentInstrument.IdString,
              measureNumber: sourceMeasure.MeasureNumber,
              noteIndex,
            }
          }
          noteIndex += 1
        }
      }
    }
  }

  return null
}

function findGraphicalNoteFromRef(
  osmd: OpenSheetMusicDisplay,
  scoreId: string,
  ref: EditableNoteRef,
): GraphicalNote | null {
  for (const staffMeasures of osmd.GraphicSheet.MeasureList) {
    for (const measure of staffMeasures) {
      if (!measure?.staffEntries) continue
      for (const staffEntry of measure.staffEntries) {
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
          for (const graphicalNote of voiceEntry.notes) {
            const noteRef = getEditableRefFromGraphicalNote(graphicalNote, scoreId)
            if (refsEqual(noteRef, ref)) return graphicalNote
          }
        }
      }
    }
  }
  return null
}

function highlightGraphicalNote(
  note: GraphicalNote,
  selectedGraphicalNoteRef: MutableRefObject<GraphicalNote | null>,
) {
  const colorOptions = {
    applyToBeams: true,
    applyToFlag: true,
    applyToLedgerLines: true,
    applyToNoteheads: true,
    applyToStem: true,
  }

  try {
    selectedGraphicalNoteRef.current?.setColor(DEFAULT_MUSIC_COLOR, colorOptions)
    note.setColor(HIGHLIGHT_COLOR, colorOptions)
    selectedGraphicalNoteRef.current = note
  } catch {
    selectedGraphicalNoteRef.current = note
  }
}

function screenToSvgAnchor(svg: SVGSVGElement, x: number, y: number): SvgAnchor | null {
  const matrix = svg.getScreenCTM()
  if (!matrix) return null

  const point = svg.createSVGPoint()
  point.x = x
  point.y = y
  const transformed = point.matrixTransform(matrix.inverse())
  return { x: transformed.x, y: transformed.y }
}

function unionRects(rects: DOMRect[]) {
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((rect) => rect.left))
  const right = Math.max(...rects.map((rect) => rect.right))
  const top = Math.min(...rects.map((rect) => rect.top))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

function getGraphicalNoteAnchor(note: GraphicalNote, svg: SVGSVGElement): SvgAnchor | null {
  const noteWithSvgHelpers = note as GraphicalNote & {
    getNoteheadSVGs?: () => Element[]
    getStemSVG?: () => Element | undefined
  }
  const candidates = [
    ...(noteWithSvgHelpers.getNoteheadSVGs?.() ?? []),
    noteWithSvgHelpers.getStemSVG?.(),
  ].filter((element): element is Element => !!element)

  const rect = unionRects(
    candidates
      .map((element) => element.getBoundingClientRect())
      .filter((candidate) => candidate.width > 0 || candidate.height > 0),
  )

  if (!rect) return null
  return screenToSvgAnchor(svg, rect.left + rect.width / 2, rect.top + rect.height / 2)
}

function ensureInstantPreviewLayer(svg: SVGSVGElement) {
  const existing = svg.querySelector<SVGGElement>(`g[${INSTANT_PREVIEW_LAYER_ATTR}="true"]`)
  if (existing) return existing

  const layer = document.createElementNS(SVG_NS, 'g')
  layer.setAttribute(INSTANT_PREVIEW_LAYER_ATTR, 'true')
  layer.setAttribute('pointer-events', 'none')
  svg.appendChild(layer)
  return layer
}

function clearInstantPreviewLayer(svg: SVGSVGElement | null | undefined) {
  svg?.querySelector(`g[${INSTANT_PREVIEW_LAYER_ATTR}="true"]`)?.remove()
}

function removeInstantPreviewElements(
  svg: SVGSVGElement,
  predicate: (element: SVGElement) => boolean,
) {
  const layer = ensureInstantPreviewLayer(svg)
  Array.from(layer.children).forEach((child) => {
    if (child instanceof SVGElement && predicate(child)) child.remove()
  })
}

function setPreviewMeta(element: SVGElement, kind: string, refKey?: string) {
  element.setAttribute(INSTANT_PREVIEW_KIND_ATTR, kind)
  if (refKey) element.setAttribute('data-note-ref', refKey)
}

function renderInstantDynamic(svg: SVGSVGElement, ref: EditableNoteRef, anchor: SvgAnchor, mark: DynamicMark) {
  const refKey = noteRefKey(ref)
  const layer = ensureInstantPreviewLayer(svg)
  removeInstantPreviewElements(
    svg,
    (element) =>
      element.getAttribute(INSTANT_PREVIEW_KIND_ATTR) === 'dynamic' &&
      element.getAttribute('data-note-ref') === refKey,
  )

  const text = document.createElementNS(SVG_NS, 'text')
  setPreviewMeta(text, 'dynamic', refKey)
  text.setAttribute('x', String(anchor.x))
  text.setAttribute('y', String(anchor.y + 32))
  text.setAttribute('text-anchor', 'middle')
  text.setAttribute('font-family', 'Georgia, Times New Roman, serif')
  text.setAttribute('font-size', '22')
  text.setAttribute('font-style', 'italic')
  text.setAttribute('font-weight', '700')
  text.setAttribute('fill', '#111827')
  text.textContent = mark
  layer.appendChild(text)
}

function renderInstantBowing(svg: SVGSVGElement, ref: EditableNoteRef, anchor: SvgAnchor, mark: BowingMark) {
  const refKey = noteRefKey(ref)
  const layer = ensureInstantPreviewLayer(svg)
  removeInstantPreviewElements(
    svg,
    (element) =>
      element.getAttribute(INSTANT_PREVIEW_KIND_ATTR) === 'bowing' &&
      element.getAttribute('data-note-ref') === refKey,
  )

  const path = document.createElementNS(SVG_NS, 'path')
  setPreviewMeta(path, 'bowing', refKey)
  const yTop = anchor.y - 34
  const yBottom = anchor.y - 16
  const d =
    mark === 'down-bow'
      ? `M ${anchor.x - 9} ${yBottom} V ${yTop} H ${anchor.x + 9} V ${yBottom}`
      : `M ${anchor.x - 11} ${yTop} L ${anchor.x} ${yBottom} L ${anchor.x + 11} ${yTop}`
  path.setAttribute('d', d)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', '#111827')
  path.setAttribute('stroke-width', '2.4')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  layer.appendChild(path)
}

function renderInstantSlur(
  svg: SVGSVGElement,
  start: EditableNoteRef,
  end: EditableNoteRef,
  startAnchor: SvgAnchor,
  endAnchor: SvgAnchor,
) {
  const layer = ensureInstantPreviewLayer(svg)
  const id = `${noteRefKey(start)}--${noteRefKey(end)}`
  removeInstantPreviewElements(
    svg,
    (element) =>
      element.getAttribute(INSTANT_PREVIEW_KIND_ATTR) === 'slur' &&
      element.getAttribute('data-slur-id') === id,
  )

  const path = document.createElementNS(SVG_NS, 'path')
  setPreviewMeta(path, 'slur')
  path.setAttribute('data-slur-id', id)
  path.setAttribute('data-start-ref', noteRefKey(start))
  path.setAttribute('data-end-ref', noteRefKey(end))
  const distance = Math.abs(endAnchor.x - startAnchor.x)
  const lift = Math.max(30, Math.min(82, distance * 0.22))
  const startY = startAnchor.y - 28
  const endY = endAnchor.y - 28
  const controlX = (startAnchor.x + endAnchor.x) / 2
  const controlY = Math.min(startY, endY) - lift
  path.setAttribute('d', `M ${startAnchor.x} ${startY} Q ${controlX} ${controlY} ${endAnchor.x} ${endY}`)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', '#111827')
  path.setAttribute('stroke-width', '2.2')
  path.setAttribute('stroke-linecap', 'round')
  layer.appendChild(path)
}

function removeInstantPreviewsForRef(svg: SVGSVGElement, ref: EditableNoteRef) {
  const refKey = noteRefKey(ref)
  removeInstantPreviewElements(
    svg,
    (element) =>
      element.getAttribute('data-note-ref') === refKey ||
      element.getAttribute('data-start-ref') === refKey ||
      element.getAttribute('data-end-ref') === refKey,
  )
}

function resolveXmlUrl(score: Score) {
  if (SCORE_XML_MAP[score.id]) {
    return SCORE_XML_MAP[score.id].xmlUrl
  }
  if (score.storagePath.startsWith('/')) {
    return score.storagePath
  }
  if (score.storagePath.includes('dvorak')) {
    const lower = score.storagePath.toLowerCase()
    if (lower.includes('violin1')) return '/musicxml/dvorak-sym9-violin1.musicxml'
    if (lower.includes('violin2')) return '/musicxml/dvorak-sym9-violin2.musicxml'
    if (lower.includes('full')) return '/musicxml/dvorak-sym9-full-score.musicxml'
  }
  return null
}

export function ScoreMusicXmlPage() {
  const { projectId, scoreId: scoreIdParam } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { getProject, loadProjectDetail, addToast } = useAppState()

  useEffect(() => {
    if (projectId) loadProjectDetail(projectId)
  }, [projectId, loadProjectDetail])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
  const selectedGraphicalNoteRef = useRef<GraphicalNote | null>(null)
  const selectedNoteRef = useRef<EditableNoteRef | null>(null)
  const noteAnchorByKeyRef = useRef<Map<string, SvgAnchor>>(new Map())
  const lastRenderedXmlRef = useRef<string | null>(null)
  const backgroundRenderTokenRef = useRef(0)
  const zoomRef = useRef(100)

  const project = projectId ? getProject(projectId) : undefined
  const scoreId = scoreIdParam ?? searchParams.get('scoreId') ?? ''

  const availableScores = useMemo(() => {
    if (!project) return []
    // Show all scores — inline XML is loaded on demand via the API
    return project.scores
  }, [project])

  const defaultScoreId = availableScores[0]?.id ?? scoreId
  const activeScoreId = scoreId || defaultScoreId
  const activeScore = project?.scores.find((s) => s.id === activeScoreId)
  const xmlEntry = useMemo(
    () =>
      activeScore
        ? {
            title: activeScore.title,
            composer: '',
            xmlUrl: resolveXmlUrl(activeScore) ?? '',
          }
        : SCORE_XML_MAP[activeScoreId] ?? SCORE_XML_MAP['s-canon-v1'],
    [activeScore, activeScoreId],
  )

  const [status, setStatus] = useState<RenderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [mode, setMode] = useState<SelectionMode>('select')
  const [selectedNote, setSelectedNote] = useState<EditableNoteRef | null>(null)
  const [slurDraft, setSlurDraft] = useState<SlurDraft | null>(null)
  const [showMeasureNumbers, setShowMeasureNumbers] = useState(true)
  const [showPartNames, setShowPartNames] = useState(true)
  const [compactLayout, setCompactLayout] = useState(true)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [originalXmlByScoreId, setOriginalXmlByScoreId] = useState<Record<string, string>>({})
  const [workingXmlByScoreId, setWorkingXmlByScoreId] = useState<Record<string, string>>({})
  const [historyByScoreId, setHistoryByScoreId] = useState<Record<string, XmlHistory>>({})

  const workingXml = workingXmlByScoreId[scoreId]
  const originalXml = originalXmlByScoreId[scoreId]
  const history = historyByScoreId[scoreId] ?? { past: [], future: [] }
  const isModified = !!workingXml && !!originalXml && workingXml !== originalXml

  useEffect(() => {
    selectedNoteRef.current = selectedNote
  }, [selectedNote])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    if (!xmlEntry || !containerRef.current) return

    let cancelled = false
    const container = containerRef.current
    selectedGraphicalNoteRef.current = null
    lastRenderedXmlRef.current = null
    noteAnchorByKeyRef.current.clear()
    backgroundRenderTokenRef.current += 1

    async function bootstrapScore() {
      setStatus('loading')
      setError(null)
      container.innerHTML = ''
      osmdRef.current = null

      try {
        let xml = workingXmlByScoreId[scoreId]
        if (!xml) {
          const xmlUrl = activeScore ? resolveXmlUrl(activeScore) : null
          if (xmlUrl) {
            const response = await fetch(xmlUrl)
            if (!response.ok) {
              throw new Error(`Failed to load MusicXML (${response.status})`)
            }
            xml = await response.text()
          } else if (activeScore?.xmlContent) {
            xml = activeScore.xmlContent
          } else {
            const apiScore = await scoresApi.getScore(scoreId)
            if (!apiScore.xml_content) {
              throw new Error(
                'This score does not have inline XML content. The file may be stored in external storage.',
              )
            }
            xml = apiScore.xml_content
          }
          if (cancelled) return

          setOriginalXmlByScoreId((prev) => ({ ...prev, [scoreId]: prev[scoreId] ?? xml }))
          setWorkingXmlByScoreId((prev) => ({ ...prev, [scoreId]: prev[scoreId] ?? xml }))
          setHistoryByScoreId((prev) => ({
            ...prev,
            [scoreId]: prev[scoreId] ?? { past: [], future: [] },
          }))
        }

        const osmd = new OpenSheetMusicDisplay(container, {
          autoResize: true,
          backend: 'svg',
          drawComposer: true,
          drawCredits: true,
          drawMeasureNumbers: showMeasureNumbers,
          drawPartNames: showPartNames,
          drawingParameters: compactLayout ? 'compacttight' : 'default',
          pageBackgroundColor: '#ffffff',
        })

        osmdRef.current = osmd
        osmd.loadUrlTimeout = 15000

        await osmd.load(xml, xmlEntry.title)
        if (cancelled) return
        osmd.Zoom = zoomRef.current / 100
        osmd.render()
        lastRenderedXmlRef.current = xml
        clearInstantPreviewLayer(container.querySelector('svg'))
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Unable to render MusicXML')
      }
    }

    void bootstrapScore()

    return () => {
      cancelled = true
    }
  }, [
    activeScore,
    compactLayout,
    scoreId,
    showMeasureNumbers,
    showPartNames,
    xmlEntry,
  ])

  useEffect(() => {
    if (status !== 'ready' || !workingXml || !osmdRef.current) return
    if (workingXml === lastRenderedXmlRef.current) return

    let cancelled = false
    let idleHandle: number | null = null
    const osmd = osmdRef.current
    const noteToReselect = selectedNoteRef.current
    const renderToken = ++backgroundRenderTokenRef.current

    async function applyWorkingXmlUpdate() {
      try {
        await osmd.load(workingXml, xmlEntry.title)
        if (cancelled || renderToken !== backgroundRenderTokenRef.current) return
        osmd.Zoom = zoomRef.current / 100
        osmd.renderAndScrollBack()
        lastRenderedXmlRef.current = workingXml
        noteAnchorByKeyRef.current.clear()
        clearInstantPreviewLayer(getScoreSvgElement())

        if (noteToReselect) {
          const graphicalNote = findGraphicalNoteFromRef(osmd, scoreId, noteToReselect)
          if (graphicalNote) {
            highlightGraphicalNote(graphicalNote, selectedGraphicalNoteRef)
          }
        }
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Unable to update MusicXML')
      }
    }

    const timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        idleHandle = window.requestIdleCallback(() => void applyWorkingXmlUpdate(), {
          timeout: 1200,
        })
        return
      }

      void applyWorkingXmlUpdate()
    }, OSMD_BACKGROUND_RENDER_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (idleHandle !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleHandle)
      }
    }
  }, [workingXml, status, scoreId, xmlEntry.title])

  useEffect(() => {
    if (status !== 'ready' || !osmdRef.current) return
    const osmd = osmdRef.current
    osmd.Zoom = zoom / 100
    osmd.renderAndScrollBack()

    const ref = selectedNoteRef.current
    if (ref) {
      const graphicalNote = findGraphicalNoteFromRef(osmd, scoreId, ref)
      if (graphicalNote) {
        highlightGraphicalNote(graphicalNote, selectedGraphicalNoteRef)
      }
    }
  }, [status, zoom, scoreId])

  if (!project || !activeScore) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <div className="text-sm font-semibold text-slate-900">MusicXML score not found</div>
          <div className="mt-2">
            <Button variant="secondary" onClick={() => navigate('/projects')}>
              Back to projects
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  function changeScore(nextScoreId: string) {
    setSelectedNote(null)
    setSlurDraft(null)
    selectedGraphicalNoteRef.current = null
    setSearchParams({ scoreId: nextScoreId })
  }

  function getClickedGraphicalNote(event: React.MouseEvent<HTMLDivElement>) {
    const osmd = osmdRef.current
    const svg = getScoreSvgElement()
    if (!osmd || !svg) return null

    const matrix = svg.getScreenCTM()
    if (!matrix) return null

    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const svgPoint = point.matrixTransform(matrix.inverse())
    const osmdPoint = osmd.GraphicSheet.svgToOsmd(new PointF2D(svgPoint.x, svgPoint.y))

    return osmd.GraphicSheet.GetNearestNote(osmdPoint, new PointF2D(18, 18)) ?? null
  }

  function getScoreSvgElement() {
    const svg = containerRef.current?.querySelector('svg')
    return svg instanceof SVGSVGElement ? svg : null
  }

  function rememberNoteAnchor(
    ref: EditableNoteRef,
    graphicalNote: GraphicalNote | null,
    fallbackAnchor?: SvgAnchor | null,
  ) {
    const svg = getScoreSvgElement()
    if (!svg) return null

    const anchor = graphicalNote ? getGraphicalNoteAnchor(graphicalNote, svg) : null
    const nextAnchor = anchor ?? fallbackAnchor ?? null
    if (nextAnchor) noteAnchorByKeyRef.current.set(noteRefKey(ref), nextAnchor)
    return nextAnchor
  }

  function getPreviewAnchor(ref: EditableNoteRef) {
    const stored = noteAnchorByKeyRef.current.get(noteRefKey(ref))
    if (stored) return stored

    const osmd = osmdRef.current
    const svg = getScoreSvgElement()
    if (!osmd || !svg) return null

    const graphicalNote = findGraphicalNoteFromRef(osmd, scoreId, ref)
    return rememberNoteAnchor(ref, graphicalNote)
  }

  function previewDynamic(ref: EditableNoteRef, mark: DynamicMark) {
    const svg = getScoreSvgElement()
    const anchor = getPreviewAnchor(ref)
    if (svg && anchor) renderInstantDynamic(svg, ref, anchor, mark)
  }

  function previewBowing(ref: EditableNoteRef, mark: BowingMark) {
    const svg = getScoreSvgElement()
    const anchor = getPreviewAnchor(ref)
    if (svg && anchor) renderInstantBowing(svg, ref, anchor, mark)
  }

  function previewSlur(start: EditableNoteRef, end: EditableNoteRef) {
    const svg = getScoreSvgElement()
    const startAnchor = getPreviewAnchor(start)
    const endAnchor = getPreviewAnchor(end)
    if (svg && startAnchor && endAnchor) {
      renderInstantSlur(svg, start, end, startAnchor, endAnchor)
    }
  }

  function previewErase(ref: EditableNoteRef) {
    const svg = getScoreSvgElement()
    if (svg) removeInstantPreviewsForRef(svg, ref)
  }

  function handleScoreClick(event: React.MouseEvent<HTMLDivElement>) {
    if (mode === 'pan' || status !== 'ready') return
    if (!containerRef.current?.contains(event.target as Node)) return

    const graphicalNote = getClickedGraphicalNote(event)
    if (!graphicalNote) {
      addToast({ title: 'No note selected', message: 'Click closer to a notehead.' })
      return
    }

    const ref = getEditableRefFromGraphicalNote(graphicalNote, scoreId)
    if (!ref) {
      addToast({ title: 'This note cannot be edited yet' })
      return
    }

    setSelectedNote(ref)
    const svg = getScoreSvgElement()
    const clickAnchor = svg ? screenToSvgAnchor(svg, event.clientX, event.clientY) : null
    rememberNoteAnchor(ref, graphicalNote, clickAnchor)
    highlightGraphicalNote(graphicalNote, selectedGraphicalNoteRef)

    if (mode === 'slur') {
      handleSlurNoteClick(ref)
    }
  }

  function applyXmlOperation(
    title: string,
    updateXml: (xml: string) => string,
    preview?: () => void,
  ) {
    const currentXml = workingXmlByScoreId[scoreId]
    if (!currentXml) return

    try {
      const nextXml = updateXml(currentXml)
      if (nextXml === currentXml) return

      preview?.()
      setWorkingXmlByScoreId((prev) => ({ ...prev, [scoreId]: nextXml }))
      setHistoryByScoreId((prev) => {
        const current = prev[scoreId] ?? { past: [], future: [] }
        return {
          ...prev,
          [scoreId]: {
            past: [...current.past, currentXml],
            future: [],
          },
        }
      })
      addToast({ title })
    } catch (err) {
      addToast({
        title: 'Edit failed',
        message: err instanceof Error ? err.message : 'Unable to update MusicXML.',
      })
    }
  }

function applyDynamic(mark: DynamicMark) {
  if (!selectedNote) return
  const ref = selectedNote
  applyXmlOperation(
    `Dynamic ${mark} applied`,
    (xml) => replaceDynamic(xml, ref, mark),
    () => previewDynamic(ref, mark),
  )
}

function applyBowing(mark: BowingMark) {
  if (!selectedNote) return
  const ref = selectedNote
  applyXmlOperation(
    mark === 'up-bow' ? 'Up-bow applied' : 'Down-bow applied',
    (xml) => replaceBowing(xml, ref, mark),
    () => previewBowing(ref, mark),
  )
}

function eraseSelectedMarkings() {
  if (!selectedNote) return
  const ref = selectedNote
  applyXmlOperation(
    'Selected markings erased',
    (xml) => eraseSupportedMarkings(xml, ref),
    () => previewErase(ref),
  )
  setSlurDraft(null)
  setMode('select')
}

  function startSlurMode() {
    setMode('slur')
    if (selectedNote) {
      setSlurDraft({ start: selectedNote })
      addToast({ title: 'Slur start selected', message: 'Click the ending note.' })
      return
    }
    setSlurDraft(null)
    addToast({ title: 'Select slur start', message: 'Click the first note.' })
  }

  function handleSlurNoteClick(ref: EditableNoteRef) {
    if (!slurDraft) {
      setSlurDraft({ start: ref })
      addToast({ title: 'Slur start selected', message: 'Click the ending note.' })
      return
    }

    const start = slurDraft.start
    applyXmlOperation(
      'Slur applied',
      (xml) => addSlur(xml, start, ref),
      () => previewSlur(start, ref),
    )
    setSlurDraft(null)
    setMode('select')
  }

  function undoXmlEdit() {
    const currentXml = workingXmlByScoreId[scoreId]
    const currentHistory = historyByScoreId[scoreId]
    if (!currentXml || !currentHistory?.past.length) return

    const previousXml = currentHistory.past[currentHistory.past.length - 1]
    setWorkingXmlByScoreId((prev) => ({ ...prev, [scoreId]: previousXml }))
    setHistoryByScoreId((prev) => ({
      ...prev,
      [scoreId]: {
        past: currentHistory.past.slice(0, -1),
        future: [currentXml, ...currentHistory.future],
      },
    }))
    setSlurDraft(null)
    addToast({ title: 'Undo' })
  }

  function redoXmlEdit() {
    const currentXml = workingXmlByScoreId[scoreId]
    const currentHistory = historyByScoreId[scoreId]
    if (!currentXml || !currentHistory?.future.length) return

    const nextXml = currentHistory.future[0]
    setWorkingXmlByScoreId((prev) => ({ ...prev, [scoreId]: nextXml }))
    setHistoryByScoreId((prev) => ({
      ...prev,
      [scoreId]: {
        past: [...currentHistory.past, currentXml],
        future: currentHistory.future.slice(1),
      },
    }))
    setSlurDraft(null)
    addToast({ title: 'Redo' })
  }

  function resetWorkingXml() {
    if (!originalXml) return
    setWorkingXmlByScoreId((prev) => ({ ...prev, [scoreId]: originalXml }))
    setHistoryByScoreId((prev) => ({ ...prev, [scoreId]: { past: [], future: [] } }))
    setSelectedNote(null)
    setSlurDraft(null)
    setMode('select')
    addToast({ title: 'Score reset to original MusicXML' })
  }

  function exportWorkingXml() {
    if (!workingXml) return
    downloadText(`${fileSafeName(xmlEntry.title || scoreId)}-edited.musicxml`, workingXml)
  }

  function resetView() {
    setZoom(100)
    containerRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <div className="flex h-dvh flex-col bg-[#eef1f4]">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/projects/${project.id}?tab=pieces`)}
              >
                <ArrowLeft className="size-4" />
                曲目與分譜
              </Button>
              <div className="truncate text-sm font-semibold text-slate-950">
                {xmlEntry.title}
              </div>
              <Badge tone={isModified ? 'warn' : 'neutral'}>
                {isModified ? `${history.past.length} edits` : 'Original'}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {activeScore?.fileType ?? 'musicxml'} · {xmlEntry.composer || '—'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={scoreId}
              onChange={(event) => changeScore(event.target.value)}
              className="h-9 max-w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm xl:max-w-96"
              aria-label="Score part"
            >
              {availableScores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={exportWorkingXml} disabled={!workingXml}>
              <Download className="size-4" />
              Export
            </Button>
            <Button variant="secondary" onClick={() => setSummaryOpen(true)}>
              <Save className="size-4" />
              Summary
            </Button>
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <ToolButton
            active={mode === 'select'}
            icon={<MousePointer2 className="size-4" />}
            label="Select"
            onClick={() => {
              setMode('select')
              setSlurDraft(null)
            }}
          />
          <ToolButton
            active={mode === 'pan'}
            icon={<Hand className="size-4" />}
            label="Pan"
            onClick={() => {
              setMode('pan')
              setSlurDraft(null)
            }}
          />

          <Divider />

          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 shadow-inner">
            {DYNAMICS.map((mark) => (
              <SymbolButton
                key={mark}
                title={`Apply ${mark}`}
                disabled={!selectedNote}
                onClick={() => applyDynamic(mark)}
              >
                <span className="font-serif text-base font-bold italic leading-none">
                  {mark}
                </span>
              </SymbolButton>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 shadow-inner">
            <SymbolButton
              title="Apply down-bow"
              disabled={!selectedNote}
              onClick={() => applyBowing('down-bow')}
            >
              <DownBowIcon />
            </SymbolButton>
            <SymbolButton
              title="Apply up-bow"
              disabled={!selectedNote}
              onClick={() => applyBowing('up-bow')}
            >
              <UpBowIcon />
            </SymbolButton>
            <SymbolButton
              title="Create slur"
              active={mode === 'slur'}
              onClick={startSlurMode}
            >
              <SlurIcon />
            </SymbolButton>
            <SymbolButton
              title="Erase dynamics, bowing, and slurs on selected note"
              disabled={!selectedNote}
              onClick={eraseSelectedMarkings}
            >
              <Eraser className="size-4" />
            </SymbolButton>
          </div>

          <Divider />

          <IconButton title="Zoom out" onClick={() => setZoom((value) => Math.max(60, value - 10))}>
            <ZoomOut className="size-4" />
          </IconButton>
          <div className="min-w-14 text-center text-sm font-medium text-slate-700">{zoom}%</div>
          <IconButton title="Zoom in" onClick={() => setZoom((value) => Math.min(180, value + 10))}>
            <ZoomIn className="size-4" />
          </IconButton>
          <IconButton title="Reset view" onClick={resetView}>
            <Maximize2 className="size-4" />
          </IconButton>

          <Divider />

          <IconButton title="Undo" disabled={!history.past.length} onClick={undoXmlEdit}>
            <Undo2 className="size-4" />
          </IconButton>
          <IconButton title="Redo" disabled={!history.future.length} onClick={redoXmlEdit}>
            <Redo2 className="size-4" />
          </IconButton>
          <IconButton title="Reset score" disabled={!isModified} onClick={resetWorkingXml}>
            <RotateCcw className="size-4" />
          </IconButton>

          <details className="ml-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">View</summary>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showMeasureNumbers}
                  onChange={(event) => setShowMeasureNumbers(event.target.checked)}
                />
                Measures
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showPartNames}
                  onChange={(event) => setShowPartNames(event.target.checked)}
                />
                Parts
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={compactLayout}
                  onChange={(event) => setCompactLayout(event.target.checked)}
                />
                Compact
              </label>
            </div>
          </details>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 lg:block">
          <div className="text-sm font-semibold text-slate-950">Selection</div>
          <div className="mt-3 grid gap-3">
            <div>
              <div className="text-xs font-medium text-slate-500">Note</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {noteLabel(selectedNote)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Mode</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {mode === 'slur' ? 'Slur endpoint selection' : mode}
              </div>
            </div>
            {slurDraft && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">Slur start</div>
                <div className="mt-1 text-sm text-slate-700">
                  {noteLabel(slurDraft.start)}
                </div>
              </div>
            )}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500">Changes</div>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge tone={isModified ? 'warn' : 'neutral'}>
                  {history.past.length} edits
                </Badge>
                {!!history.future.length && <Badge>Redo: {history.future.length}</Badge>}
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div
            className={cn(
              'relative h-full overflow-auto bg-[#e7ebef] p-4 sm:p-6',
              mode === 'pan' ? 'cursor-grab' : 'cursor-default',
            )}
            onClick={handleScoreClick}
          >
            <div className="mx-auto min-h-full w-fit min-w-[760px] rounded-lg border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
              {status === 'loading' && (
                <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                  Rendering MusicXML...
                </div>
              )}
              {status === 'error' && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  {error}
                </div>
              )}
              <div
                ref={containerRef}
                className={cn(
                  'musicxml-stage min-h-96',
                  status !== 'ready' && 'pointer-events-none opacity-30',
                )}
              />
            </div>
          </div>
        </main>
      </div>

      <Modal
        title="MusicXML edit summary"
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setSummaryOpen(false)}>
              Close
            </Button>
            <Button variant="secondary" disabled={!isModified} onClick={resetWorkingXml}>
              Reset score
            </Button>
            <Button onClick={exportWorkingXml} disabled={!workingXml}>
              Export XML
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 text-sm text-slate-700">
          <div className="flex flex-wrap gap-2">
            <Badge tone={isModified ? 'warn' : 'neutral'}>
              {isModified ? 'Unsaved browser edit' : 'No changes'}
            </Badge>
            <Badge>{history.past.length} edits in history</Badge>
            <Badge>{history.future.length} redo steps</Badge>
          </div>
          <div>
            Current score: <span className="font-medium text-slate-900">{xmlEntry.title}</span>
          </div>
          <div>
            Selected note: <span className="font-medium text-slate-900">{noteLabel(selectedNote)}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            {/* Prototype: edits mutate only in-memory MusicXML for this browser session. No backend persistence or file write is performed yet. */}
            The exported XML contains the current in-memory edits. Closing or refreshing the page clears them.
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Divider() {
  return <div className="mx-1 h-6 w-px bg-slate-200" />
}

function ToolButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 sm:h-9',
        active
          ? 'border-slate-950 bg-slate-950 text-white'
          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100',
      )}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  )
}

function SymbolButton({
  active,
  children,
  title,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
  title: string
}) {
  return (
    <button
      {...props}
      type="button"
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex size-10 cursor-pointer items-center justify-center rounded-md border text-slate-900 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-40 sm:size-9',
        active
          ? 'border-slate-950 bg-slate-950 text-white'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-100 active:bg-slate-200',
        props.className,
      )}
    >
      {children}
    </button>
  )
}

function IconButton({
  children,
  title,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return (
    <button
      {...props}
      type="button"
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex size-10 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-50 sm:size-9',
        props.className,
      )}
    >
      {children}
    </button>
  )
}

function DownBowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        d="M7 17V7h10v10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeWidth="2.4"
      />
    </svg>
  )
}

function UpBowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        d="M6 6l6 13L18 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  )
}

function SlurIcon() {
  return (
    <svg viewBox="0 0 28 20" className="h-5 w-7" aria-hidden="true">
      <path
        d="M3 14c5-8 17-8 22 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
    </svg>
  )
}
