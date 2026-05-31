import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as historyApi from '../api/history'
import {
  mapBranch,
  mapCommit,
  mapPiece,
  mapProjectMember,
  mapProjectSummary,
  mapScore,
  mapSection,
} from '../api/mappers'
import * as piecesApi from '../api/pieces'
import * as projectsApi from '../api/projects'
import * as scoresApi from '../api/scores'
import * as sectionsApi from '../api/sections'
import type { ApiBranch, ApiScore, ApiUser } from '../api/types'
import type {
  Commit,
  MemberInviteDraft,
  Piece,
  Project,
  ProjectMember,
  Score,
  Section,
  User,
} from '../types'
import { sectionLabel } from '../utils/sectionLabels'

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
  getPieces: (projectId: string) => Piece[]
  getPieceScore: (projectId: string, pieceId: string, sectionId: string) => Score | undefined
  getMemberInvites: (projectId: string) => MemberInviteDraft[]

  createProject: (input: {
    name: string
    description: string
    sectionId: string
  }) => Promise<Project>
  updateProjectDraft: (projectId: string, input: { name: string; description: string }) => void
  createPiece: (projectId: string, input: { title: string; composer?: string }) => Promise<Piece>
  deletePiece: (projectId: string, pieceId: string) => Promise<void>
  movePiece: (projectId: string, pieceId: string, direction: 'up' | 'down') => Promise<void>
  reorderPieces: (projectId: string, orderedPieceIds: string[]) => Promise<void>
  deleteProjectScore: (projectId: string, scoreId: string) => Promise<void>
  joinProject: (input: { inviteCode: string; sectionId: string }) => Promise<void>
  createInviteCode: (projectId: string) => Promise<string>
  createMemberInvite: (
    projectId: string,
    input: { sectionId: string; targetRole: 'principal' | 'member' },
  ) => Promise<MemberInviteDraft>
  removeProjectMemberMock: (projectId: string, memberId: string) => void

  addToast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  createBranch: (projectId: string, name: string) => Promise<void>
  switchBranch: (projectId: string, branchId: string) => Promise<void>
  deleteBranch: (projectId: string, branchId: string) => Promise<void>
  mergeBranch: (projectId: string, fromBranchId: string, intoBranchId: string) => Promise<void>
  createCommit: (projectId: string, message: string) => Promise<void>
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
  const [invitesByProjectId, setInvitesByProjectId] = useState<Record<string, MemberInviteDraft[]>>({})

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
        const [projectRes, membersRes, scoresRes, branchesRes, piecesRes] = await Promise.allSettled([
          projectsApi.getProject(projectId),
          projectsApi.listProjectMembers(projectId),
          scoresApi.listProjectScores(projectId),
          historyApi.listBranches(projectId),
          piecesApi.listProjectPieces(projectId),
        ])

        if (projectRes.status === 'rejected') throw projectRes.reason
        if (membersRes.status === 'rejected') throw membersRes.reason

        const projectRow = projectRes.value
        const memberRows = membersRes.value
        const scoreRows: ApiScore[] = scoresRes.status === 'fulfilled' ? scoresRes.value : []
        const branchRows: ApiBranch[] =
          branchesRes.status === 'fulfilled' ? branchesRes.value : []
        const pieceRows = piecesRes.status === 'fulfilled' ? piecesRes.value : []

        const members = memberRows.map(mapProjectMember)
        rememberNames(members)

        const scores = scoreRows.map(mapScore)
        const pieces = pieceRows.map(mapPiece)
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
          pieces,
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
      getPieces: (projectId) => {
        const project = projects.find((p) => p.id === projectId)
        return [...(project?.pieces ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
      },
      getPieceScore: (projectId, pieceId, sectionId) =>
        projects
          .find((p) => p.id === projectId)
          ?.scores.find((s) => s.pieceId === pieceId && s.sectionId === sectionId),
      getMemberInvites: (projectId) => invitesByProjectId[projectId] ?? [],

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
          { id: id('t'), title: 'Project created', message: project.name },
        ])
        const loaded = await loadProjectDetail(project.id)
        return loaded ?? project
      },

      updateProjectDraft: (projectId, input) => {
        // TODO API contract: PATCH /api/projects/:projectId
        // Request: { name: string, description?: string }
        // Response: ApiResponse<ApiProject>
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  name: input.name,
                  description: input.description,
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        )
        setToasts((prev) => [
          ...prev,
          { id: id('t'), title: 'Project changes saved locally', message: 'Backend update is not implemented yet.' },
        ])
      },

      createPiece: async (projectId, input) => {
        const created = await piecesApi.createProjectPiece(projectId, {
          title: input.title.trim(),
          composer: input.composer?.trim() || undefined,
        })
        const piece = mapPiece(created)
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  pieces: [...p.pieces, piece].sort((a, b) => a.sortOrder - b.sortOrder),
                }
              : p,
          ),
        )
        return piece
      },

      deletePiece: async (projectId, pieceId) => {
        await piecesApi.deleteProjectPiece(projectId, pieceId)
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  pieces: p.pieces.filter((piece) => piece.id !== pieceId),
                  scores: p.scores.filter((score) => score.pieceId !== pieceId),
                }
              : p,
          ),
        )
      },

      movePiece: async (projectId, pieceId, direction) => {
        const project = projects.find((p) => p.id === projectId)
        if (!project) return

        const pieces = [...project.pieces].sort((a, b) => a.sortOrder - b.sortOrder)
        const index = pieces.findIndex((piece) => piece.id === pieceId)
        const swapWith = direction === 'up' ? index - 1 : index + 1
        if (index < 0 || swapWith < 0 || swapWith >= pieces.length) return

        const next = [...pieces]
        ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
        const orderedPieceIds = next.map((piece) => piece.id)

        const reordered = await piecesApi.reorderProjectPieces(projectId, orderedPieceIds)
        const mapped = reordered.map(mapPiece)
        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, pieces: mapped } : p)),
        )
      },

      reorderPieces: async (projectId, orderedPieceIds) => {
        const reordered = await piecesApi.reorderProjectPieces(projectId, orderedPieceIds)
        const mapped = reordered.map(mapPiece)
        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, pieces: mapped } : p)),
        )
      },

      deleteProjectScore: async (projectId, scoreId) => {
        await scoresApi.deleteScore(scoreId)
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? { ...p, scores: p.scores.filter((score) => score.id !== scoreId) }
              : p,
          ),
        )
      },

      joinProject: async (input) => {
        await projectsApi.joinByInviteCode(input)
        await refreshProjects()
        setToasts((prev) => [
          ...prev,
          { id: id('t'), title: 'Joined project', message: 'Welcome aboard.' },
        ])
      },

      createInviteCode: async (projectId) => {
        const result = await projectsApi.createInviteCode(projectId)
        return result.inviteCode
      },

      createMemberInvite: async (projectId, input) => {
        const section = sections.find((s) => s.id === input.sectionId)
        if (!section || !currentUser) throw new Error('Invalid invite metadata')

        const result = await projectsApi.createInviteCode(projectId)
        const invite: MemberInviteDraft = {
          id: id('invite'),
          projectId,
          sectionId: input.sectionId,
          sectionName: sectionLabel(section),
          targetRole: input.targetRole,
          inviteCode: result.inviteCode,
          createdByUserId: currentUser.id,
          createdAt: new Date().toISOString(),
          source: 'api-token-with-frontend-metadata',
        }
        // TODO API contract: POST /api/projects/:projectId/invites
        // Request: { targetRole: 'principal' | 'member', sectionId: string, expiresIn?: string }
        // Response: ApiResponse<{ id, inviteCode, targetRole, sectionId, expiresAt }>
        // Current backend returns only a generic inviteCode, so role/section intent is stored in frontend state.
        setInvitesByProjectId((prev) => ({
          ...prev,
          [projectId]: [invite, ...(prev[projectId] ?? [])],
        }))
        return invite
      },

      removeProjectMemberMock: (projectId, memberId) => {
        // TODO API contract: DELETE /api/projects/:projectId/members/:memberId
        // Request: path params only, no body
        // Response: ApiResponse<{ id: string }>
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? { ...p, members: p.members.filter((member) => member.id !== memberId) }
              : p,
          ),
        )
        setToasts((prev) => [
          ...prev,
          { id: id('t'), title: 'Member removed from this view', message: 'Backend removal is not implemented yet.' },
        ])
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

      createCommit: async (projectId, message) => {
        const project = projectsRef.current.find((p) => p.id === projectId)
        if (!project) throw new Error('Project not found')
        const branchId = project.currentBranchId
        if (!branchId) throw new Error('No active branch')

        const scoreSnapshots = project.scores.map((s) => ({
          scoreId: s.id,
          storagePath: s.storagePath,
          fileType: s.fileType,
          storageBucket: s.storageBucket,
          originalFilename: s.originalFilename,
          mimeType: s.mimeType,
          fileSizeBytes: s.fileSizeBytes,
        }))

        const branch = project.branches.find((b) => b.id === branchId)
        const branchName = branch?.name ?? project.currentBranchName

        const detail = await historyApi.createCommit(projectId, branchId, {
          message,
          scoreSnapshots,
        })

        const newCommit = mapCommit(detail, branchName)
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? { ...p, commits: [newCommit, ...p.commits] }
              : p,
          ),
        )
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
      invitesByProjectId,
    ],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppState() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppState must be used within AppStateProvider')
  return v
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRequiredUser() {
  const { currentUser } = useAppState()
  return currentUser ?? emptyUser
}
