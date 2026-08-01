import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { assistantApi, categoriesApi, generationsApi, imagesApi, promptsApi } from '../api'
import { ApiError } from '../api/client'
import { AuthedImage } from '../components/AuthedImage'
import { useLocalStorageState } from '../lib/storage'
import type { Generation, GenerationStep } from '../types'

const SIZES = ['1K', '2K', '3K', '4K'] as const
const RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'] as const

type GenPrefs = {
  size: (typeof SIZES)[number]
  ratio: (typeof RATIOS)[number]
  auto_review: boolean
}

const DEFAULT_GEN_PREFS: GenPrefs = { size: '1K', ratio: '1:1', auto_review: false }

function isSize(v: string): v is GenPrefs['size'] {
  return (SIZES as readonly string[]).includes(v)
}
function isRatio(v: string): v is GenPrefs['ratio'] {
  return (RATIOS as readonly string[]).includes(v)
}

function actionLabel(action: string): string {
  if (action === 'fix_i2i') return 'правка (i2i)'
  if (action === 'fix_regen') return 'регенерация'
  return 'генерация'
}

function stepStatusLabel(step: GenerationStep, isLatest: boolean, jobRunning: boolean): string {
  if (step.error && !step.image_id) return 'ошибка генерации'
  if (step.image_id && step.review_score == null && !step.finished_at && jobRunning && isLatest) {
    return 'проверка качества…'
  }
  if (step.image_id && step.review_score == null && step.error?.startsWith('review failed')) {
    return 'ревью недоступно'
  }
  if (step.review_score != null) {
    return step.review_passed ? 'принято' : 'нужна правка'
  }
  if (!step.image_id && jobRunning && isLatest) return 'генерация…'
  return 'готово'
}

