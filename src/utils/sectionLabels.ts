import type { ProjectMember, Section } from '../types'

const SECTION_LABELS_BY_CODE: Record<string, string> = {
  first_violin: 'First Violin',
  second_violin: 'Second Violin',
  viola: 'Viola',
  cello: 'Cello',
  double_bass: 'Double Bass',
}

export function sectionLabel(section: Pick<Section, 'code' | 'name'> | null | undefined) {
  if (!section) return 'Unassigned'
  return SECTION_LABELS_BY_CODE[section.code] ?? section.name
}

export function memberSectionLabel(
  member: Pick<ProjectMember, 'sectionCode' | 'sectionName'> | null | undefined,
) {
  if (!member) return 'Unassigned'
  return SECTION_LABELS_BY_CODE[member.sectionCode] ?? (member.sectionName || 'Unassigned')
}
