import { api } from './client'

export type ImagePromptMode = 't2i' | 'i2i'

export const assistantApi = {
  suggest: (hint: string, mode: ImagePromptMode) =>
    api<{ text: string }>('/api/assistant/suggest', {
      method: 'POST',
      json: { hint, mode },
    }),
  improve: (text: string, mode: ImagePromptMode) =>
    api<{ improved_text: string }>('/api/assistant/improve', {
      method: 'POST',
      json: { text, mode },
    }),
}
