import { getWebApp } from '../twa/telegram'

const TOKEN_KEY = 'tma_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let detail = res.statusText
  try {
    const data = await res.json()
    if (typeof data.detail === 'string') detail = data.detail
    else if (Array.isArray(data.detail))
      detail = data.detail.map((d: { msg?: string }) => d.msg).join(', ')
  } catch {
    /* ignore */
  }
  return new ApiError(res.status, detail)
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown; formData?: FormData } = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  const token = getToken()
  const initData = getWebApp()?.initData
  if (token) headers.set('Authorization', `Bearer ${token}`)
  else if (initData) headers.set('Telegram-Init-Data', initData)

  let body = options.body
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.json)
  } else if (options.formData) {
    body = options.formData
  }

  const res = await fetch(path, { ...options, headers, body })
  if (res.status === 204) return undefined as T
  if (!res.ok) throw await parseError(res)
  return res.json() as Promise<T>
}
