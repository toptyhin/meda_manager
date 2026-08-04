import { useState } from 'react'

type Props = {
  error: string | null
  onSubmit: (username: string, password: string) => Promise<void>
}

/** Форма входа по логину/паролю для локальной разработки без Telegram. */
export function DevLoginPage({ error, onSubmit }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(username.trim(), password)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 safe-top">
      <div className="w-full max-w-sm flex flex-col items-center text-center anim-fade-up">
        <img
          src="/logo2.webp"
          alt=""
          width={64}
          height={64}
          className="size-16 rounded-2xl shadow-md ring-1 ring-line"
        />
        <h1 className="mt-4 text-xl font-bold tracking-tight">Media Manager</h1>
        <p className="mt-1.5 text-sm text-muted leading-relaxed">
          Режим разработки. Войдите по логину и паролю веб-аккаунта.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 w-full flex flex-col gap-3">
          <label className="block text-left">
            <span className="mb-1 block text-xs font-medium text-muted">Логин</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              autoComplete="username"
              autoCapitalize="none"
              className="w-full rounded-xl border border-line bg-card px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </label>
          <label className="block text-left">
            <span className="mb-1 block text-xs font-medium text-muted">Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-xl border border-line bg-card px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </label>

          {error && (
            <p className="rounded-xl border border-bad/30 bg-bad/10 text-bad px-3.5 py-2.5 text-sm leading-snug">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!username.trim() || !password || submitting}
            className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-grad-from via-grad-via to-grad-to px-4 py-3 text-sm font-semibold text-white shadow-lg active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100"
          >
            {submitting && (
              <span
                aria-hidden
                className="inline-block size-4 rounded-full border-2 border-current border-t-transparent animate-spin"
              />
            )}
            {submitting ? 'Входим…' : 'Войти'}
          </button>
        </form>

        <p className="mt-6 text-xs text-muted/70 leading-relaxed">
          Экран виден только в dev-сборке.
          <br />
          В production приложение открывается из Telegram.
        </p>
      </div>
    </div>
  )
}
