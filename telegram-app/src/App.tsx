import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { CreatePage } from './pages/CreatePage'
import { MediaLibraryPage } from './pages/MediaLibraryPage'
import { ProfilePage } from './pages/ProfilePage'
import { useTelegramAuth } from './twa/auth'

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center gap-3 px-6 text-center safe-top">
      {children}
    </div>
  )
}

export default function App() {
  const { state, error, retry } = useTelegramAuth()

  if (state === 'loading') {
    return (
      <Splash>
        <div className="size-10 rounded-full border-2 border-line border-t-accent animate-spin" />
        <p className="text-sm text-muted">Входим…</p>
      </Splash>
    )
  }

  if (state === 'no-telegram') {
    return (
      <Splash>
        <h1 className="text-lg font-bold">Media Manager</h1>
        <p className="text-sm text-muted">
          Приложение работает внутри Telegram. Откройте его через кнопку меню бота.
        </p>
      </Splash>
    )
  }

  if (state === 'error') {
    return (
      <Splash>
        <h1 className="text-lg font-bold">Не удалось войти</h1>
        <p className="text-sm text-muted">{error ?? 'Неизвестная ошибка'}</p>
        <button
          type="button"
          onClick={() => void retry()}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white"
        >
          Повторить
        </button>
      </Splash>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="create" element={<CreatePage />} />
        <Route path="media" element={<MediaLibraryPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
