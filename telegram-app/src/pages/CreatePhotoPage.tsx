import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, fetchAuthedBlob } from '../api/client'
import {
  generationsApi,
  IMAGE_RATIOS,
  IMAGE_SIZES,
  type Generation,
  type ImageRatio,
  type ImageSize,
} from '../api/generations'
import { limitsApi } from '../api/limits'
import { AuthedImage } from '../components/AuthedImage'
import { haptic, hapticNotify } from '../twa/telegram'

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

function IconDownload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4v12m0 0-4.5-4.5M12 16l4.5-4.5" />
      <path d="M4 20h16" />
    </svg>
  )
}

function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
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

export function CreatePhotoPage() {
  const qc = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [ratio, setRatio] = useState<ImageRatio>('1:1')
  const [size, setSize] = useState<ImageSize>('1K')
  const [jobId, setJobId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const quotaQuery = useQuery({ queryKey: ['limits-me'], queryFn: limitsApi.me })
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

  async function submit() {
    const text = prompt.trim()
    if (!text || submitting) return
    setSubmitting(true)
    setFormError(null)
    haptic('medium')
    try {
      const created = await generationsApi.create({ text, size, ratio })
      setJobId(created.id)
    } catch (e) {
      setFormError(
        e instanceof ApiError ? e.detail : 'Не удалось запустить генерацию. Попробуйте ещё раз.',
      )
      hapticNotify('error')
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
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

  return (
    <div className="flex flex-col gap-4 anim-fade-up">
      <header className="flex items-center gap-2">
        <Link
          to="/create"
          onClick={() => haptic()}
          aria-label="Назад"
          className="inline-flex items-center justify-center size-9 rounded-xl border border-line bg-card text-muted active:scale-95 transition-transform"
        >
          <IconBack />
        </Link>
        <h1 className="flex-1 text-lg font-bold tracking-tight">Новое изображение</h1>
        {imageQuota && imageQuota.remaining !== null && (
          <span className="rounded-full bg-accent-soft text-accent text-xs font-semibold px-2.5 py-1">
            Осталось: {imageQuota.remaining}
          </span>
        )}
      </header>

      {jobId === null ? (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Описание</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Например: рыжий кот в скафандре на фоне Марса, кинематографичный свет"
              className="w-full resize-none rounded-2xl border border-line bg-card px-3.5 py-3 text-sm leading-relaxed placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </label>

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
            disabled={!prompt.trim() || submitting}
            className="mt-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-grad-from via-grad-via to-grad-to px-4 py-3.5 text-base font-semibold text-white shadow-lg active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100"
          >
            {submitting ? <Spinner /> : <IconSparkles />}
            {submitting ? 'Запускаем…' : 'Сгенерировать'}
          </button>
        </div>
      ) : (
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
                  onClick={reset}
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
                onClick={reset}
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
