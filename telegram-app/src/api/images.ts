import { api } from './client'

export type ImageKind = 'reference' | 'generated' | 'draft'

export type MediaImage = {
  id: number
  kind: ImageKind
  width: number
  height: number
  rating: number
  prompt_text: string | null
  size: string | null
  ratio: string | null
  created_at: string
  thumb_url: string
  file_url: string
}

export type ImageListResponse = {
  items: MediaImage[]
  total: number
  page: number
  page_size: number
}

export type UploadedImage = {
  id: number
  kind: string
  width: number
  height: number
  thumb_url: string
  file_url: string
}

export const imagesApi = {
  list: (params: {
    kind?: ImageKind | ''
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
  upload: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api<UploadedImage>('/api/images/upload', { method: 'POST', formData: fd })
  },
  remove: (id: number) => api<void>(`/api/images/${id}`, { method: 'DELETE' }),
}
