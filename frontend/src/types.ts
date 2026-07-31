export type User = {
  id: number
  username: string
  is_admin: boolean
  created_at: string
}

export type Invite = {
  id: number
  code: string
  is_blocked: boolean
  created_by: number | null
  used_by: number | null
  created_at: string
  created_by_username: string | null
  used_by_username: string | null
}

export type Category = {
  id: number
  name: string
  created_at: string
}

export type PromptVersion = {
  id: number
  prompt_id: number
  version: number
  text: string
  source: 'manual' | 'assistant'
  created_at: string
}

export type PromptMode = 't2i' | 'i2i'

export type Prompt = {
  id: number
  title: string
  category_id: number
  mode: PromptMode
  created_at: string
  current_version: PromptVersion | null
}

export type ImageKind = 'reference' | 'generated'

export type MediaImage = {
  id: number
  kind: ImageKind
  width: number
  height: number
  rating: number
  prompt_version_id: number | null
  parent_image_id: number | null
  category_id: number | null
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

export type GenerationStatus = 'pending' | 'running' | 'done' | 'error'
export type GenerationMode = 'generate' | 'edit'

export type Generation = {
  id: number
  mode: GenerationMode
  status: GenerationStatus
  error: string | null
  prompt_version_id: number | null
  result_image_id: number | null
  params: Record<string, unknown>
  created_at: string
  finished_at: string | null
}
