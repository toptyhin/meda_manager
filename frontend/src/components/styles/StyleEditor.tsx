import { useMemo, useReducer, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { stylesApi } from '../../api'
import { ApiError } from '../../api/client'
import type { StyleKind, StylePreset } from '../../types'

const CUSTOM_CATEGORY = '__custom__'

const KIND_LABELS: Record<StyleKind, string> = {
  both: 'изо + видео',
  image: 'изображение',
  video: 'видео',
}

type FormState = {
  title: string
  description: string
  category: string
  kind: StyleKind
  text: string
}

type FormAction = { type: 'patch'; patch: Partial<FormState> }

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch }
  }
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  category: '',
  kind: 'both',
  text: '',
}

type Props = {
  selectedId: number | null
  defaultCategory: string
  onCreated: (id: number) => void
  onDeleted: () => void
}

export function StyleEditor({ selectedId, defaultCategory, onCreated, onDeleted }: Props) {
  const qc = useQueryClient()
  const styles = useQuery({ queryKey: ['styles'], queryFn: () => stylesApi.list() })
  const selected = styles.data?.find((p) => p.id === selectedId) ?? null

  const [form, dispatch] = useReducer(
    formReducer,
    { selected, defaultCategory },
    ({ selected: s, defaultCategory: dc }): FormState =>
      s
        ? {
            title: s.title,
            description: s.description ?? '',
            category: s.category,
            kind: s.kind,
            text: s.text,
          }
        : { ...EMPTY_FORM, category: dc },
  )
  const [error, setError] = useState<string | null>(null)

  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const p of styles.data ?? []) cats.add(p.category)
    return Array.from(cats).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [styles.data])

  const isCustomCategory = form.category !== '' && !categories.includes(form.category)
  const categorySelect = isCustomCategory ? CUSTOM_CATEGORY : form.category
  const resolvedCategory =
    categorySelect === CUSTOM_CATEGORY
      ? form.category.trim()
      : categorySelect || (categories[0] ?? '')

  const mutationBody = () => ({
    title: form.title.trim() || 'Без названия',
    description: form.description.trim() || null,
    category: resolvedCategory,
    kind: form.kind,
    text: form.text.trim(),
  })

  const createStyle = useMutation({
    mutationFn: () => stylesApi.create(mutationBody()),
    onSuccess: (p: StylePreset) => {
      // Сразу кладём в кэш, чтобы при remount (key=selectedId) форма нашла стиль
      qc.setQueryData<StylePreset[]>(['styles'], (old) => [...(old ?? []), p])
      void qc.invalidateQueries({ queryKey: ['styles'] })
      setError(null)
      onCreated(p.id)
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  const updateStyle = useMutation({
    mutationFn: () => stylesApi.update(selectedId ?? 0, mutationBody()),
    onSuccess: (updated: StylePreset) => {
      qc.setQueryData<StylePreset[]>(['styles'], (old) =>
        old?.map((s) => (s.id === updated.id ? updated : s)),
      )
      void qc.invalidateQueries({ queryKey: ['styles'] })
      setError(null)
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  const deleteStyle = useMutation({
    mutationFn: () => stylesApi.remove(selectedId ?? 0),
    onSuccess: () => {
      onDeleted()
      void qc.invalidateQueries({ queryKey: ['styles'] })
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  const canSave = Boolean(form.text.trim() && resolvedCategory)

  return (
    <section className="bg-card border border-line rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          {selectedId ? 'Редактор стиля' : 'Новый стиль'}
        </h1>
        {selected && (
          <span className="text-xs text-muted">{KIND_LABELS[selected.kind]}</span>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-bad/10 text-bad text-sm px-3 py-2">{error}</div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm block sm:col-span-2">
          <span className="text-muted">Название</span>
          <input
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2"
            value={form.title}
            onChange={(e) => dispatch({ type: 'patch', patch: { title: e.target.value } })}
          />
        </label>
        <label className="text-sm block">
          <span className="text-muted">Категория</span>
          <select
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2"
            value={categorySelect}
            onChange={(e) => {
              const v = e.target.value
              dispatch({ type: 'patch', patch: { category: v === CUSTOM_CATEGORY ? '' : v } })
            }}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
            <option value={CUSTOM_CATEGORY}>Своя категория…</option>
          </select>
        </label>
        <label className="text-sm block">
          <span className="text-muted">Область</span>
          <select
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2"
            value={form.kind}
            onChange={(e) =>
              dispatch({ type: 'patch', patch: { kind: e.target.value as StyleKind } })
            }
          >
            <option value="both">Изображение и видео</option>
            <option value="image">Только изображение</option>
            <option value="video">Только видео</option>
          </select>
        </label>
        {categorySelect === CUSTOM_CATEGORY && (
          <label className="text-sm block sm:col-span-2">
            <span className="text-muted">Название категории</span>
            <input
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2"
              value={form.category}
              onChange={(e) =>
                dispatch({ type: 'patch', patch: { category: e.target.value } })
              }
              placeholder="Например: Свои"
            />
          </label>
        )}
        <label className="text-sm block sm:col-span-2">
          <span className="text-muted">Описание</span>
          <input
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2"
            value={form.description}
            onChange={(e) =>
              dispatch({ type: 'patch', patch: { description: e.target.value } })
            }
            placeholder="Кратко, для подсказки в пикере"
          />
        </label>
      </div>

      <label className="text-sm block">
        <span className="text-muted">Текст стиля</span>
        <textarea
          className="mt-1 w-full min-h-[160px] rounded-lg border border-line bg-paper px-3 py-2 resize-y font-mono text-xs leading-relaxed"
          value={form.text}
          onChange={(e) => dispatch({ type: 'patch', patch: { text: e.target.value } })}
          placeholder="Oil painting of {subject}, thick brush strokes…"
        />
        <span className="block mt-1 text-xs text-muted">
          Используйте {'{subject}'} — при вставке в промпт плейсхолдер будет убран
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        {!selectedId ? (
          <button
            type="button"
            disabled={!canSave || createStyle.isPending}
            onClick={() => createStyle.mutate()}
            className="rounded-lg bg-accent hover:bg-accent-hover text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Создать
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={!canSave || updateStyle.isPending}
              onClick={() => updateStyle.mutate()}
              className="rounded-lg bg-accent hover:bg-accent-hover text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Сохранить
            </button>
            <button
              type="button"
              disabled={deleteStyle.isPending}
              onClick={() => {
                if (confirm(`Удалить стиль «${form.title}»?`)) deleteStyle.mutate()
              }}
              className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-bad/10 hover:text-bad"
            >
              Удалить
            </button>
          </>
        )}
      </div>
    </section>
  )
}
