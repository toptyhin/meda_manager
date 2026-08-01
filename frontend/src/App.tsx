import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { Layout } from './components/Layout'
import { GeneratePage } from './pages/GeneratePage'
import { InvitesPage } from './pages/InvitesPage'
import { LoginPage } from './pages/LoginPage'
import { MediaPage } from './pages/MediaPage'
import { PromptsPage } from './pages/PromptsPage'
import { RegisterPage } from './pages/RegisterPage'
import { StylesPage } from './pages/StylesPage'
import { VideoPage } from './pages/VideoPage'
import type { ReactNode } from 'react'

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center text-muted text-sm">
        Загрузка…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<MediaPage />} />
        <Route path="prompts" element={<PromptsPage />} />
        <Route path="styles" element={<StylesPage />} />
        <Route path="generate" element={<GeneratePage />} />
        <Route path="video" element={<VideoPage />} />
        <Route path="invites" element={<InvitesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
