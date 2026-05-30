import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as historyApi from '../api/history'
import {
  mapBranch,
  mapCommit,
  mapProjectMember,
  mapProjectSummary,
  mapScore,
  mapSection,
} from '../api/mappers'
import * as projectsApi from '../api/projects'
import * as scoresApi from '../api/scores'
import * as sectionsApi from '../api/sections'
import type { ApiBranch, ApiScore, ApiUser } from '../api/types'
import type { Commit, Project, ProjectMember, Score, Section, User } from '../types'

type Toast = { id: string; title: string; message?: string }

type AppState = {
  currentUser: User | null
  projects: Project[]
  sections: Section[]
  projectsLoading: boolean
  sectionsLoading: boolean
  toasts: Toast[]

  applyAuthUser: (apiUser: ApiUser) => Promise<void>
  clearAuthUser: () => void
  refreshProjects: () => Promise<void>
  loadSections: () => Promise<Section[]>
  loadProjectDetail: (
    projectId: string,
    options?: { force?: boolean },
  ) => Promise<Project | undefined>
  getProject: (id: string) => Project | undefined
  getScore: (projectId: string, scoreId: string) => Score | undefined
  getMemberDisplayName: (userId: string) => string

  createProject: (input: {
    name: string
    description: string
    sectionId: string
  }) => Promise<Project>
  joinProject: (input: { inviteCode: string; sectionId: string }) => Promise<void>
  createInviteCode: (projectId: string) => Promise<string>

  addToast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  createBranch: (projectId: string, name: string) => Promise<void>
  switchBranch: (projectId: string, branchId: string) => Promise<void>
  deleteBranch: (projectId: string, branchId: string) => Promise<void>
  mergeBranch: (projectId: string, fromBranchId: string, intoBranchId: string) => Promise<void>
}

const Ctx = createContext<AppState | null>(null)

