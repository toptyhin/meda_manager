import { api } from './client'

export type ReferralUserBrief = {
  telegram_id: number
  username: string | null
  first_name: string
  referred_at: string | null
}

export type ReferralCounts = {
  l1: number
  l2: number
  l3: number
  total: number
}

export type ReferralMe = {
  code: string
  link: string | null
  counts: ReferralCounts
  levels: {
    l1: ReferralUserBrief[]
    l2: ReferralUserBrief[]
    l3: ReferralUserBrief[]
  }
}

export const referralsApi = {
  me: () => api<ReferralMe>('/api/referrals/me'),
}
