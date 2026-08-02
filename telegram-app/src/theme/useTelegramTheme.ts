import { useEffect } from 'react'
import { getWebApp } from '../twa/telegram'

const TG_VAR_MAP: Array<[key: string, cssVar: string]> = [
  ['bg_color', '--paper'],
  ['secondary_bg_color', '--card'],
  ['text_color', '--ink'],
  ['hint_color', '--muted'],
  ['section_separator_color', '--line'],
]

function applyTheme() {
  const tg = getWebApp()
  const root = document.documentElement

  const dark = tg
    ? tg.colorScheme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches
  root.classList.toggle('dark', dark)
  root.dataset.theme = dark ? 'dark' : 'light'

  const params = tg?.themeParams ?? {}
  for (const [key, cssVar] of TG_VAR_MAP) {
    const value = (params as Record<string, string | undefined>)[key]
    if (value) root.style.setProperty(cssVar, value)
    else root.style.removeProperty(cssVar)
  }
  if (!params.secondary_bg_color && params.section_bg_color) {
    root.style.setProperty('--card', params.section_bg_color)
  }

  const paper = getComputedStyle(root).getPropertyValue('--paper').trim()
  if (tg && paper) {
    try {
      tg.setBackgroundColor(paper)
      tg.setHeaderColor(paper)
    } catch {
      /* ignore */
    }
  }
}

export function useTelegramTheme() {
  useEffect(() => {
    applyTheme()
    const tg = getWebApp()
    if (tg) {
      tg.onEvent('themeChanged', applyTheme)
      return () => tg.offEvent('themeChanged', applyTheme)
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', applyTheme)
    return () => mq.removeEventListener('change', applyTheme)
  }, [])
}