function id(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2)}`
}

function mapApiUserToUser(apiUser: ApiUser): User {
  return {
    id: apiUser.id,
    name: apiUser.name,
    role: apiUser.system_role === 'platform_admin' ? 'admin' : 'regular',
    intro: apiUser.intro ?? '',
    avatarUrl: apiUser.avatar_url ?? undefined,
  }
}

const emptyUser: User = {
  id: '',
  name: 'Guest',
  role: 'regular',
  intro: '',
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [sectionsLoading, setSectionsLoading] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [nameCache, setNameCache] = useState<Record<string, string>>({})

  // Stable refs so callbacks don't need projects/nameCache as deps
  const projectsRef = useRef(projects)
  const nameCacheRef = useRef(nameCache)
  useEffect(() => { projectsRef.current = projects }, [projects])
  useEffect(() => { nameCacheRef.current = nameCache }, [nameCache])

  const rememberNames = useCallback((members: ProjectMember[]) => {
    setNameCache((prev) => {
      const next = { ...prev }
      for (const m of members) {
        next[m.userId] = m.userName
      }
      return next
    })
  }, [])

  const refreshProjects = useCallback(async () => {
    setProjectsLoading(true)
    try {
      const rows = await projectsApi.listProjects()
      setProjects((prev) => {
        const prevById = new Map(prev.map((p) => [p.id, p]))
        return rows.map((row) => {
          const existing = prevById.get(row.id)
          if (existing?.detailLoaded) {
            return {
              ...existing,
              name: row.name,
              description: row.description ?? '',
              createdBy: row.created_by,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            }
          }
          return mapProjectSummary(row)
        })
      })
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  const loadSections = useCallback(async () => {
    if (sections.length > 0) return sections
    setSectionsLoading(true)
    try {
      const rows = await sectionsApi.listSections()
      const mapped = rows.map(mapSection)
      setSections(mapped)
      return mapped
    } finally {
      setSectionsLoading(false)
    }
  }, [sections])

  const loadProjectDetail = useCallback(
    async (projectId: string, options: { force?: boolean } = {}) => {
      // Read via ref so this callback stays stable across renders
      const existing = projectsRef.current.find((p) => p.id === projectId)
      if (!options.force && existing?.detailLoaded) return existing
      if (!options.force && existing?.detailLoading) return existing

      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, detailLoading: true } : p)),
      )

      try {
        const [projectRes, membersRes, scoresRes, branchesRes] = await Promise.allSettled([
          projectsApi.getProject(projectId),
          projectsApi.listProjectMembers(projectId),
          scoresApi.listProjectScores(projectId),
          historyApi.listBranches(projectId),
        ])

        if (projectRes.status === 'rejected') throw projectRes.reason
        if (membersRes.status === 'rejected') throw membersRes.reason

        const projectRow = projectRes.value
        const memberRows = membersRes.value
        const scoreRows: ApiScore[] = scoresRes.status === 'fulfilled' ? scoresRes.value : []
        const branchRows: ApiBranch[] =
          branchesRes.status === 'fulfilled' ? branchesRes.value : []

        const members = memberRows.map(mapProjectMember)
        rememberNames(members)

        const scores = scoreRows.map(mapScore)
        const branches = branchRows.map(mapBranch)
        const defaultBranch = branches.find((b) => b.isDefault) ?? branches[0]
        const currentBranchId = defaultBranch?.id ?? ''
        const currentBranchName = defaultBranch?.name ?? 'main'

        let commits: Commit[] = []
        if (defaultBranch) {
          try {
            const commitRows = await historyApi.listBranchCommits(projectId, defaultBranch.id)
            commits = commitRows.map((c) => mapCommit(c, defaultBranch.name))
            rememberNames(
              commits.map((c) => ({
                id: c.id,
                userId: c.authorUserId,
                userName: nameCacheRef.current[c.authorUserId] ?? c.authorUserId,
                userEmail: '',
                sectionId: '',
                sectionCode: '',
                sectionName: '',
                role: 'member' as const,
              })),
            )
          } catch {
            commits = []
          }
        }

        const detail: Project = {
          id: projectRow.id,
          name: projectRow.name,
          description: projectRow.description ?? '',
          createdBy: projectRow.created_by,
          createdAt: projectRow.created_at,
          updatedAt: projectRow.updated_at,
          members,
          scores,
          branches,
          currentBranchId,
          currentBranchName,
          commits,
          detailLoaded: true,
          detailLoading: false,
        }

        setProjects((prev) => {
          const idx = prev.findIndex((p) => p.id === projectId)
          if (idx === -1) return [...prev, detail]
          return prev.map((p) => (p.id === projectId ? detail : p))
        })

        return detail
      } catch {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId ? { ...p, detailLoading: false, detailLoaded: false } : p,
          ),
        )
        return undefined
      }
    },
    [rememberNames],
  )

  const applyAuthUser = useCallback(async (apiUser: ApiUser) => {
    const mapped = mapApiUserToUser(apiUser)
    setCurrentUser(mapped)
    setNameCache((prev) => ({ ...prev, [mapped.id]: mapped.name }))
    setProjects([])
    try {
      await refreshProjects()
    } catch {
      // Keep the authenticated session even if project loading fails.
    }
  }, [refreshProjects])

  const clearAuthUser = useCallback(() => {
    setCurrentUser(null)
    setProjects([])
    setSections([])
    setNameCache({})
  }, [])

  const api: AppState = useMemo(
    () => ({
      currentUser,
      projects,
      sections,
      projectsLoading,
      sectionsLoading,
      toasts,

      applyAuthUser,
      clearAuthUser,
      refreshProjects,
      loadSections,
      loadProjectDetail,

      getProject: (projectId) => projects.find((p) => p.id === projectId),
      getScore: (projectId, scoreId) =>
        projects.find((p) => p.id === projectId)?.scores.find((s) => s.id === scoreId),
      getMemberDisplayName: (userId) => nameCache[userId] ?? userId,

      createProject: async (input) => {
        const created = await projectsApi.createProject({
          name: input.name,
          description: input.description,
          sectionId: input.sectionId,
        })
        const project = mapProjectSummary(created)
        setProjects((prev) => [project, ...prev])
        setToasts((prev) => [
          ...prev,
          { id: id('t'), title: '專案已建立', message: project.name },
        ])
        const loaded = await loadProjectDetail(project.id)
        return loaded ?? project
      },

      joinProject: async (input) => {
        await projectsApi.joinByInviteCode(input)
        await refreshProjects()
        setToasts((prev) => [
          ...prev,
          { id: id('t'), title: '已加入專案', message: '歡迎加入！' },
        ])
      },

      createInviteCode: async (projectId) => {
        const result = await projectsApi.createInviteCode(projectId)
        return result.inviteCode
      },

      addToast: (t) => setToasts((prev) => [...prev, { ...t, id: id('t') }]),
      dismissToast: (toastId) => setToasts((prev) => prev.filter((t) => t.id !== toastId)),

      createBranch: async (projectId, name) => {
        const project = projects.find((p) => p.id === projectId)
        const fromCommitId = project?.branches.find((b) => b.id === project.currentBranchId)
          ?.headCommitId
        const branch = await historyApi.createBranch(projectId, {
          name,
          fromCommitId: fromCommitId ?? undefined,
        })
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  branches: [...p.branches, mapBranch(branch)],
                  currentBranchId: branch.id,
                  currentBranchName: branch.name,
                }
              : p,
          ),
        )
      },

      switchBranch: async (projectId, branchId) => {
        const project = projects.find((p) => p.id === projectId)
        const branch = project?.branches.find((b) => b.id === branchId)
        if (!branch) return
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== projectId) return p
            return { ...p, currentBranchId: branch.id, currentBranchName: branch.name }
          }),
        )
        const commitRows = await historyApi.listBranchCommits(projectId, branchId)
        const commits = commitRows.map((c) => mapCommit(c, branch.name))
        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, commits } : p)),
        )
      },

      deleteBranch: async (projectId, branchId) => {
        await historyApi.deleteBranch(projectId, branchId)
        const project = projects.find((p) => p.id === projectId)
        const wasActive = project?.currentBranchId === branchId
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== projectId) return p
            const newBranches = p.branches.filter((b) => b.id !== branchId)
            if (wasActive) {
              const next = newBranches.find((b) => b.isDefault) ?? newBranches[0]
              return {
                ...p,
                branches: newBranches,
                currentBranchId: next?.id ?? '',
                currentBranchName: next?.name ?? 'main',
                commits: [],
              }
            }
            return { ...p, branches: newBranches }
          }),
        )
        if (wasActive && project) {
          const remaining = project.branches.filter((b) => b.id !== branchId)
          const next = remaining.find((b) => b.isDefault) ?? remaining[0]
          if (next) {
            const commitRows = await historyApi.listBranchCommits(projectId, next.id)
            const commits = commitRows.map((c) => mapCommit(c, next.name))
            setProjects((prev) =>
              prev.map((p) => (p.id === projectId ? { ...p, commits } : p)),
            )
          }
        }
      },

      mergeBranch: async (projectId, fromBranchId, intoBranchId) => {
        await historyApi.mergeBranches(projectId, {
          fromBranchId,
          intoBranchId,
        })
        await loadProjectDetail(projectId)
      },
    }),
    [
      currentUser,
      projects,
      sections,
      projectsLoading,
      sectionsLoading,
      toasts,
      applyAuthUser,
      clearAuthUser,
      refreshProjects,
      loadSections,
      loadProjectDetail,
      nameCache,
    ],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useAppState() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppState must be used within AppStateProvider')
  return v
}

export function useRequiredUser() {
  const { currentUser } = useAppState()
  return currentUser ?? emptyUser
}
