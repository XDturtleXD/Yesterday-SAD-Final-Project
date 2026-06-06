// Shared render-time MusicXML sanitizer used by both the per-section editor
// (ScoreMusicXmlPage) and the conductor full-score preview (FullScorePanel).
//
// Audiveris (OMR) output occasionally trips OpenSheetMusicDisplay during layout.
// These fixes strip the offending bits so the score still renders:
//   1. Rest placement attributes that push rests off-staff.
//   2. Unpaired <octave-shift> spanners (a start with no stop, or vice-versa),
//      which make OSMD's calculateOctaveShifts() dereference an undefined end
//      timestamp and throw "Cannot read properties of undefined (reading
//      'realValue')", aborting the entire render.

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
  return Array.from(parent.children).filter((child) => !name || isElementNamed(child, name))
}

function removeElementIfEmpty(element: Element | null | undefined) {
  if (element && element.children.length === 0 && !element.textContent?.trim()) {
    element.remove()
  }
}

function isRestNote(note: Element) {
  return elementChildren(note, 'rest').length > 0
}

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

// Drop any <octave-shift> lacking a proper start↔stop pair (matched per part,
// per `number`), cleaning up the now-empty <direction>/<direction-type> wrappers.
function removeUnpairedOctaveShifts(doc: Document) {
  elementChildren(doc.documentElement, 'part').forEach((part) => {
    const shifts = Array.from(part.getElementsByTagName('*')).filter((element) =>
      isElementNamed(element, 'octave-shift'),
    )
    const openByNumber = new Map<string, Element>()
    const orphans: Element[] = []

    shifts.forEach((shift) => {
      const type = shift.getAttribute('type') ?? ''
      const number = shift.getAttribute('number') || '1'

      if (type === 'stop') {
        if (openByNumber.has(number)) {
          openByNumber.delete(number)
        } else {
          orphans.push(shift)
        }
        return
      }

      if (type === 'continue') {
        if (!openByNumber.has(number)) orphans.push(shift)
        return
      }

      const previousOpen = openByNumber.get(number)
      if (previousOpen) orphans.push(previousOpen)
      openByNumber.set(number, shift)
    })

    openByNumber.forEach((shift) => orphans.push(shift))

    orphans.forEach((shift) => {
      const directionType = shift.parentElement
      const direction = directionType?.parentElement
      shift.remove()
      removeElementIfEmpty(directionType)
      removeElementIfEmpty(direction)
    })
  })
}

export function sanitizeMusicXmlForRender(xml: string) {
  try {
    const doc = parseMusicXml(xml)
    const notes = Array.from(doc.getElementsByTagName('*')).filter(
      (element) => isElementNamed(element, 'note') && isRestNote(element),
    )

    notes.forEach((note) => {
      // Render-time only: neutralize Audiveris rest placement so rests sit on-staff.
      note.removeAttribute('default-y')
      note.removeAttribute('relative-y')

      elementChildren(note, 'rest').forEach((rest) => {
        elementChildren(rest, 'display-step').forEach((child) => child.remove())
        elementChildren(rest, 'display-octave').forEach((child) => child.remove())
      })
    })

    removeUnpairedOctaveShifts(doc)

    return serializeMusicXml(doc)
  } catch {
    return xml
  }
}
