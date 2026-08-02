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

export type ImageKind = 'reference' | 'generated' | 'draft'

export type MediaImage = {
  id: number
  kind: ImageKind
  width: number
  height: number
  rating: number
  prompt_version_id: number | null
  prompt_text?: string | null
  parent_image_id: number | null
  category_id: number | null
  size: string | null
  ratio: string | null
  created_at: string
  thumb_url: string
  file_url: string
}

export type ImproveKind =
  | 'image_t2i'
  | 'image_i2i'
  | 'video_t2v'
  | 'video_i2v'
  | 'video_keyframes'

export type ImproveTemplateVersion = {
  id: number
  kind: ImproveKind
  version: number
  text: string
  created_at: string
}

export type ImproveTemplate = {
  kind: ImproveKind
  text: string
  version: number | null
  is_default: boolean
  default_text: string
  versions: ImproveTemplateVersion[]
}

export type ImageListResponse = {
  items: MediaImage[]
  total: number
  page: number
  page_size: number
}

export type GenerationStatus = 'pending' | 'running' | 'done' | 'error'
export type GenerationMode = 'generate' | 'edit'

export type ReviewIssue = {
  type: string
  description: string
  severity: string
}

export type GenerationStep = {
  id: number
  attempt: number
  action: string
  prompt_used: string
  image_id: number | null
  thumb_url: string | null
  file_url: string | null
  review_score: number | null
  review_passed: boolean | null
  review_issues: ReviewIssue[]
  review_fix_mode: string | null
  error: string | null
  created_at: string
  finished_at: string | null
}

export type Generation = {
  id: number
  mode: GenerationMode
  status: GenerationStatus
  error: string | null
  prompt_version_id: number | null
  result_image_id: number | null
  auto_review: boolean
  review_score: number | null
  review_passed: boolean | null
  params: Record<string, unknown>
  steps: GenerationStep[]
  created_at: string
  finished_at: string | null
}

export type StyleKind = 'image' | 'video' | 'both'

export type StylePreset = {
  id: number
  title: string
  description: string | null
  category: string
  kind: StyleKind
  text: string
  created_at: string
}

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
  category_id: number | null
  created_at: string
  file_url: string
}

export type VideoListResponse = {
  items: MediaVideo[]
  total: number
  page: number
  page_size: number
}

export type VideoGeneration = {
  id: number
  mode: VideoMode
  status: GenerationStatus
  error: string | null
  progress: number
  params: Record<string, unknown>
  provider_task_id: string | null
  provider_video_id: string | null
  result_video_id: number | null
  created_at: string
  finished_at: string | null
}
