import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { assistantApi, categoriesApi, videoGenerationsApi } from '../../api'
import { ApiError } from '../../api/client'
import { ImproveTemplateModal } from '../ImproveTemplateModal'
import { SettingsIconButton } from '../SettingsIconButton'
import { StylePresetPicker } from '../StylePresetPicker'
import { CreativeAssistant } from './CreativeAssistant'
import { SourcePicker } from './SourcePicker'
import { VideoJobCard } from './VideoJobCard'
import { resolveDuration, resolveQuality, useVideoFormStore } from '../../lib/videoFormStore'
import {
  CAMERA_MOVES,
  FRAME_RATE,
  QUALITY_PRESETS,
  framesForDuration,
  randomSeed,
} from '../../lib/videoPresets'
import type { ImproveKind, VideoGeneration, VideoMode } from '../../types'

const MODES: { id: VideoMode; title: string; hint: string }[] = [
  { id: 'i2v', title: 'Оживлятор', hint: 'Фото → короткое анимированное видео' },
  { id: 't2v', title: 'Режиссёр', hint: 'Текст → готовый ролик' },
  {
    id: 'keyframes',
    title: 'Сторимейкер',
    hint: 'Несколько кадров → связное видео с переходами',
  },
]

const PROMPT_PLACEHOLDERS: Record<VideoMode, string> = {
  i2v: 'Опишите движение: что оживает, что остаётся стабильным…',
  keyframes: 'Опишите переход между ключевыми кадрами…',
  t2v: 'Опишите сцену: субъект, действие, камера, свет, стиль…',
}

