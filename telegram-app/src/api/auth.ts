import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export type CurrentUser = {
  id: number
  username: string
  is_admin: boolean
  created_at: string
}

export const authApi = {
  me: () => api<CurrentUser>('/api/auth/me'),
}

/**
 * Веб-пользователь из JWT. Запасной источник имени/профиля, когда нет
 * Telegram initData (dev-вход по логину и паролю).
 */
export function useCurrentUser(enabled: boolean) {
  return useQuery({ queryKey: ['auth-me'], queryFn: authApi.me, enabled })
}
