import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { assistantApi, type ImagePromptMode } from '../api/assistant'
import { ApiError, fetchAuthedBlob } from '../api/client'
import {
  generationsApi,
  IMAGE_RATIOS,
  IMAGE_SIZES,
  type Generation,
  type ImageRatio,
  type ImageSize,
} from '../api/generations'
import { imagesApi } from '../api/images'
import { limitsApi } from '../api/limits'
import { AuthedImage } from '../components/AuthedImage'
import { haptic, hapticNotify } from '../twa/telegram'

type Step = 'pick' | 'form'

const STATUS_TEXT: Record<Generation['status'], string> = {
  pending: 'В очереди…',
  running: 'Генерируем изображение…',
  done: 'Готово',
  error: 'Ошибка генерации',
}

const SIZE_CAPTIONS: Record<ImageSize, string> = {
  '1K': 'быстро',
  '2K': 'баланс',
  '3K': 'детально',
  '4K': 'максимум',
}

function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}

function IconSparkles() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z" />
      <path d="M19 14l.9 2.1 2.1.9-2.1.9L19 20l-.9-2.1-2.1-.9 2.1-.9L19 14z" />
    </svg>
  )
}

function IconText() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7V5h16v2" />
      <path d="M12 5v14" />
      <path d="M8 19h8" />
    </svg>
  )
}

function IconPhoto() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="m21 15-4.2-4.2a1.5 1.5 0 0 0-2.1 0L6 19.5" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4v12m0 0-4.5-4.5M12 16l4.5-4.5" />
      <path d="M4 20h16" />
    </svg>
  )
}

function IconChevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic()
        onClick()
      }}
      className={`rounded-xl border px-2 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line bg-card text-muted'
      }`}
    >
      {children}
    </button>
  )
}

function errMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.detail : fallback
}

