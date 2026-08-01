import { create } from 'zustand'
import { readStorage, writeStorage } from './storage'
import {
  PLATFORM_PRESETS,
  QUALITY_PRESETS,
  appendPhrase,
  composePrompt,
  type PromptParts,
  type QualityPreset,
} from './videoPresets'
import type { MediaVideo, VideoMode } from '../types'

export type VideoPrefs = {
  qualityId: string
  durationSec: 3 | 5 | 10
}

const PREFS_KEY = 'mm-video-prefs'
const DEFAULT_PREFS: VideoPrefs = { qualityId: 'social', durationSec: 5 }

const EMPTY_PARTS: PromptParts = {
  subject: '',
  action: '',
  scene: '',
  camera: '',
  lighting: '',
  style: '',
}

export function resolveQuality(prefs: VideoPrefs): QualityPreset {
  return QUALITY_PRESETS.find((p) => p.id === prefs.qualityId) ?? QUALITY_PRESETS[0]
}

export function resolveDuration(prefs: VideoPrefs): 3 | 5 | 10 {
  const q = resolveQuality(prefs)
  return q.allowedDurations.includes(prefs.durationSec)
    ? prefs.durationSec
    : q.defaultDurationSec
}

function persistPrefs(prefs: VideoPrefs): VideoPrefs {
  writeStorage(PREFS_KEY, prefs)
  return prefs
}

type VideoFormState = {
  mode: VideoMode
  text: string
  negativePrompt: string
  seed: string
  sources: number[]
  categoryId: number | ''
  showAssistant: boolean
  parts: PromptParts
  prefs: VideoPrefs
  setMode: (mode: VideoMode) => void
  setText: (text: string) => void
  setNegativePrompt: (value: string) => void
  setSeed: (value: string) => void
  setCategoryId: (value: number | '') => void
  toggleAssistant: () => void
  setPart: (key: keyof PromptParts, value: string) => void
  toggleSource: (id: number) => void
  applyPlatform: (platformId: string) => void
  applyCamera: (phrase: string) => void
  applyPartsToPrompt: () => void
  setQuality: (qualityId: string) => void
  setDuration: (duration: 3 | 5 | 10) => void
  reproduce: (video: MediaVideo) => void
}

export const useVideoFormStore = create<VideoFormState>()((set, get) => ({
  mode: 't2v',
  text: '',
  negativePrompt: '',
  seed: '',
  sources: [],
  categoryId: '',
  showAssistant: false,
  parts: EMPTY_PARTS,
  prefs: readStorage<VideoPrefs>(PREFS_KEY, DEFAULT_PREFS),

  setMode: (mode) =>
    set((s) => ({
      mode,
      sources:
        mode === 't2v' ? [] : mode === 'i2v' ? s.sources.slice(0, 1) : s.sources,
    })),
  setText: (text) => set({ text }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
  setSeed: (seed) => set({ seed }),
  setCategoryId: (categoryId) => set({ categoryId }),
  toggleAssistant: () => set((s) => ({ showAssistant: !s.showAssistant })),
  setPart: (key, value) => set((s) => ({ parts: { ...s.parts, [key]: value } })),

  toggleSource: (id) =>
    set((s) => {
      if (s.sources.includes(id)) return { sources: s.sources.filter((x) => x !== id) }
      if (s.mode === 'i2v') return { sources: [id] }
      if (s.sources.length >= 5) return s
      return { sources: [...s.sources, id] }
    }),

  applyPlatform: (platformId) => {
    const p = PLATFORM_PRESETS.find((x) => x.id === platformId)
    if (!p) return
    const q = QUALITY_PRESETS.find((x) => x.id === p.qualityId)
    set((s) => ({
      prefs: q ? persistPrefs({ qualityId: q.id, durationSec: p.durationSec }) : s.prefs,
      parts: { ...s.parts, style: p.stylePhrase },
      text: appendPhrase(s.text, p.stylePhrase),
      showAssistant: true,
    }))
  },

  applyCamera: (phrase) =>
    set((s) => ({
      parts: { ...s.parts, camera: phrase },
      text: appendPhrase(s.text, phrase),
    })),

  applyPartsToPrompt: () => {
    const composed = composePrompt(get().parts)
    if (composed) set({ text: composed })
  },

  setQuality: (qualityId) =>
    set((s) => {
      const q = QUALITY_PRESETS.find((p) => p.id === qualityId)
      if (!q) return s
      const current = resolveDuration(s.prefs)
      return {
        prefs: persistPrefs({
          qualityId: q.id,
          durationSec: q.allowedDurations.includes(current)
            ? current
            : q.defaultDurationSec,
        }),
      }
    }),

  setDuration: (duration) =>
    set((s) => ({ prefs: persistPrefs({ ...s.prefs, durationSec: duration }) })),

  reproduce: (video) =>
    set((s) => {
      const match = QUALITY_PRESETS.find(
        (p) => p.width === video.width && p.height === video.height,
      )
      let prefs = s.prefs
      if (match) {
        const sec = video.duration <= 4 ? 3 : video.duration <= 7.5 ? 5 : 10
        prefs = persistPrefs({
          qualityId: match.id,
          durationSec: match.allowedDurations.includes(sec as 3 | 5 | 10)
            ? (sec as 3 | 5 | 10)
            : match.defaultDurationSec,
        })
      }
      return {
        mode: video.mode,
        text: video.prompt_text,
        negativePrompt: video.negative_prompt ?? '',
        seed: video.seed != null ? String(video.seed) : '',
        sources: video.source_image_ids,
        categoryId: video.category_id ?? '',
        prefs,
      }
    }),
}))
