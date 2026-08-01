import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../api/client'
import { ThemeToggle } from '../components/ThemeToggle'

export function LoginPage() {
  const { user, login, loading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Ошибка входа')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center px-4 relative">
      <ThemeToggle className="absolute top-4 right-4" />
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-md bg-card border border-line rounded-2xl p-8 shadow-sm"
      >
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="Media Manager" className="size-16 rounded-2xl mb-3" width={64} height={64} />
          <h1 className="text-2xl font-semibold">Вход</h1>
          <p className="text-muted text-sm mt-1">Media Manager</p>
        </div>
        {error && (
          <div className="mb-4 rounded-md bg-bad/10 text-bad text-sm px-3 py-2">{error}</div>
        )}
        <label className="block text-sm mb-4">
          <span className="text-muted">Логин</span>
          <input
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-accent"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-sm mb-6">
          <span className="text-muted">Пароль</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-accent"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-accent hover:bg-accent-hover text-white font-medium py-2.5 disabled:opacity-60"
        >
          {busy ? 'Входим…' : 'Войти'}
        </button>
        <p className="mt-4 text-sm text-muted text-center">
          Нет аккаунта?{' '}
          <Link to="/register" className="text-accent hover:underline">
            Регистрация по инвайту
          </Link>
        </p>
      </form>
    </div>
  )
}
