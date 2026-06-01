import type { ProjectMember, Section } from '../types'
import type { LanguagePreference } from '../state/AppState'

const SECTION_LABELS_BY_CODE: Record<string, string> = {
  first_violin: 'First Violin',
  second_violin: 'Second Violin',
  viola: 'Viola',
  cello: 'Cello',
  double_bass: 'Double Bass',
}

const SECTION_LABELS_ZH_BY_CODE: Record<string, string> = {
  first_violin: '第一小提琴',
  second_violin: '第二小提琴',
  viola: '中提琴',
  cello: '大提琴',
  double_bass: '低音提琴',
}

export function sectionLabel(
  section: Pick<Section, 'code' | 'name'> | null | undefined,
  language: LanguagePreference = 'en',
) {
  if (!section) return language === 'zh' ? '未分配' : 'Unassigned'
  if (language === 'zh') return SECTION_LABELS_ZH_BY_CODE[section.code] ?? section.name
  return SECTION_LABELS_BY_CODE[section.code] ?? section.name
}

export function memberSectionLabel(
  member: Pick<ProjectMember, 'sectionCode' | 'sectionName'> | null | undefined,
  language: LanguagePreference = 'en',
) {
  if (!member) return language === 'zh' ? '未分配' : 'Unassigned'
  if (language === 'zh') {
    return SECTION_LABELS_ZH_BY_CODE[member.sectionCode] ?? (member.sectionName || '未分配')
  }
  return SECTION_LABELS_BY_CODE[member.sectionCode] ?? (member.sectionName || 'Unassigned')
}
