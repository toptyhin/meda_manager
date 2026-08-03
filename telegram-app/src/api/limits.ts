import { api } from './client'

export type QuotaPlan = {
  id: number
  name: string
  expires_at: string | null
}

export type QuotaResource = {
  resource_kind: 'image' | 'video'
  period: 'daily' | 'weekly' | 'monthly' | 'total'
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

export const limitsApi = {
  me: () => api<QuotaSnapshot>('/api/limits/me'),
}