export function GeneratePage() {
  const [params] = useSearchParams()
  const editId = params.get('edit') ? Number(params.get('edit')) : null
  const qc = useQueryClient()

  const [promptId, setPromptId] = useState<number | ''>('')
  const [text, setText] = useState('')
  const [refs, setRefs] = useState<number[]>([])
  const [genPrefs, setGenPrefs] = useLocalStorageState<GenPrefs>(
    'mm-gen-prefs',
    DEFAULT_GEN_PREFS,
  )
  const size = isSize(genPrefs.size) ? genPrefs.size : DEFAULT_GEN_PREFS.size
  const ratio = isRatio(genPrefs.ratio) ? genPrefs.ratio : DEFAULT_GEN_PREFS.ratio
  const autoReview = Boolean(genPrefs.auto_review)
  const setSize = (v: string) => {
    if (isSize(v)) setGenPrefs((p) => ({ ...p, size: v }))
  }
  const setRatio = (v: string) => {
    if (isRatio(v)) setGenPrefs((p) => ({ ...p, ratio: v }))
  }
  const setAutoReview = (v: boolean) => {
    setGenPrefs((p) => ({ ...p, auto_review: v }))
  }
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [job, setJob] = useState<Generation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [improving, setImproving] = useState(false)

  const cats = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })
  const prompts = useQuery({ queryKey: ['prompts'], queryFn: () => promptsApi.list() })
  const refsList = useQuery({
    queryKey: ['images', 'refs-for-gen'],
    queryFn: () => imagesApi.list({ page_size: 100, sort: 'created_at', order: 'desc' }),
  })
  const parentImage = useQuery({
    queryKey: ['image', editId],
    queryFn: () => imagesApi.get(editId!),
    enabled: editId != null,
  })

  const selectedPrompt = useMemo(
    () => prompts.data?.find((p) => p.id === promptId) ?? null,
    [prompts.data, promptId],
  )
  const needsRef = selectedPrompt?.mode === 'i2i'
  const hasReference = refs.length > 0 || editId != null

  useEffect(() => {
    if (selectedPrompt?.current_version) {
      setText(selectedPrompt.current_version.text)
      setCategoryId(selectedPrompt.category_id)
    }
  }, [selectedPrompt])

  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') return
    const t = setInterval(() => {
      void generationsApi.get(job.id).then((j) => {
        setJob(j)
        if (j.status === 'done') void qc.invalidateQueries({ queryKey: ['images'] })
      })
    }, 2000)
    return () => clearInterval(t)
  }, [job, qc])

  function toggleRef(id: number) {
    setRefs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function improve() {
    setImproving(true)
    setError(null)
    try {
      const catName = cats.data?.find((c) => c.id === categoryId)?.name
      const { improved_text } = await assistantApi.improve(text, catName)
      setText(improved_text)
      if (selectedPrompt != null) {
        await promptsApi.addVersion(selectedPrompt.id, improved_text, 'assistant')
        void qc.invalidateQueries({ queryKey: ['prompts'] })
      }
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
      const body = {
        mode: editId ? ('edit' as const) : ('generate' as const),
        text,
        prompt_version_id: selectedPrompt?.current_version?.id ?? null,
        reference_image_ids: refs,
        parent_image_id: editId,
        size,
        ratio,
        category_id: categoryId === '' ? null : categoryId,
        auto_review: autoReview,
      }
      const j = await generationsApi.create(body)
      setJob(j)
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Ошибка запуска')
    } finally {
      setBusy(false)
    }
  }

  const resultImage = refsList.data?.items.find((i) => i.id === job?.result_image_id)
  const jobRunning = job?.status === 'pending' || job?.status === 'running'
  const steps = job?.steps ?? []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">
          {editId ? 'Редактирование изображения' : 'Генерация'}
        </h1>
        <p className="text-sm text-muted mt-1">
          Agnes Image 2.1 Flash · t2i — без референса, i2i — обязательно с референсом
        </p>
      </div>

      {editId && parentImage.data && (
        <div className="flex items-center gap-4 bg-card border border-line rounded-xl p-3">
          <AuthedImage
            src={parentImage.data.thumb_url}
            alt="parent"
            className="w-20 h-20 object-cover rounded-lg"
          />
          <div className="text-sm">
            <div className="font-medium">Исходное изображение #{editId}</div>
            <div className="text-muted">Будет передано как вход для image-to-image</div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-bad/10 text-bad text-sm px-3 py-2">{error}</div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm block">
              <span className="text-muted">Промпт из библиотеки</span>
              <select
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2"
                value={promptId}
                onChange={(e) =>
                  setPromptId(e.target.value ? Number(e.target.value) : '')
                }
              >
                <option value="">— свой текст —</option>
                {prompts.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · {p.mode === 'i2i' ? 'i2i' : 't2i'}
                  </option>
                ))}
              </select>
              {needsRef && (
                <span className="block mt-1 text-xs text-muted">
                  Этот промпт работает по референсу (image-to-image)
                </span>
              )}
            </label>
            <label className="text-sm block">
              <span className="text-muted">Категория результата</span>
              <select
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2"
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
          </div>

          <label className="text-sm block">
            <span className="text-muted">Промпт</span>
            <textarea
              className="mt-1 w-full min-h-[140px] rounded-lg border border-line bg-card px-3 py-2"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Опишите сцену, стиль, освещение…"
            />
          </label>

          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-sm">
              <span className="text-muted block mb-1">Size</span>
              <select
                className="rounded-md border border-line bg-paper px-2 py-1.5"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              >
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted block mb-1">Ratio</span>
              <select
                className="rounded-md border border-line bg-paper px-2 py-1.5"
                value={ratio}
                onChange={(e) => setRatio(e.target.value)}
              >
                {RATIOS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm flex items-center gap-2 pb-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-line"
                checked={autoReview}
                onChange={(e) => setAutoReview(e.target.checked)}
              />
              <span>
                Автопроверка и исправление
                <span className="block text-xs text-muted">
                  до ~3× дольше · оценка качества + автоправка
                </span>
              </span>
            </label>
            <div className="ml-auto self-end flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!text || improving}
                onClick={() => void improve()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm hover:bg-line/40 disabled:opacity-50"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z" />
                  <path d="m14 7 3 3" />
                  <path d="M5 6v4" />
                  <path d="M19 14v4" />
                  <path d="M10 2v2" />
                  <path d="M7 8H3" />
                  <path d="M21 16h-4" />
                  <path d="M11 3H9" />
                </svg>
                {improving ? 'Улучшаем…' : 'Улучшить промпт'}
              </button>
              <button
                type="button"
                disabled={
                  !text ||
                  busy ||
                  (needsRef && !hasReference) ||
                  job?.status === 'pending' ||
                  job?.status === 'running'
                }
                onClick={() => void start()}
                className="rounded-lg bg-accent hover:bg-accent-hover text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
              >
                {busy ? 'Запуск…' : editId ? 'Редактировать' : 'Сгенерировать'}
              </button>
            </div>
          </div>

          {job && (
            <div className="rounded-xl border border-line bg-card p-4 space-y-3">
              <div className="flex items-center justify-between text-sm gap-3 flex-wrap">
                <span>
                  Задача #{job.id}:{' '}
                  <strong>
                    {job.status === 'pending' && 'в очереди'}
                    {job.status === 'running' &&
                      (job.auto_review ? 'автопайплайн…' : 'генерация…')}
                    {job.status === 'done' && 'готово'}
                    {job.status === 'error' && 'ошибка'}
                  </strong>
                </span>
                {jobRunning && (
                  <span className="text-muted animate-pulse">
                    {job.auto_review
                      ? 'авто-режим: до нескольких минут × число попыток'
                      : 'ожидайте до нескольких минут'}
                  </span>
                )}
                {job.status === 'done' && job.auto_review && (
                  <span
                    className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                      job.review_passed
                        ? 'bg-accent/15 text-accent'
                        : 'bg-bad/10 text-bad'
                    }`}
                  >
                    {job.review_score != null ? `оценка ${job.review_score}/10` : 'без оценки'}
                    {job.review_passed === false && ' · качество не подтверждено'}
                    {job.review_passed === true && ' · принято'}
                  </span>
                )}
              </div>
              {job.error && <div className="text-bad text-sm">{job.error}</div>}

              {job.auto_review && steps.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted uppercase tracking-wide">
                    Попытки
                  </div>
                  <ol className="space-y-2">
                    {steps.map((step, idx) => {
                      const isLatest = idx === steps.length - 1
                      return (
                        <li
                          key={step.id}
                          className="flex gap-3 items-start rounded-lg border border-line bg-paper/60 p-2"
                        >
                          {step.thumb_url ? (
                            <AuthedImage
                              src={step.thumb_url}
                              alt={`attempt-${step.attempt}`}
                              className="w-14 h-14 rounded object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded bg-line/40 shrink-0 animate-pulse" />
                          )}
                          <div className="min-w-0 flex-1 text-sm">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-medium">
                                Попытка {step.attempt} · {actionLabel(step.action)}
                              </span>
                              <span className="text-muted">
                                {stepStatusLabel(step, isLatest, Boolean(jobRunning))}
                              </span>
                              {step.review_score != null && (
                                <span className="text-xs rounded bg-card border border-line px-1.5">
                                  {step.review_score}/10
                                </span>
                              )}
                              {step.review_fix_mode && step.review_passed === false && (
                                <span className="text-xs text-muted">
                                  → {step.review_fix_mode === 'regen' ? 'regen' : 'i2i'}
                                </span>
                              )}
                            </div>
                            {step.review_issues?.length > 0 && (
                              <ul className="mt-1 text-xs text-muted list-disc pl-4 space-y-0.5">
                                {step.review_issues.map((issue, i) => (
                                  <li key={i}>
                                    <span
                                      className={
                                        issue.severity === 'major' ? 'text-bad' : undefined
                                      }
                                    >
                                      {issue.description || issue.type}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {step.error && (
                              <div className="mt-1 text-xs text-bad">{step.error}</div>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              )}

              {job.status === 'done' && job.result_image_id && (
                <div className="space-y-2">
                  {resultImage ? (
                    <AuthedImage
                      src={resultImage.file_url}
                      alt="result"
                      className="max-h-96 rounded-lg object-contain mx-auto"
                    />
                  ) : (
                    <AuthedImage
                      src={`/api/images/${job.result_image_id}/file`}
                      alt="result"
                      className="max-h-96 rounded-lg object-contain mx-auto"
                    />
                  )}
                  <Link to="/" className="text-sm text-accent hover:underline inline-block">
                    Открыть в медиа-менеджере →
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        <aside
          className={`bg-card border rounded-xl p-3 space-y-3 ${
            needsRef && !hasReference ? 'border-bad/60' : 'border-line'
          }`}
        >
          <div>
            <div className="font-medium text-sm">Референсы</div>
            <p className="text-xs text-muted mt-0.5">
              Выберите изображения (человек, сумка, очки…)
            </p>
            {needsRef && !hasReference && (
              <p className="text-xs text-bad mt-1">
                Для этого промпта нужен референс — выберите изображение
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-auto">
            {refsList.data?.items.map((img) => {
              const on = refs.includes(img.id)
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => toggleRef(img.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                    on ? 'border-accent' : 'border-transparent'
                  }`}
                >
                  <AuthedImage
                    src={img.thumb_url}
                    alt={`ref-${img.id}`}
                    className="w-full h-full object-cover"
                  />
                  {on && (
                    <span className="absolute top-1 right-1 bg-accent text-white text-[10px] rounded px-1">
                      {refs.indexOf(img.id) + 1}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {!refsList.data?.items.length && (
            <div className="text-xs text-muted">
              Нет изображений.{' '}
              <Link to="/" className="text-accent hover:underline">
                Загрузите референс
              </Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
