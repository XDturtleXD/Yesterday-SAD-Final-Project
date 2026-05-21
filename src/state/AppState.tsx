import React, { createContext, useContext, useMemo, useState } from 'react'
import type { ApiUser } from '../api/types'
import { mockProjects, mockUsers } from '../mock/mockData'
import type { Commit, Project, Score, User, UserRole } from '../types'

type Toast = { id: string; title: string; message?: string }

type AppState = {
  currentUser: User
  users: User[]
  projects: Project[]
  toasts: Toast[]

  switchUser: (role: UserRole) => void
  applyAuthUser: (apiUser: ApiUser) => void
  clearAuthUser: () => void
  getUser: (id: string) => User | undefined
  getProject: (id: string) => Project | undefined
  getScore: (projectId: string, scoreId: string) => Score | undefined

  createProject: (partial: {
    name: string
    description: string
    ensembleType: string
    initialInstruments: string[]
    inviteEmails: string[]
  }) => Project

  addToast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  addCommit: (projectId: string, commit: Omit<Commit, 'id'>) => void
  createBranch: (projectId: string, name: string) => void
  switchBranch: (projectId: string, name: string) => void
  mergeBranch: (projectId: string, from: string, into: string) => void
  toggleSongPin: (projectId: string, songId: string) => void

  deleteProject: (projectId: string) => void
  deleteUser: (userId: string) => void
  deleteScore: (projectId: string, scoreId: string) => void
}

const Ctx = createContext<AppState | null>(null)

function id(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2)}`
}

function roleToUserId(role: UserRole) {
  if (role === 'regular') return 'u-regular'
  if (role === 'owner') return 'u-owner'
  return 'u-admin'
}

function mapApiUserToUser(apiUser: ApiUser): User {
  const role: UserRole =
    apiUser.system_role === 'platform_admin' ? 'admin' : 'regular'
  return {
    id: apiUser.id,
    name: apiUser.name,
    role,
    intro: apiUser.email,
  }
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [currentUserId, setCurrentUserId] = useState<string>('u-owner')
  const [users, setUsers] = useState<User[]>(mockUsers)
  const [projects, setProjects] = useState<Project[]>(mockProjects)
  const [toasts, setToasts] = useState<Toast[]>([])

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? users[0],
    [users, currentUserId],
  )

  const api: AppState = useMemo(
    () => ({
      currentUser,
      users,
      projects,
      toasts,

      switchUser: (role) => setCurrentUserId(roleToUserId(role)),

      applyAuthUser: (apiUser) => {
        const mapped = mapApiUserToUser(apiUser)
        setUsers((prev) => {
          const exists = prev.some((u) => u.id === mapped.id)
          if (exists) {
            return prev.map((u) => (u.id === mapped.id ? { ...u, ...mapped } : u))
          }
          return [...prev, mapped]
        })
        setCurrentUserId(mapped.id)
      },

      clearAuthUser: () => setCurrentUserId('u-owner'),

      getUser: (userId) => users.find((u) => u.id === userId),
      getProject: (projectId) => projects.find((p) => p.id === projectId),
      getScore: (projectId, scoreId) =>
        projects
          .find((p) => p.id === projectId)
          ?.scores.find((s) => s.id === scoreId),

      createProject: (partial) => {
        const projectId = id('p')
        const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
        const p: Project = {
          id: projectId,
          name: partial.name,
          description: partial.description,
          ensembleType: partial.ensembleType,
          members: [
            {
              userId: currentUser.id,
              roles: currentUser.role === 'admin' ? ['owner'] : ['owner'],
              instruments: ['piano'],
            },
          ],
          scores: [],
          branches: ['main'],
          currentBranch: 'main',
          currentCommitId: id('c'),
          commits: [
            {
              id: id('c'),
              projectId,
              branch: 'main',
              message: 'Initial project created',
              authorUserId: currentUser.id,
              timestamp: now,
            },
          ],
          lastUpdatedAt: now,
        }
        setProjects((prev) => [p, ...prev])
        setToasts((prev) => [
          ...prev,
          { id: id('t'), title: 'Project created', message: p.name },
        ])
        return p
      },

      addToast: (t) =>
        setToasts((prev) => [...prev, { ...t, id: id('t') }]),
      dismissToast: (toastId) =>
        setToasts((prev) => prev.filter((t) => t.id !== toastId)),

      addCommit: (projectId, commit) => {
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== projectId) return p
            const full: Commit = { ...commit, id: id('c') }
            return {
              ...p,
              commits: [full, ...p.commits],
              currentCommitId: full.id,
              lastUpdatedAt: full.timestamp,
            }
          }),
        )
      },

      createBranch: (projectId, name) => {
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== projectId) return p
            if (p.branches.includes(name)) return p
            return { ...p, branches: [...p.branches, name] }
          }),
        )
      },

      switchBranch: (projectId, name) => {
        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, currentBranch: name } : p)),
        )
      },

      mergeBranch: (projectId, from, into) => {
        const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== projectId) return p
            const mergeCommit: Commit = {
              id: id('c'),
              projectId,
              branch: into,
              message: `Merge branch "${from}" into "${into}" (simulated)`,
              authorUserId: currentUser.id,
              timestamp: now,
            }
            return {
              ...p,
              currentBranch: into,
              commits: [mergeCommit, ...p.commits],
              currentCommitId: mergeCommit.id,
              lastUpdatedAt: now,
            }
          }),
        )
      },

      toggleSongPin: (projectId, songId) => {
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== projectId) return p
            if (!p.songs) return p
            return {
              ...p,
              songs: p.songs.map((s) =>
                s.id === songId ? { ...s, pinned: !s.pinned } : s,
              ),
            }
          }),
        )
      },

      deleteProject: (projectId) => {
        setProjects((prev) => prev.filter((p) => p.id !== projectId))
        setToasts((prev) => [
          ...prev,
          { id: id('t'), title: 'Project deleted (simulated)' },
        ])
      },

      deleteUser: (userId) => {
        setUsers((prev) => prev.filter((u) => u.id !== userId))
        setToasts((prev) => [
          ...prev,
          { id: id('t'), title: 'User deleted (simulated)' },
        ])
      },

      deleteScore: (projectId, scoreId) => {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? { ...p, scores: p.scores.filter((s) => s.id !== scoreId) }
              : p,
          ),
        )
        setToasts((prev) => [
          ...prev,
          { id: id('t'), title: 'Score deleted (simulated)' },
        ])
      },
    }),
    [currentUser, users, projects, toasts],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppState() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppState must be used within AppStateProvider')
  return v
}
