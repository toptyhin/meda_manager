import { api } from './client'
import type {
  Category,
  Generation,
  GenerationMode,
  ImageKind,
  ImageListResponse,
  ImproveKind,
  ImproveTemplate,
  ImproveTemplateVersion,
  Invite,
  MediaImage,
  MediaVideo,
  Prompt,
  PromptMode,
  PromptVersion,
  StyleKind,
  StylePreset,
  User,
  VideoGeneration,
  VideoListResponse,
  VideoMode,
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

export const stylesApi = {
  list: (kind?: StyleKind) => {
    const q = kind != null ? `?kind=${kind}` : ''
    return api<StylePreset[]>(`/api/styles${q}`)
  },
  create: (body: {
    title: string
    description?: string | null
    category: string
    kind?: StyleKind
    text: string
  }) => api<StylePreset>('/api/styles', { method: 'POST', json: body }),
  update: (
    id: number,
    body: {
      title?: string
      description?: string | null
      category?: string
      kind?: StyleKind
      text?: string
    },
  ) => api<StylePreset>(`/api/styles/${id}`, { method: 'PATCH', json: body }),
  remove: (id: number) => api<void>(`/api/styles/${id}`, { method: 'DELETE' }),
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
    auto_review?: boolean
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
  improveVideo: (text: string, category_name?: string) =>
    api<{ improved_text: string }>('/api/assistant/video-improve', {
      method: 'POST',
      json: { text, category_name },
    }),
  getTemplate: (kind: ImproveKind) =>
    api<ImproveTemplate>(`/api/assistant/templates/${kind}`),
  addTemplateVersion: (kind: ImproveKind, text: string) =>
    api<ImproveTemplateVersion>(`/api/assistant/templates/${kind}/versions`, {
      method: 'POST',
      json: { text },
    }),
}

export const videoGenerationsApi = {
  create: (body: {
    mode: VideoMode
    text: string
    source_image_ids?: number[]
    width: number
    height: number
    num_frames: number
    frame_rate: number
    seed?: number | null
    negative_prompt?: string | null
    category_id?: number | null
  }) => api<VideoGeneration>('/api/video-generations', { method: 'POST', json: body }),
  get: (id: number) => api<VideoGeneration>(`/api/video-generations/${id}`),
  list: () => api<VideoGeneration[]>('/api/video-generations'),
}

export const videosApi = {
  list: (params: {
    mode?: VideoMode | ''
    category_id?: number | ''
    page?: number
    page_size?: number
  } = {}) => {
    const sp = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v))
    })
    const q = sp.toString()
    return api<VideoListResponse>(`/api/videos${q ? `?${q}` : ''}`)
  },
  get: (id: number) => api<MediaVideo>(`/api/videos/${id}`),
  update: (id: number, body: { category_id?: number | null }) =>
    api<MediaVideo>(`/api/videos/${id}`, { method: 'PATCH', json: body }),
  remove: (id: number) => api<void>(`/api/videos/${id}`, { method: 'DELETE' }),
}
