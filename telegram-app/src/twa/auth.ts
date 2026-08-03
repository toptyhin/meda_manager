import { useCallback, useEffect, useState } from 'react'
import { getToken, loginWithTelegram } from '../api/client'
import { getWebApp } from './telegram'

export type AuthState = 'loading' | 'ready' | 'no-telegram' | 'error'

/**
 * Mini App auth bootstrap: if a JWT exists — ready; otherwise, when opened
 * from Telegram (initData present), exchange initData for a JWT. Outside
 * Telegram there is nothing to log in with.
 */
export function useTelegramAuth() {
  const [state, setState] = useState<AuthState>(() => {
    if (getToken()) return 'ready'
    if (!getWebApp()?.initData) return 'no-telegram'
    return 'loading'
  })
  const [error, setError] = useState<string | null>(null)

  const login = useCallback(async () => {
    if (!getWebApp()?.initData) {
      setState('no-telegram')
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

  useEffect(() => {
    if (state !== 'loading') return
    void login()
  }, [state, login])

  return { state, error, retry: login }
}
