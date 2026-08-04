export interface TgUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  photo_url?: string
}

export interface TgThemeParams {
  bg_color?: string
  secondary_bg_color?: string
  section_bg_color?: string
  section_separator_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  accent_text_color?: string
  subtitle_color?: string
  destructive_text_color?: string
  header_bg_color?: string
  bottom_bar_bg_color?: string
  section_header_text_color?: string
}

export interface TgWebApp {
  initData: string
  initDataUnsafe: {
    user?: TgUser
    start_param?: string
  }
  colorScheme: 'light' | 'dark'
  themeParams: TgThemeParams
  isExpanded: boolean
  viewportHeight: number
  viewportStableHeight: number
  version: string
  platform: string
  ready(): void
  expand(): void
  close(): void
  disableVerticalSwipes(): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  openTelegramLink?(url: string): void
  openLink?(url: string): void
  onEvent(eventType: string, callback: () => void): void
  offEvent(eventType: string, callback: () => void): void
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
    selectionChanged(): void
  }
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TgWebApp
    }
  }
}
