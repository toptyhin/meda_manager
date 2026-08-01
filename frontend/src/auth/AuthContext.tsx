import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authApi } from '../api'
import { getToken, setToken } from '../api/client'
import type { User } from '../types'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await authApi.me()
      setUser(me)
    } catch {
      setToken(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    const { access_token } = await authApi.login(username, password)
    setToken(access_token)
    const me = await authApi.me()
    setUser(me)
  }, [])

  const register = useCallback(async (username: string, password: string, invite: string) => {
    const { access_token } = await authApi.register(username, password, invite)
    setToken(access_token)
    const me = await authApi.me()
    setUser(me)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
