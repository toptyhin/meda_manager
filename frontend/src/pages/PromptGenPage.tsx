import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assistantApi, settingsApi } from '../api'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import type { PromptMode } from '../types'

const inputCls =
  'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40'
const monoCls =
  'w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/40'

export function PromptGenPage() {
  const { user, loading } = useAuth()
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [hint, setHint] = useState('')
  const [mode, setMode] = useState<PromptMode>('t2i')
  const [preview, setPreview] = useState('')
  const [error, setError] = useState<string | null>(null)

  const template = useQuery({
    queryKey: ['prompt-gen-template'],
    queryFn: settingsApi.getPromptTemplate,
    enabled: !!user?.is_admin,
  })

  useEffect(() => {
    if (template.data && !dirty) setDraft(template.data.text)
  }, [template.data, dirty])

  const save = useMutation({
    mutationFn: (text: string) => settingsApi.updatePromptTemplate(text),
    onSuccess: async () => {
      setDirty(false)
      setError(null)
      await qc.invalidateQueries({ queryKey: ['prompt-gen-template'] })
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  const reset = useMutation({
    mutationFn: () => settingsApi.resetPromptTemplate(),
    onSuccess: async (data) => {
      setDraft(data.text)
      setDirty(false)
      setError(null)
      await qc.invalidateQueries({ queryKey: ['prompt-gen-template'] })
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  const runPreview = useMutation({
    mutationFn: () =>
      settingsApi.previewPromptTemplate({
        text: dirty ? draft : undefined,
        hint: hint.trim(),
        mode,
      }),
    onSuccess: (data) => {
      setPreview(data.text)
      setError(null)
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  const runUserSuggest = useMutation({
    mutationFn: () => assistantApi.suggest(hint.trim(), mode),
    onSuccess: (data) => {
      setPreview(data.text)
      setError(null)
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  if (loading) return <div className="text-sm text-muted">Загрузка…</div>
  if (!user?.is_admin) return <Navigate to="/" replace />

  const canSave =
    draft.trim().length > 0 &&
    !save.isPending &&
    draft.trim() !== (template.data?.text ?? '').trim()

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Генератор промптов</h1>
        <p className="text-sm text-muted mt-0.5">
          Системный шаблон для кнопки «Придумай промпт» в Telegram Mini App.
          Плейсхолдер <code className="text-xs">{'{mode_label}'}</code> подставляется как
          text-to-image / image-to-image.
          {template.data?.is_default
            ? ' Сейчас — значение по умолчанию из кода.'
            : template.data?.version != null
              ? ` Текущая версия: v${template.data.version}.`
              : ''}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-bad/10 text-bad text-sm px-3 py-2">{error}</div>
      )}
      {template.isError && (
        <div className="rounded-lg bg-bad/10 text-bad text-sm px-3 py-2">
          Не удалось загрузить шаблон
        </div>
      )}

      <section className="rounded-xl border border-line bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Системный промпт</h2>
        <textarea
          aria-label="Текст шаблона"
          className={`${monoCls} min-h-[240px]`}
          rows={14}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setDirty(true)
          }}
          disabled={template.isLoading}
          spellCheck={false}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSave}
            onClick={() => save.mutate(draft.trim())}
            className="rounded-lg bg-accent hover:bg-accent-hover text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {save.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button
            type="button"
            disabled={reset.isPending || template.data?.is_default}
            onClick={() => {
              if (confirm('Сбросить к шаблону по умолчанию? История версий будет удалена.')) {
                reset.mutate()
              }
            }}
            className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-line/40 disabled:opacity-50"
          >
            Сбросить к умолчанию
          </button>
          <button
            type="button"
            disabled={!template.data}
            onClick={() => {
              if (!template.data) return
              setDraft(template.data.default_text)
              setDirty(true)
            }}
            className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-line/40 disabled:opacity-50"
          >
            Подставить дефолт в редактор
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-card p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Плейграунд</h2>
          <p className="text-xs text-muted mt-0.5">
            Проверка шаблона (черновик или сохранённый) и живого эндпоинта Mini App.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['t2i', 'i2i'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 text-xs border transition ${
                mode === m
                  ? 'bg-ink text-paper border-ink'
                  : 'border-line text-muted hover:bg-line/40'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <label className="block space-y-1 text-sm">
          <span className="text-muted">Тема / подсказка (необязательно)</span>
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="например: киберпанк-портрет"
            className={inputCls}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={runPreview.isPending || !draft.trim()}
            onClick={() => runPreview.mutate()}
            className="rounded-lg bg-accent hover:bg-accent-hover text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {runPreview.isPending ? 'Генерируем…' : 'Проверить шаблон'}
          </button>
          <button
            type="button"
            disabled={runUserSuggest.isPending}
            onClick={() => runUserSuggest.mutate()}
            className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-line/40 disabled:opacity-50"
            title="Вызов /api/assistant/suggest — как в Mini App"
          >
            {runUserSuggest.isPending ? 'Генерируем…' : 'Как в Mini App'}
          </button>
        </div>

        {preview && (
          <div className="rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
            {preview}
          </div>
        )}
      </section>
    </div>
  )
}
