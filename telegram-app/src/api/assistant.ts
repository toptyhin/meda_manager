import { api } from './client'

export type ImagePromptMode = 't2i' | 'i2i'

export type SuggestIntent = {
  key: string
  label: string
}

export const assistantApi = {
  suggest: (hint: string, mode: ImagePromptMode, intent?: string | null) =>
    api<{ text: string }>('/api/assistant/suggest', {
      method: 'POST',
      json: { hint, mode, intent: intent ?? null },
    }),
  listSuggestIntents: () => api<SuggestIntent[]>('/api/assistant/suggest-intents'),
  improve: (text: string, mode: ImagePromptMode) =>
    api<{ improved_text: string }>('/api/assistant/improve', {
      method: 'POST',
      json: { text, mode },
    }),
}
