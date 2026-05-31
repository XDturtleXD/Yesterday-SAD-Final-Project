import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { GuestRoute } from './auth/GuestRoute'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppStateProvider } from './state/AppState'
import { AppLayout } from './ui/layout/AppLayout'
import { PublicLayout } from './ui/layout/PublicLayout'
import { AdminDashboardPage } from './ui/pages/AdminDashboardPage'
import { HomePage } from './ui/pages/HomePage'
import { LandingPage } from './ui/pages/LandingPage'
import { LoginPage } from './ui/pages/LoginPage'
import { ProjectDetailPage } from './ui/pages/ProjectDetailPage'
import { ProjectFormPage } from './ui/pages/ProjectFormPage'
import { ProjectsPage } from './ui/pages/ProjectsPage'
import { ScoreEditorPage } from './ui/pages/ScoreEditorPage'
import { ScoreMusicXmlPage } from './ui/pages/ScoreMusicXmlPage'
import { UserProfilePage } from './ui/pages/UserProfilePage'

export default function App() {
  return (
    <AppStateProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<LandingPage />} />
              <Route element={<GuestRoute />}>
                <Route path="login" element={<LoginPage />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="dashboard" element={<HomePage />} />
                <Route path="projects" element={<ProjectsPage />} />
                <Route path="projects/new" element={<ProjectFormPage mode="create" />} />
                <Route path="projects/:projectId/edit" element={<ProjectFormPage mode="edit" />} />
                <Route path="projects/:projectId" element={<ProjectDetailPage />} />
                <Route
                  path="projects/:projectId/scores/:scoreId/editor"
                  element={<ScoreEditorPage />}
                />
                <Route
                  path="projects/:projectId/scores/:scoreId/musicxml"
                  element={<ScoreMusicXmlPage />}
                />
                <Route path="users/:userId" element={<UserProfilePage />} />
                <Route path="admin" element={<AdminDashboardPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </AppStateProvider>
  )
}
