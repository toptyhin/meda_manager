export type QualityPreset = {
  id: string
  label: string
  description: string
  width: number
  height: number
  ratio: string
  defaultDurationSec: 3 | 5 | 10
  allowedDurations: Array<3 | 5 | 10>
}

export type CameraMove = {
  id: string
  label: string
  phrase: string
}

export type PlatformPreset = {
  id: string
  label: string
  qualityId: string
  durationSec: 3 | 5 | 10
  stylePhrase: string
}

export const QUALITY_PRESETS: QualityPreset[] = [
  {
    id: 'social',
    label: 'Соцсети (9:16)',
    description: 'Вертикальное видео для TikTok / Reels / Shorts',
    width: 720,
    height: 1280,
    ratio: '9:16',
    defaultDurationSec: 5,
    allowedDurations: [3, 5],
  },
  {
    id: 'presentation',
    label: 'Презентации (16:9)',
    description: 'Горизонтальное видео для демо и презентаций',
    width: 1280,
    height: 720,
    ratio: '16:9',
    defaultDurationSec: 5,
    allowedDurations: [5, 10],
  },
  {
    id: 'stories',
    label: 'Истории (1:1)',
    description: 'Квадратное видео для лент и сторис',
    width: 960,
    height: 960,
    ratio: '1:1',
    defaultDurationSec: 5,
    allowedDurations: [3, 5],
  },
]

export const CAMERA_MOVES: CameraMove[] = [
  { id: 'pan', label: 'Панорама', phrase: 'slow camera pan' },
  {
    id: 'track',
    label: 'Трекинг',
    phrase: 'tracking shot following the subject',
  },
  { id: 'zoom', label: 'Зум', phrase: 'slow zoom in' },
  {
    id: 'orbit',
    label: 'Орбита',
    phrase: 'orbiting camera around the subject',
  },
  { id: 'static', label: 'Статика', phrase: 'static locked camera' },
]

export const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: 'tiktok',
    label: 'TikTok',
    qualityId: 'social',
    durationSec: 5,
    stylePhrase: 'vertical short-form social video style, punchy motion, high retention pacing',
  },
  {
    id: 'reels',
    label: 'Reels',
    qualityId: 'social',
    durationSec: 5,
    stylePhrase: 'Instagram Reels aesthetic, clean modern look, smooth motion',
  },
  {
    id: 'shorts',
    label: 'YouTube Shorts',
    qualityId: 'social',
    durationSec: 5,
    stylePhrase: 'YouTube Shorts style, cinematic vertical framing, clear subject focus',
  },
]

export const FRAME_RATE = 24

/** Map target duration (seconds) to Agnes num_frames at 24fps (8n+1). */
export function framesForDuration(seconds: 3 | 5 | 10): number {
  if (seconds === 3) return 81
  if (seconds === 10) return 241
  return 121
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647)
}

export type PromptParts = {
  subject: string
  action: string
  scene: string
  camera: string
  lighting: string
  style: string
}

export function composePrompt(parts: PromptParts): string {
  return [parts.subject, parts.action, parts.scene, parts.camera, parts.lighting, parts.style]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ')
}

export { insertSnippet as appendPhrase } from './styleSnippets'

export const MODE_LABELS: Record<'t2v' | 'i2v' | 'keyframes', string> = {
  t2v: 'Режиссёр',
  i2v: 'Оживлятор',
  keyframes: 'Сторимейкер',
}
