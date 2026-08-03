import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assistantApi, settingsApi } from '../api'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import type { PromptGenIntent, PromptMode } from '../types'

const inputCls =
  'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40'
const monoCls =
  'w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/40'
const chipBase =
  'rounded-full px-3 py-1 text-xs border transition cursor-pointer'

function errorText(e: Error): string {
  return e instanceof ApiError ? e.detail : e.message
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type IntentDraft = {
  label: string
  instruction: string
  position: string
}

function toDraft(intent: PromptGenIntent): IntentDraft {
  return {
    label: intent.label,
    instruction: intent.instruction,
    position: String(intent.position),
  }
}

function IntentsSection({ onError }: { onError: (msg: string | null) => void }) {
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<IntentDraft | null>(null)
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newDraft, setNewDraft] = useState<IntentDraft>({
    label: '',
    instruction: '',
    position: '0',
  })

  const intents = useQuery({
    queryKey: ['prompt-gen-intents'],
    queryFn: settingsApi.listPromptGenIntents,
  })

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['prompt-gen-intents'] }),
      qc.invalidateQueries({ queryKey: ['suggest-intents'] }),
    ])
  }

  const update = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number
      body: Parameters<typeof settingsApi.updatePromptGenIntent>[1]
    }) => settingsApi.updatePromptGenIntent(id, body),
    onSuccess: async () => {
      setEditingId(null)
      setDraft(null)
      onError(null)
      await invalidate()
    },
    onError: (e: Error) => onError(errorText(e)),
  })

  const create = useMutation({
    mutationFn: () =>
      settingsApi.createPromptGenIntent({
        key: newKey.trim(),
        label: newDraft.label.trim(),
        instruction: newDraft.instruction.trim(),
        position: Number.parseInt(newDraft.position, 10) || 0,
      }),
    onSuccess: async () => {
      setAdding(false)
      setNewKey('')
      setNewDraft({ label: '', instruction: '', position: '0' })
      onError(null)
      await invalidate()
    },
    onError: (e: Error) => onError(errorText(e)),
  })

  const remove = useMutation({
    mutationFn: (id: number) => settingsApi.deletePromptGenIntent(id),
    onSuccess: async () => {
      onError(null)
      await invalidate()
    },
    onError: (e: Error) => onError(errorText(e)),
  })

  const items = intents.data ?? []
  const canCreate =
    newKey.trim().length > 0 &&
    newDraft.label.trim().length > 0 &&
    newDraft.instruction.trim().length > 0 &&
    !create.isPending

  return (
    <section className="rounded-xl border border-line bg-card p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Интенты</h2>
        <p className="text-xs text-muted mt-0.5">
          Настроения, которые пользователь выбирает при запуске «Придумай промпт».
          Инструкция подставляется в системный промпт через плейсхолдер{' '}
          <code className="text-xs">{'{intent_instruction}'}</code> (или дописывается
          в конец шаблона). Пишите инструкцию на английском.
        </p>
      </div>

      {intents.isError && (
        <div className="rounded-lg bg-bad/10 text-bad text-sm px-3 py-2">
          Не удалось загрузить интенты
        </div>
      )}

      <ul className="space-y-2">
        {items.map((intent) => (
          <li key={intent.id} className="rounded-lg border border-line bg-paper p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{intent.label}</span>
              <code className="text-xs text-muted">{intent.key}</code>
              <span className="text-xs text-muted">позиция {intent.position}</span>
              {!intent.is_active && (
                <span className="rounded-full bg-line/60 text-muted text-[11px] px-2 py-0.5">
                  выключен
                </span>
              )}
              <span className="flex-1" />
              <button
                type="button"
                onClick={() =>
                  update.mutate({ id: intent.id, body: { is_active: !intent.is_active } })
                }
                disabled={update.isPending}
                className="rounded-lg border border-line px-3 py-1 text-xs hover:bg-line/40 disabled:opacity-50"
              >
                {intent.is_active ? 'Выключить' : 'Включить'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (editingId === intent.id) {
                    setEditingId(null)
                    setDraft(null)
                  } else {
                    setEditingId(intent.id)
                    setDraft(toDraft(intent))
                  }
                }}
                className="rounded-lg border border-line px-3 py-1 text-xs hover:bg-line/40"
              >
                {editingId === intent.id ? 'Свернуть' : 'Изменить'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Удалить интент «${intent.label}»?`)) {
                    remove.mutate(intent.id)
                  }
                }}
                disabled={remove.isPending}
                className="rounded-lg border border-bad/40 text-bad px-3 py-1 text-xs hover:bg-bad/10 disabled:opacity-50"
              >
                Удалить
              </button>
            </div>

            {editingId === intent.id && draft && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <label className="block space-y-1 text-sm">
                    <span className="text-muted text-xs">Название (для кнопок)</span>
                    <input
                      type="text"
                      value={draft.label}
                      onChange={(e) =>
                        setDraft({ ...draft, label: e.target.value })
                      }
                      className={inputCls}
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-muted text-xs">Позиция</span>
                    <input
                      type="number"
                      value={draft.position}
                      onChange={(e) =>
                        setDraft({ ...draft, position: e.target.value })
                      }
                      className={inputCls}
                    />
                  </label>
                </div>
                <label className="block space-y-1 text-sm">
                  <span className="text-muted text-xs">Инструкция (EN)</span>
                  <textarea
                    rows={3}
                    value={draft.instruction}
                    onChange={(e) =>
                      setDraft({ ...draft, instruction: e.target.value })
                    }
                    className={monoCls}
                    spellCheck={false}
                  />
                </label>
                <button
                  type="button"
                  disabled={
                    update.isPending ||
                    !draft.label.trim() ||
                    !draft.instruction.trim()
                  }
                  onClick={() =>
                    update.mutate({
                      id: intent.id,
                      body: {
                        label: draft.label.trim(),
                        instruction: draft.instruction.trim(),
                        position: Number.parseInt(draft.position, 10) || 0,
                      },
                    })
                  }
                  className="rounded-lg bg-accent hover:bg-accent-hover text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {update.isPending ? 'Сохраняем…' : 'Сохранить'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="rounded-lg border border-dashed border-line p-3 space-y-2">
          <div className="grid grid-cols-[1fr_1fr_120px] gap-2">
            <label className="block space-y-1 text-sm">
              <span className="text-muted text-xs">Ключ (slug, латиница)</span>
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="noir"
                className={inputCls}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted text-xs">Название</span>
              <input
                type="text"
                value={newDraft.label}
                onChange={(e) => setNewDraft({ ...newDraft, label: e.target.value })}
                placeholder="Нуар"
                className={inputCls}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted text-xs">Позиция</span>
              <input
                type="number"
                value={newDraft.position}
                onChange={(e) =>
                  setNewDraft({ ...newDraft, position: e.target.value })
                }
                className={inputCls}
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-muted text-xs">Инструкция (EN)</span>
            <textarea
              rows={3}
              value={newDraft.instruction}
              onChange={(e) =>
                setNewDraft({ ...newDraft, instruction: e.target.value })
              }
              placeholder="Mood: film noir…"
              className={monoCls}
              spellCheck={false}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canCreate}
              onClick={() => create.mutate()}
              className="rounded-lg bg-accent hover:bg-accent-hover text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {create.isPending ? 'Добавляем…' : 'Добавить'}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-line/40"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg border border-dashed border-line px-4 py-2 text-sm text-muted hover:bg-line/40"
        >
          + Новый интент
        </button>
      )}
    </section>
  )
}

export function PromptGenPage() {
  const { user, loading } = useAuth()
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [hint, setHint] = useState('')
  const [mode, setMode] = useState<PromptMode>('t2i')
  const [intent, setIntent] = useState<string | null>(null)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState<string | null>(null)

  const template = useQuery({
    queryKey: ['prompt-gen-template'],
    queryFn: settingsApi.getPromptTemplate,
    enabled: !!user?.is_admin,
  })

  const activeIntents = useQuery({
    queryKey: ['suggest-intents'],
    queryFn: assistantApi.listSuggestIntents,
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
    onError: (e: Error) => setError(errorText(e)),
  })

  const restore = useMutation({
    mutationFn: (version: number) => settingsApi.restorePromptTemplateVersion(version),
    onSuccess: async () => {
      setDirty(false)
      setError(null)
      await qc.invalidateQueries({ queryKey: ['prompt-gen-template'] })
    },
    onError: (e: Error) => setError(errorText(e)),
  })

  const reset = useMutation({
    mutationFn: () => settingsApi.resetPromptTemplate(),
    onSuccess: async (data) => {
      setDraft(data.text)
      setDirty(false)
      setError(null)
      await qc.invalidateQueries({ queryKey: ['prompt-gen-template'] })
    },
    onError: (e: Error) => setError(errorText(e)),
  })

  const runPreview = useMutation({
    mutationFn: () =>
      settingsApi.previewPromptTemplate({
        text: dirty ? draft : undefined,
        hint: hint.trim(),
        mode,
        intent,
      }),
    onSuccess: (data) => {
      setPreview(data.text)
      setError(null)
    },
    onError: (e: Error) => setError(errorText(e)),
  })

  const runUserSuggest = useMutation({
    mutationFn: () => assistantApi.suggest(hint.trim(), mode, intent),
    onSuccess: (data) => {
      setPreview(data.text)
      setError(null)
    },
    onError: (e: Error) => setError(errorText(e)),
  })

  if (loading) return <div className="text-sm text-muted">Загрузка…</div>
  if (!user?.is_admin) return <Navigate to="/" replace />

  const versions = template.data?.versions ?? []
  const currentVersion = template.data?.version ?? null
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
          Плейсхолдеры: <code className="text-xs">{'{mode_label}'}</code> —
          text-to-image / image-to-image,{' '}
          <code className="text-xs">{'{intent_instruction}'}</code> — инструкция
          выбранного интента (пусто, если интент не выбран).
          {template.data?.is_default
            ? ' Сейчас — значение по умолчанию из кода.'
            : currentVersion != null
              ? ` Текущая версия: v${currentVersion}.`
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
            {save.isPending ? 'Сохраняем…' : 'Сохранить новой версией'}
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
        <h2 className="text-sm font-semibold">История версий</h2>
        {versions.length === 0 ? (
          <p className="text-xs text-muted">
            Сохранённых версий нет — используется шаблон по умолчанию из кода.
          </p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li
                key={v.id}
                className="rounded-lg border border-line bg-paper p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-semibold text-ink">v{v.version}</span>
                  <span>{fmtDate(v.created_at)}</span>
                  {v.version === currentVersion && (
                    <span className="rounded-full bg-accent/10 text-accent text-[11px] font-semibold px-2 py-0.5">
                      текущая
                    </span>
                  )}
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(v.text)
                      setDirty(true)
                    }}
                    className="rounded-lg border border-line px-3 py-1 text-xs hover:bg-line/40"
                  >
                    В редактор
                  </button>
                  <button
                    type="button"
                    disabled={restore.isPending || v.version === currentVersion}
                    onClick={() => {
                      if (confirm(`Восстановить v${v.version} как новую версию?`)) {
                        restore.mutate(v.version)
                      }
                    }}
                    className="rounded-lg border border-line px-3 py-1 text-xs hover:bg-line/40 disabled:opacity-50"
                  >
                    Восстановить
                  </button>
                </div>
                <p className="text-xs text-muted leading-relaxed line-clamp-2 whitespace-pre-wrap">
                  {v.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <IntentsSection onError={setError} />

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
              className={`${chipBase} ${
                mode === m
                  ? 'bg-ink text-paper border-ink'
                  : 'border-line text-muted hover:bg-line/40'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Настроение:</span>
          <button
            type="button"
            onClick={() => setIntent(null)}
            className={`${chipBase} ${
              intent === null
                ? 'bg-ink text-paper border-ink'
                : 'border-line text-muted hover:bg-line/40'
            }`}
          >
            Любое
          </button>
          {(activeIntents.data ?? []).map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => setIntent(i.key)}
              className={`${chipBase} ${
                intent === i.key
                  ? 'bg-ink text-paper border-ink'
                  : 'border-line text-muted hover:bg-line/40'
              }`}
            >
              {i.label}
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