export function VideoGenerator() {
  const qc = useQueryClient()
  const mode = useVideoFormStore((s) => s.mode)
  const text = useVideoFormStore((s) => s.text)
  const negativePrompt = useVideoFormStore((s) => s.negativePrompt)
  const seed = useVideoFormStore((s) => s.seed)
  const sources = useVideoFormStore((s) => s.sources)
  const categoryId = useVideoFormStore((s) => s.categoryId)
  const prefs = useVideoFormStore((s) => s.prefs)
  const setMode = useVideoFormStore((s) => s.setMode)
  const setText = useVideoFormStore((s) => s.setText)
  const setNegativePrompt = useVideoFormStore((s) => s.setNegativePrompt)
  const setSeed = useVideoFormStore((s) => s.setSeed)
  const setCategoryId = useVideoFormStore((s) => s.setCategoryId)
  const applyCamera = useVideoFormStore((s) => s.applyCamera)
  const setQuality = useVideoFormStore((s) => s.setQuality)
  const setDuration = useVideoFormStore((s) => s.setDuration)

  const [job, setJob] = useState<VideoGeneration | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [improving, setImproving] = useState(false)
  const [showTplSettings, setShowTplSettings] = useState(false)

  const quality = resolveQuality(prefs)
  const durationSec = resolveDuration(prefs)
  const minSources = mode === 'i2v' ? 1 : mode === 'keyframes' ? 2 : 0
  const maxSources = mode === 'i2v' ? 1 : mode === 'keyframes' ? 5 : 0
  const sourcesOk = sources.length >= minSources && sources.length <= maxSources
  const canSubmit = Boolean(text.trim()) && (mode === 't2v' || sourcesOk)
  const jobRunning = job?.status === 'pending' || job?.status === 'running'

  const cats = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })

  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') return
    const t = setInterval(() => {
      void videoGenerationsApi.get(job.id).then((j) => {
        setJob(j)
        if (j.status === 'done') void qc.invalidateQueries({ queryKey: ['videos'] })
      })
    }, 2000)
    return () => clearInterval(t)
  }, [job, qc])

  async function improve() {
    setImproving(true)
    setError(null)
    try {
      const catName = cats.data?.find((c) => c.id === categoryId)?.name
      const { improved_text } = await assistantApi.improveVideo(text, catName, mode)
      setText(improved_text)
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Не удалось улучшить промпт')
    } finally {
      setImproving(false)
    }
  }

  async function start() {
    setBusy(true)
    setError(null)
    setJob(null)
    try {
      const seedNum = seed.trim() === '' ? randomSeed() : Number(seed)
      if (!Number.isFinite(seedNum) || seedNum < 0) {
        setError('Seed должен быть неотрицательным числом')
        return
      }
      const j = await videoGenerationsApi.create({
        mode,
        text: text.trim(),
        source_image_ids: mode === 't2v' ? [] : sources,
        width: quality.width,
        height: quality.height,
        num_frames: framesForDuration(durationSec),
        frame_rate: FRAME_RATE,
        seed: seedNum,
        negative_prompt: negativePrompt.trim() || null,
        category_id: categoryId === '' ? null : categoryId,
      })
      setSeed(String((j.params.seed as number | undefined) ?? seedNum))
      setJob(j)
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Ошибка запуска')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-bad/10 text-bad text-sm px-3 py-2">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`rounded-xl border px-4 py-2.5 text-left min-w-[160px] transition ${
              mode === m.id
                ? 'border-accent bg-accent/10'
                : 'border-line bg-card hover:bg-line/30'
            }`}
          >
            <div className="text-sm font-medium">{m.title}</div>
            <div className="text-xs text-muted mt-0.5">{m.hint}</div>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        <div className="space-y-4">
          <CreativeAssistant />

          <div className="space-y-2">
            <label className="text-sm block">
              <span className="text-muted">Промпт</span>
              <div className="mt-1">
                <StylePresetPicker kind="video" text={text} onChange={setText} />
              </div>
              <textarea
                className="mt-2 w-full min-h-[120px] rounded-lg border border-line bg-card px-3 py-2"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={PROMPT_PLACEHOLDERS[mode]}
              />
            </label>
          </div>

          <label className="text-sm block">
            <span className="text-muted">Negative prompt — чего не должно быть</span>
            <textarea
              className="mt-1 w-full min-h-[64px] rounded-lg border border-line bg-card px-3 py-2"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="blurry, watermark, distorted face…"
            />
          </label>

          <div>
            <div className="text-sm text-muted mb-1.5">Движение камеры</div>
            <div className="flex flex-wrap gap-1.5">
              {CAMERA_MOVES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => applyCamera(c.phrase)}
                  className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-line/40"
                  title={c.phrase}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-sm">
              <span className="text-muted block mb-1">Формат</span>
              <select
                className="rounded-md border border-line bg-paper px-2 py-1.5"
                value={quality.id}
                onChange={(e) => setQuality(e.target.value)}
              >
                {QUALITY_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted block mb-1">Длительность</span>
              <select
                className="rounded-md border border-line bg-paper px-2 py-1.5"
                value={durationSec}
                onChange={(e) => setDuration(Number(e.target.value) as 3 | 5 | 10)}
              >
                {quality.allowedDurations.map((d) => (
                  <option key={d} value={d}>
                    ~{d} с
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted block mb-1">Seed</span>
              <input
                className="w-32 rounded-md border border-line bg-paper px-2 py-1.5"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="авто"
                inputMode="numeric"
              />
            </label>
            <label className="text-sm">
              <span className="text-muted block mb-1">Категория</span>
              <select
                className="rounded-md border border-line bg-paper px-2 py-1.5"
                value={categoryId}
                onChange={(e) =>
                  setCategoryId(e.target.value ? Number(e.target.value) : '')
                }
              >
                <option value="">Без категории</option>
                {cats.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex flex-wrap gap-2">
              <div className="inline-flex items-stretch gap-1">
                <button
                  type="button"
                  disabled={!text || improving}
                  onClick={() => void improve()}
                  className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-line/40 disabled:opacity-50"
                >
                  {improving ? 'Улучшаем…' : 'Улучшить через ИИ'}
                </button>
                <SettingsIconButton onClick={() => setShowTplSettings(true)} />
              </div>
              <button
                type="button"
                disabled={!canSubmit || busy || jobRunning}
                onClick={() => void start()}
                className="rounded-lg bg-accent hover:bg-accent-hover text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
              >
                {busy ? 'Запуск…' : 'Сгенерировать видео'}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted">
            {quality.width}×{quality.height} · ~{durationSec}с ·{' '}
            {framesForDuration(durationSec)} кадров @ {FRAME_RATE} fps ·{' '}
            {quality.description}
          </p>

          {job && <VideoJobCard job={job} />}
        </div>

        <SourcePicker />
      </div>

      {showTplSettings && (
        <ImproveTemplateModal
          kind={`video_${mode}` as ImproveKind}
          onClose={() => setShowTplSettings(false)}
        />
      )}
    </div>
  )
}
