import { api } from './client'
import type {
  Category,
  Generation,
  GenerationMode,
  ImageKind,
  ImageListResponse,
  Invite,
  MediaImage,
  Prompt,
  PromptMode,
  PromptVersion,
  User,
} from '../types'

export const authApi = {
  login: (username: string, password: string) =>
    api<{ access_token: string }>('/api/auth/login', {
      method: 'POST',
      json: { username, password },
    }),
  register: (username: string, password: string, invite_code: string) =>
    api<{ access_token: string }>('/api/auth/register', {
      method: 'POST',
      json: { username, password, invite_code },
    }),
  me: () => api<User>('/api/auth/me'),
}

export const invitesApi = {
  list: () => api<Invite[]>('/api/invites'),
  create: () => api<Invite>('/api/invites', { method: 'POST' }),
  update: (id: number, is_blocked: boolean) =>
    api<Invite>(`/api/invites/${id}`, { method: 'PATCH', json: { is_blocked } }),
  remove: (id: number) => api<void>(`/api/invites/${id}`, { method: 'DELETE' }),
}

export const categoriesApi = {
  list: () => api<Category[]>('/api/categories'),
  create: (name: string) =>
    api<Category>('/api/categories', { method: 'POST', json: { name } }),
  update: (id: number, name: string) =>
    api<Category>(`/api/categories/${id}`, { method: 'PATCH', json: { name } }),
  remove: (id: number) => api<void>(`/api/categories/${id}`, { method: 'DELETE' }),
}

export const promptsApi = {
  list: (category_id?: number) => {
    const q = category_id != null ? `?category_id=${category_id}` : ''
    return api<Prompt[]>(`/api/prompts${q}`)
  },
  get: (id: number) => api<Prompt>(`/api/prompts/${id}`),
  create: (body: { title: string; category_id: number; text: string; mode?: PromptMode }) =>
    api<Prompt>('/api/prompts', { method: 'POST', json: body }),
  update: (id: number, body: { title?: string; category_id?: number }) =>
    api<Prompt>(`/api/prompts/${id}`, { method: 'PATCH', json: body }),
  remove: (id: number) => api<void>(`/api/prompts/${id}`, { method: 'DELETE' }),
  versions: (id: number) => api<PromptVersion[]>(`/api/prompts/${id}/versions`),
  addVersion: (id: number, text: string, source: 'manual' | 'assistant' = 'manual') =>
    api<PromptVersion>(`/api/prompts/${id}/versions`, {
      method: 'POST',
      json: { text, source },
    }),
}

export const imagesApi = {
  list: (params: {
    kind?: ImageKind | ''
    category_id?: number | ''
    rating_min?: number | ''
    sort?: 'created_at' | 'rating'
    order?: 'asc' | 'desc'
    page?: number
    page_size?: number
  } = {}) => {
    const sp = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v))
    })
    const q = sp.toString()
    return api<ImageListResponse>(`/api/images${q ? `?${q}` : ''}`)
  },
  upload: (file: File, category_id?: number) => {
    const fd = new FormData()
    fd.append('file', file)
    const q = category_id != null ? `?category_id=${category_id}` : ''
    return api<MediaImage>(`/api/images/upload${q}`, { method: 'POST', formData: fd })
  },
  update: (id: number, body: { rating?: number; category_id?: number }) =>
    api<MediaImage>(`/api/images/${id}`, { method: 'PATCH', json: body }),
  remove: (id: number) => api<void>(`/api/images/${id}`, { method: 'DELETE' }),
  get: (id: number) => api<MediaImage>(`/api/images/${id}`),
}

export const generationsApi = {
  create: (body: {
    mode?: GenerationMode
    prompt_version_id?: number | null
    text?: string
    reference_image_ids?: number[]
    parent_image_id?: number | null
    size?: string
    ratio?: string
    category_id?: number | null
  }) => api<Generation>('/api/generations', { method: 'POST', json: body }),
  get: (id: number) => api<Generation>(`/api/generations/${id}`),
  list: () => api<Generation[]>('/api/generations'),
}

export const assistantApi = {
  improve: (text: string, category_name?: string) =>
    api<{ improved_text: string }>('/api/assistant/improve', {
      method: 'POST',
      json: { text, category_name },
    }),
}
