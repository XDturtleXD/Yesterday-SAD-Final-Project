import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import {
  OpenSheetMusicDisplay,
  PointF2D,
  type GraphicalNote,
} from 'opensheetmusicdisplay'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import * as annotationsApi from '../../api/annotations'
import * as scoresApi from '../../api/scores'
import { useAppState } from '../../state/AppState'
import { useTranslation } from '../../i18n'
import type { AnnotationScope, Score, ScoreAnnotation } from '../../types'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { Modal } from '../primitives/Modal'
import { cn } from '../utils/cn'
import {
  ArrowLeft,
  Download,
  Eraser,
  FileText,
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
const DEFAULT_NOTE_STAFF = '1'
const DEFAULT_NOTE_VOICE = '1'
const EMPTY_ANNOTATION_LAYERS: AnnotationLayerState = { shared: [], private: [] }

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

function applyBowingToXmlNote(note: Element, mark: BowingMark) {
  removeBowingFromNote(note)
  const notations = ensureChild(note, 'notations')
  const technical = ensureChild(notations, 'technical')

  technical.appendChild(note.ownerDocument.createElement(mark))
}

function applyBowingToDocument(doc: Document, ref: EditableNoteRef, mark: BowingMark) {
  const note = findXmlNote(doc, ref)
  if (!note) return false

  applyBowingToXmlNote(note, mark)
  return true
}

function replaceBowing(xml: string, ref: EditableNoteRef, mark: BowingMark) {
  const doc = parseMusicXml(xml)
  if (!applyBowingToDocument(doc, ref, mark)) {
    throw new Error('Could not find the selected note in MusicXML.')
  }

  return serializeMusicXml(doc)
}

function getBowingAnnotationMark(annotation: ScoreAnnotation): BowingMark | null {
  const bowingType = annotation.payload.bowingType
  return bowingType === 'up-bow' || bowingType === 'down-bow' ? bowingType : null
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

      changed = applyBowingToDocument(doc, ref, mark) || changed
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

function getVoiceEntryVoice(voiceEntry: unknown) {
  return firstStringValue(
    nestedValue(voiceEntry, ['VoiceId']),
    nestedValue(voiceEntry, ['voiceId']),
    nestedValue(voiceEntry, ['ParentVoice', 'VoiceId']),
    nestedValue(voiceEntry, ['ParentVoice', 'voiceId']),
  ) ?? DEFAULT_NOTE_VOICE
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

function getEditableRefFromGraphicalNote(
  note: GraphicalNote,
  scoreId: string,
): EditableNoteRef | null {
  const sourceNote = note.sourceNote
  const sourceMeasure = sourceNote.SourceMeasure
  const staff = sourceNote.ParentStaff
  const staffIndex = staff.idInMusicSheet
  const entries = sourceMeasure.getEntriesPerStaff(staffIndex) ?? []
  const targetStaff = getSourceNoteStaff(note)
  let targetVoice = getSourceNoteVoice(sourceNote)

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
  const noteIndex = pitchedNotes.indexOf(sourceNote)
  if (noteIndex < 0) return null

  // noteIndex is 0-based within staff/voice pitched notes only.
  return {
    scoreId,
    partId: staff.ParentInstrument.IdString,
    measureNumber: sourceMeasure.MeasureNumber,
    measureArrayIndex: getSourceMeasureArrayIndex(sourceMeasure),
    noteIndex,
    staff: targetStaff,
    voice: targetVoice,
    pitchStep: sourcePitchStep(sourceNote),
    pitchOctave: sourcePitchOctave(sourceNote),
    duration: sourceDuration(sourceNote),
  }
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
  const { language, t } = useTranslation()

  useEffect(() => {
    if (projectId) loadProjectDetail(projectId)
  }, [projectId, loadProjectDetail])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
  const selectedGraphicalNoteRef = useRef<GraphicalNote | null>(null)
  const selectedNoteRef = useRef<EditableNoteRef | null>(null)
  const pendingHairpinSelectionKeyRef = useRef<string | null>(null)
  const workingXmlByScoreIdRef = useRef<Record<string, string>>({})
  const lastRenderedXmlRef = useRef<string | null>(null)
  const backgroundRenderTokenRef = useRef(0)
  const zoomRef = useRef(90)
  const addToastRef = useRef(addToast)

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
  const [zoom, setZoom] = useState(90)
  const [mode, setMode] = useState<SelectionMode>('select')
  const [selectedNote, setSelectedNote] = useState<EditableNoteRef | null>(null)
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
  const layeredRenderXml = useMemo(() => {
    if (!workingXml) return undefined
    if (activeAnnotationLayer !== 'private') return workingXml

    return applyPrivateBowingAnnotationsToXml(workingXml, scoreId, privateAnnotations)
  }, [activeAnnotationLayer, privateAnnotations, scoreId, workingXml])

  useEffect(() => {
    workingXmlByScoreIdRef.current = workingXmlByScoreId
  }, [workingXmlByScoreId])

  useEffect(() => {
    selectedNoteRef.current = selectedNote
  }, [selectedNote])

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
        const message = err instanceof Error ? err.message : 'Unable to load annotation layers'
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
        const renderXml = sanitizeRestPlacementForRender(renderXmlSource)
        await osmd.load(renderXml, xmlEntry.title)
        if (cancelled || renderToken !== backgroundRenderTokenRef.current) return
        osmd.Zoom = zoomRef.current / 100
        osmd.renderAndScrollBack()
        lastRenderedXmlRef.current = renderXmlSource

        if (noteToReselect) {
          const graphicalNote = findGraphicalNoteFromRef(osmd, scoreId, noteToReselect)
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
    setSelectedNote(null)
    setSlurDraft(null)
    setHairpinDraft(null)
    pendingHairpinSelectionKeyRef.current = null
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

    return osmd.GraphicSheet.GetNearestNote(osmdPoint, new PointF2D(12, 12)) ?? null
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

    const ref = getEditableRefFromGraphicalNote(graphicalNote, scoreId)
    if (!ref) {
      addToast({ title: t('scoreEditor.noteCannotBeEditedYet') })
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
    const currentXml = workingXmlByScoreId[scoreId]
    if (!currentXml) return

    try {
      const nextXml = updateXml(currentXml)
      if (nextXml === currentXml) return

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
        title: t('scoreEditor.editFailed'),
        message: language === 'en' && err instanceof Error ? err.message : t('scoreEditor.updateFailed'),
      })
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

  function applyBowing(mark: BowingMark) {
    if (!selectedNote) return
    const ref = selectedNote
    if (activeAnnotationLayer === 'private') {
      void createPrivateBowingAnnotation(ref, mark)
      return
    }

    applyXmlOperation(
      mark === 'up-bow' ? t('scoreEditor.upBowApplied') : t('scoreEditor.downBowApplied'),
      (xml) => replaceBowing(xml, ref, mark),
    )
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
            <Button onClick={saveWorkingXml} disabled={!scoreId || !workingXml || !isModified || isSaving}>
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
                title={`${t('scoreEditor.apply')} ${mark}`}
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
            {ARTICULATION_TOOLS.map((tool) => (
              <SymbolButton
                key={tool.mark}
                title={`Apply ${tool.label}`}
                disabled={!selectedNote}
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
                title={`Create ${tool.label} hairpin`}
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
                  ? `${t('scoreEditor.applyDownBow')} - saves to My private layer`
                  : t('scoreEditor.applyDownBow')
              }
              disabled={!selectedNote}
              onClick={() => applyBowing('down-bow')}
            >
              <DownBowIcon />
            </SymbolButton>
            <SymbolButton
              title={
                activeAnnotationLayer === 'private'
                  ? `${t('scoreEditor.applyUpBow')} - saves to My private layer`
                  : t('scoreEditor.applyUpBow')
              }
              disabled={!selectedNote}
              onClick={() => applyBowing('up-bow')}
            >
              <UpBowIcon />
            </SymbolButton>
            <SymbolButton
              title={t('scoreEditor.createSlur')}
              active={mode === 'slur'}
              onClick={startSlurMode}
            >
              <SlurIcon />
            </SymbolButton>
            <SymbolButton
              title={t('scoreEditor.eraseSelected')}
              disabled={!selectedNote}
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
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 lg:block">
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
            <Button onClick={saveWorkingXml} disabled={!scoreId || !workingXml || !isModified || isSaving}>
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
