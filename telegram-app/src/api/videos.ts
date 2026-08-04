import { api } from './client'

export type VideoMode = 't2v' | 'i2v' | 'keyframes'

export type MediaVideo = {
  id: number
  width: number
  height: number
  duration: number
  fps: number
  seed: number | null
  mode: VideoMode
  prompt_text: string
  negative_prompt: string | null
  source_image_ids: number[]
  created_at: string
  file_url: string
}

export type VideoListResponse = {
  items: MediaVideo[]
  total: number
  page: number
  page_size: number
}

export const VIDEO_MODE_LABELS: Record<VideoMode, string> = {
  t2v: 'Режиссёр',
  i2v: 'Оживлятор',
  keyframes: 'Сторимейкер',
}

export const videosApi = {
  list: (params: {
    mode?: VideoMode | ''
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
  remove: (id: number) => api<void>(`/api/videos/${id}`, { method: 'DELETE' }),
}
