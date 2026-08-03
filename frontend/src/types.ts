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

export type ProviderCapabilities = {
  chat: boolean
  image: boolean
  video: boolean
  catalog: boolean
}

export type ProviderInfo = {
  id: string
  name: string
  capabilities: ProviderCapabilities
  configured: boolean
  is_default_chat: boolean
}

export type ModelPricing = {
  prompt_per_1m: number | null
  completion_per_1m: number | null
  image: number | null
  request: number | null
  input_cache_read_per_1m: number | null
  unit: string | null
}

export type ModelInfo = {
  id: string
  provider: string
  kind: string
  context_length: number | null
  max_output_length: number | null
  input_modalities: string[]
  output_modalities: string[]
  pricing: ModelPricing | null
}

export type ProviderModelsResponse = {
  provider: string
  items: ModelInfo[]
  cached: boolean
  fetched_at: string | null
  expires_at: string | null
}

export type ProviderSettings = {
  id: string
  name: string
  enabled: boolean
  configured: boolean
  key_source: 'db' | 'env' | 'none' | string
  api_key_masked: string | null
  base_url: string
  chat_model: string
  capabilities: ProviderCapabilities
}

/** Глобальный шаблон «Придумай промпт» (админ). */
export type AppPromptTemplate = {
  kind: string
  text: string
  version: number | null
  is_default: boolean
  default_text: string
  updated_at: string | null
}

export type ChatModelPreference = {
  provider: string
  model: string
  source: 'user' | 'default' | string
}

// --- Tariffs & limits ---

export type LimitResourceKind = 'image' | 'video'
export type LimitPeriod = 'daily' | 'weekly' | 'monthly' | 'total'
export type CreditKind = 'paid' | 'bonus' | 'adjustment' | 'consume'

export type TariffLimit = {
  id: number
  resource_kind: LimitResourceKind
  period: LimitPeriod
  max_count: number | null
  credit_cost: number
}

export type TariffLimitDraft = {
  resource_kind: LimitResourceKind
  period: LimitPeriod
  max_count: number | null
  credit_cost: number
}

export type TariffPlan = {
  id: number
  name: string
  description: string | null
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  limits: TariffLimit[]
}

export type TariffPlanPayload = {
  name: string
  description?: string | null
  is_default?: boolean
  is_active?: boolean
  limits?: TariffLimitDraft[]
}

export type QuotaPlan = {
  id: number
  name: string
  expires_at: string | null
}

export type QuotaResource = {
  resource_kind: LimitResourceKind
  period: LimitPeriod
  limit: number | null
  used: number
  remaining: number | null
  reset_at: string | null
  credit_cost: number
}

export type QuotaSnapshot = {
  plan: QuotaPlan | null
  resources: QuotaResource[]
  credits: number
  enforcement_enabled: boolean
}

export type Subscription = {
  id: number
  plan_id: number
  plan_name: string
  created_by: number | null
  expires_at: string | null
  created_at: string
  active: boolean
}

export type CreditTransaction = {
  id: number
  amount: number
  kind: CreditKind
  reason: string | null
  source: string
  created_by: number | null
  created_at: string
}

export type TgUserListItem = {
  telegram_id: number
  username: string | null
  first_name: string
  last_name: string | null
  photo_url: string | null
  is_premium: boolean
  is_blocked: boolean
  linked_user_id: number | null
  plan: QuotaPlan | null
  balance: number
  used_today: number
  used_month: number
  first_seen_at: string
  last_seen_at: string
}

export type TgUserListResponse = {
  items: TgUserListItem[]
  total: number
}

export type TgUserDetail = TgUserListItem & {
  subscriptions: Subscription[]
  transactions: CreditTransaction[]
  quota: QuotaSnapshot | null
}
