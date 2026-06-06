import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import {
  OpenSheetMusicDisplay,
  PointF2D,
  type GraphicalNote,
} from 'opensheetmusicdisplay'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import * as annotationsApi from '../../api/annotations'
import * as scoresApi from '../../api/scores'
import { useAppState, useRequiredUser } from '../../state/AppState'
import { useTranslation } from '../../i18n'
import type { AnnotationScope, PieceSimilarityHighlight, Score, ScoreAnnotation, SimilarPassageCandidate } from '../../types'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { Modal } from '../primitives/Modal'
import { cn } from '../utils/cn'
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Download,
  Eraser,
  FileText,
  Hand,
  Maximize2,
  MousePointer2,
  Redo2,
  RotateCcw,
  Save,
  Search,
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
type ArticulationMark = 'staccato' | 'accent' | 'tenuto' | 'fermata'
type HairpinType = 'crescendo' | 'diminuendo'
type SelectionMode = 'select' | 'pan' | 'slur' | 'hairpin'

type EditableNoteRef = {
  scoreId: string
  partId: string
  measureNumber: number
  measureArrayIndex?: number
  noteIndex: number
  staff?: string
  voice?: string
  pitchStep?: string
  pitchOctave?: string
  duration?: string
}

type SlurDraft = {
  start: EditableNoteRef
  end?: EditableNoteRef
}

type HairpinDraft = {
  type: HairpinType
  start?: EditableNoteRef
}

type XmlHistory = {
  past: string[]
  future: string[]
}

type AnnotationLayerState = {
  shared: ScoreAnnotation[]
  private: ScoreAnnotation[]
}

type IndexedXmlNote = EditableNoteRef & {
  note: Element
}

type RenderStatus = 'idle' | 'loading' | 'ready' | 'error'
type SimilarityScanStatus = 'idle' | 'scanning' | 'ready' | 'error'
type PieceSimilarityState = {
  highlights: PieceSimilarityHighlight[]
  status: SimilarityScanStatus
  error: string | null
}
type PendingBowingSuggestion = {
  id: string
  sourceScoreId: string
  sourceSectionName: string
  sourceMeasureRange: string
  targetScoreId: string
  targetSectionName: string
  targetRef: EditableNoteRef
  bowingType: BowingMark
  similarity: number
  status: 'pending'
}

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
const ARTICULATION_TOOLS: Array<{ mark: ArticulationMark; label: string; symbol: string }> = [
  { mark: 'staccato', label: 'Staccato', symbol: '·' },
  { mark: 'accent', label: 'Accent', symbol: '>' },
  { mark: 'tenuto', label: 'Tenuto', symbol: '-' },
  { mark: 'fermata', label: 'Fermata', symbol: '𝄐' },
]
const HAIRPIN_TOOLS: Array<{ type: HairpinType; label: string; symbol: string }> = [
  { type: 'crescendo', label: 'Cresc', symbol: '<' },
  { type: 'diminuendo', label: 'Dim', symbol: '>' },
]
const HIGHLIGHT_COLOR = '#0284c7'
const DEFAULT_MUSIC_COLOR = '#000000'
const OSMD_BACKGROUND_RENDER_DELAY_MS = 650
const AUTO_SIMILARITY_PREVIEW_LIMIT = 10
const DEFAULT_NOTE_STAFF = '1'
const DEFAULT_NOTE_VOICE = '1'
const EMPTY_ANNOTATION_LAYERS: AnnotationLayerState = { shared: [], private: [] }
const DEBUG_NOTE_MAPPING = true
const REST_REPLACEMENT_NOTE_RADIUS = 24

function parseMusicXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parserError = Array.from(doc.getElementsByTagName('*')).find((element) =>
    isElementNamed(element, 'parsererror'),
  )
  if (parserError) {
    throw new Error('MusicXML could not be parsed.')
  }
  return doc
}

