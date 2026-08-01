import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  assistantApi,
  categoriesApi,
  imagesApi,
  videoGenerationsApi,
  videosApi,
} from '../api'
import { ApiError } from '../api/client'
import { AuthedImage } from '../components/AuthedImage'
import { AuthedVideo } from '../components/AuthedVideo'
import { useLocalStorageState } from '../lib/storage'
import {
  CAMERA_MOVES,
  FRAME_RATE,
  MODE_LABELS,
  PLATFORM_PRESETS,
  QUALITY_PRESETS,
  appendPhrase,
  composePrompt,
  framesForDuration,
  randomSeed,
  type PromptParts,
} from '../lib/videoPresets'
import type { MediaVideo, VideoGeneration, VideoMode } from '../types'

type VideoPrefs = {
  qualityId: string
  durationSec: 3 | 5 | 10
}

const DEFAULT_PREFS: VideoPrefs = { qualityId: 'social', durationSec: 5 }

const EMPTY_PARTS: PromptParts = {
  subject: '',
  action: '',
  scene: '',
  camera: '',
  lighting: '',
  style: '',
}

export function VideoPage() {
  const qc = useQueryClient()
  const [mode, setMode] = useState<VideoMode>('t2v')
  const [text, setText] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [seed, setSeed] = useState<string>('')
  const [sources, setSources] = useState<number[]>([])
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [prefs, setPrefs] = useLocalStorageState<VideoPrefs>('mm-video-prefs', DEFAULT_PREFS)
  const [showAssistant, setShowAssistant] = useState(false)
  const [parts, setParts] = useState<PromptParts>(EMPTY_PARTS)
  const [job, setJob] = useState<VideoGeneration | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [improving, setImproving] = useState(false)
  const [libraryMode, setLibraryMode] = useState<VideoMode | ''>('')

  const quality =
    QUALITY_PRESETS.find((p) => p.id === prefs.qualityId) ?? QUALITY_PRESETS[0]
  const durationSec = quality.allowedDurations.includes(prefs.durationSec)
    ? prefs.durationSec
    : quality.defaultDurationSec

  const cats = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })
  const images = useQuery({
    queryKey: ['images', 'refs-for-video'],
    queryFn: () => imagesApi.list({ page_size: 100, sort: 'created_at', order: 'desc' }),
  })
  const library = useQuery({
    queryKey: ['videos', libraryMode],
    queryFn: () =>
      videosApi.list({
        mode: libraryMode || undefined,
        page_size: 24,
      }),
  })

  const maxSources = mode === 'i2v' ? 1 : mode === 'keyframes' ? 5 : 0
  const minSources = mode === 'i2v' ? 1 : mode === 'keyframes' ? 2 : 0
  const sourcesOk = sources.length >= minSources && sources.length <= maxSources
  const canSubmit = Boolean(text.trim()) && (mode === 't2v' || sourcesOk)

  useEffect(() => {
    if (mode === 't2v') setSources([])
    else if (mode === 'i2v' && sources.length > 1) setSources((s) => s.slice(0, 1))
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function toggleSource(id: number) {
    setSources((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (mode === 'i2v') return [id]
      if (prev.length >= 5) return prev
      return [...prev, id]
    })
  }

  function applyPlatform(platformId: string) {
    const p = PLATFORM_PRESETS.find((x) => x.id === platformId)
    if (!p) return
    const q = QUALITY_PRESETS.find((x) => x.id === p.qualityId)
    if (q) {
      setPrefs({ qualityId: q.id, durationSec: p.durationSec })
    }
    setParts((prev) => ({ ...prev, style: p.stylePhrase }))
    setText((prev) => appendPhrase(prev, p.stylePhrase))
    setShowAssistant(true)
  }

  function applyCamera(phrase: string) {
    setParts((prev) => ({ ...prev, camera: phrase }))
    setText((prev) => appendPhrase(prev, phrase))
  }

  function applyPartsToPrompt() {
    const composed = composePrompt(parts)
    if (composed) setText(composed)
  }

  async function improve() {
    setImproving(true)
    setError(null)
    try {
      const catName = cats.data?.find((c) => c.id === categoryId)?.name
      const { improved_text } = await assistantApi.improveVideo(text, catName)
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

  function reproduce(video: MediaVideo) {
    setMode(video.mode)
    setText(video.prompt_text)
    setNegativePrompt(video.negative_prompt ?? '')
    setSeed(video.seed != null ? String(video.seed) : '')
    setSources(video.source_image_ids)
    setCategoryId(video.category_id ?? '')
    const match = QUALITY_PRESETS.find(
      (p) => p.width === video.width && p.height === video.height,
    )
    if (match) {
      const sec =
        video.duration <= 4 ? 3 : video.duration <= 7.5 ? 5 : 10
      const allowed = match.allowedDurations.includes(sec as 3 | 5 | 10)
        ? (sec as 3 | 5 | 10)
        : match.defaultDurationSec
      setPrefs({ qualityId: match.id, durationSec: allowed })
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removeVideo(id: number) {
    if (!confirm('Удалить это видео?')) return
    try {
      await videosApi.remove(id)
      void qc.invalidateQueries({ queryKey: ['videos'] })
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Не удалось удалить')
    }
  }

  const resultUrl = useMemo(() => {
    if (job?.status === 'done' && job.result_video_id) {
      return `/api/videos/${job.result_video_id}/file`
    }
    return null
  }, [job])

  const jobRunning = job?.status === 'pending' || job?.status === 'running'

  const modes: { id: VideoMode; title: string; hint: string }[] = [
    { id: 'i2v', title: 'Оживлятор', hint: 'Фото → короткое анимированное видео' },
    { id: 't2v', title: 'Режиссёр', hint: 'Текст → готовый ролик' },
    {
      id: 'keyframes',
      title: 'Сторимейкер',
      hint: 'Несколько кадров → связное видео с переходами',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Видео</h1>
        <p className="text-sm text-muted mt-1">
          Agnes Video V2.0 · Оживлятор · Режиссёр · Сторимейкер
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-bad/10 text-bad text-sm px-3 py-2">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {modes.map((m) => (
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
          <div className="rounded-xl border border-line bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="font-medium text-sm">Креативный ассистент</div>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORM_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPlatform(p.id)}
                    className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-line/40"
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowAssistant((v) => !v)}
                  className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-line/40"
                >
                  {showAssistant ? 'Скрыть шаблон' : 'Шаблон промпта'}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted">
              Шаблон: [Субъект] + [Действие] + [Сцена] + [Движение камеры] + [Освещение] +
              [Стиль]
            </p>
            {showAssistant && (
              <div className="grid sm:grid-cols-2 gap-2">
                {(
                  [
                    ['subject', 'Субъект'],
                    ['action', 'Действие'],
                    ['scene', 'Сцена'],
                    ['camera', 'Движение камеры'],
                    ['lighting', 'Освещение'],
                    ['style', 'Стиль'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="text-xs block">
                    <span className="text-muted">{label}</span>
                    <input
                      className="mt-0.5 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
                      value={parts[key]}
                      onChange={(e) => setParts((p) => ({ ...p, [key]: e.target.value }))}
                    />
                  </label>
                ))}
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={applyPartsToPrompt}
                    className="rounded-md bg-ink text-paper px-3 py-1.5 text-xs"
                  >
                    Собрать промпт из шаблона
                  </button>
                </div>
              </div>
            )}
          </div>

          <label className="text-sm block">
            <span className="text-muted">Промпт</span>
            <textarea
              className="mt-1 w-full min-h-[120px] rounded-lg border border-line bg-card px-3 py-2"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                mode === 'i2v'
                  ? 'Опишите движение: что оживает, что остаётся стабильным…'
                  : mode === 'keyframes'
                    ? 'Опишите переход между ключевыми кадрами…'
                    : 'Опишите сцену: субъект, действие, камера, свет, стиль…'
              }
            />
          </label>

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
                onChange={(e) => {
                  const q = QUALITY_PRESETS.find((p) => p.id === e.target.value)
                  if (!q) return
                  setPrefs({
                    qualityId: q.id,
                    durationSec: q.allowedDurations.includes(durationSec)
                      ? durationSec
                      : q.defaultDurationSec,
                  })
                }}
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
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    durationSec: Number(e.target.value) as 3 | 5 | 10,
                  }))
                }
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
              <button
                type="button"
                disabled={!text || improving}
                onClick={() => void improve()}
                className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-line/40 disabled:opacity-50"
              >
                {improving ? 'Улучшаем…' : 'Улучшить через ИИ'}
              </button>
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
            {quality.width}×{quality.height} · ~{durationSec}с · {framesForDuration(durationSec)}{' '}
            кадров @ {FRAME_RATE} fps · {quality.description}
          </p>

          {job && (
            <div className="rounded-xl border border-line bg-card p-4 space-y-3">
              <div className="flex items-center justify-between text-sm gap-3 flex-wrap">
                <span>
                  Задача #{job.id} · {MODE_LABELS[job.mode]}:{' '}
                  <strong>
                    {job.status === 'pending' && 'в очереди'}
                    {job.status === 'running' && 'генерация…'}
                    {job.status === 'done' && 'готово'}
                    {job.status === 'error' && 'ошибка'}
                  </strong>
                </span>
                {jobRunning && (
                  <span className="text-muted">{job.progress}%</span>
                )}
              </div>
              {jobRunning && (
                <div className="h-2 rounded-full bg-line overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-500"
                    style={{ width: `${Math.max(job.progress, 4)}%` }}
                  />
                </div>
              )}
              {job.error && <div className="text-bad text-sm">{job.error}</div>}
              {resultUrl && (
                <AuthedVideo
                  src={resultUrl}
                  className="w-full max-h-[480px] rounded-lg bg-ink/5"
                />
              )}
            </div>
          )}
        </div>

        {mode !== 't2v' && (
          <aside
            className={`bg-card border rounded-xl p-3 space-y-3 ${
              !sourcesOk ? 'border-bad/60' : 'border-line'
            }`}
          >
            <div>
              <div className="font-medium text-sm">
                {mode === 'i2v' ? 'Исходное фото' : 'Ключевые кадры'}
              </div>
              <p className="text-xs text-muted mt-0.5">
                {mode === 'i2v'
                  ? 'Выберите одно изображение'
                  : 'Выберите 2–5 изображений. Порядок = порядок кадров'}
              </p>
              {!sourcesOk && (
                <p className="text-xs text-bad mt-1">
                  Нужно {mode === 'i2v' ? '1' : 'от 2 до 5'} изображений
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-auto">
              {images.data?.items.map((img) => {
                const on = sources.includes(img.id)
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => toggleSource(img.id)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                      on ? 'border-accent' : 'border-transparent'
                    }`}
                  >
                    <AuthedImage
                      src={img.thumb_url}
                      alt={`src-${img.id}`}
                      className="w-full h-full object-cover"
                    />
                    {on && (
                      <span className="absolute top-1 right-1 bg-accent text-white text-[10px] rounded px-1">
                        {sources.indexOf(img.id) + 1}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {!images.data?.items.length && (
              <div className="text-xs text-muted">
                Нет изображений.{' '}
                <Link to="/" className="text-accent hover:underline">
                  Загрузите в Медиа
                </Link>
              </div>
            )}
          </aside>
        )}
      </div>

      <section className="space-y-3 pt-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold">Библиотека видео</h2>
          <select
            className="rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
            value={libraryMode}
            onChange={(e) => setLibraryMode((e.target.value || '') as VideoMode | '')}
          >
            <option value="">Все режимы</option>
            <option value="i2v">Оживлятор</option>
            <option value="t2v">Режиссёр</option>
            <option value="keyframes">Сторимейкер</option>
          </select>
        </div>
        {!library.data?.items.length && (
          <p className="text-sm text-muted">Пока нет сгенерированных видео.</p>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {library.data?.items.map((v) => (
            <article
              key={v.id}
              className="rounded-xl border border-line bg-card overflow-hidden flex flex-col"
            >
              <AuthedVideo
                src={v.file_url}
                className="w-full aspect-video bg-ink/5 object-contain"
              />
              <div className="p-3 space-y-2 text-sm flex-1 flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium rounded-full bg-line/50 px-2 py-0.5">
                    {MODE_LABELS[v.mode]}
                  </span>
                  <span className="text-xs text-muted">
                    {v.width}×{v.height} · ~{v.duration.toFixed(1)}с
                  </span>
                </div>
                <p className="text-xs text-muted line-clamp-3 flex-1">{v.prompt_text}</p>
                {v.seed != null && (
                  <div className="text-[11px] text-muted">seed: {v.seed}</div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => reproduce(v)}
                    className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-line/40"
                  >
                    Воспроизвести
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeVideo(v.id)}
                    className="rounded-md border border-line px-2.5 py-1 text-xs text-bad hover:bg-bad/10"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
