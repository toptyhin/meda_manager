import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { assistantApi, categoriesApi, generationsApi, imagesApi, promptsApi } from '../api'
import { ApiError } from '../api/client'
import { AuthedImage } from '../components/AuthedImage'
import { ImproveTemplateModal } from '../components/ImproveTemplateModal'
import { GenerateControls } from '../components/generate/GenerateControls'
import { JobStatusCard } from '../components/generate/JobStatusCard'
import { ReferencePicker } from '../components/generate/ReferencePicker'
import { StylePresetPicker } from '../components/StylePresetPicker'
import {
  DEFAULT_GEN_PREFS,
  isGenRatio,
  isGenSize,
  type GenPrefs,
} from '../lib/genPrefs'
import { useLocalStorageState } from '../lib/storage'
import type { Generation, PromptMode } from '../types'

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
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [job, setJob] = useState<Generation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [improving, setImproving] = useState(false)
  const [describing, setDescribing] = useState(false)
  const [showTplSettings, setShowTplSettings] = useState(false)

  const size = isGenSize(genPrefs.size) ? genPrefs.size : DEFAULT_GEN_PREFS.size
  const ratio = isGenRatio(genPrefs.ratio) ? genPrefs.ratio : DEFAULT_GEN_PREFS.ratio
  const autoReview = Boolean(genPrefs.auto_review)

  const cats = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })
  const prompts = useQuery({ queryKey: ['prompts'], queryFn: () => promptsApi.list() })
  const parentImage = useQuery({
    queryKey: ['image', editId],
    queryFn: () => (editId != null ? imagesApi.get(editId) : Promise.resolve(null)),
    enabled: editId != null,
  })

  const selectedPrompt = useMemo(
    () => prompts.data?.find((p) => p.id === promptId) ?? null,
    [prompts.data, promptId],
  )
  const needsRef = selectedPrompt?.mode === 'i2i'
  const hasReference = refs.length > 0 || editId != null
  const imageMode: PromptMode = needsRef || hasReference ? 'i2i' : 't2i'
  const describeSourceId =
    refs.length === 1 ? refs[0] : editId != null && refs.length === 0 ? editId : null

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
      const { improved_text } = await assistantApi.improve(text, catName, imageMode)
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

  async function describeFromRef() {
    if (describeSourceId == null) return
    setDescribing(true)
    setError(null)
    try {
      const { text: described } = await assistantApi.describeImage(describeSourceId)
      setText(described)
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Не удалось описать изображение')
    } finally {
      setDescribing(false)
    }
  }

  async function start() {
    setBusy(true)
    setError(null)
    setJob(null)
    try {
      const j = await generationsApi.create({
        mode: editId ? 'edit' : 'generate',
        text,
        prompt_version_id: selectedPrompt?.current_version?.id ?? null,
        reference_image_ids: refs,
        parent_image_id: editId,
        size,
        ratio,
        category_id: categoryId === '' ? null : categoryId,
        auto_review: autoReview,
      })
      setJob(j)
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Ошибка запуска')
    } finally {
      setBusy(false)
    }
  }

  const jobRunning = job?.status === 'pending' || job?.status === 'running'

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

          <div className="space-y-2">
            <label className="text-sm block">
              <span className="text-muted">Промпт</span>
              <div className="mt-1">
                <StylePresetPicker kind="image" text={text} onChange={setText} />
              </div>
              <textarea
                className="mt-2 w-full min-h-[140px] rounded-lg border border-line bg-card px-3 py-2"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Опишите сцену, стиль, освещение…"
              />
            </label>
          </div>

          <GenerateControls
            prefs={{ size, ratio, auto_review: autoReview }}
            onChange={(patch) => setGenPrefs((p) => ({ ...p, ...patch }))}
            canImprove={Boolean(text)}
            improving={improving}
            onImprove={() => void improve()}
            onShowTplSettings={() => setShowTplSettings(true)}
            canDescribe={describeSourceId != null}
            describing={describing}
            onDescribe={() => void describeFromRef()}
            submitDisabled={
              (!text.trim() && !hasReference) ||
              (needsRef && !hasReference) ||
              Boolean(jobRunning)
            }
            submitLabel={editId ? 'Редактировать' : 'Сгенерировать'}
            busy={busy}
            onSubmit={() => void start()}
          />

          {job && <JobStatusCard job={job} />}
        </div>

        <ReferencePicker
          refs={refs}
          onToggle={toggleRef}
          needsRef={needsRef}
          hasReference={hasReference}
        />
      </div>
      {showTplSettings && (
        <ImproveTemplateModal
          kind={imageMode === 'i2i' ? 'image_i2i' : 'image_t2i'}
          onClose={() => setShowTplSettings(false)}
        />
      )}
    </div>
  )
}
