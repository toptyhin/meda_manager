import { useCallback, useEffect, useState } from 'react'
import { ApiError, getToken, loginWithPassword, loginWithTelegram } from '../api/client'
import { getWebApp } from './telegram'

export type AuthState = 'loading' | 'ready' | 'no-telegram' | 'dev-login' | 'error'

/** Dev-вход по логину/паролю доступен только в dev-сборке (vite dev). */
export const DEV_LOGIN_ENABLED = import.meta.env.DEV

/**
 * Mini App auth bootstrap: if a JWT exists — ready; otherwise, when opened
 * from Telegram (initData present), exchange initData for a JWT. Outside
 * Telegram in dev mode — fall back to a username/password login form.
 */
export function useTelegramAuth() {
  const [state, setState] = useState<AuthState>(() => {
    if (getToken()) return 'ready'
    if (!getWebApp()?.initData) return DEV_LOGIN_ENABLED ? 'dev-login' : 'no-telegram'
    return 'loading'
  })
  const [error, setError] = useState<string | null>(null)

  const login = useCallback(async () => {
    if (!getWebApp()?.initData) {
      setState(DEV_LOGIN_ENABLED ? 'dev-login' : 'no-telegram')
      return
    }
    setState('loading')
    setError(null)
    try {
      await loginWithTelegram()
      setState('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }, [])

  const devLogin = useCallback(async (username: string, password: string) => {
    setError(null)
    try {
      await loginWithPassword(username, password)
      setState('ready')
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? 'Неверный логин или пароль'
          : e instanceof Error
            ? e.message
            : String(e),
      )
    }
  }, [])

  useEffect(() => {
    if (state !== 'loading') return
    void login()
  }, [state, login])

  return { state, error, retry: login, devLogin }
}
