import { api } from './client'

export type GenerationStatus = 'pending' | 'running' | 'done' | 'error'

export type Generation = {
  id: number
  mode: 'generate' | 'edit'
  status: GenerationStatus
  error: string | null
  result_image_id: number | null
  review_score: number | null
  review_passed: boolean | null
  params: Record<string, unknown>
  created_at: string
  finished_at: string | null
}

export type GenerationCreateBody = {
  text: string
  size: string
  ratio: string
  mode?: 'generate' | 'edit'
  reference_image_ids?: number[]
  parent_image_id?: number | null
}

// Дублируют ALLOWED_SIZES/ALLOWED_RATIOS из backend/app/api/generations.py
export const IMAGE_SIZES = ['1K', '2K', '3K', '4K'] as const
export const IMAGE_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '21:9'] as const

export type ImageSize = (typeof IMAGE_SIZES)[number]
export type ImageRatio = (typeof IMAGE_RATIOS)[number]

export const generationsApi = {
  create: (body: GenerationCreateBody) =>
    api<Generation>('/api/generations', { method: 'POST', json: body }),
  get: (id: number) => api<Generation>(`/api/generations/${id}`),
}
