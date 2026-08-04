import { getWebApp } from '../twa/telegram'

const TOKEN_KEY = 'tma_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  // react-doctor-disable-next-line react-doctor/auth-token-in-web-storage -- TMA JWT; HttpOnly cookies need same-site API deploy
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export type QuotaErrorDetail = {
  code: string
  message?: string
  resource_kind?: string
  period?: string
  limit?: number | null
  used?: number
  remaining?: number | null
  reset_at?: string | null
  balance?: number
  credit_cost?: number
}

export class ApiError extends Error {
  status: number
  detail: string
  quota: QuotaErrorDetail | null

  constructor(status: number, detail: string, quota: QuotaErrorDetail | null = null) {
    super(detail)
    this.status = status
    this.detail = detail
    this.quota = quota
  }

  get isQuotaExceeded(): boolean {
    return this.status === 429 && this.quota !== null
  }
}

function formatQuotaMessage(q: QuotaErrorDetail): string {
  const parts = [q.message ?? 'Лимит генераций исчерпан']
  if (q.reset_at) {
    const when = new Date(q.reset_at)
    if (!Number.isNaN(when.getTime())) {
      parts.push(`обновится ${when.toLocaleString('ru-RU')}`)
    }
  }
  if (typeof q.balance === 'number') {
    parts.push(`остаток кредитов: ${q.balance}`)
  }
  return parts.join('; ')
}

async function parseError(res: Response): Promise<ApiError> {
  let detail = res.statusText
  let quota: QuotaErrorDetail | null = null
  try {
    const data = await res.json()
    if (typeof data.detail === 'string') detail = data.detail
    else if (Array.isArray(data.detail))
      detail = data.detail.map((d: { msg?: string }) => d.msg).join(', ')
    else if (data.detail && typeof data.detail === 'object') {
      // Structured errors (e.g. 429 quota_exceeded from the limits service).
      quota = data.detail as QuotaErrorDetail
      detail = quota.code === 'quota_exceeded' ? formatQuotaMessage(quota) : (quota.message ?? detail)
    }
  } catch {
    /* ignore */
  }
  return new ApiError(res.status, detail, quota)
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown; formData?: FormData } = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let body = options.body
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.json)
  } else if (options.formData) {
    body = options.formData
  }

  const res = await fetch(path, { ...options, headers, body })
  if (res.status === 204) return undefined as T
  if (res.status === 401 && getToken()) {
    // Token expired or account recreated — force re-login on next bootstrap.
    setToken(null)
  }
  if (!res.ok) throw await parseError(res)
  return res.json() as Promise<T>
}

export async function fetchAuthedBlob(url: string): Promise<Blob> {
  const token = getToken()
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw await parseError(res)
  return res.blob()
}

/** Exchange Mini App initData for a JWT; creates the account on first login. */
export async function loginWithTelegram(): Promise<void> {
  const initData = getWebApp()?.initData
  if (!initData) throw new Error('Нет initData — приложение должно быть открыто из Telegram')
  const res = await fetch('/api/auth/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: initData }),
  })
  if (!res.ok) throw await parseError(res)
  const data = (await res.json()) as { access_token: string }
  setToken(data.access_token)
}

/** Dev-вход без Telegram: логин/пароль веб-аккаунта → тот же JWT. */
export async function loginWithPassword(username: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw await parseError(res)
  const data = (await res.json()) as { access_token: string }
  setToken(data.access_token)
}
