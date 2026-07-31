import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { categoriesApi, generationsApi, imagesApi, promptsApi } from '../api'
import { ApiError } from '../api/client'
import { AuthedImage } from '../components/AuthedImage'
import { useLocalStorageState } from '../lib/storage'
import type { Generation } from '../types'

const SIZES = ['1K', '2K', '3K', '4K'] as const
const RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'] as const

type GenPrefs = {
  size: (typeof SIZES)[number]
  ratio: (typeof RATIOS)[number]
}

const DEFAULT_GEN_PREFS: GenPrefs = { size: '1K', ratio: '1:1' }

function isSize(v: string): v is GenPrefs['size'] {
  return (SIZES as readonly string[]).includes(v)
}
function isRatio(v: string): v is GenPrefs['ratio'] {
  return (RATIOS as readonly string[]).includes(v)
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
  const setSize = (v: string) => {
    if (isSize(v)) setGenPrefs((p) => ({ ...p, size: v }))
  }
  const setRatio = (v: string) => {
    if (isRatio(v)) setGenPrefs((p) => ({ ...p, ratio: v }))
  }
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [job, setJob] = useState<Generation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

          <div className="flex flex-wrap gap-3">
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
            <div className="ml-auto self-end">
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
              <div className="flex items-center justify-between text-sm">
                <span>
                  Задача #{job.id}:{' '}
                  <strong>
                    {job.status === 'pending' && 'в очереди'}
                    {job.status === 'running' && 'генерация…'}
                    {job.status === 'done' && 'готово'}
                    {job.status === 'error' && 'ошибка'}
                  </strong>
                </span>
                {(job.status === 'pending' || job.status === 'running') && (
                  <span className="text-muted animate-pulse">ожидайте до нескольких минут</span>
                )}
              </div>
              {job.error && <div className="text-bad text-sm">{job.error}</div>}
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