function serializeMusicXml(doc: Document) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(doc.documentElement)}\n`
}

function isElementNamed(element: Element, name: string) {
  const tagName = element.tagName
  const tagNameWithoutPrefix = tagName.includes(':') ? tagName.split(':').pop() : tagName

  return (
    element.localName === name ||
    tagName === name ||
    tagName.toLowerCase() === name.toLowerCase() ||
    tagNameWithoutPrefix === name
  )
}

function elementChildren(parent: ParentNode, name?: string) {
  return Array.from(parent.children).filter(
    (child) => !name || isElementNamed(child, name),
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

function isRestNote(note: Element) {
  return elementChildren(note, 'rest').length > 0
}

function sanitizeRestPlacementForRender(xml: string) {
  try {
    const doc = parseMusicXml(xml)
    const notes = Array.from(doc.getElementsByTagName('*')).filter((element) =>
      isElementNamed(element, 'note') && isRestNote(element),
    )

    notes.forEach((note) => {
      // This sanitizer only affects render-time rest placement for Audiveris MusicXML.
      note.removeAttribute('default-y')
      note.removeAttribute('relative-y')

      elementChildren(note, 'rest').forEach((rest) => {
        elementChildren(rest, 'display-step').forEach((child) => child.remove())
        elementChildren(rest, 'display-octave').forEach((child) => child.remove())
      })
    })

    return serializeMusicXml(doc)
  } catch {
    return xml
  }
}

function getChildText(parent: Element, localName: string) {
  return elementChildren(parent, localName)[0]?.textContent?.trim() || undefined
}

function getXmlNoteStaff(note: Element) {
  return getChildText(note, 'staff') ?? DEFAULT_NOTE_STAFF
}

function getXmlNoteVoice(note: Element) {
  return getChildText(note, 'voice') ?? DEFAULT_NOTE_VOICE
}

function getXmlNotePitch(note: Element) {
  const pitch = elementChildren(note, 'pitch')[0]
  return {
    pitchStep: pitch ? getChildText(pitch, 'step') : undefined,
    pitchOctave: pitch ? getChildText(pitch, 'octave') : undefined,
  }
}

function noteContextKey(staff: string | undefined, voice: string | undefined) {
  return `${staff ?? DEFAULT_NOTE_STAFF}\u0000${voice ?? DEFAULT_NOTE_VOICE}`
}

function buildEditableNoteIndex(doc: Document, scoreId: string): IndexedXmlNote[] {
  const parts = elementChildren(doc.documentElement, 'part')

  return parts.flatMap((part) => {
    const partId = part.getAttribute('id') ?? 'P1'
    const measures = elementChildren(part, 'measure')

    return measures.flatMap((measure, measureIndex) => {
      const measureNumber = getMeasureNumber(measure, measureIndex + 1)
      const notesByContext = new Map<string, IndexedXmlNote[]>()
      const indexedNotes: IndexedXmlNote[] = []

      elementChildren(measure, 'note').forEach((note) => {
        if (isGraceNote(note) || isRestNote(note)) return

        const staff = getXmlNoteStaff(note)
        const voice = getXmlNoteVoice(note)
        const contextKey = noteContextKey(staff, voice)
        const contextNotes = notesByContext.get(contextKey) ?? []
        const { pitchStep, pitchOctave } = getXmlNotePitch(note)
        const indexedNote = {
          scoreId,
          partId,
          measureNumber,
          measureArrayIndex: measureIndex,
          noteIndex: contextNotes.length,
          staff,
          voice,
          pitchStep,
          pitchOctave,
          duration: getChildText(note, 'duration'),
          note,
        }

        contextNotes.push(indexedNote)
        notesByContext.set(contextKey, contextNotes)
        indexedNotes.push(indexedNote)
      })

      return indexedNotes
    })
  })
}

function baseRefsEqual(a: EditableNoteRef, b: EditableNoteRef) {
  const sameMeasure =
    a.measureArrayIndex !== undefined && b.measureArrayIndex !== undefined
      ? a.measureArrayIndex === b.measureArrayIndex
      : a.measureNumber === b.measureNumber

  return (
    a.scoreId === b.scoreId &&
    a.partId === b.partId &&
    sameMeasure &&
    a.noteIndex === b.noteIndex
  )
}

function refsEqual(a: EditableNoteRef | null | undefined, b: EditableNoteRef | null | undefined) {
  if (!a || !b || !baseRefsEqual(a, b)) return false
  if (a.staff && b.staff && a.staff !== b.staff) return false
  if (a.voice && b.voice && a.voice !== b.voice) return false
  return true
}

function compareRefs(a: EditableNoteRef, b: EditableNoteRef) {
  if (a.partId !== b.partId) return a.partId.localeCompare(b.partId)
  if (a.measureArrayIndex !== undefined && b.measureArrayIndex !== undefined) {
    if (a.measureArrayIndex !== b.measureArrayIndex) return a.measureArrayIndex - b.measureArrayIndex
  }
  if (a.measureNumber !== b.measureNumber) return a.measureNumber - b.measureNumber
  const aStaff = a.staff ?? DEFAULT_NOTE_STAFF
  const bStaff = b.staff ?? DEFAULT_NOTE_STAFF
  if (aStaff !== bStaff) return aStaff.localeCompare(bStaff, undefined, { numeric: true })
  const aVoice = a.voice ?? DEFAULT_NOTE_VOICE
  const bVoice = b.voice ?? DEFAULT_NOTE_VOICE
  if (aVoice !== bVoice) return aVoice.localeCompare(bVoice, undefined, { numeric: true })
  return a.noteIndex - b.noteIndex
}

function findXmlNote(doc: Document, ref: EditableNoteRef) {
  const indexedNotes = buildEditableNoteIndex(doc, ref.scoreId)
  const refStaff = ref.staff
  const refVoice = ref.voice
  const hasStaffVoice = !!refStaff || !!refVoice

  if (ref.measureArrayIndex !== undefined) {
    const exactMeasureIndexMatch = indexedNotes.find(
      (item) =>
        item.scoreId === ref.scoreId &&
        item.partId === ref.partId &&
        item.measureArrayIndex === ref.measureArrayIndex &&
        item.noteIndex === ref.noteIndex &&
        item.staff === (refStaff ?? DEFAULT_NOTE_STAFF) &&
        item.voice === (refVoice ?? DEFAULT_NOTE_VOICE),
    )
    if (exactMeasureIndexMatch) return exactMeasureIndexMatch.note

    if (hasStaffVoice) {
      const partialMeasureIndexMatch = indexedNotes.find(
        (item) =>
          item.scoreId === ref.scoreId &&
          item.partId === ref.partId &&
          item.measureArrayIndex === ref.measureArrayIndex &&
          item.noteIndex === ref.noteIndex &&
          (!refStaff || !item.staff || item.staff === refStaff) &&
          (!refVoice || !item.voice || item.voice === refVoice),
      )
      if (partialMeasureIndexMatch) return partialMeasureIndexMatch.note
    }
  }

  const exactMatch = indexedNotes.find(
    (item) =>
      baseRefsEqual(item, ref) &&
      item.staff === (refStaff ?? DEFAULT_NOTE_STAFF) &&
      item.voice === (refVoice ?? DEFAULT_NOTE_VOICE),
  )
  if (exactMatch) return exactMatch.note

  if (hasStaffVoice) {
    return (
      indexedNotes.find(
        (item) =>
          baseRefsEqual(item, ref) &&
          (!refStaff || !item.staff || item.staff === refStaff) &&
          (!refVoice || !item.voice || item.voice === refVoice),
      )?.note ?? null
    )
  }

  return indexedNotes.find((item) => baseRefsEqual(item, ref))?.note ?? null
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

function applyBowingToXmlNote(note: Element, mark: BowingMark, sharedLayer = false) {
  removeBowingFromNote(note)
  const notations = ensureChild(note, 'notations')
  const technical = ensureChild(notations, 'technical')
  const bowing = note.ownerDocument.createElement(mark)
  if (sharedLayer) {
    bowing.setAttribute('data-user-bowing', 'true')
    bowing.setAttribute('data-bowing-layer', 'shared')
  }
  technical.appendChild(bowing)
}


function replaceBowing(xml: string, ref: EditableNoteRef, mark: BowingMark) {
  const doc = parseMusicXml(xml)
  const note = findXmlNote(doc, ref)

  if (!note) {
    console.error('[BowingDebug] replaceBowing: note NOT found. ref=', JSON.stringify(ref))
    throw new Error('Could not find the selected note in MusicXML.')
  }

  // ── DEBUG ─────────────────────────────────────────────────────────────────
  const allIndexed = buildEditableNoteIndex(doc, ref.scoreId)
  const measureNotes = allIndexed.filter(
    (n) =>
      n.partId === ref.partId &&
      (ref.measureArrayIndex !== undefined
        ? n.measureArrayIndex === ref.measureArrayIndex
        : n.measureNumber === ref.measureNumber),
  )
  const hasSameBowing = noteHasBowingType(note, mark)
  const chordGroupBowing = findChordGroupNoteWithBowing(note, mark)
  console.group(`[BowingDebug] replaceBowing  mark=${mark}`)
  console.log('1. ref:', JSON.stringify(ref))
  console.log('2. note XML before:', note.outerHTML)
  console.log('4. measure notes:',
    measureNotes.map((n) => {
      const technicals = elementChildren(n.note, 'notations').flatMap((no) =>
        elementChildren(no, 'technical'),
      )
      const bowings = technicals
        .flatMap((t) => elementChildren(t))
        .filter((e) => e.localName === 'up-bow' || e.localName === 'down-bow')
      const isChord = elementChildren(n.note, 'chord').length > 0
      return (
        `[${n.noteIndex}] ${n.pitchStep}${n.pitchOctave} dur=${n.duration} ` +
        `staff=${n.staff} voice=${n.voice} chord=${isChord} ` +
        `bowings=[${bowings.map((b) => `${b.localName}(user=${b.getAttribute('data-user-bowing') ?? ''})`).join(',')}]`
      )
    }).join('\n  '),
  )
  console.log('6. selected note has this bowing type:', hasSameBowing)
  console.log(
    '7. chord group note with this bowing:',
    chordGroupBowing ? (chordGroupBowing === note ? 'same note' : `sibling — ${chordGroupBowing.outerHTML}`) : 'none',
  )
  console.groupEnd()
  // ── END DEBUG ─────────────────────────────────────────────────────────────

  // Toggle off — selected note already has this bowing type: just remove it
  if (hasSameBowing) {
    const removed = removeBowingFromNote(note)
    console.log('[BowingDebug] 5. toggled OFF selected note, removed:', removed)
    console.log('[BowingDebug] 3. note XML after:', note.outerHTML)
    return serializeMusicXml(doc)
  }

  // Chord-sibling toggle — selected note is clean but a sibling in the same chord
  // group carries this bowing (e.g. OCR placed it on the chord leader while OSMD
  // reports a different chord note as the click target).
  if (chordGroupBowing && chordGroupBowing !== note) {
    const removed = removeBowingFromNote(chordGroupBowing)
    console.log('[BowingDebug] 5. toggled OFF chord sibling, removed:', removed)
    console.log('[BowingDebug] 3. sibling XML after:', chordGroupBowing.outerHTML)
    return serializeMusicXml(doc)
  }

  // Apply new bowing to the selected note
  applyBowingToXmlNote(note, mark, true)
  console.log('[BowingDebug] 3. note XML after (new bowing):', note.outerHTML)
  console.log('[BowingDebug] 5. removed count: 0 (new bowing added)')
  return serializeMusicXml(doc)
}

function getBowingAnnotationMark(annotation: ScoreAnnotation): BowingMark | null {
  const bowingType = annotation.payload.bowingType
  if (bowingType === 'up-bow' || bowingType === 'up') return 'up-bow'
  if (bowingType === 'down-bow' || bowingType === 'down') return 'down-bow'
  return null
}

function editableNoteRefFromTargetRef(
  targetRef: Record<string, unknown>,
  scoreId: string,
): EditableNoteRef | null {
  const refScoreId = stringValue(targetRef.scoreId) ?? scoreId
  const partId = stringValue(targetRef.partId)
  const measureNumber = numberValue(targetRef.measureNumber)
  const noteIndex = numberValue(targetRef.noteIndex)

  if (refScoreId !== scoreId || !partId || measureNumber === undefined || noteIndex === undefined) {
    return null
  }

  const measureArrayIndex = numberValue(targetRef.measureArrayIndex)
  const staff = stringValue(targetRef.staff)
  const voice = stringValue(targetRef.voice)
  const pitchStep = stringValue(targetRef.pitchStep)
  const pitchOctave = stringValue(targetRef.pitchOctave)
  const duration = stringValue(targetRef.duration)

  return {
    scoreId: refScoreId,
    partId,
    measureNumber,
    ...(measureArrayIndex !== undefined ? { measureArrayIndex } : {}),
    noteIndex,
    ...(staff ? { staff } : {}),
    ...(voice ? { voice } : {}),
    ...(pitchStep ? { pitchStep } : {}),
    ...(pitchOctave ? { pitchOctave } : {}),
    ...(duration ? { duration } : {}),
  }
}

function sameAnnotationMeasure(item: IndexedXmlNote, ref: EditableNoteRef) {
  if (ref.measureArrayIndex !== undefined) {
    return item.measureArrayIndex === ref.measureArrayIndex
  }
  return item.measureNumber === ref.measureNumber
}

function optionalStaffVoiceMatches(item: IndexedXmlNote, ref: EditableNoteRef) {
  return (
    (!ref.staff || item.staff === ref.staff) &&
    (!ref.voice || item.voice === ref.voice)
  )
}

function optionalPitchDurationMatches(item: IndexedXmlNote, ref: EditableNoteRef) {
  return (
    (!ref.pitchStep || item.pitchStep === ref.pitchStep) &&
    (!ref.pitchOctave || item.pitchOctave === ref.pitchOctave) &&
    (!ref.duration || item.duration === ref.duration)
  )
}

function findXmlNoteForPrivateAnnotation(doc: Document, ref: EditableNoteRef) {
  const exact = findXmlNote(doc, ref)
  if (exact) return exact

  const metadataMatches = buildEditableNoteIndex(doc, ref.scoreId).filter(
    (item) =>
      item.scoreId === ref.scoreId &&
      item.partId === ref.partId &&
      sameAnnotationMeasure(item, ref) &&
      optionalStaffVoiceMatches(item, ref),
  )

  const sameIndex = metadataMatches.find((item) => item.noteIndex === ref.noteIndex)
  if (sameIndex) return sameIndex.note

  const pitchDurationMatches = metadataMatches.filter((item) =>
    optionalPitchDurationMatches(item, ref),
  )
  return pitchDurationMatches.length === 1 ? pitchDurationMatches[0].note : null
}

function applyPrivateBowingAnnotationsToXml(
  xml: string,
  scoreId: string,
  annotations: ScoreAnnotation[],
) {
  const privateBowingAnnotations = annotations.filter(
    (annotation) => annotation.scope === 'private' && annotation.annotationType === 'bowing',
  )
  if (privateBowingAnnotations.length === 0) return xml

  try {
    const doc = parseMusicXml(xml)
    let changed = false

    privateBowingAnnotations.forEach((annotation) => {
      const mark = getBowingAnnotationMark(annotation)
      const ref = editableNoteRefFromTargetRef(annotation.targetRef, scoreId)
      if (!mark || !ref) return

      const note = findXmlNoteForPrivateAnnotation(doc, ref)
      if (!note) return

      applyBowingToXmlNote(note, mark)
      changed = true
    })

    return changed ? serializeMusicXml(doc) : xml
  } catch {
    return xml
  }
}

function measureRangeText(start: number, end: number) {
  return `m.${start}${end !== start ? `–${end}` : ''}`
}

function indexedNoteMatchesRef(item: IndexedXmlNote, ref: EditableNoteRef) {
  return (
    item.scoreId === ref.scoreId &&
    item.partId === ref.partId &&
    sameAnnotationMeasure(item, ref) &&
    item.noteIndex === ref.noteIndex &&
    optionalStaffVoiceMatches(item, ref)
  )
}

function editableRefFromIndexedNote(item: IndexedXmlNote): EditableNoteRef {
  return {
    scoreId: item.scoreId,
    partId: item.partId,
    measureNumber: item.measureNumber,
    ...(item.measureArrayIndex !== undefined ? { measureArrayIndex: item.measureArrayIndex } : {}),
    noteIndex: item.noteIndex,
    ...(item.staff ? { staff: item.staff } : {}),
    ...(item.voice ? { voice: item.voice } : {}),
    ...(item.pitchStep ? { pitchStep: item.pitchStep } : {}),
    ...(item.pitchOctave ? { pitchOctave: item.pitchOctave } : {}),
    ...(item.duration ? { duration: item.duration } : {}),
  }
}

function getIndexedNotesInRange(
  xml: string,
  scoreId: string,
  startTargetRef: Record<string, unknown>,
  endTargetRef: Record<string, unknown>,
  startMeasureNumber: number,
  endMeasureNumber: number,
) {
  const doc = parseMusicXml(xml)
  const notes = buildEditableNoteIndex(doc, scoreId)
  const startRef = editableNoteRefFromTargetRef(startTargetRef, scoreId)
  const endRef = editableNoteRefFromTargetRef(endTargetRef, scoreId)

  if (startRef && endRef) {
    const from = compareRefs(startRef, endRef) <= 0 ? startRef : endRef
    const to = from === startRef ? endRef : startRef
    return notes.filter(
      (item) =>
        item.partId === from.partId &&
        compareRefs(item, from) >= 0 &&
        compareRefs(item, to) <= 0,
    )
  }

  const fromMeasure = Math.min(startMeasureNumber, endMeasureNumber)
  const toMeasure = Math.max(startMeasureNumber, endMeasureNumber)
  const partId = stringValue(startTargetRef.partId) ?? stringValue(endTargetRef.partId)
  return notes.filter(
    (item) =>
      (!partId || item.partId === partId) &&
      item.measureNumber >= fromMeasure &&
      item.measureNumber <= toMeasure,
  )
}

function mapRangeIndex(sourceIndex: number, sourceCount: number, targetCount: number) {
  if (sourceIndex < 0 || sourceCount <= 0 || targetCount <= 0) return -1
  if (sourceCount === 1 || targetCount === 1) return 0
  return Math.min(
    targetCount - 1,
    Math.max(0, Math.round((sourceIndex / (sourceCount - 1)) * (targetCount - 1))),
  )
}


function noteHasRealBowing(note: Element): boolean {
  return elementChildren(note, 'notations').some((notations) =>
    elementChildren(notations, 'technical').some((technical) =>
      elementChildren(technical).some(
        (child) => child.localName === 'up-bow' || child.localName === 'down-bow',
      ),
    ),
  )
}

function noteHasBowingType(note: Element, mark: BowingMark): boolean {
  return elementChildren(note, 'notations').some((notations) =>
    elementChildren(notations, 'technical').some((technical) =>
      elementChildren(technical).some((child) => child.localName === mark),
    ),
  )
}

// Returns the first note in the chord group (including `note` itself) that carries
// `mark`. Chord group = consecutive <note> siblings where all except the first
// have a <chord/> child.  Returns null if none in the group has `mark`.
function findChordGroupNoteWithBowing(note: Element, mark: BowingMark): Element | null {
  // Walk backwards to the chord leader
  let leader: Element = note
  while (elementChildren(leader, 'chord').length > 0) {
    const prev = leader.previousElementSibling
    if (!prev || prev.localName !== 'note') break
    leader = prev
  }
  // Collect full chord group
  const group: Element[] = [leader]
  let cursor: Element | null = leader.nextElementSibling
  while (cursor?.localName === 'note' && elementChildren(cursor, 'chord').length > 0) {
    group.push(cursor)
    cursor = cursor.nextElementSibling
  }
  return group.find((n) => noteHasBowingType(n, mark)) ?? null
}

// Write a suggestion bowing directly into the XML as a real shared bowing.
// Uses the flexible finder (same as private annotations) and skips if the
// chord group already has any real bowing.
function applyAcceptedBowingSuggestion(
  xml: string,
  ref: EditableNoteRef,
  mark: BowingMark,
): string {
  const doc = parseMusicXml(xml)
  const note = findXmlNoteForPrivateAnnotation(doc, ref)
  if (!note) return xml

  // Skip if this note or any sibling in its chord group already has real bowing
  const groupHasReal = (() => {
    if (noteHasRealBowing(note)) return true
    let leader: Element = note
    while (elementChildren(leader, 'chord').length > 0) {
      const prev = leader.previousElementSibling
      if (!prev || prev.localName !== 'note') break
      leader = prev
    }
    const group: Element[] = [leader]
    let cursor: Element | null = leader.nextElementSibling
    while (cursor !== null && cursor.localName === 'note' && elementChildren(cursor, 'chord').length > 0) {
      group.push(cursor)
      cursor = cursor.nextElementSibling
    }
    return group.some((n) => noteHasRealBowing(n))
  })()
  if (groupHasReal) return xml

  applyBowingToXmlNote(note, mark, true) // sharedLayer = true: adds data-user-bowing + data-bowing-layer
  return serializeMusicXml(doc)
}

function applyRedBowingSuggestionToXmlNote(note: Element, mark: BowingMark) {
  const doc = note.ownerDocument

  // If this note is part of a chord (has <chord/>), walk back to the chord leader
  // so the direction lands at the correct beat position in OSMD.
  let insertAnchor: Element = note
  if (elementChildren(note, 'chord').length > 0) {
    let prev = note.previousElementSibling
    while (prev?.localName === 'note' && elementChildren(prev, 'chord').length > 0) {
      prev = prev.previousElementSibling
    }
    if (prev?.localName === 'note') insertAnchor = prev
  }

  const direction = doc.createElement('direction')
  direction.setAttribute('placement', 'above')
  direction.setAttribute('data-sync-suggestion', 'true')

  const directionType = doc.createElement('direction-type')
  const words = doc.createElement('words')
  words.setAttribute('color', '#d00000')
  words.setAttribute('font-weight', 'bold')
  words.setAttribute('font-size', '12')
  words.setAttribute('relative-y', '20')
  const defaultX = note.getAttribute('default-x')
  if (defaultX) words.setAttribute('default-x', defaultX)
  words.textContent = mark === 'up-bow' ? 'V' : 'Π'
  directionType.appendChild(words)
  direction.appendChild(directionType)

  const staff = getChildText(note, 'staff')
  if (staff) {
    const staffEl = doc.createElement('staff')
    staffEl.textContent = staff
    direction.appendChild(staffEl)
  }

  const voice = getChildText(note, 'voice')
  if (voice) {
    const voiceEl = doc.createElement('voice')
    voiceEl.textContent = voice
    direction.appendChild(voiceEl)
  }

  insertAnchor.parentElement?.insertBefore(direction, insertAnchor)
}

function applyPendingBowingSuggestionsToXml(
  xml: string,
  suggestions: PendingBowingSuggestion[],
) {
  if (suggestions.length === 0) return xml

  try {
    const doc = parseMusicXml(xml)
    let changed = false

    suggestions.forEach((suggestion) => {
      const tRef = suggestion.targetRef
      const note = findXmlNoteForPrivateAnnotation(doc, tRef)
      if (!note) {
        console.log(
          `[BowingDebug:suppress] ${suggestion.bowingType} @m${tRef.measureNumber}[idx=${tRef.noteIndex}]: note NOT FOUND in XML → shown`,
        )
        return
      }
      const hasReal = noteHasRealBowing(note)

      // C: check whether any note in the same chord group has real bowing —
      //    the exact-note check misses this when the click landed on a sibling.
      let chordGroupHasReal = false
      if (!hasReal) {
        let leader: Element = note
        while (elementChildren(leader, 'chord').length > 0) {
          const prev = leader.previousElementSibling
          if (!prev || prev.localName !== 'note') break
          leader = prev
        }
        const group: Element[] = [leader]
        let cursor: Element | null = leader.nextElementSibling
        while (cursor !== null && cursor.localName === 'note' && elementChildren(cursor, 'chord').length > 0) {
          group.push(cursor)
          cursor = cursor.nextElementSibling
        }
        chordGroupHasReal = group.some((n) => noteHasRealBowing(n))
      }

      console.log(
        `[BowingDebug:suppress] ${suggestion.bowingType} @m${tRef.measureNumber}[idx=${tRef.noteIndex}]:`,
        `hasRealBowing=${hasReal}`,
        `chordGroupHasReal=${chordGroupHasReal}`,
        hasReal
          ? '→ SUPPRESSED ✓'
          : chordGroupHasReal
            ? '→ SHOWN ⚠️  (chord sibling has real bowing — suppress check too narrow)'
            : '→ shown (no real bowing found)',
      )

      if (hasReal) return

      applyRedBowingSuggestionToXmlNote(note, suggestion.bowingType)
      changed = true
    })

    return changed ? serializeMusicXml(doc) : xml
  } catch {
    return xml
  }
}

function ensureNotations(note: Element) {
  return ensureChild(note, 'notations')
}

function ensureArticulations(notations: Element) {
  return ensureChild(notations, 'articulations')
}

function hasArticulation(note: Element, type: Exclude<ArticulationMark, 'fermata'>) {
  return elementChildren(note, 'notations').some((notations) =>
    elementChildren(notations, 'articulations').some(
      (articulations) => elementChildren(articulations, type).length > 0,
    ),
  )
}

function hasFermata(note: Element) {
  return elementChildren(note, 'notations').some(
    (notations) => elementChildren(notations, 'fermata').length > 0,
  )
}

function replaceArticulation(xml: string, ref: EditableNoteRef, type: ArticulationMark) {
  const doc = parseMusicXml(xml)
  const note = findXmlNote(doc, ref)
  if (!note) throw new Error('Could not find the selected note in MusicXML.')
  if (isRestNote(note)) return xml

  const notations = ensureNotations(note)
  if (type === 'fermata') {
    if (hasFermata(note)) return xml
    const fermata = doc.createElement('fermata')
    fermata.setAttribute('type', 'upright')
    notations.appendChild(fermata)
    return serializeMusicXml(doc)
  }

  if (hasArticulation(note, type)) return xml
  const articulations = ensureArticulations(notations)
  articulations.appendChild(doc.createElement(type))
  return serializeMusicXml(doc)
}

function getDirectionWedge(direction: Element) {
  return elementChildren(direction, 'direction-type')
    .flatMap((directionType) => elementChildren(directionType, 'wedge'))[0]
}

function directionMatchesWedge(
  direction: Element | null | undefined,
  type: HairpinType | 'stop',
  number: string,
  staff: string,
) {
  if (!direction || !isElementNamed(direction, 'direction')) return false

  const wedge = getDirectionWedge(direction)
  if (!wedge) return false

  const directionStaff = getChildText(direction, 'staff') ?? DEFAULT_NOTE_STAFF
  return (
    wedge.getAttribute('type') === type &&
    (wedge.getAttribute('number') || '1') === number &&
    directionStaff === staff
  )
}

function hasWedgeDirectionBeforeNote(
  note: Element,
  type: HairpinType | 'stop',
  number: string,
  staff: string,
) {
  return directionMatchesWedge(note.previousElementSibling, type, number, staff)
}

function createWedgeDirection(doc: Document, type: HairpinType | 'stop', number: string, staff: string) {
  const direction = doc.createElement('direction')
  direction.setAttribute('placement', 'below')

  const directionType = doc.createElement('direction-type')
  const wedge = doc.createElement('wedge')
  wedge.setAttribute('type', type)
  wedge.setAttribute('number', number)
  directionType.appendChild(wedge)
  direction.appendChild(directionType)

  const staffElement = doc.createElement('staff')
  staffElement.textContent = staff
  direction.appendChild(staffElement)

  return direction
}

function addWedgeDirectionBeforeNote(
  note: Element,
  type: HairpinType | 'stop',
  number: string,
  staff: string,
) {
  note.parentElement?.insertBefore(createWedgeDirection(note.ownerDocument, type, number, staff), note)
}

function addHairpin(xml: string, type: HairpinType, start: EditableNoteRef, end: EditableNoteRef) {
  if (start.scoreId !== end.scoreId || start.partId !== end.partId) {
    throw new Error('Hairpins must begin and end in the same part.')
  }

  if (compareRefs(start, end) >= 0) {
    throw new Error('Choose a later note as the hairpin endpoint.')
  }

  const doc = parseMusicXml(xml)
  const startNote = findXmlNote(doc, start)
  const endNote = findXmlNote(doc, end)
  if (!startNote || !endNote) {
    throw new Error('Could not find the selected hairpin notes in MusicXML.')
  }
  if (isRestNote(startNote) || isRestNote(endNote)) return xml

  const number = '1'
  const startStaff = start.staff ?? DEFAULT_NOTE_STAFF
  const endStaff = end.staff ?? startStaff
  let changed = false

  if (!hasWedgeDirectionBeforeNote(startNote, type, number, startStaff)) {
    addWedgeDirectionBeforeNote(startNote, type, number, startStaff)
    changed = true
  }
  if (!hasWedgeDirectionBeforeNote(endNote, 'stop', number, endStaff)) {
    addWedgeDirectionBeforeNote(endNote, 'stop', number, endStaff)
    changed = true
  }

  return changed ? serializeMusicXml(doc) : xml
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
  const measureNumber =
    typeof ref.measureNumber === 'number' && Number.isFinite(ref.measureNumber)
      ? ref.measureNumber
      : typeof ref.measureArrayIndex === 'number'
        ? ref.measureArrayIndex + 1
        : '-'
  return `${measureNumber}-${ref.noteIndex + 1}`
}

function rangeLabel(start: EditableNoteRef | null, end: EditableNoteRef | null) {
  if (!start && !end) return '-'
  return `${noteLabel(start)} -> ${noteLabel(end)}`
}

function percentage(value: number) {
  return `${Math.round(value * 100)}%`
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

function editableNoteRefKey(ref: EditableNoteRef) {
  return [
    ref.scoreId,
    ref.partId,
    ref.measureArrayIndex ?? '',
    ref.measureNumber,
    ref.noteIndex,
    ref.staff ?? '',
    ref.voice ?? '',
  ].join('\u0000')
}

function editableNoteRefToAnnotationTarget(ref: EditableNoteRef) {
  const targetRef: Record<string, unknown> = {
    scoreId: ref.scoreId,
    partId: ref.partId,
    measureNumber: ref.measureNumber,
    noteIndex: ref.noteIndex,
  }

  const optionalFields: Array<keyof EditableNoteRef> = [
    'measureArrayIndex',
    'staff',
    'voice',
    'pitchStep',
    'pitchOctave',
    'duration',
  ]

  optionalFields.forEach((field) => {
    const value = ref[field]
    if (value !== undefined) {
      targetRef[field] = value
    }
  })

  return targetRef
}

function formatAnnotationErrorDetails(details: unknown) {
  if (!details) return undefined
  if (typeof details === 'string') return details

  if (typeof details === 'object') {
    const record = details as Record<string, unknown>
    const usefulFields = ['message', 'details', 'hint', 'code'].flatMap((key) => {
      const value = record[key]
      return typeof value === 'string' && value.trim() ? [`${key}: ${value}`] : []
    })
    if (usefulFields.length > 0) return usefulFields.join(' | ')
  }

  try {
    return JSON.stringify(details)
  } catch {
    return String(details)
  }
}

function hairpinLabel(type: HairpinType) {
  return HAIRPIN_TOOLS.find((tool) => tool.type === type)?.label ?? type
}

type UnknownRecord = Record<string, unknown>
type SourceNoteLike = GraphicalNote['sourceNote']
type SourceStaffEntryLike = {
  VoiceEntries: Array<{
    Notes: SourceNoteLike[]
  }>
}
type XmlFallbackNote = {
  ref: EditableNoteRef
  xmlOrder: number
  rawStaff?: string
  rawVoice?: string
  chord: boolean
  alter?: string
  snippet: string
}
type XmlFallbackScore = {
  candidate: XmlFallbackNote
  score: number
  reasons: string[]
  misses: string[]
}
type CanvasScrollSnapshot = {
  top: number
  left: number
}
type PitchedGraphicalNoteCandidate = {
  note: GraphicalNote
  distance: number
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  return undefined
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function finiteNumberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function nestedValue(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, key) => asRecord(current)?.[key], value)
}

function firstStringValue(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value)
    if (text) return text
  }
  return undefined
}

function getSourceNoteStaffFromSourceNote(sourceNote: SourceNoteLike) {
  const sourceNoteRecord = asRecord(sourceNote)
  const staffRecord = asRecord(sourceNote.ParentStaff)
  const instrumentRecord = asRecord(sourceNote.ParentStaff.ParentInstrument)
  const staves = instrumentRecord?.Staves ?? instrumentRecord?.staves

  if (Array.isArray(staves)) {
    const staffIndexInPart = staves.indexOf(sourceNote.ParentStaff)
    if (staffIndexInPart >= 0) return String(staffIndexInPart + 1)
  }

  const explicitStaff = firstStringValue(
    sourceNoteRecord?.Staff,
    sourceNoteRecord?.staff,
    sourceNoteRecord?.StaffNumber,
    sourceNoteRecord?.staffNumber,
    staffRecord?.StaffNumber,
    staffRecord?.staffNumber,
  )
  if (explicitStaff) return explicitStaff

  return stringValue(sourceNote.ParentStaff.idInMusicSheet + 1) ?? DEFAULT_NOTE_STAFF
}

function getSourceNoteStaff(note: GraphicalNote) {
  return getSourceNoteStaffFromSourceNote(note.sourceNote)
}

function getSourceNoteVoice(sourceNote: GraphicalNote['sourceNote'], voiceEntry?: unknown) {
  return firstStringValue(
    nestedValue(sourceNote, ['VoiceId']),
    nestedValue(sourceNote, ['voiceId']),
    nestedValue(sourceNote, ['ParentVoiceEntry', 'VoiceId']),
    nestedValue(sourceNote, ['ParentVoiceEntry', 'voiceId']),
    nestedValue(sourceNote, ['ParentVoiceEntry', 'ParentVoice', 'VoiceId']),
    nestedValue(sourceNote, ['ParentVoiceEntry', 'ParentVoice', 'voiceId']),
    nestedValue(voiceEntry, ['VoiceId']),
    nestedValue(voiceEntry, ['voiceId']),
    nestedValue(voiceEntry, ['ParentVoice', 'VoiceId']),
    nestedValue(voiceEntry, ['ParentVoice', 'voiceId']),
  ) ?? DEFAULT_NOTE_VOICE
}

function getOptionalVoiceEntryVoice(voiceEntry: unknown) {
  return firstStringValue(
    nestedValue(voiceEntry, ['VoiceId']),
    nestedValue(voiceEntry, ['voiceId']),
    nestedValue(voiceEntry, ['ParentVoice', 'VoiceId']),
    nestedValue(voiceEntry, ['ParentVoice', 'voiceId']),
  )
}

function getVoiceEntryVoice(voiceEntry: unknown) {
  return getOptionalVoiceEntryVoice(voiceEntry) ?? DEFAULT_NOTE_VOICE
}

function getSourceVoiceEntryFromGraphicalNote(note: GraphicalNote) {
  return nestedValue(note, ['parentVoiceEntry', 'parentVoiceEntry']) ??
    nestedValue(note, ['ParentVoiceEntry', 'ParentVoiceEntry'])
}

function getSourceNotesFromVoiceEntry(voiceEntry: unknown) {
  const notes = nestedValue(voiceEntry, ['Notes']) ?? nestedValue(voiceEntry, ['notes'])
  return Array.isArray(notes) ? notes as SourceNoteLike[] : []
}

function getSourceVoiceEntriesFromVoiceEntry(voiceEntry: unknown) {
  const voiceEntries =
    nestedValue(voiceEntry, ['ParentVoice', 'VoiceEntries']) ??
    nestedValue(voiceEntry, ['parentVoice', 'voiceEntries'])
  return Array.isArray(voiceEntries) ? voiceEntries : []
}

function getSourceMeasureArrayIndex(sourceMeasure: unknown) {
  return numberValue(
    nestedValue(sourceMeasure, ['measureListIndex']) ??
    nestedValue(sourceMeasure, ['MeasureListIndex']) ??
    nestedValue(sourceMeasure, ['measureIndex']) ??
    nestedValue(sourceMeasure, ['MeasureIndex']) ??
    nestedValue(sourceMeasure, ['index']) ??
    nestedValue(sourceMeasure, ['Index']),
  )
}

function sourcePitchStep(sourceNote: GraphicalNote['sourceNote']) {
  const pitch = nestedValue(sourceNote, ['Pitch'])
  const rawStep = nestedValue(pitch, ['Step']) ?? nestedValue(pitch, ['step']) ??
    nestedValue(pitch, ['FundamentalNote']) ?? nestedValue(pitch, ['fundamentalNote'])

  if (typeof rawStep === 'number' && Number.isFinite(rawStep)) {
    return ['C', 'D', 'E', 'F', 'G', 'A', 'B'][rawStep]
  }

  const step = stringValue(rawStep)
  return step ? step.charAt(0).toUpperCase() : undefined
}

function sourcePitchOctave(sourceNote: GraphicalNote['sourceNote']) {
  return firstStringValue(
    nestedValue(sourceNote, ['Pitch', 'Octave']),
    nestedValue(sourceNote, ['Pitch', 'octave']),
  )
}

function sourcePitchAlter(sourceNote: GraphicalNote['sourceNote']) {
  return firstStringValue(
    nestedValue(sourceNote, ['Pitch', 'Alteration']),
    nestedValue(sourceNote, ['Pitch', 'alteration']),
    nestedValue(sourceNote, ['Pitch', 'Alter']),
    nestedValue(sourceNote, ['Pitch', 'alter']),
  )
}

function sourceDuration(sourceNote: GraphicalNote['sourceNote']) {
  const length = nestedValue(sourceNote, ['Length']) ?? nestedValue(sourceNote, ['length'])
  const lengthRecord = asRecord(length)
  return firstStringValue(
    nestedValue(sourceNote, ['Duration']),
    nestedValue(sourceNote, ['duration']),
    lengthRecord?.RealValue,
    lengthRecord?.realValue,
    lengthRecord?.Numerator && lengthRecord?.Denominator
      ? `${stringValue(lengthRecord.Numerator)}/${stringValue(lengthRecord.Denominator)}`
      : undefined,
    length,
  )
}

function isSourceTiedNote(sourceNote: GraphicalNote['sourceNote']) {
  return Boolean(
    nestedValue(sourceNote, ['NoteTie']) ??
    nestedValue(sourceNote, ['noteTie']) ??
    nestedValue(sourceNote, ['Tie']) ??
    nestedValue(sourceNote, ['tie']),
  )
}

function isSourceGraceNote(sourceNote: GraphicalNote['sourceNote']) {
  return !!nestedValue(sourceNote, ['IsGraceNote'])
}

function isSourceRestNote(sourceNote: GraphicalNote['sourceNote']) {
  const sourceNoteRecord = asRecord(sourceNote)
  const isRestMethod = sourceNoteRecord?.isRest
  if (typeof isRestMethod === 'function') return !!isRestMethod.call(sourceNote)

  const explicitRest = nestedValue(sourceNote, ['IsRest']) ?? nestedValue(sourceNote, ['isRest'])
  if (typeof explicitRest === 'boolean') return explicitRest
  return !nestedValue(sourceNote, ['Pitch'])
}

function isPitchedSourceNote(sourceNote: SourceNoteLike | null | undefined) {
  return Boolean(sourceNote && !isSourceGraceNote(sourceNote) && !isSourceRestNote(sourceNote) && nestedValue(sourceNote, ['Pitch']))
}

function isEditablePitchedGraphicalNote(note: GraphicalNote | null | undefined) {
  return isPitchedSourceNote(note?.sourceNote)
}

function sourceMeasureMatches(left: unknown, right: unknown) {
  if (!left || !right) return false
  if (left === right) return true

  const leftIndex = getSourceMeasureArrayIndex(left)
  const rightIndex = getSourceMeasureArrayIndex(right)
  if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex === rightIndex

  const leftNumber = numberValue(nestedValue(left, ['MeasureNumber']) ?? nestedValue(left, ['measureNumber']))
  const rightNumber = numberValue(nestedValue(right, ['MeasureNumber']) ?? nestedValue(right, ['measureNumber']))
  return leftNumber !== undefined && rightNumber !== undefined && leftNumber === rightNumber
}

function safeGraphicalNoteStaff(note: GraphicalNote) {
  try {
    return getSourceNoteStaff(note)
  } catch {
    return undefined
  }
}

function sourceStaffMatches(left: GraphicalNote, right: GraphicalNote) {
  const leftStaff = left.sourceNote?.ParentStaff
  const rightStaff = right.sourceNote?.ParentStaff
  if (leftStaff && rightStaff && leftStaff === rightStaff) return true

  const leftStaffLabel = safeGraphicalNoteStaff(left)
  const rightStaffLabel = safeGraphicalNoteStaff(right)
  if (!leftStaffLabel || !rightStaffLabel) return true
  return leftStaffLabel === rightStaffLabel
}

function pointCoordinate(point: unknown, axis: 'x' | 'y') {
  const upperAxis = axis.toUpperCase()
  return finiteNumberValue(nestedValue(point, [axis]) ?? nestedValue(point, [upperAxis]))
}

function graphicalObjectCenter(value: unknown) {
  const shape = nestedValue(value, ['PositionAndShape']) ?? nestedValue(value, ['positionAndShape'])
  const absolutePosition =
    nestedValue(shape, ['AbsolutePosition']) ??
    nestedValue(shape, ['absolutePosition']) ??
    nestedValue(value, ['PositionAndShape', 'AbsolutePosition'])
  const relativePosition =
    nestedValue(shape, ['RelativePosition']) ??
    nestedValue(shape, ['relativePosition'])
  const size = nestedValue(shape, ['Size']) ?? nestedValue(shape, ['size'])
  const point = absolutePosition ?? relativePosition ?? shape
  const x = pointCoordinate(point, 'x')
  const y = pointCoordinate(point, 'y')
  if (x === undefined || y === undefined) return null

  const width = finiteNumberValue(
    nestedValue(size, ['width']) ??
    nestedValue(size, ['Width']) ??
    nestedValue(shape, ['width']) ??
    nestedValue(shape, ['Width']),
  ) ?? 0
  const height = finiteNumberValue(
    nestedValue(size, ['height']) ??
    nestedValue(size, ['Height']) ??
    nestedValue(shape, ['height']) ??
    nestedValue(shape, ['Height']),
  ) ?? 0

  return {
    x: x + width / 2,
    y: y + height / 2,
  }
}

function graphicalNoteCenter(note: GraphicalNote) {
  return (
    graphicalObjectCenter(note) ??
    graphicalObjectCenter(nestedValue(note, ['sourceNote'])) ??
    graphicalObjectCenter(nestedValue(note, ['vfnote']))
  )
}

function distanceToPoint(note: GraphicalNote, point: PointF2D) {
  const center = graphicalNoteCenter(note)
  const pointX = pointCoordinate(point, 'x')
  const pointY = pointCoordinate(point, 'y')
  if (!center || pointX === undefined || pointY === undefined) return Number.POSITIVE_INFINITY

  return Math.hypot(center.x - pointX, center.y - pointY)
}

function summarizeGraphicalNoteCandidate(note: GraphicalNote, distance?: number) {
  const sourceNote = note.sourceNote
  const sourceMeasure = sourceNote?.SourceMeasure
  return {
    measureNumber: sourceMeasure?.MeasureNumber,
    measureArrayIndex: getSourceMeasureArrayIndex(sourceMeasure),
    partId: sourceNote?.ParentStaff?.ParentInstrument?.IdString,
    staff: sourceNote ? safeGraphicalNoteStaff(note) : undefined,
    pitchStep: sourceNote ? sourcePitchStep(sourceNote) : undefined,
    pitchOctave: sourceNote ? sourcePitchOctave(sourceNote) : undefined,
    pitchAlter: sourceNote ? sourcePitchAlter(sourceNote) : undefined,
    duration: sourceNote ? sourceDuration(sourceNote) : undefined,
    isRest: sourceNote ? isSourceRestNote(sourceNote) : undefined,
    isGrace: sourceNote ? isSourceGraceNote(sourceNote) : undefined,
    distance,
  }
}

function findNearestPitchedGraphicalNoteInSameMeasure(
  osmd: OpenSheetMusicDisplay,
  nearestNote: GraphicalNote,
  osmdPoint: PointF2D,
) {
  const nearestSourceMeasure = nearestNote.sourceNote?.SourceMeasure
  if (!nearestSourceMeasure) return { replacement: null, candidates: [] }

  const candidates: PitchedGraphicalNoteCandidate[] = []
  for (const staffMeasures of osmd.GraphicSheet.MeasureList) {
    for (const measure of staffMeasures) {
      if (!measure?.staffEntries) continue
      for (const staffEntry of measure.staffEntries) {
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
          for (const graphicalNote of voiceEntry.notes) {
            if (graphicalNote === nearestNote) continue
            if (!isEditablePitchedGraphicalNote(graphicalNote)) continue
            if (!sourceMeasureMatches(graphicalNote.sourceNote.SourceMeasure, nearestSourceMeasure)) continue
            if (!sourceStaffMatches(graphicalNote, nearestNote)) continue

            const distance = distanceToPoint(graphicalNote, osmdPoint)
            if (!Number.isFinite(distance) || distance > REST_REPLACEMENT_NOTE_RADIUS) continue
            candidates.push({ note: graphicalNote, distance })
          }
        }
      }
    }
  }

  candidates.sort((left, right) => left.distance - right.distance)
  return {
    replacement: candidates[0] ?? null,
    candidates,
  }
}

function warnRestGraphicalNoteReplacement(debugObject: unknown) {
  if (!DEBUG_NOTE_MAPPING) return
  console.warn('[MusicXML note mapping] nearest GraphicalNote was rest/unpitched; searched pitched replacement', debugObject)
}

function getPitchedSourceNotesInVoice(
  entries: SourceStaffEntryLike[],
  voice: string,
) {
  const notes: SourceNoteLike[] = []

  for (const entry of entries) {
    for (const voiceEntry of entry.VoiceEntries) {
      if (getVoiceEntryVoice(voiceEntry) !== voice) continue

      for (const sourceEntryNote of voiceEntry.Notes) {
        if (!isSourceGraceNote(sourceEntryNote) && !isSourceRestNote(sourceEntryNote)) {
          notes.push(sourceEntryNote)
        }
      }
    }
  }

  return notes
}

function getPitchedSourceNotesFromParentVoice(
  sourceVoiceEntry: unknown,
  sourceMeasure: unknown,
) {
  const notes: SourceNoteLike[] = []

  for (const voiceEntry of getSourceVoiceEntriesFromVoiceEntry(sourceVoiceEntry)) {
    for (const sourceEntryNote of getSourceNotesFromVoiceEntry(voiceEntry)) {
      if (sourceEntryNote.SourceMeasure !== sourceMeasure) continue
      if (!isSourceGraceNote(sourceEntryNote) && !isSourceRestNote(sourceEntryNote)) {
        notes.push(sourceEntryNote)
      }
    }
  }

  return notes
}

function pitchedSourceNoteIndex(notes: SourceNoteLike[], sourceNote: SourceNoteLike) {
  return notes.findIndex(
    (note) => !isSourceGraceNote(note) && !isSourceRestNote(note) && note === sourceNote,
  )
}

function collectXmlFallbackNotesInMeasure(
  doc: Document,
  baseRef: EditableNoteRef,
): XmlFallbackNote[] {
  const part = elementChildren(doc.documentElement, 'part')
    .find((item) => item.getAttribute('id') === baseRef.partId)
  if (!part) return []

  const measures = elementChildren(part, 'measure')
  const measure =
    baseRef.measureArrayIndex !== undefined
      ? measures[baseRef.measureArrayIndex]
      : measures.find((item, index) => getMeasureNumber(item, index + 1) === baseRef.measureNumber)
  if (!measure) return []

  const notesByContext = new Map<string, number>()
  const fallbackNotes: XmlFallbackNote[] = []
  let xmlOrder = 0

  elementChildren(measure, 'note').forEach((note) => {
    if (isGraceNote(note) || isRestNote(note)) return

    const rawStaff = getChildText(note, 'staff')
    const rawVoice = getChildText(note, 'voice')
    const staff = rawStaff ?? DEFAULT_NOTE_STAFF
    const voice = rawVoice ?? DEFAULT_NOTE_VOICE
    const contextKey = noteContextKey(staff, voice)
    const noteIndex = notesByContext.get(contextKey) ?? 0
    const { pitchStep, pitchOctave } = getXmlNotePitch(note)
    const pitch = elementChildren(note, 'pitch')[0]
    const alter = pitch ? getChildText(pitch, 'alter') : undefined

    fallbackNotes.push({
      ref: {
        ...baseRef,
        noteIndex,
        staff,
        voice,
        ...(pitchStep ? { pitchStep } : {}),
        ...(pitchOctave ? { pitchOctave } : {}),
        duration: getChildText(note, 'duration'),
      },
      xmlOrder,
      ...(rawStaff ? { rawStaff } : {}),
      ...(rawVoice ? { rawVoice } : {}),
      chord: elementChildren(note, 'chord').length > 0,
      ...(alter ? { alter } : {}),
      snippet: new XMLSerializer()
        .serializeToString(note)
        .replace(/\s+/g, ' ')
        .slice(0, 240),
    })

    notesByContext.set(contextKey, noteIndex + 1)
    xmlOrder += 1
  })

  return fallbackNotes
}

function scoreXmlFallbackNote(
  candidate: XmlFallbackNote,
  baseRef: EditableNoteRef,
  preferredOrder: number | undefined,
) {
  let score = 0
  const reasons: string[] = []
  const misses: string[] = []

  if (baseRef.pitchStep && candidate.ref.pitchStep === baseRef.pitchStep) {
    score += 3
    reasons.push('pitchStep')
  } else {
    misses.push(`pitchStep ${candidate.ref.pitchStep ?? 'none'} != ${baseRef.pitchStep ?? 'none'}`)
  }
  if (baseRef.pitchOctave && candidate.ref.pitchOctave === baseRef.pitchOctave) {
    score += 3
    reasons.push('pitchOctave')
  } else {
    misses.push(`pitchOctave ${candidate.ref.pitchOctave ?? 'none'} != ${baseRef.pitchOctave ?? 'none'}`)
  }
  if (baseRef.duration && candidate.ref.duration === baseRef.duration) {
    score += 2
    reasons.push('duration')
  } else {
    misses.push(`duration ${candidate.ref.duration ?? 'none'} != ${baseRef.duration ?? 'none'}`)
  }
  if (baseRef.staff && candidate.rawStaff && candidate.rawStaff === baseRef.staff) {
    score += 1
    reasons.push('staff')
  } else if (baseRef.staff && candidate.rawStaff) {
    misses.push(`staff ${candidate.rawStaff} != ${baseRef.staff}`)
  } else if (baseRef.staff) {
    misses.push(`staff missing in XML, source ${baseRef.staff}`)
  }
  if (baseRef.voice && candidate.rawVoice && candidate.rawVoice === baseRef.voice) {
    score += 1
    reasons.push('voice')
  } else if (baseRef.voice && candidate.rawVoice) {
    misses.push(`voice ${candidate.rawVoice} != ${baseRef.voice}`)
  } else if (baseRef.voice) {
    misses.push(`voice missing in XML, source ${baseRef.voice}`)
  }
  if (preferredOrder !== undefined) {
    const distance = Math.abs(candidate.xmlOrder - preferredOrder)
    const orderScore = Math.max(0, 2 - distance)
    if (orderScore > 0) {
      score += orderScore
      reasons.push(`order:${orderScore}`)
    } else {
      misses.push(`order distance ${distance}`)
    }
  } else {
    misses.push('preferredOrder unavailable')
  }

  return { score, reasons, misses }
}

function evaluateXmlFallbackMatcher(
  xml: string | undefined,
  baseRef: EditableNoteRef,
  preferredOrder: number | undefined,
) {
  if (!xml) {
    return {
      ref: null,
      reason: 'working XML unavailable',
      xmlMeasureCandidates: [],
      scoredCandidates: [],
      selectedCandidate: null,
    }
  }

  try {
    const doc = parseMusicXml(xml)
    const xmlMeasureCandidates = collectXmlFallbackNotesInMeasure(doc, baseRef)
    const candidates = xmlMeasureCandidates
      .map((candidate) => ({
        candidate,
        ...scoreXmlFallbackNote(candidate, baseRef, preferredOrder),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (preferredOrder !== undefined) {
          return (
            Math.abs(a.candidate.xmlOrder - preferredOrder) -
            Math.abs(b.candidate.xmlOrder - preferredOrder)
          )
        }
        return a.candidate.xmlOrder - b.candidate.xmlOrder
      })

    const best = candidates[0]
    if (!best) {
      return {
        ref: null,
        reason: 'no XML pitched notes found in target measure',
        xmlMeasureCandidates,
        scoredCandidates: candidates,
        selectedCandidate: null,
      }
    }
    if (best.score < 6) {
      return {
        ref: null,
        reason: `best XML candidate score ${best.score} below threshold 6`,
        xmlMeasureCandidates,
        scoredCandidates: candidates,
        selectedCandidate: best,
      }
    }
    const nextBest = candidates[1]
    if (nextBest && nextBest.score === best.score && preferredOrder === undefined) {
      return {
        ref: null,
        reason: `ambiguous XML candidates tied at score ${best.score} without preferred order`,
        xmlMeasureCandidates,
        scoredCandidates: candidates,
        selectedCandidate: best,
      }
    }

    return {
      ref: best.candidate.ref,
      reason: 'selected XML fallback candidate',
      xmlMeasureCandidates,
      scoredCandidates: candidates,
      selectedCandidate: best,
    }
  } catch {
    return {
      ref: null,
      reason: 'failed to parse or inspect working XML',
      xmlMeasureCandidates: [],
      scoredCandidates: [],
      selectedCandidate: null,
    }
  }
}

function summarizeSourceNote(sourceNote: SourceNoteLike, identityTarget?: SourceNoteLike) {
  return {
    identityMatch: identityTarget ? sourceNote === identityTarget : undefined,
    pitchStep: sourcePitchStep(sourceNote),
    pitchOctave: sourcePitchOctave(sourceNote),
    pitchAlter: sourcePitchAlter(sourceNote),
    duration: sourceDuration(sourceNote),
    isGrace: isSourceGraceNote(sourceNote),
    isRest: isSourceRestNote(sourceNote),
    isTied: isSourceTiedNote(sourceNote),
  }
}

function summarizeParentVoiceEntry(sourceVoiceEntry: unknown, sourceNote: SourceNoteLike) {
  const notes = getSourceNotesFromVoiceEntry(sourceVoiceEntry)
  return {
    exists: Boolean(sourceVoiceEntry),
    voice: getOptionalVoiceEntryVoice(sourceVoiceEntry),
    notesCount: notes.length,
    pitchedNotesCount: notes.filter((note) => !isSourceGraceNote(note) && !isSourceRestNote(note)).length,
    notes: notes.map((note, index) => ({
      index,
      ...summarizeSourceNote(note, sourceNote),
    })),
  }
}

function summarizeXmlFallbackNote(candidate: XmlFallbackNote) {
  return {
    index: candidate.xmlOrder,
    noteIndex: candidate.ref.noteIndex,
    step: candidate.ref.pitchStep,
    octave: candidate.ref.pitchOctave,
    alter: candidate.alter,
    duration: candidate.ref.duration,
    hasChord: candidate.chord,
    staff: candidate.rawStaff,
    voice: candidate.rawVoice,
    effectiveStaff: candidate.ref.staff,
    effectiveVoice: candidate.ref.voice,
    snippet: candidate.snippet,
  }
}

function summarizeScoredCandidate(candidate: XmlFallbackScore) {
  return {
    ...summarizeXmlFallbackNote(candidate.candidate),
    score: candidate.score,
    reasons: candidate.reasons,
    misses: candidate.misses,
  }
}

function warnNoteMappingFailure(debugObject: unknown) {
  if (!DEBUG_NOTE_MAPPING) return
  console.warn('[MusicXML note mapping] GraphicalNote could not be mapped to EditableNoteRef', debugObject)
}

function getEditableRefFromGraphicalNote(
  note: GraphicalNote,
  scoreId: string,
  xml?: string,
  debug = false,
): EditableNoteRef | null {
  const sourceNote = note.sourceNote
  const sourceMeasure = sourceNote.SourceMeasure
  const staff = sourceNote.ParentStaff
  const staffIndex = staff.idInMusicSheet
  const entries = sourceMeasure.getEntriesPerStaff(staffIndex) ?? []
  const targetStaff = getSourceNoteStaff(note)
  const directSourceVoiceEntry = getSourceVoiceEntryFromGraphicalNote(note)
  let targetVoice = getOptionalVoiceEntryVoice(directSourceVoiceEntry) ?? getSourceNoteVoice(sourceNote)

  for (const entry of entries) {
    const containingVoiceEntry = entry.VoiceEntries.find((voiceEntry) =>
      voiceEntry.Notes.some((sourceEntryNote) => sourceEntryNote === sourceNote),
    )
    if (containingVoiceEntry) {
      targetVoice = getVoiceEntryVoice(containingVoiceEntry)
      break
    }
  }

  const pitchedNotes = getPitchedSourceNotesInVoice(entries, targetVoice)
  let noteIndex = pitchedNotes.indexOf(sourceNote)

  if (noteIndex < 0) {
    const parentVoiceNotes = getPitchedSourceNotesFromParentVoice(
      directSourceVoiceEntry,
      sourceMeasure,
    )
    noteIndex = parentVoiceNotes.indexOf(sourceNote)
  }

  const baseRef = {
    scoreId,
    partId: staff.ParentInstrument.IdString,
    measureNumber: sourceMeasure.MeasureNumber,
    measureArrayIndex: getSourceMeasureArrayIndex(sourceMeasure),
    noteIndex: Math.max(0, noteIndex),
    staff: targetStaff,
    voice: targetVoice,
    pitchStep: sourcePitchStep(sourceNote),
    pitchOctave: sourcePitchOctave(sourceNote),
    duration: sourceDuration(sourceNote),
  }

  if (noteIndex >= 0) {
    // noteIndex is 0-based within staff/voice pitched notes only.
    return baseRef
  }

  const directVoiceNotes = getSourceNotesFromVoiceEntry(directSourceVoiceEntry)
    .filter((item) => !isSourceGraceNote(item) && !isSourceRestNote(item))
  const parentVoiceNotes = getPitchedSourceNotesFromParentVoice(
    directSourceVoiceEntry,
    sourceMeasure,
  )
  const directVoiceOrder = pitchedSourceNoteIndex(directVoiceNotes, sourceNote)
  const parentVoiceOrder = pitchedSourceNoteIndex(parentVoiceNotes, sourceNote)
  const preferredOrder =
    directVoiceOrder >= 0
      ? directVoiceOrder
      : parentVoiceOrder >= 0
        ? parentVoiceOrder
        : undefined

  const fallbackResult = evaluateXmlFallbackMatcher(xml, baseRef, preferredOrder)
  if (fallbackResult.ref) return fallbackResult.ref

  if (debug) {
    const sourceEntries = sourceMeasure.getEntriesPerStaff(staffIndex) ?? []
    warnNoteMappingFailure({
      reason: fallbackResult.reason,
      graphicalNoteSummary: {
        className: note.constructor?.name,
        vfnoteIndex: numberValue(nestedValue(note, ['vfnoteIndex'])),
        staffLine: numberValue(nestedValue(note, ['staffLine'])),
      },
      sourceNoteSummary: {
        ...summarizeSourceNote(sourceNote),
        isChordLike: getSourceNotesFromVoiceEntry(directSourceVoiceEntry)
          .filter((item) => !isSourceGraceNote(item) && !isSourceRestNote(item)).length > 1,
      },
      parentVoiceEntrySummary: summarizeParentVoiceEntry(directSourceVoiceEntry, sourceNote),
      sourceMeasureSummary: {
        measureNumber: sourceMeasure.MeasureNumber,
        measureArrayIndex: getSourceMeasureArrayIndex(sourceMeasure),
        partId: staff.ParentInstrument.IdString,
        staff: targetStaff,
        voice: targetVoice,
        staffIndex,
        entriesCount: sourceEntries.length,
        entries: sourceEntries.map((entry, entryIndex) => ({
          entryIndex,
          voiceEntriesCount: entry.VoiceEntries.length,
          voiceEntries: entry.VoiceEntries.map((voiceEntry, voiceEntryIndex) => ({
            voiceEntryIndex,
            voice: getVoiceEntryVoice(voiceEntry),
            notesCount: voiceEntry.Notes.length,
            notes: voiceEntry.Notes.map((entryNote, noteIndex) => ({
              noteIndex,
              ...summarizeSourceNote(entryNote, sourceNote),
            })),
          })),
        })),
      },
      xmlMeasureCandidates: fallbackResult.xmlMeasureCandidates.map(summarizeXmlFallbackNote),
      scoredCandidates: fallbackResult.scoredCandidates.map(summarizeScoredCandidate),
      selectedCandidate: fallbackResult.selectedCandidate
        ? summarizeScoredCandidate(fallbackResult.selectedCandidate)
        : null,
    })
  }

  return null
}

function findGraphicalNoteFromRef(
  osmd: OpenSheetMusicDisplay,
  scoreId: string,
  ref: EditableNoteRef,
  xml?: string,
): GraphicalNote | null {
  for (const staffMeasures of osmd.GraphicSheet.MeasureList) {
    for (const measure of staffMeasures) {
      if (!measure?.staffEntries) continue
      for (const staffEntry of measure.staffEntries) {
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
          for (const graphicalNote of voiceEntry.notes) {
            const noteRef = getEditableRefFromGraphicalNote(graphicalNote, scoreId, xml)
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
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { getProject, loadProjectDetail, addToast } = useAppState()
  const currentUser = useRequiredUser()
  const { language, t } = useTranslation()

  useEffect(() => {
    if (projectId) loadProjectDetail(projectId)
  }, [projectId, loadProjectDetail])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
  const selectedGraphicalNoteRef = useRef<GraphicalNote | null>(null)
  const selectedNoteRef = useRef<EditableNoteRef | null>(null)
  const pendingHairpinSelectionKeyRef = useRef<string | null>(null)
  const workingXmlByScoreIdRef = useRef<Record<string, string>>({})
  const scoreXmlCacheRef = useRef<Record<string, string>>({})
  const lastRenderedXmlRef = useRef<string | null>(null)
  const backgroundRenderTokenRef = useRef(0)
  const zoomRef = useRef(90)
  const addToastRef = useRef(addToast)
  const bowingSuggestionScanPiecesRef = useRef(new Set<string>())

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
  const activePieceId = activeScore?.pieceId ?? ''
  const myProjectMember = useMemo(
    () => project?.members.find((member) => member.userId === currentUser.id),
    [currentUser.id, project],
  )
  const canManageProjectScores =
    currentUser.role === 'admin' || myProjectMember?.role === 'concertmaster'
  const canAnnotateActiveScore =
    !!activeScore &&
    (canManageProjectScores ||
      ((myProjectMember?.role === 'member' || myProjectMember?.role === 'principal') &&
        myProjectMember.sectionId === activeScore.sectionId))
  const canSaveSharedScore =
    !!activeScore &&
    (canManageProjectScores ||
      (myProjectMember?.role === 'principal' &&
        myProjectMember.sectionId === activeScore.sectionId))
  const viewOnlyMessage =
    language === 'zh'
      ? '你可以查看所有聲部，但只能在自己所屬的聲部上做記號。'
      : 'You can view every section, but markings are only allowed on your assigned section.'
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
  const [zoom, setZoom] = useState(90)
  const [mode, setMode] = useState<SelectionMode>('select')
  const [selectedNote, setSelectedNote] = useState<EditableNoteRef | null>(null)
  const [similarityRangeStart, setSimilarityRangeStart] = useState<EditableNoteRef | null>(null)
  const [similarityRangeEnd, setSimilarityRangeEnd] = useState<EditableNoteRef | null>(null)
  const [similarityCandidates, setSimilarityCandidates] = useState<SimilarPassageCandidate[]>([])
  const [isFindingSimilar, setIsFindingSimilar] = useState(false)
  const [similarityError, setSimilarityError] = useState<string | null>(null)
  const [pieceSimilarityByPieceId, setPieceSimilarityByPieceId] = useState<Record<string, PieceSimilarityState>>({})
  const [showAllAutoSimilarityHighlights, setShowAllAutoSimilarityHighlights] = useState(false)
  const [pendingBowingSuggestionsByScoreId, setPendingBowingSuggestionsByScoreId] = useState<
    Record<string, PendingBowingSuggestion[]>
  >({})
  const [slurDraft, setSlurDraft] = useState<SlurDraft | null>(null)
  const [hairpinDraft, setHairpinDraft] = useState<HairpinDraft | null>(null)
  const [showMeasureNumbers, setShowMeasureNumbers] = useState(true)
  const [showPartNames, setShowPartNames] = useState(true)
  const [compactLayout, setCompactLayout] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [originalXmlByScoreId, setOriginalXmlByScoreId] = useState<Record<string, string>>({})
  const [workingXmlByScoreId, setWorkingXmlByScoreId] = useState<Record<string, string>>({})
  const [historyByScoreId, setHistoryByScoreId] = useState<Record<string, XmlHistory>>({})
  const [activeAnnotationLayer, setActiveAnnotationLayer] = useState<AnnotationScope>('shared')
  const [annotationsByScoreId, setAnnotationsByScoreId] = useState<Record<string, AnnotationLayerState>>({})
  const [annotationsLoadingByScoreId, setAnnotationsLoadingByScoreId] = useState<Record<string, boolean>>({})
  const [annotationErrorByScoreId, setAnnotationErrorByScoreId] = useState<Record<string, string | undefined>>({})

  const workingXml = workingXmlByScoreId[scoreId]
  const originalXml = originalXmlByScoreId[scoreId]
  const history = historyByScoreId[scoreId] ?? { past: [], future: [] }
  const isModified = !!workingXml && !!originalXml && workingXml !== originalXml
  const annotationLayers = annotationsByScoreId[scoreId] ?? EMPTY_ANNOTATION_LAYERS
  const sharedAnnotations = annotationLayers.shared
  const privateAnnotations = annotationLayers.private
  const annotationsLoading = !!annotationsLoadingByScoreId[scoreId]
  const annotationError = annotationErrorByScoreId[scoreId]
  const sharedEditDisabled = !canSaveSharedScore
  const sharedEditTitleSuffix = sharedEditDisabled ? ` - ${viewOnlyMessage}` : ''
  const bowingDisabled =
    !selectedNote ||
    (activeAnnotationLayer === 'private' ? !canAnnotateActiveScore : !canSaveSharedScore)
  const bowingTitleSuffix =
    activeAnnotationLayer === 'private'
      ? !canAnnotateActiveScore ? ` - ${viewOnlyMessage}` : ''
      : sharedEditTitleSuffix
  const currentPendingBowingSuggestions = pendingBowingSuggestionsByScoreId[scoreId] ?? []
  const layeredRenderXml = useMemo(() => {
    if (!workingXml) return undefined

    const bowingLayerXml =
      activeAnnotationLayer === 'private'
        ? applyPrivateBowingAnnotationsToXml(workingXml, scoreId, privateAnnotations)
        : workingXml

    return applyPendingBowingSuggestionsToXml(
      bowingLayerXml,
      currentPendingBowingSuggestions,
    )
  }, [activeAnnotationLayer, currentPendingBowingSuggestions, privateAnnotations, scoreId, workingXml])

  const privateAnnotationRenderKey = privateAnnotations
    .map((annotation) => `${annotation.id}:${annotation.updatedAt ?? annotation.createdAt}`)
    .join('|')
  const pendingBowingSuggestionRenderKey = currentPendingBowingSuggestions
    .map((suggestion) => `${suggestion.id}:${suggestion.targetRef.measureNumber}:${suggestion.targetRef.noteIndex}`)
    .join('|')

  useEffect(() => {
    workingXmlByScoreIdRef.current = workingXmlByScoreId
    Object.entries(workingXmlByScoreId).forEach(([cachedScoreId, xml]) => {
      scoreXmlCacheRef.current[cachedScoreId] = xml
    })
  }, [workingXmlByScoreId])

  useEffect(() => {
    selectedNoteRef.current = selectedNote
  }, [selectedNote])

  useEffect(() => {
    setSimilarityRangeStart(null)
    setSimilarityRangeEnd(null)
    setSimilarityCandidates([])
    setSimilarityError(null)
  }, [scoreId])

  useEffect(() => {
    setShowAllAutoSimilarityHighlights(false)
  }, [activePieceId])

  useEffect(() => {
    if (!projectId || !activePieceId) return
    const current = pieceSimilarityByPieceId[activePieceId]
    if (current && current.status !== 'idle') return

    setPieceSimilarityByPieceId((prev) => ({
      ...prev,
      [activePieceId]: { highlights: prev[activePieceId]?.highlights ?? [], status: 'scanning', error: null },
    }))

    scoresApi.scanPieceSimilarPassages(projectId, activePieceId, {
      threshold: 0.78,
      maxHighlights: 30,
    })
      .then((response) => {
        setPieceSimilarityByPieceId((prev) => ({
          ...prev,
          [activePieceId]: { highlights: response.highlights, status: 'ready', error: null },
        }))
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Scan failed'
        setPieceSimilarityByPieceId((prev) => ({
          ...prev,
          [activePieceId]: { highlights: prev[activePieceId]?.highlights ?? [], status: 'error', error: message },
        }))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activePieceId])

  useEffect(() => {
    if (!projectId || !activePieceId) return
    if (bowingSuggestionScanPiecesRef.current.has(activePieceId)) return
    bowingSuggestionScanPiecesRef.current.add(activePieceId)

    scoresApi.scanBowingSuggestions(projectId, activePieceId, { threshold: 0.78, maxHighlights: 30 })
      .then((response) => {
        if (!response.suggestions?.length) return
        setPendingBowingSuggestionsByScoreId((prev) => {
          const next = { ...prev }
          response.suggestions.forEach((s) => {
            const current = next[s.targetScoreId] ?? []
            const isDuplicate = current.some(
              (item) =>
                item.bowingType === s.bowingType &&
                editableNoteRefKey(item.targetRef) === editableNoteRefKey(s.targetRef as EditableNoteRef),
            )
            if (!isDuplicate) {
              next[s.targetScoreId] = [...current, { ...s, targetRef: s.targetRef as EditableNoteRef }]
            }
          })
          return next
        })
      })
      .catch(() => { /* best-effort */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activePieceId])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    addToastRef.current = addToast
  }, [addToast])

  useEffect(() => {
    if (!scoreId) return

    let cancelled = false
    setAnnotationsLoadingByScoreId((prev) => ({ ...prev, [scoreId]: true }))
    setAnnotationErrorByScoreId((prev) => ({ ...prev, [scoreId]: undefined }))

    annotationsApi.listScoreAnnotations(scoreId)
      .then((annotations) => {
        if (cancelled) return
        setAnnotationsByScoreId((prev) => ({
          ...prev,
          [scoreId]: {
            shared: annotations.filter((annotation) => annotation.scope === 'shared'),
            private: annotations.filter((annotation) => annotation.scope === 'private'),
          },
        }))
      })
      .catch((err) => {
        if (cancelled) return
        const isAnnotationError = err instanceof annotationsApi.AnnotationApiError
        const details = isAnnotationError ? formatAnnotationErrorDetails(err.details) : undefined
        const baseMessage = err instanceof Error ? err.message : 'Unable to load annotation layers'
        const message = details ? `${baseMessage} - ${details}` : baseMessage
        setAnnotationErrorByScoreId((prev) => ({ ...prev, [scoreId]: message }))
        setAnnotationsByScoreId((prev) => ({ ...prev, [scoreId]: EMPTY_ANNOTATION_LAYERS }))
        addToastRef.current({
          title: 'Annotation layers unavailable',
          message,
        })
      })
      .finally(() => {
        if (cancelled) return
        setAnnotationsLoadingByScoreId((prev) => ({ ...prev, [scoreId]: false }))
      })

    return () => {
      cancelled = true
    }
  }, [scoreId])

  useEffect(() => {
    if (mode !== 'hairpin' || !selectedNote || !hairpinDraft) return

    const selectionKey = editableNoteRefKey(selectedNote)
    if (pendingHairpinSelectionKeyRef.current === selectionKey) {
      pendingHairpinSelectionKeyRef.current = null
      return
    }

    handleHairpinNoteSelection(selectedNote)
  }, [mode, selectedNote, hairpinDraft])

  useEffect(() => {
    if (!xmlEntry || !containerRef.current) return

    let cancelled = false
    const container = containerRef.current
    selectedGraphicalNoteRef.current = null
    lastRenderedXmlRef.current = null
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
              throw new Error(`${t('scoreEditor.loadMusicXmlFailed')} (${response.status})`)
            }
            xml = await response.text()
          } else if (activeScore?.xmlContent) {
            xml = activeScore.xmlContent
          } else {
            const apiScore = await scoresApi.getScore(scoreId)
            if (!apiScore.xml_content) {
              throw new Error(t('scoreEditor.noInlineXml'))
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
          alignRests: 2,
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

        const renderXml = sanitizeRestPlacementForRender(xml)
        await osmd.load(renderXml, xmlEntry.title)
        if (cancelled) return
        osmd.Zoom = zoomRef.current / 100
        osmd.render()
        lastRenderedXmlRef.current = xml
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(language === 'en' && err instanceof Error ? err.message : t('scoreEditor.renderFailed'))
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
    lastRenderedXmlRef.current = null
  }, [activeAnnotationLayer, pendingBowingSuggestionRenderKey, privateAnnotationRenderKey, scoreId])

  useEffect(() => {
    if (status !== 'ready' || !layeredRenderXml || !osmdRef.current) return
    if (layeredRenderXml === lastRenderedXmlRef.current) return

    const renderXmlSource = layeredRenderXml
    let cancelled = false
    let idleHandle: number | null = null
    const osmd = osmdRef.current
    const noteToReselect = selectedNoteRef.current
    const renderToken = ++backgroundRenderTokenRef.current

    async function applyWorkingXmlUpdate() {
      try {
        const scrollSnapshot = getCanvasScrollSnapshot()
        const renderXml = sanitizeRestPlacementForRender(renderXmlSource)
        await osmd.load(renderXml, xmlEntry.title)
        if (cancelled || renderToken !== backgroundRenderTokenRef.current) return
        osmd.Zoom = zoomRef.current / 100
        osmd.renderAndScrollBack()
        restoreCanvasScroll(scrollSnapshot)
        lastRenderedXmlRef.current = renderXmlSource

        if (noteToReselect) {
          const graphicalNote = findGraphicalNoteFromRef(osmd, scoreId, noteToReselect, renderXmlSource)
          if (graphicalNote) {
            highlightGraphicalNote(graphicalNote, selectedGraphicalNoteRef)
          }
        }
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(language === 'en' && err instanceof Error ? err.message : t('scoreEditor.updateFailed'))
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
  }, [layeredRenderXml, status, scoreId, xmlEntry.title])

  useEffect(() => {
    if (status !== 'ready' || !osmdRef.current) return
    const osmd = osmdRef.current
    const scrollSnapshot = getCanvasScrollSnapshot()
    osmd.Zoom = zoom / 100
    osmd.renderAndScrollBack()
    restoreCanvasScroll(scrollSnapshot)

    const ref = selectedNoteRef.current
    if (ref) {
      const graphicalNote = findGraphicalNoteFromRef(
        osmd,
        scoreId,
        ref,
        lastRenderedXmlRef.current ?? undefined,
      )
      if (graphicalNote) {
        highlightGraphicalNote(graphicalNote, selectedGraphicalNoteRef)
      }
    }
  }, [status, zoom, scoreId])

  function getCanvasScrollSnapshot(): CanvasScrollSnapshot | null {
    const canvas = canvasRef.current
    return canvas ? { top: canvas.scrollTop, left: canvas.scrollLeft } : null
  }

  function restoreCanvasScroll(snapshot: CanvasScrollSnapshot | null) {
    if (!snapshot) return

    window.requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.scrollTop = snapshot.top
      canvas.scrollLeft = snapshot.left
    })
  }

  if (!project || !activeScore) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <div className="text-sm font-semibold text-slate-900">{t('scoreEditor.musicXmlNotFound')}</div>
          <div className="mt-2">
            <Button variant="secondary" onClick={() => navigate('/projects')}>
              {t('scoreEditor.backToProjects')}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  function changeScore(nextScoreId: string) {
    if (!projectId) {
      addToast({
        title: language === 'zh' ? '無法開啟分譜' : 'Unable to open score',
        message: language === 'zh' ? '目前缺少專案路由資訊。' : 'The current project route context is missing.',
      })
      return
    }

    const targetScore = availableScores.find((item) => item.id === nextScoreId)
    if (!targetScore) {
      addToast({
        title: language === 'zh' ? '無法開啟分譜' : 'Unable to open score',
        message: language === 'zh' ? '找不到目標分譜，或你沒有檢視權限。' : 'The target score was not found or is not visible to you.',
      })
      return
    }

    setSelectedNote(null)
    setSlurDraft(null)
    setHairpinDraft(null)
    pendingHairpinSelectionKeyRef.current = null
    selectedGraphicalNoteRef.current = null
    navigate(`/projects/${encodeURIComponent(projectId)}/scores/${encodeURIComponent(nextScoreId)}/musicxml`)
  }

  function setSimilarityRangePoint(point: 'start' | 'end') {
    if (!selectedNote) {
      addToast({ title: t('scoreEditor.noNoteSelected'), message: t('scoreEditor.clickCloserToNote') })
      return
    }

    if (point === 'start') {
      setSimilarityRangeStart(selectedNote)
    } else {
      setSimilarityRangeEnd(selectedNote)
    }
    setSimilarityCandidates([])
    setSimilarityError(null)
  }

  function candidateSectionLabel(candidate: SimilarPassageCandidate) {
    if (candidate.targetSectionName) return candidate.targetSectionName
    const member = project?.members.find((item) => item.sectionId === candidate.targetSectionId)
    if (member) return member.sectionName
    const score = availableScores.find((item) => item.id === candidate.targetScoreId)
    return score?.title ?? candidate.targetSectionId
  }

  async function findSimilarPassages() {
    if (!similarityRangeStart || !similarityRangeEnd) {
      const message = language === 'zh' ? '請先設定旋律範圍起點與終點。' : 'Set a range start and end first.'
      setSimilarityError(message)
      addToast({ title: language === 'zh' ? '尚未設定範圍' : 'Range not set', message })
      return
    }

    setIsFindingSimilar(true)
    setSimilarityError(null)
    try {
      const candidates = await scoresApi.findSimilarPassages(scoreId, {
        sourceRange: {
          startRef: editableNoteRefToAnnotationTarget(similarityRangeStart),
          endRef: editableNoteRefToAnnotationTarget(similarityRangeEnd),
        },
        threshold: 0.7,
        limit: 10,
      })
      setSimilarityCandidates(candidates)
      if (candidates.length === 0) {
        addToast({
          title: language === 'zh' ? '沒有找到相似段落' : 'No similar passages found',
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to find similar passages'
      setSimilarityError(message)
      addToast({
        title: language === 'zh' ? '尋找相似段落失敗' : 'Similar passage search failed',
        message,
      })
    } finally {
      setIsFindingSimilar(false)
    }
  }

  async function runPieceSimilarityScan() {
    if (!projectId || !activePieceId) {
      addToast({
        title: language === 'zh' ? '無法掃描相似段落' : 'Unable to scan similar passages',
        message: language === 'zh' ? '目前缺少 piece 資訊。' : 'The current piece context is missing.',
      })
      return
    }

    const current = pieceSimilarityByPieceId[activePieceId]
    if (current?.status === 'scanning') return

    setPieceSimilarityByPieceId((prev) => ({
      ...prev,
      [activePieceId]: { highlights: prev[activePieceId]?.highlights ?? [], status: 'scanning', error: null },
    }))

    try {
      const response = await scoresApi.scanPieceSimilarPassages(projectId, activePieceId, {
        threshold: 0.78,
        maxHighlights: 30,
      })
      setPieceSimilarityByPieceId((prev) => ({
        ...prev,
        [activePieceId]: { highlights: response.highlights, status: 'ready', error: null },
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed'
      setPieceSimilarityByPieceId((prev) => ({
        ...prev,
        [activePieceId]: { highlights: prev[activePieceId]?.highlights ?? [], status: 'error', error: message },
      }))
    }
  }

  function sectionLabel(sectionId: string | null, sectionName: string | null, scoreIdForFallback: string) {
    if (sectionName) return sectionName
    const member = project?.members.find((m) => m.sectionId === sectionId)
    if (member) return member.sectionName
    const score = availableScores.find((s) => s.id === scoreIdForFallback)
    return score?.title ?? scoreIdForFallback
  }

  async function getScoreXmlForSuggestion(targetScoreId: string) {
    const cached =
      workingXmlByScoreIdRef.current[targetScoreId] ??
      scoreXmlCacheRef.current[targetScoreId]
    if (cached) return cached

    const targetScore = availableScores.find((item) => item.id === targetScoreId)
    if (targetScore?.xmlContent) {
      scoreXmlCacheRef.current[targetScoreId] = targetScore.xmlContent
      return targetScore.xmlContent
    }

    const xmlUrl = targetScore ? resolveXmlUrl(targetScore) : null
    if (xmlUrl) {
      const response = await fetch(xmlUrl)
      if (!response.ok) return null
      const xml = await response.text()
      scoreXmlCacheRef.current[targetScoreId] = xml
      return xml
    }

    const apiScore = await scoresApi.getScore(targetScoreId)
    if (!apiScore.xml_content) return null
    scoreXmlCacheRef.current[targetScoreId] = apiScore.xml_content
    return apiScore.xml_content
  }

  async function createBowingSyncSuggestionsFromSimilarPassages(
    sourceRef: EditableNoteRef,
    bowingType: BowingMark,
  ) {
    const sourceXml = workingXmlByScoreIdRef.current[sourceRef.scoreId]
    if (!sourceXml || autoSimilarityHighlights.length === 0) return

    const suggestions: PendingBowingSuggestion[] = []

    for (const highlight of autoSimilarityHighlights) {
      const sourceIsLeft = highlight.leftScoreId === sourceRef.scoreId
      const sourceIsRight = highlight.rightScoreId === sourceRef.scoreId
      if (!sourceIsLeft && !sourceIsRight) continue

      const sourceStartRef = sourceIsLeft ? highlight.leftStartRef : highlight.rightStartRef
      const sourceEndRef = sourceIsLeft ? highlight.leftEndRef : highlight.rightEndRef
      const sourceStartMeasure = sourceIsLeft
        ? highlight.leftStartMeasureNumber
        : highlight.rightStartMeasureNumber
      const sourceEndMeasure = sourceIsLeft
        ? highlight.leftEndMeasureNumber
        : highlight.rightEndMeasureNumber
      const targetScoreId = sourceIsLeft ? highlight.rightScoreId : highlight.leftScoreId
      const targetStartRef = sourceIsLeft ? highlight.rightStartRef : highlight.leftStartRef
      const targetEndRef = sourceIsLeft ? highlight.rightEndRef : highlight.leftEndRef
      const targetStartMeasure = sourceIsLeft
        ? highlight.rightStartMeasureNumber
        : highlight.leftStartMeasureNumber
      const targetEndMeasure = sourceIsLeft
        ? highlight.rightEndMeasureNumber
        : highlight.leftEndMeasureNumber

      const sourceRangeNotes = getIndexedNotesInRange(
        sourceXml,
        sourceRef.scoreId,
        sourceStartRef,
        sourceEndRef,
        sourceStartMeasure,
        sourceEndMeasure,
      )
      const sourceIndex = sourceRangeNotes.findIndex((item) => indexedNoteMatchesRef(item, sourceRef))
      if (sourceIndex < 0) continue

      const targetXml = await getScoreXmlForSuggestion(targetScoreId)
      if (!targetXml) continue

      const targetRangeNotes = getIndexedNotesInRange(
        targetXml,
        targetScoreId,
        targetStartRef,
        targetEndRef,
        targetStartMeasure,
        targetEndMeasure,
      )
      const targetIndex = mapRangeIndex(sourceIndex, sourceRangeNotes.length, targetRangeNotes.length)
      const targetNote = targetIndex >= 0 ? targetRangeNotes[targetIndex] : undefined
      if (!targetNote) continue

      const sourceSectionName = sourceIsLeft
        ? sectionLabel(highlight.leftSectionId, highlight.leftSectionName, highlight.leftScoreId)
        : sectionLabel(highlight.rightSectionId, highlight.rightSectionName, highlight.rightScoreId)
      const targetSectionName = sourceIsLeft
        ? sectionLabel(highlight.rightSectionId, highlight.rightSectionName, highlight.rightScoreId)
        : sectionLabel(highlight.leftSectionId, highlight.leftSectionName, highlight.leftScoreId)
      const targetRef = editableRefFromIndexedNote(targetNote)
      const sourceMeasureRange = measureRangeText(sourceStartMeasure, sourceEndMeasure)

      suggestions.push({
        id: [
          sourceRef.scoreId,
          targetScoreId,
          editableNoteRefKey(targetRef),
          bowingType,
        ].join(':'),
        sourceScoreId: sourceRef.scoreId,
        sourceSectionName,
        sourceMeasureRange,
        targetScoreId,
        targetSectionName,
        targetRef,
        bowingType,
        similarity: highlight.similarity,
        status: 'pending',
      })
    }

    if (suggestions.length === 0) return

    setPendingBowingSuggestionsByScoreId((prev) => {
      const next = { ...prev }
      suggestions.forEach((suggestion) => {
        const current = next[suggestion.targetScoreId] ?? []
        const duplicate = current.some(
          (item) =>
            item.sourceScoreId === suggestion.sourceScoreId &&
            item.bowingType === suggestion.bowingType &&
            editableNoteRefKey(item.targetRef) === editableNoteRefKey(suggestion.targetRef),
        )
        if (!duplicate) {
          next[suggestion.targetScoreId] = [...current, suggestion]
        }
      })
      return next
    })
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

    const nearestNote = osmd.GraphicSheet.GetNearestNote(osmdPoint, new PointF2D(12, 12)) ?? null
    if (!nearestNote || isEditablePitchedGraphicalNote(nearestNote)) return nearestNote

    const { replacement, candidates } = findNearestPitchedGraphicalNoteInSameMeasure(
      osmd,
      nearestNote,
      osmdPoint,
    )
    warnRestGraphicalNoteReplacement({
      nearestNoteWasRestOrUnpitched: true,
      nearestNote: summarizeGraphicalNoteCandidate(nearestNote, distanceToPoint(nearestNote, osmdPoint)),
      replacementFound: Boolean(replacement),
      replacement: replacement ? summarizeGraphicalNoteCandidate(replacement.note, replacement.distance) : null,
      candidates: candidates.slice(0, 8).map((candidate) =>
        summarizeGraphicalNoteCandidate(candidate.note, candidate.distance),
      ),
    })

    return replacement?.note ?? nearestNote
  }

  function getScoreSvgElement() {
    const svg = containerRef.current?.querySelector('svg')
    return svg instanceof SVGSVGElement ? svg : null
  }

  function handleScoreClick(event: React.MouseEvent<HTMLDivElement>) {
    if (mode === 'pan' || status !== 'ready') return
    if (!containerRef.current?.contains(event.target as Node)) return

    const graphicalNote = getClickedGraphicalNote(event)
    if (!graphicalNote) {
      addToast({ title: t('scoreEditor.noNoteSelected'), message: t('scoreEditor.clickCloserToNote') })
      return
    }

    const ref = getEditableRefFromGraphicalNote(graphicalNote, scoreId, workingXml, true)
    if (!ref) {
      addToast({ title: t('scoreEditor.noteCannotBeEditedYet') })
      if (DEBUG_NOTE_MAPPING) {
        addToast({ title: 'Mapping debug printed to console' })
      }
      return
    }

    setSelectedNote(ref)
    highlightGraphicalNote(graphicalNote, selectedGraphicalNoteRef)

    if (mode === 'slur') {
      handleSlurNoteClick(ref)
    }
  }

  function applyXmlOperation(
    title: string,
    updateXml: (xml: string) => string,
  ) {
    if (!canSaveSharedScore) {
      addToast({
        title: language === 'zh' ? '此聲部只能檢視' : 'View-only section',
        message: viewOnlyMessage,
      })
      return
    }

    const currentXml = workingXmlByScoreId[scoreId]
    if (!currentXml) return false

    try {
      const nextXml = updateXml(currentXml)
      if (nextXml === currentXml) return false

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
      return true
    } catch (err) {
      addToast({
        title: t('scoreEditor.editFailed'),
        message: language === 'en' && err instanceof Error ? err.message : t('scoreEditor.updateFailed'),
      })
      return false
    }
  }

  function applyDynamic(mark: DynamicMark) {
    if (!selectedNote) return
    const ref = selectedNote
    applyXmlOperation(
      t('scoreEditor.dynamicApplied'),
      (xml) => replaceDynamic(xml, ref, mark),
    )
  }

  async function createPrivateBowingAnnotation(ref: EditableNoteRef, mark: BowingMark) {
    if (!canAnnotateActiveScore) {
      addToast({
        title: language === 'zh' ? '無法在此聲部做私人記號' : 'Private marking unavailable',
        message: viewOnlyMessage,
      })
      return
    }

    try {
      const annotation = await annotationsApi.createScoreAnnotation(scoreId, {
        scope: 'private',
        annotationType: 'bowing',
        targetRef: editableNoteRefToAnnotationTarget(ref),
        payload: { bowingType: mark },
      })

      setAnnotationsByScoreId((prev) => {
        const current = prev[scoreId] ?? EMPTY_ANNOTATION_LAYERS
        return {
          ...prev,
          [scoreId]: {
            shared: current.shared,
            private: [...current.private, annotation],
          },
        }
      })

      addToast({
        title: mark === 'up-bow' ? 'Private up-bow saved' : 'Private down-bow saved',
        message: 'Saved to My private layer.',
      })
    } catch (err) {
      const isAnnotationError = err instanceof annotationsApi.AnnotationApiError
      const status = isAnnotationError ? ` (${err.status})` : ''
      const details = isAnnotationError ? formatAnnotationErrorDetails(err.details) : undefined
      const message = err instanceof Error ? err.message : t('scoreEditor.updateFailed')
      addToast({
        title: `Private bowing was not saved${status}`,
        message: details ? `${message} - ${details}` : message,
      })
    }
  }

  function acceptBowingSuggestion(suggestion: PendingBowingSuggestion) {
    applyXmlOperation(
      language === 'zh' ? '已套用弓法建議' : 'Bowing suggestion accepted',
      (xml) => applyAcceptedBowingSuggestion(xml, suggestion.targetRef, suggestion.bowingType),
    )
    setPendingBowingSuggestionsByScoreId((prev) => ({
      ...prev,
      [scoreId]: (prev[scoreId] ?? []).filter((s) => s.id !== suggestion.id),
    }))
  }

  function acceptAllBowingSuggestions() {
    const toApply = currentPendingBowingSuggestions
    if (toApply.length === 0) return
    applyXmlOperation(
      language === 'zh' ? `已套用 ${toApply.length} 個弓法建議` : `Accepted ${toApply.length} bowing suggestion${toApply.length === 1 ? '' : 's'}`,
      (xml) => toApply.reduce((acc, s) => applyAcceptedBowingSuggestion(acc, s.targetRef, s.bowingType), xml),
    )
    setPendingBowingSuggestionsByScoreId((prev) => ({ ...prev, [scoreId]: [] }))
  }

  function applyBowing(mark: BowingMark) {
    if (!selectedNote) return
    const ref = selectedNote
    if (activeAnnotationLayer === 'private') {
      void createPrivateBowingAnnotation(ref, mark)
      return
    }

    // ── DEBUG A / B / D ───────────────────────────────────────────────────
    const clickedKey = editableNoteRefKey(ref)
    const nearSuggestions = currentPendingBowingSuggestions.filter(
      (s) => Math.abs(s.targetRef.measureNumber - ref.measureNumber) <= 2,
    )
    console.group(`[BowingDebug:applyBowing]  mark=${mark}  m${ref.measureNumber}[idx=${ref.noteIndex}]`)
    console.log('A. clicked ref:', JSON.stringify(ref))
    console.log('A. clicked key:', clickedKey)
    console.log('A. pending suggestions near ±2 measures:')
    if (nearSuggestions.length === 0) {
      console.log('   (none)')
    } else {
      nearSuggestions.forEach((s) => {
        const sKey = editableNoteRefKey(s.targetRef)
        const exactMatch = sKey === clickedKey
        const diff: string[] = []
        if (s.targetRef.measureArrayIndex !== ref.measureArrayIndex)
          diff.push(`measureArrayIndex suggestion=${s.targetRef.measureArrayIndex} clicked=${ref.measureArrayIndex}`)
        if (s.targetRef.measureNumber !== ref.measureNumber)
          diff.push(`measureNumber suggestion=${s.targetRef.measureNumber} clicked=${ref.measureNumber}`)
        if (s.targetRef.noteIndex !== ref.noteIndex)
          diff.push(`noteIndex suggestion=${s.targetRef.noteIndex} clicked=${ref.noteIndex}`)
        if ((s.targetRef.staff ?? '') !== (ref.staff ?? ''))
          diff.push(`staff suggestion=${s.targetRef.staff ?? ''} clicked=${ref.staff ?? ''}`)
        if ((s.targetRef.voice ?? '') !== (ref.voice ?? ''))
          diff.push(`voice suggestion=${s.targetRef.voice ?? ''} clicked=${ref.voice ?? ''}`)
        if (s.targetRef.partId !== ref.partId)
          diff.push(`partId suggestion=${s.targetRef.partId} clicked=${ref.partId}`)
        console.log(
          `   ${s.bowingType} @m${s.targetRef.measureNumber}[idx=${s.targetRef.noteIndex}]`,
          `exactKeyMatch=${exactMatch}`,
          exactMatch ? '' : `  DIFF: [${diff.join(' | ')}]`,
        )
        console.log('   suggestion key :', sKey)
        console.log('   clicked key    :', clickedKey)
      })
    }
    // B: sync suggestion directions should never be in workingXml
    const syncInWorking = workingXml?.includes('data-sync-suggestion') ?? false
    console.log('B. data-sync-suggestion in workingXml:', syncInWorking ? 'YES ⚠️ (should not happen)' : 'no (correct)')
    // D: pending suggestions survive bowing ops (state only cleared by manual dismiss / re-scan)
    console.log('D. total pending suggestions for this score (before op):', currentPendingBowingSuggestions.length)
    console.groupEnd()
    // ── END DEBUG ─────────────────────────────────────────────────────────

    const applied = applyXmlOperation(
      mark === 'up-bow' ? t('scoreEditor.upBowApplied') : t('scoreEditor.downBowApplied'),
      (xml) => replaceBowing(xml, ref, mark),
    )
    if (applied && activeAnnotationLayer === 'shared') {
      void createBowingSyncSuggestionsFromSimilarPassages(ref, mark)
    }
  }

  function applyArticulation(type: ArticulationMark) {
    if (!selectedNote) {
      addToast({ title: t('scoreEditor.noNoteSelected'), message: t('scoreEditor.clickCloserToNote') })
      return
    }

    const ref = selectedNote
    const label = ARTICULATION_TOOLS.find((tool) => tool.mark === type)?.label ?? type
    applyXmlOperation(
      `${label} applied`,
      (xml) => replaceArticulation(xml, ref, type),
    )
  }

  function eraseSelectedMarkings() {
    if (!selectedNote) return
    const ref = selectedNote
    applyXmlOperation(
      t('scoreEditor.selectedMarkingsErased'),
      (xml) => eraseSupportedMarkings(xml, ref),
    )
    setSlurDraft(null)
    setHairpinDraft(null)
    pendingHairpinSelectionKeyRef.current = null
    setMode('select')
  }

  function startSlurMode() {
    if (!canSaveSharedScore) {
      addToast({
        title: language === 'zh' ? '此聲部只能檢視' : 'View-only section',
        message: viewOnlyMessage,
      })
      return
    }

    setMode('slur')
    setHairpinDraft(null)
    pendingHairpinSelectionKeyRef.current = null
    if (selectedNote) {
      setSlurDraft({ start: selectedNote })
      addToast({ title: t('scoreEditor.slurStartSelected'), message: t('scoreEditor.clickEndingNote') })
      return
    }
    setSlurDraft(null)
    addToast({ title: t('scoreEditor.selectSlurStart'), message: t('scoreEditor.clickFirstNote') })
  }

  function handleSlurNoteClick(ref: EditableNoteRef) {
    if (!slurDraft) {
      setSlurDraft({ start: ref })
      addToast({ title: t('scoreEditor.slurStartSelected'), message: t('scoreEditor.clickEndingNote') })
      return
    }

    const start = slurDraft.start
    applyXmlOperation(
      t('scoreEditor.slurApplied'),
      (xml) => addSlur(xml, start, ref),
    )
    setSlurDraft(null)
    setMode('select')
  }

  function applyHairpin(type: HairpinType) {
    if (!canSaveSharedScore) {
      addToast({
        title: language === 'zh' ? '此聲部只能檢視' : 'View-only section',
        message: viewOnlyMessage,
      })
      return
    }

    setMode('hairpin')
    setSlurDraft(null)
    if (selectedNote) {
      setHairpinDraft({ type, start: selectedNote })
      pendingHairpinSelectionKeyRef.current = editableNoteRefKey(selectedNote)
      addToast({ title: `${hairpinLabel(type)} start selected`, message: t('scoreEditor.clickEndingNote') })
      return
    }

    setHairpinDraft({ type })
    pendingHairpinSelectionKeyRef.current = null
    addToast({ title: `Select ${hairpinLabel(type)} start`, message: t('scoreEditor.clickFirstNote') })
  }

  function handleHairpinNoteSelection(ref: EditableNoteRef) {
    if (!hairpinDraft) return

    if (!hairpinDraft.start) {
      setHairpinDraft({ ...hairpinDraft, start: ref })
      pendingHairpinSelectionKeyRef.current = editableNoteRefKey(ref)
      addToast({ title: `${hairpinLabel(hairpinDraft.type)} start selected`, message: t('scoreEditor.clickEndingNote') })
      return
    }

    const start = hairpinDraft.start
    applyXmlOperation(
      `${hairpinLabel(hairpinDraft.type)} hairpin applied`,
      (xml) => addHairpin(xml, hairpinDraft.type, start, ref),
    )
    setHairpinDraft(null)
    pendingHairpinSelectionKeyRef.current = null
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
    setHairpinDraft(null)
    pendingHairpinSelectionKeyRef.current = null
    addToast({ title: t('scoreEditor.undoToast') })
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
    setHairpinDraft(null)
    pendingHairpinSelectionKeyRef.current = null
    addToast({ title: t('scoreEditor.redoToast') })
  }

  function resetWorkingXml() {
    if (!originalXml) return
    setWorkingXmlByScoreId((prev) => ({ ...prev, [scoreId]: originalXml }))
    setHistoryByScoreId((prev) => ({ ...prev, [scoreId]: { past: [], future: [] } }))
    setSelectedNote(null)
    setSlurDraft(null)
    setHairpinDraft(null)
    pendingHairpinSelectionKeyRef.current = null
    setMode('select')
    addToast({ title: t('scoreEditor.resetToast') })
  }

  function exportWorkingXml() {
    if (!workingXml) return
    downloadText(`${fileSafeName(xmlEntry.title || scoreId)}-edited.musicxml`, workingXml)
  }

  async function saveWorkingXml() {
    if (!workingXml || !scoreId) return
    if (!canSaveSharedScore) {
      addToast({
        title: language === 'zh' ? '無法儲存此聲部' : 'Cannot save this section',
        message: viewOnlyMessage,
      })
      return
    }

    if (!isModified) {
      addToast({ title: t('scoreEditor.noChanges') })
      return
    }

    setIsSaving(true)
    try {
      const savedXml = workingXml
      await scoresApi.saveScoreMusicXml(scoreId, savedXml)
      setOriginalXmlByScoreId((prev) => ({ ...prev, [scoreId]: savedXml }))
      if (workingXmlByScoreIdRef.current[scoreId] === savedXml) {
        setHistoryByScoreId((prev) => ({ ...prev, [scoreId]: { past: [], future: [] } }))
      }
      addToast({ title: t('scoreEditor.saveSuccess') })
    } catch (err) {
      addToast({
        title: t('scoreEditor.saveFailed'),
        message: language === 'en' && err instanceof Error ? err.message : t('scoreEditor.updateFailed'),
      })
    } finally {
      setIsSaving(false)
    }
  }

  function resetView() {
    setZoom(90)
    containerRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const pieceSimilarity = activePieceId
    ? pieceSimilarityByPieceId[activePieceId] ?? { highlights: [], status: 'idle' as SimilarityScanStatus, error: null }
    : { highlights: [], status: 'idle' as SimilarityScanStatus, error: null }
  const autoSimilarityHighlights = pieceSimilarity.highlights
  const similarityScanStatus = pieceSimilarity.status
  const autoSimilarityError = pieceSimilarity.error
  const hasMoreAutoSimilarityHighlights = autoSimilarityHighlights.length > AUTO_SIMILARITY_PREVIEW_LIMIT
  const visibleAutoSimilarityHighlights = showAllAutoSimilarityHighlights
    ? autoSimilarityHighlights
    : autoSimilarityHighlights.slice(0, AUTO_SIMILARITY_PREVIEW_LIMIT)
  const pendingBowingSuggestionCount = Object.values(pendingBowingSuggestionsByScoreId)
    .reduce((sum, suggestions) => sum + suggestions.length, 0)

  return (
    <div className="score-editor-page flex h-dvh flex-col bg-[#eef1f4]">
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
                {t('scoreEditor.piecesBack')}
              </Button>
              <div className="truncate text-sm font-semibold text-slate-950">
                {xmlEntry.title}
              </div>
              <Badge tone={isModified ? 'warn' : 'neutral'}>
                {isModified ? `${history.past.length} ${t('scoreEditor.edits')}` : t('common.original')}
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
              aria-label={t('scoreEditor.scorePart')}
            >
              {availableScores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={exportWorkingXml} disabled={!workingXml}>
              <Download className="size-4" />
              {t('common.export')}
            </Button>
            <Button onClick={saveWorkingXml} disabled={!scoreId || !workingXml || !isModified || isSaving || !canSaveSharedScore}>
              <Save className="size-4" />
              {isSaving ? t('common.saving') : t('common.save')}
            </Button>
            <Button variant="secondary" onClick={() => setSummaryOpen(true)}>
              <FileText className="size-4" />
              {t('common.summary')}
            </Button>
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <ToolButton
            active={mode === 'select'}
            icon={<MousePointer2 className="size-4" />}
            label={t('scoreEditor.select')}
            onClick={() => {
              setMode('select')
              setSlurDraft(null)
              setHairpinDraft(null)
              pendingHairpinSelectionKeyRef.current = null
            }}
          />
          <ToolButton
            active={mode === 'pan'}
            icon={<Hand className="size-4" />}
            label={t('scoreEditor.pan')}
            onClick={() => {
              setMode('pan')
              setSlurDraft(null)
              setHairpinDraft(null)
              pendingHairpinSelectionKeyRef.current = null
            }}
          />

          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 shadow-inner">
            <span className="px-2 text-xs font-medium text-slate-500">Layer</span>
            <button
              type="button"
              aria-pressed={activeAnnotationLayer === 'shared'}
              onClick={() => setActiveAnnotationLayer('shared')}
              className={cn(
                'h-7 rounded px-2 text-xs font-medium transition',
                activeAnnotationLayer === 'shared'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white hover:text-slate-950',
              )}
            >
              Shared ({sharedAnnotations.length})
            </button>
            <button
              type="button"
              aria-pressed={activeAnnotationLayer === 'private'}
              onClick={() => setActiveAnnotationLayer('private')}
              className={cn(
                'h-7 rounded px-2 text-xs font-medium transition',
                activeAnnotationLayer === 'private'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white hover:text-slate-950',
              )}
            >
              My private ({privateAnnotations.length})
            </button>
            {annotationsLoading && (
              <span className="px-2 text-xs text-slate-500">Loading</span>
            )}
            {annotationError && !annotationsLoading && (
              <span
                className="px-2 text-xs font-semibold text-amber-700"
                title={annotationError}
              >
                !
              </span>
            )}
          </div>

          <Divider />

          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 shadow-inner">
            {DYNAMICS.map((mark) => (
              <SymbolButton
                key={mark}
                title={`${t('scoreEditor.apply')} ${mark}${sharedEditTitleSuffix}`}
                disabled={!selectedNote || sharedEditDisabled}
                onClick={() => applyDynamic(mark)}
              >
                <span className="font-serif text-base font-bold italic leading-none">
                  {mark}
                </span>
              </SymbolButton>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 shadow-inner">
            {ARTICULATION_TOOLS.map((tool) => (
              <SymbolButton
                key={tool.mark}
                title={`Apply ${tool.label}${sharedEditTitleSuffix}`}
                disabled={!selectedNote || sharedEditDisabled}
                onClick={() => applyArticulation(tool.mark)}
              >
                <span className="text-base font-semibold leading-none">
                  {tool.symbol}
                </span>
              </SymbolButton>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 shadow-inner">
            {HAIRPIN_TOOLS.map((tool) => (
              <SymbolButton
                key={tool.type}
                title={`Create ${tool.label} hairpin${sharedEditTitleSuffix}`}
                disabled={sharedEditDisabled}
                active={mode === 'hairpin' && hairpinDraft?.type === tool.type}
                className="w-auto min-w-14 px-2.5 text-xs font-semibold"
                onClick={() => applyHairpin(tool.type)}
              >
                <span className="whitespace-nowrap leading-none">
                  {tool.label} {tool.symbol}
                </span>
              </SymbolButton>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 shadow-inner">
            <SymbolButton
              title={
                activeAnnotationLayer === 'private'
                  ? `${t('scoreEditor.applyDownBow')} - saves to My private layer${bowingTitleSuffix}`
                  : `${t('scoreEditor.applyDownBow')}${bowingTitleSuffix}`
              }
              disabled={bowingDisabled}
              onClick={() => applyBowing('down-bow')}
            >
              <DownBowIcon />
            </SymbolButton>
            <SymbolButton
              title={
                activeAnnotationLayer === 'private'
                  ? `${t('scoreEditor.applyUpBow')} - saves to My private layer${bowingTitleSuffix}`
                  : `${t('scoreEditor.applyUpBow')}${bowingTitleSuffix}`
              }
              disabled={bowingDisabled}
              onClick={() => applyBowing('up-bow')}
            >
              <UpBowIcon />
            </SymbolButton>
            <SymbolButton
              title={t('scoreEditor.createSlur')}
              disabled={sharedEditDisabled}
              active={mode === 'slur'}
              onClick={startSlurMode}
            >
              <SlurIcon />
            </SymbolButton>
            <SymbolButton
              title={`${t('scoreEditor.eraseSelected')}${sharedEditTitleSuffix}`}
              disabled={!selectedNote || sharedEditDisabled}
              onClick={eraseSelectedMarkings}
            >
              <Eraser className="size-4" />
            </SymbolButton>
          </div>

          <Divider />

          <IconButton title={t('scoreEditor.zoomOut')} onClick={() => setZoom((value) => Math.max(60, value - 10))}>
            <ZoomOut className="size-4" />
          </IconButton>
          <div className="min-w-14 text-center text-sm font-medium text-slate-700">{zoom}%</div>
          <IconButton title={t('scoreEditor.zoomIn')} onClick={() => setZoom((value) => Math.min(180, value + 10))}>
            <ZoomIn className="size-4" />
          </IconButton>
          <IconButton title={t('scoreEditor.resetView')} onClick={resetView}>
            <Maximize2 className="size-4" />
          </IconButton>

          <Divider />

          <IconButton title={t('scoreEditor.undo')} disabled={!history.past.length} onClick={undoXmlEdit}>
            <Undo2 className="size-4" />
          </IconButton>
          <IconButton title={t('scoreEditor.redo')} disabled={!history.future.length} onClick={redoXmlEdit}>
            <Redo2 className="size-4" />
          </IconButton>
          <IconButton title={t('scoreEditor.resetScore')} disabled={!isModified} onClick={resetWorkingXml}>
            <RotateCcw className="size-4" />
          </IconButton>

          <details className="ml-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">{t('scoreEditor.view')}</summary>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showMeasureNumbers}
                  onChange={(event) => setShowMeasureNumbers(event.target.checked)}
                />
                {t('scoreEditor.measures')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showPartNames}
                  onChange={(event) => setShowPartNames(event.target.checked)}
                />
                {t('scoreEditor.parts')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={compactLayout}
                  onChange={(event) => setCompactLayout(event.target.checked)}
                />
                {t('scoreEditor.compact')}
              </label>
            </div>
          </details>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 min-w-[20rem] max-w-[20rem] shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4 lg:block">
          <div className="text-sm font-semibold text-slate-950">{t('scoreEditor.selection')}</div>
          <div className="mt-3 grid gap-3">
            <div>
              <div className="text-xs font-medium text-slate-500">{t('scoreEditor.note')}</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {noteLabel(selectedNote)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">{t('scoreEditor.mode')}</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {mode === 'slur'
                  ? t('scoreEditor.slurEndpointSelection')
                  : mode === 'hairpin'
                    ? `${hairpinDraft ? hairpinLabel(hairpinDraft.type) : 'Hairpin'} endpoint selection`
                    : mode === 'pan'
                      ? t('scoreEditor.pan')
                      : t('scoreEditor.select')}
              </div>
            </div>
            {slurDraft && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">{t('scoreEditor.slurStart')}</div>
                <div className="mt-1 text-sm text-slate-700">
                  {noteLabel(slurDraft.start)}
                </div>
              </div>
            )}
            {hairpinDraft?.start && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">
                  {hairpinLabel(hairpinDraft.type)} start
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {noteLabel(hairpinDraft.start)}
                </div>
              </div>
            )}
            <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-1">
                <div className="min-w-0 truncate text-xs font-medium text-slate-500">
                  {language === 'zh' ? '相似段落' : 'Similar passages'}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {similarityScanStatus === 'ready' && (
                    <Badge tone={autoSimilarityHighlights.length ? 'info' : 'neutral'}>
                      {autoSimilarityHighlights.length}
                    </Badge>
                  )}
                  <button
                    type="button"
                    disabled={similarityScanStatus === 'scanning'}
                    onClick={() => {
                      void runPieceSimilarityScan()
                    }}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {similarityScanStatus === 'scanning'
                      ? language === 'zh' ? '掃描中…' : 'Scanning…'
                      : language === 'zh' ? '重新掃描' : 'Rescan'}
                  </button>
                </div>
              </div>
              {autoSimilarityError && (
                <div className="mt-2 text-xs font-medium text-amber-700">{autoSimilarityError}</div>
              )}
              {similarityScanStatus === 'idle' && (
                <div className="mt-2 text-xs text-slate-400">
                  {language === 'zh' ? '載入中…' : 'Loading…'}
                </div>
              )}
              {similarityScanStatus === 'ready' && autoSimilarityHighlights.length === 0 && (
                <div className="mt-2 text-xs text-slate-500">
                  {language === 'zh' ? '沒有找到相似段落。' : 'No similar passages found.'}
                </div>
              )}
              {autoSimilarityHighlights.length > 0 && (
                <div className="mt-2 max-h-80 min-w-0 overflow-y-auto pr-1">
                  <div className="grid min-w-0 gap-2">
                    {visibleAutoSimilarityHighlights.map((h) => (
                      <div
                        key={`${h.leftScoreId}-${h.rightScoreId}-${h.leftStartMeasureNumber}-${h.rightStartMeasureNumber}-${h.similarity}`}
                        className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-2"
                      >
                        <div className="grid min-w-0 gap-1.5">
                          <div className="min-w-0">
                            <div
                              className="truncate text-xs font-semibold text-slate-900"
                              title={`${sectionLabel(h.leftSectionId, h.leftSectionName, h.leftScoreId)} m.${h.leftStartMeasureNumber}${
                                h.leftEndMeasureNumber !== h.leftStartMeasureNumber ? `-${h.leftEndMeasureNumber}` : ''
                              } -> ${sectionLabel(h.rightSectionId, h.rightSectionName, h.rightScoreId)} m.${h.rightStartMeasureNumber}${
                                h.rightEndMeasureNumber !== h.rightStartMeasureNumber ? `-${h.rightEndMeasureNumber}` : ''
                              }`}
                            >
                              {sectionLabel(h.leftSectionId, h.leftSectionName, h.leftScoreId)} m.{h.leftStartMeasureNumber}
                              {h.leftEndMeasureNumber !== h.leftStartMeasureNumber ? `–${h.leftEndMeasureNumber}` : ''}
                            </div>
                            <div className="truncate text-xs font-medium text-slate-700">
                              ↔ {sectionLabel(h.rightSectionId, h.rightSectionName, h.rightScoreId)} m.{h.rightStartMeasureNumber}
                              {h.rightEndMeasureNumber !== h.rightStartMeasureNumber ? `–${h.rightEndMeasureNumber}` : ''}
                            </div>
                            <div className="truncate text-[11px] text-slate-500">
                              {percentage(h.similarity)} · interval {percentage(h.intervalScore)} · rhythm {percentage(h.rhythmScore)}
                            </div>
                            {(scoreId === h.leftScoreId || scoreId === h.rightScoreId) && (
                              <div className="mt-1 inline-flex rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                                {language === 'zh' ? '目前開啟' : 'Currently open'}
                              </div>
                            )}
                          </div>
                          <div className="flex min-w-0 justify-end gap-1">
                            <button
                              type="button"
                              className="min-w-0 truncate rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              title={sectionLabel(h.leftSectionId, h.leftSectionName, h.leftScoreId)}
                              onClick={() => changeScore(h.leftScoreId)}
                            >
                              {language === 'zh'
                                ? `開啟${sectionLabel(h.leftSectionId, h.leftSectionName, h.leftScoreId)}`
                                : 'Open left'}
                            </button>
                            <button
                              type="button"
                              className="min-w-0 truncate rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              title={sectionLabel(h.rightSectionId, h.rightSectionName, h.rightScoreId)}
                              onClick={() => changeScore(h.rightScoreId)}
                            >
                              {language === 'zh'
                                ? `開啟${sectionLabel(h.rightSectionId, h.rightSectionName, h.rightScoreId)}`
                                : 'Open right'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {hasMoreAutoSimilarityHighlights && (
                    <button
                      type="button"
                      className="mt-2 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      onClick={() => setShowAllAutoSimilarityHighlights((value) => !value)}
                    >
                      {showAllAutoSimilarityHighlights
                        ? language === 'zh' ? '收合' : 'Show less'
                        : language === 'zh'
                          ? `顯示全部 ${autoSimilarityHighlights.length} 筆`
                          : `Show all ${autoSimilarityHighlights.length}`}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="min-w-0 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-xs font-medium text-rose-700">
                  {language === 'zh' ? '弓法同步建議' : 'Bowing sync suggestions'}
                </div>
                <Badge tone={pendingBowingSuggestionCount ? 'warn' : 'neutral'}>
                  {pendingBowingSuggestionCount}
                </Badge>
              </div>
              {currentPendingBowingSuggestions.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {currentPendingBowingSuggestions.length > 1 && (
                    <button
                      type="button"
                      disabled={!canSaveSharedScore}
                      onClick={acceptAllBowingSuggestions}
                      className="flex w-full items-center justify-center gap-1 rounded bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <CheckCheck className="size-3" />
                      {language === 'zh' ? `全部套用 (${currentPendingBowingSuggestions.length})` : `Accept all (${currentPendingBowingSuggestions.length})`}
                    </button>
                  )}
                  <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
                    {currentPendingBowingSuggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="flex items-center justify-between gap-1 rounded bg-white/60 px-1.5 py-1"
                        title={`${suggestion.sourceSectionName} ${suggestion.sourceMeasureRange}`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-medium text-rose-800">
                            <span className="mr-0.5 font-bold">{suggestion.bowingType === 'down-bow' ? 'Π' : 'V'}</span>
                            {' '}{language === 'zh' ? '來自' : 'From'} {suggestion.sourceSectionName} {suggestion.sourceMeasureRange}
                          </div>
                          <div className="text-[10px] text-rose-600/75">
                            {Math.round(suggestion.similarity * 100)}% {language === 'zh' ? '相似度' : 'similarity'}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!canSaveSharedScore}
                          onClick={() => acceptBowingSuggestion(suggestion)}
                          className="shrink-0 flex items-center gap-0.5 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Check className="size-2.5" />
                          {language === 'zh' ? '套用' : 'Accept'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-rose-600/75">
                  {language === 'zh' ? '目前分譜沒有待顯示建議。' : 'No suggestions for the current score.'}
                </div>
              )}
            </div>
            <details className="rounded-lg border border-slate-200 bg-slate-50">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700">
                {language === 'zh' ? '進階 / 手動搜尋' : 'Advanced / Manual search'}
              </summary>
              <div className="grid gap-3 px-3 pb-3 pt-1">
                <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-inner">
                  <button
                    type="button"
                    disabled={!selectedNote}
                    onClick={() => setSimilarityRangePoint('start')}
                    className="h-7 rounded px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {language === 'zh' ? '設起點' : 'Set start'}
                  </button>
                  <button
                    type="button"
                    disabled={!selectedNote}
                    onClick={() => setSimilarityRangePoint('end')}
                    className="h-7 rounded px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {language === 'zh' ? '設終點' : 'Set end'}
                  </button>
                  <Button
                    variant="secondary"
                    className="h-7 px-2 text-xs"
                    disabled={!similarityRangeStart || !similarityRangeEnd || isFindingSimilar}
                    onClick={() => void findSimilarPassages()}
                  >
                    <Search className="size-3.5" />
                    {isFindingSimilar
                      ? language === 'zh' ? '搜尋中' : 'Finding'
                      : language === 'zh' ? '尋找相似段落' : 'Find similar'}
                  </Button>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs font-medium text-slate-500">
                    {language === 'zh' ? '相似旋律範圍' : 'Range'}
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {rangeLabel(similarityRangeStart, similarityRangeEnd)}
                  </div>
                  {similarityError && (
                    <div className="mt-2 text-xs font-medium text-amber-700">{similarityError}</div>
                  )}
                </div>
                <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-xs font-medium text-slate-500">
                      {language === 'zh' ? '候選段落' : 'Candidates'}
                    </div>
                    <Badge tone={similarityCandidates.length ? 'info' : 'neutral'}>
                      {similarityCandidates.length}
                    </Badge>
                  </div>
                  <div className="mt-2 grid max-h-72 min-w-0 gap-2 overflow-y-auto pr-1">
                    {similarityCandidates.length === 0 ? (
                      <div className="text-xs text-slate-500">
                        {language === 'zh' ? '尚未搜尋。' : 'No search yet.'}
                      </div>
                    ) : (
                      similarityCandidates.map((candidate) => (
                        <div
                          key={`${candidate.targetScoreId}-${candidate.startMeasureNumber}-${candidate.endMeasureNumber}-${candidate.similarity}`}
                          className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-2"
                        >
                          <div className="grid min-w-0 gap-1.5">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {candidateSectionLabel(candidate)}
                              </div>
                              <div className="truncate text-xs text-slate-600">
                                m.{candidate.startMeasureNumber}
                                {candidate.endMeasureNumber !== candidate.startMeasureNumber
                                  ? `-${candidate.endMeasureNumber}`
                                  : ''}{' '}
                                · {percentage(candidate.similarity)}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="justify-self-end rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              onClick={() => changeScore(candidate.targetScoreId)}
                            >
                              {language === 'zh' ? '開啟' : 'Open'}
                            </button>
                          </div>
                          <div className="mt-1 truncate text-[11px] text-slate-500">
                            interval {percentage(candidate.intervalScore)} · rhythm {percentage(candidate.rhythmScore)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </details>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500">{t('scoreEditor.changes')}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge tone={isModified ? 'warn' : 'neutral'}>
                  {history.past.length} {t('scoreEditor.edits')}
                </Badge>
                {!!history.future.length && <Badge>{t('scoreEditor.redo')}: {history.future.length}</Badge>}
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div
            ref={canvasRef}
            className={cn(
              'score-editor-canvas relative h-full overflow-auto bg-[#e7ebef] p-4 sm:p-6',
              mode === 'pan' ? 'cursor-grab' : 'cursor-default',
            )}
            onClick={handleScoreClick}
          >
            <div className="score-editor-paper mx-auto min-h-full w-full max-w-[1000px] rounded-lg border border-slate-200 bg-white px-4 py-5 shadow-[0_8px_30px_rgba(15,23,42,0.08)] sm:px-6 lg:px-8">
              {status === 'loading' && (
                <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                  {t('scoreEditor.rendering')}
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
        title={t('scoreEditor.summaryTitle')}
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setSummaryOpen(false)}>
              {t('common.close')}
            </Button>
            <Button variant="secondary" disabled={!isModified} onClick={resetWorkingXml}>
              {t('scoreEditor.resetScore')}
            </Button>
            <Button onClick={exportWorkingXml} disabled={!workingXml}>
              {t('scoreEditor.exportXml')}
            </Button>
            <Button onClick={saveWorkingXml} disabled={!scoreId || !workingXml || !isModified || isSaving || !canSaveSharedScore}>
              {isSaving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 text-sm text-slate-700">
          <div className="flex flex-wrap gap-2">
            <Badge tone={isModified ? 'warn' : 'neutral'}>
              {isModified ? t('scoreEditor.unsavedEdit') : t('scoreEditor.noChanges')}
            </Badge>
            <Badge>{history.past.length} {t('scoreEditor.editsInHistory')}</Badge>
            <Badge>{history.future.length} {t('scoreEditor.redoSteps')}</Badge>
          </div>
          <div>
            {t('scoreEditor.currentScore')}: <span className="font-medium text-slate-900">{xmlEntry.title}</span>
          </div>
          <div>
            {t('scoreEditor.selectedNote')}: <span className="font-medium text-slate-900">{noteLabel(selectedNote)}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            {t('scoreEditor.exportHelp')}
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
