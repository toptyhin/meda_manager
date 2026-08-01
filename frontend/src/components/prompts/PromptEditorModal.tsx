import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assistantApi, categoriesApi, promptsApi } from '../../api'
import { ApiError } from '../../api/client'
import { ImproveTemplateModal } from '../ImproveTemplateModal'
import { Modal } from '../Modal'
import { SettingsIconButton } from '../SettingsIconButton'
import { StylePresetPicker } from '../StylePresetPicker'
import type { Prompt, PromptMode } from '../../types'

type Props = {
  promptId: number | null
  onClose: () => void
  onCreated: (id: number) => void
}

export function PromptEditorModal({ promptId, onClose, onCreated }: Props) {
  const qc = useQueryClient()
  const closeRef = useRef(onClose)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [mode, setMode] = useState<PromptMode>('t2i')
  const [error, setError] = useState<string | null>(null)
  const [improving, setImproving] = useState(false)
  const [showTplSettings, setShowTplSettings] = useState(false)

  const cats = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })
  const prompts = useQuery({ queryKey: ['prompts'], queryFn: () => promptsApi.list() })
  const selected = prompts.data?.find((p) => p.id === promptId) ?? null
  const versions = useQuery({
    queryKey: ['prompt-versions', promptId],
    queryFn: () =>
      promptId != null ? promptsApi.versions(promptId) : Promise.resolve([]),
    enabled: promptId != null,
  })

  const effectiveCategoryId =
    categoryId !== '' ? categoryId : (cats.data?.[0]?.id ?? '')

  useEffect(() => {
    if (selected) {
      setTitle(selected.title)
      setText(selected.current_version?.text ?? '')
      setCategoryId(selected.category_id)
      setMode(selected.mode)
    }
  }, [selected])

  const createPrompt = useMutation({
    mutationFn: () =>
      promptsApi.create({
        title: title || 'Без названия',
        category_id: Number(effectiveCategoryId),
        text,
        mode,
      }),
    onSuccess: (p: Prompt) => {
      void qc.invalidateQueries({ queryKey: ['prompts'] })
      setError(null)
      onCreated(p.id)
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  const saveVersion = useMutation({
    mutationFn: () => promptsApi.addVersion(promptId ?? 0, text, 'manual'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['prompts'] })
      void qc.invalidateQueries({ queryKey: ['prompt-versions', promptId] })
    },
  })

  const updateMeta = useMutation({
    mutationFn: () =>
      promptsApi.update(promptId ?? 0, {
        title,
        category_id: Number(effectiveCategoryId),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['prompts'] }),
  })

  const deletePrompt = useMutation({
    mutationFn: () => promptsApi.remove(promptId ?? 0),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['prompts'] })
      closeRef.current()
    },
  })

  async function improve() {
    setImproving(true)
    setError(null)
    try {
      const catName = cats.data?.find((c) => c.id === effectiveCategoryId)?.name
      const { improved_text } = await assistantApi.improve(text, catName)
      setText(improved_text)
      if (promptId != null) {
        await promptsApi.addVersion(promptId, improved_text, 'assistant')
        void qc.invalidateQueries({ queryKey: ['prompts'] })
        void qc.invalidateQueries({ queryKey: ['prompt-versions', promptId] })
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Не удалось улучшить промпт')
    } finally {
      setImproving(false)
    }
  }

  async function saveAll() {
    try {
      await updateMeta.mutateAsync()
      saveVersion.mutate()
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Не удалось сохранить')
    }
  }

  return (
    <Modal
      onClose={onClose}
      label={promptId ? 'Редактор промпта' : 'Новый промпт'}
      className="max-w-3xl"
    >
      {(close) => {
        closeRef.current = close
        return (
      <>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {promptId ? 'Редактор промпта' : 'Новый промпт'}
            </h2>
            {selected && (
              <p className="text-xs text-muted mt-1">
                текущая версия v{selected.current_version?.version} ·{' '}
                {selected.mode === 'i2i' ? 'i2i (нужен референс)' : 't2i'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            className="text-muted hover:text-ink text-xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="rounded-md bg-bad/10 text-bad text-sm px-3 py-2">{error}</div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm block">
            <span className="text-muted">Название</span>
            <input
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="text-sm block">
            <span className="text-muted">Категория</span>
            <select
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2"
              value={effectiveCategoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
            >
              {cats.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {!promptId && (
            <label className="text-sm block sm:col-span-2">
              <span className="text-muted">Режим</span>
              <select
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2"
                value={mode}
                onChange={(e) => setMode(e.target.value as PromptMode)}
              >
                <option value="t2i">t2i — текст → изображение</option>
                <option value="i2i">i2i — по референсу (image-to-image)</option>
              </select>
            </label>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm block">
            <span className="text-muted">Текст промпта</span>
            <div className="mt-1">
              <StylePresetPicker kind="image" text={text} onChange={setText} />
            </div>
            <textarea
              className="mt-2 w-full min-h-[180px] rounded-lg border border-line bg-paper px-3 py-2 resize-y"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="На основе референсного изображения человека + сумки…"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {!promptId ? (
            <button
              type="button"
              disabled={!text || !effectiveCategoryId || createPrompt.isPending}
              onClick={() => createPrompt.mutate()}
              className="rounded-lg bg-accent hover:bg-accent-hover text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Создать
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={!text || saveVersion.isPending || updateMeta.isPending}
                onClick={() => void saveAll()}
                className="rounded-lg bg-accent hover:bg-accent-hover text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Сохранить версию
              </button>
              <button
                type="button"
                className="rounded-lg border border-bad/40 text-bad px-4 py-2 text-sm"
                onClick={() => {
                  if (confirm('Удалить промпт?')) deletePrompt.mutate()
                }}
              >
                Удалить
              </button>
            </>
          )}
          <div className="inline-flex items-stretch gap-1">
            <button
              type="button"
              disabled={!text || improving}
              onClick={() => void improve()}
              className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-line/40 disabled:opacity-50"
            >
              {improving ? 'Улучшаем…' : 'Улучшить промпт'}
            </button>
            <SettingsIconButton onClick={() => setShowTplSettings(true)} />
          </div>
        </div>

        {promptId && versions.data && versions.data.length > 0 && (
          <div className="pt-4 border-t border-line">
            <div className="text-sm font-medium mb-2">История версий</div>
            <ul className="space-y-2 max-h-56 overflow-auto">
              {versions.data.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className="w-full text-left rounded-lg border border-line px-3 py-2 text-sm hover:bg-line/20"
                    onClick={() => setText(v.text)}
                  >
                    <div className="flex justify-between text-xs text-muted mb-1">
                      <span>
                        v{v.version} ·{' '}
                        {v.source === 'assistant' ? 'ассистент' : 'вручную'}
                      </span>
                      <span>{new Date(v.created_at).toLocaleString('ru-RU')}</span>
                    </div>
                    <div className="line-clamp-2">{v.text}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!cats.data?.length && (
          <div className="text-sm text-muted border border-dashed border-line rounded-lg p-4">
            Сначала создайте категорию (кнопка настроек в правом верхнем углу)
          </div>
        )}
      </div>
      {showTplSettings && (
        <ImproveTemplateModal kind="image" onClose={() => setShowTplSettings(false)} />
      )}
      </>
        )
      }}
    </Modal>
  )
}
