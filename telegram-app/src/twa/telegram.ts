import { useState } from 'react'
import type { TgUser, TgWebApp } from './types'

export function getWebApp(): TgWebApp | null {
  if (typeof window === 'undefined') return null
  return window.Telegram?.WebApp ?? null
}

let initialized = false

export function initTelegramApp() {
  const tg = getWebApp()
  if (!tg || initialized) return
  initialized = true
  tg.ready()
  tg.expand()
  try {
    tg.disableVerticalSwipes()
  } catch {
    /* старые клиенты без поддержки */
  }
}

export function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  try {
    getWebApp()?.HapticFeedback?.impactOccurred(style)
  } catch {
    /* ignore */
  }
}

export function hapticNotify(type: 'error' | 'success' | 'warning') {
  try {
    getWebApp()?.HapticFeedback?.notificationOccurred(type)
  } catch {
    /* ignore */
  }
}

export function useTelegramUser(): TgUser | null {
  const [user] = useState<TgUser | null>(() => getWebApp()?.initDataUnsafe?.user ?? null)
  return user
}

/** Имя для приветствия: @username → first_name → запасной вариант */
export function telegramGreetingName(user: TgUser | null, fallback = 'друг'): string {
  if (user?.username) return user.username
  if (user?.first_name) return user.first_name
  return fallback
}