export function CreatePhotoPage() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const promptAreaRef = useRef<HTMLTextAreaElement>(null)

  const [step, setStep] = useState<Step>('pick')
  const [mode, setMode] = useState<ImagePromptMode>('t2i')
  const [prompt, setPrompt] = useState('')
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [ratio, setRatio] = useState<ImageRatio>('1:1')
  const [size, setSize] = useState<ImageSize>('1K')
  const [refImageId, setRefImageId] = useState<number | null>(null)
  const [refPreviewUrl, setRefPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestIntent, setSuggestIntent] = useState<string | null>(null)
  const [intentPickerOpen, setIntentPickerOpen] = useState(false)
  const [improving, setImproving] = useState(false)
  const [jobId, setJobId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const hasPrompt = prompt.trim().length > 0
  const promptPlaceholder =
    mode === 'i2i'
      ? 'Например: сделай вечерний свет, фон — городской закат, сохрани лицо'
      : 'Например: рыжий кот в скафандре на фоне Марса, кинематографичный свет'
  const canSubmit =
    hasPrompt &&
    !submitting &&
    !uploading &&
    (mode === 't2i' || refImageId !== null)

  const quotaQuery = useQuery({ queryKey: ['limits-me'], queryFn: limitsApi.me })
  const intentsQuery = useQuery({
    queryKey: ['suggest-intents'],
    queryFn: assistantApi.listSuggestIntents,
    staleTime: 5 * 60_000,
  })
  const suggestIntents = intentsQuery.data ?? []
  const imageQuota =
    quotaQuery.data?.enforcement_enabled
      ? quotaQuery.data.resources.find((r) => r.resource_kind === 'image')
      : undefined

  const jobQuery = useQuery({
    queryKey: ['generation', jobId],
    queryFn: () => generationsApi.get(jobId as number),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'done' || s === 'error' ? false : 2000
    },
  })
  const job = jobQuery.data ?? null

  useEffect(() => {
    if (job?.status === 'done') {
      hapticNotify('success')
      void qc.invalidateQueries({ queryKey: ['limits-me'] })
    } else if (job?.status === 'error') {
      hapticNotify('error')
    }
  }, [job?.status, qc])

  useEffect(() => {
    return () => {
      if (refPreviewUrl) URL.revokeObjectURL(refPreviewUrl)
    }
  }, [refPreviewUrl])

  useLayoutEffect(() => {
    if (!editingPrompt) return
    const el = promptAreaRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editingPrompt])

  useLayoutEffect(() => {
    const el = promptAreaRef.current
    if (!editingPrompt || !el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [editingPrompt, prompt])

  function pickMode(next: ImagePromptMode) {
    haptic('medium')
    setMode(next)
    setStep('form')
    setEditingPrompt(false)
    setFormError(null)
    setJobId(null)
  }

  function goBack() {
    haptic()
    if (intentPickerOpen) {
      setIntentPickerOpen(false)
      return
    }
    setEditingPrompt(false)
    if (jobId !== null) {
      setJobId(null)
      setFormError(null)
      return
    }
    if (step === 'form') {
      setStep('pick')
      setFormError(null)
      return
    }
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setFormError(null)
    if (refPreviewUrl) URL.revokeObjectURL(refPreviewUrl)
    setRefPreviewUrl(URL.createObjectURL(file))
    try {
      const img = await imagesApi.upload(file)
      setRefImageId(img.id)
      hapticNotify('success')
    } catch (e) {
      setRefImageId(null)
      setFormError(errMessage(e, 'Не удалось загрузить фото'))
      hapticNotify('error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function openSuggest() {
    if (suggesting || improving) return
    haptic()
    if (suggestIntents.length === 0) {
      void runSuggest(null)
      return
    }
    setIntentPickerOpen(true)
  }

  async function runSuggest(intent: string | null) {
    if (suggesting || improving) return
    setSuggestIntent(intent)
    setIntentPickerOpen(false)
    setSuggesting(true)
    setFormError(null)
    try {
      const { text } = await assistantApi.suggest(prompt.trim(), mode, intent)
      setPrompt(text)
      hapticNotify('success')
    } catch (e) {
      setFormError(errMessage(e, 'Не удалось придумать промпт'))
      hapticNotify('error')
    } finally {
      setSuggesting(false)
    }
  }

  async function improve() {
    if (!hasPrompt || suggesting || improving) return
    setImproving(true)
    setFormError(null)
    haptic()
    try {
      const { improved_text } = await assistantApi.improve(prompt.trim(), mode)
      setPrompt(improved_text)
      hapticNotify('success')
    } catch (e) {
      setFormError(errMessage(e, 'Не удалось улучшить промпт'))
      hapticNotify('error')
    } finally {
      setImproving(false)
    }
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setFormError(null)
    haptic('medium')
    try {
      const created = await generationsApi.create({
        text: prompt.trim(),
        size,
        ratio,
        mode: 'generate',
        reference_image_ids: mode === 'i2i' && refImageId !== null ? [refImageId] : [],
      })
      setJobId(created.id)
    } catch (e) {
      setFormError(errMessage(e, 'Не удалось запустить генерацию. Попробуйте ещё раз.'))
      hapticNotify('error')
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    haptic()
    setJobId(null)
    setFormError(null)
  }

  async function download(imageId: number) {
    if (downloading) return
    setDownloading(true)
    try {
      const blob = await fetchAuthedBlob(`/api/images/${imageId}/file`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `generation-${imageId}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      hapticNotify('error')
    } finally {
      setDownloading(false)
    }
  }

  const aspectRatio = ratio.replace(':', ' / ')
  const title =
    step === 'pick'
      ? 'Новое изображение'
      : mode === 'i2i'
        ? 'По моей фото'
        : 'По тексту'

  // На шаге выбора — на /create; на форме — к выбору режима (или к форме с джобой).
  const showLinkBack = step === 'pick'

  return (
    <div className="flex flex-col gap-4 anim-fade-up">
      <header className="flex items-center gap-2">
        {showLinkBack ? (
          <Link
            to="/create"
            onClick={() => haptic()}
            aria-label="Назад"
            className="inline-flex items-center justify-center size-9 rounded-xl border border-line bg-card text-muted active:scale-95 transition-transform"
          >
            <IconBack />
          </Link>
        ) : (
          <button
            type="button"
            onClick={goBack}
            aria-label="Назад"
            className="inline-flex items-center justify-center size-9 rounded-xl border border-line bg-card text-muted active:scale-95 transition-transform"
          >
            <IconBack />
          </button>
        )}
        <h1 className="flex-1 text-lg font-bold tracking-tight">{title}</h1>
        {imageQuota && imageQuota.remaining !== null && (
          <span className="rounded-full bg-accent-soft text-accent text-xs font-semibold px-2.5 py-1">
            Осталось: {imageQuota.remaining}
          </span>
        )}
      </header>

      {step === 'pick' && (
        <div className="flex flex-col gap-2.5">
          <p className="text-sm text-muted px-0.5">Как создаём изображение?</p>
          <button
            type="button"
            onClick={() => pickMode('t2i')}
            className="group flex items-center gap-3.5 rounded-2xl border border-line bg-card p-4 text-left active:scale-[0.98] transition-transform"
          >
            <span className="inline-flex shrink-0 items-center justify-center size-12 rounded-xl bg-gradient-to-br from-grad-from via-grad-via to-grad-to text-white shadow-md">
              <IconText />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-base font-semibold">Изображение по тексту</span>
              <span className="block text-xs text-muted mt-0.5 leading-snug">
                Опишите идею — модель нарисует с нуля
              </span>
            </span>
            <span className="text-muted/60">
              <IconChevron />
            </span>
          </button>
          <button
            type="button"
            onClick={() => pickMode('i2i')}
            className="group flex items-center gap-3.5 rounded-2xl border border-line bg-card p-4 text-left active:scale-[0.98] transition-transform"
          >
            <span className="inline-flex shrink-0 items-center justify-center size-12 rounded-xl bg-accent-soft text-accent">
              <IconPhoto />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-base font-semibold">Изображение по моей фото</span>
              <span className="block text-xs text-muted mt-0.5 leading-snug">
                Загрузите снимок и опишите, что изменить
              </span>
            </span>
            <span className="text-muted/60">
              <IconChevron />
            </span>
          </button>
        </div>
      )}

      {step === 'form' && jobId === null && (
        <div className="flex flex-col gap-4">
          {mode === 'i2i' && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Ваше фото</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
              {refPreviewUrl || refImageId !== null ? (
                <div className="relative overflow-hidden rounded-2xl border border-line bg-card">
                  {refPreviewUrl ? (
                    <img src={refPreviewUrl} alt="" className="w-full max-h-56 object-cover" />
                  ) : (
                    <AuthedImage
                      src={`/api/images/${refImageId}/file`}
                      alt=""
                      className="w-full max-h-56 object-cover"
                    />
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex gap-2 p-2 bg-gradient-to-t from-black/50 to-transparent">
                    <button
                      type="button"
                      onClick={() => {
                        haptic()
                        fileInputRef.current?.click()
                      }}
                      disabled={uploading}
                      className="rounded-xl bg-white/90 text-[#4a2a80] text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
                    >
                      {uploading ? 'Загрузка…' : 'Заменить'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        haptic()
                        if (refPreviewUrl) URL.revokeObjectURL(refPreviewUrl)
                        setRefPreviewUrl(null)
                        setRefImageId(null)
                      }}
                      disabled={uploading}
                      className="rounded-xl bg-white/20 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
                    >
                      Убрать
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    haptic()
                    fileInputRef.current?.click()
                  }}
                  disabled={uploading}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-card/60 px-4 py-8 text-sm text-muted active:scale-[0.99] transition disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Spinner className="size-5" />
                      Загружаем…
                    </>
                  ) : (
                    <>
                      <IconPhoto />
                      Выбрать фото из галереи
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Описание</span>
            {editingPrompt ? (
              <textarea
                ref={promptAreaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onBlur={() => setEditingPrompt(false)}
                rows={4}
                placeholder={promptPlaceholder}
                className="w-full resize-none overflow-hidden rounded-2xl border border-line bg-card px-3.5 py-3 text-sm leading-relaxed placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  haptic()
                  setEditingPrompt(true)
                }}
                className="w-full min-h-[7.25rem] rounded-2xl border border-line bg-card px-3.5 py-3 text-left text-sm leading-relaxed"
              >
                <span
                  className={`block whitespace-pre-wrap ${hasPrompt ? '' : 'text-muted/60'}`}
                >
                  {hasPrompt ? prompt : promptPlaceholder}
                </span>
              </button>
            )}
          </div>

          {suggestIntents.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Настроение</span>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={suggestIntent === null} onClick={() => setSuggestIntent(null)}>
                  Любое
                </Chip>
                {suggestIntents.map((i) => (
                  <Chip
                    key={i.key}
                    active={suggestIntent === i.key}
                    onClick={() => setSuggestIntent(i.key)}
                  >
                    {i.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={openSuggest}
              disabled={suggesting || improving}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2.5 text-sm font-semibold active:scale-[0.98] transition disabled:opacity-50"
            >
              {suggesting ? <Spinner /> : <IconSparkles />}
              Придумай промпт
            </button>
            <button
              type="button"
              onClick={() => void improve()}
              disabled={!hasPrompt || suggesting || improving}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2.5 text-sm font-semibold active:scale-[0.98] transition disabled:opacity-40"
            >
              {improving ? <Spinner /> : null}
              Улучшить промпт
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Соотношение сторон</span>
            <div className="grid grid-cols-4 gap-1.5">
              {IMAGE_RATIOS.map((r) => (
                <Chip key={r} active={ratio === r} onClick={() => setRatio(r)}>
                  {r}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Качество</span>
            <div className="grid grid-cols-4 gap-1.5">
              {IMAGE_SIZES.map((s) => (
                <Chip key={s} active={size === s} onClick={() => setSize(s)}>
                  <span className="block">{s}</span>
                  <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                    {SIZE_CAPTIONS[s]}
                  </span>
                </Chip>
              ))}
            </div>
          </div>

          {formError && (
            <p className="rounded-xl border border-bad/30 bg-bad/10 text-bad px-3.5 py-2.5 text-sm leading-snug">
              {formError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="mt-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-grad-from via-grad-via to-grad-to px-4 py-3.5 text-base font-semibold text-white shadow-lg active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100"
          >
            {submitting ? <Spinner /> : <IconSparkles />}
            {submitting ? 'Запускаем…' : 'Сгенерировать'}
          </button>
        </div>
      )}

      {intentPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-backdrop/45 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-16 anim-fade-up"
          role="dialog"
          aria-modal="true"
          aria-labelledby="intent-picker-title"
          onClick={() => setIntentPickerOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-card p-3.5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3 px-0.5">
              <div>
                <h2 id="intent-picker-title" className="text-base font-semibold">
                  Какое настроение?
                </h2>
                <p className="mt-0.5 text-xs text-muted leading-snug">
                  Выберите, что учесть при генерации промпта
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  haptic()
                  setIntentPickerOpen(false)
                }}
                aria-label="Закрыть"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-muted active:scale-95"
              >
                <IconClose />
              </button>
            </div>
            <div className="flex max-h-[min(60vh,24rem)] flex-col gap-1.5 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  haptic()
                  void runSuggest(null)
                }}
                disabled={suggesting}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold active:scale-[0.99] transition disabled:opacity-50 ${
                  suggestIntent === null
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-paper'
                }`}
              >
                Любое
                <span className={suggestIntent === null ? 'text-accent/60' : 'text-muted/50'}>
                  <IconChevron />
                </span>
              </button>
              {suggestIntents.map((i) => (
                <button
                  key={i.key}
                  type="button"
                  onClick={() => {
                    haptic()
                    void runSuggest(i.key)
                  }}
                  disabled={suggesting}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold active:scale-[0.99] transition disabled:opacity-50 ${
                    suggestIntent === i.key
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-paper'
                  }`}
                >
                  {i.label}
                  <span className={suggestIntent === i.key ? 'text-accent/60' : 'text-muted/50'}>
                    <IconChevron />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 'form' && jobId !== null && (
        <div className="rounded-2xl border border-line bg-card p-3.5">
          <p className="text-xs text-muted leading-snug line-clamp-2 px-0.5">{prompt}</p>

          {job && job.status === 'done' && job.result_image_id !== null ? (
            <>
              <AuthedImage
                src={`/api/images/${job.result_image_id}/file`}
                alt={prompt}
                className="mt-2.5 w-full rounded-xl"
              />
              <div className="mt-2.5 flex items-center gap-2 px-0.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ok">
                  {STATUS_TEXT.done}
                </span>
                {job.review_score !== null && (
                  <span className="rounded-full bg-accent-soft text-accent text-[11px] font-semibold px-2 py-0.5">
                    Оценка: {job.review_score}/10
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void download(job.result_image_id as number)}
                  disabled={downloading}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2.5 text-sm font-semibold active:scale-[0.98] transition disabled:opacity-50"
                >
                  {downloading ? <Spinner /> : <IconDownload />}
                  Скачать
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white active:scale-[0.98] transition"
                >
                  Ещё одно
                </button>
              </div>
            </>
          ) : job && job.status === 'error' ? (
            <>
              <div
                className="mt-2.5 w-full rounded-xl bg-bad/10 border border-bad/30 flex items-center justify-center"
                style={{ aspectRatio }}
              >
                <p className="px-4 text-center text-sm text-bad leading-snug">
                  {job.error ?? STATUS_TEXT.error}
                </p>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="mt-3 w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white active:scale-[0.98] transition"
              >
                Попробовать снова
              </button>
            </>
          ) : (
            <>
              <div
                className="mt-2.5 w-full rounded-xl skeleton"
                style={{ aspectRatio }}
                aria-hidden
              />
              <div className="mt-3 flex items-center gap-2 px-0.5 text-sm text-muted">
                <Spinner />
                {STATUS_TEXT[job?.status ?? 'pending']}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
