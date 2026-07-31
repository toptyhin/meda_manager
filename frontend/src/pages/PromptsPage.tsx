import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assistantApi, categoriesApi, promptsApi } from '../api'
import { ApiError } from '../api/client'
import type { Prompt, PromptMode } from '../types'

export function PromptsPage() {
  const qc = useQueryClient()
  const [activeCat, setActiveCat] = useState<number | 'all'>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newCat, setNewCat] = useState('')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [mode, setMode] = useState<PromptMode>('t2i')
  const [error, setError] = useState<string | null>(null)
  const [improving, setImproving] = useState(false)

  const cats = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })
  const prompts = useQuery({
    queryKey: ['prompts', activeCat],
    queryFn: () => promptsApi.list(activeCat === 'all' ? undefined : activeCat),
  })
  const selected = prompts.data?.find((p) => p.id === selectedId) ?? null
  const versions = useQuery({
    queryKey: ['prompt-versions', selectedId],
    queryFn: () => promptsApi.versions(selectedId!),
    enabled: selectedId != null,
  })

  useEffect(() => {
    if (selected) {
      setTitle(selected.title)
      setText(selected.current_version?.text ?? '')
      setCategoryId(selected.category_id)
    }
  }, [selected])

  useEffect(() => {
    if (cats.data?.length && categoryId === '') {
      setCategoryId(cats.data[0].id)
    }
  }, [cats.data, categoryId])

  const createCat = useMutation({
    mutationFn: (name: string) => categoriesApi.create(name),
    onSuccess: () => {
      setNewCat('')
      void qc.invalidateQueries({ queryKey: ['categories'] })
    },
  })

  const deleteCat = useMutation({
    mutationFn: (id: number) => categoriesApi.remove(id),
    onSuccess: () => {
      setActiveCat('all')
      void qc.invalidateQueries({ queryKey: ['categories'] })
      void qc.invalidateQueries({ queryKey: ['prompts'] })
    },
  })

  const createPrompt = useMutation({
    mutationFn: () =>
      promptsApi.create({
        title: title || 'Без названия',
        category_id: Number(categoryId),
        text,
        mode,
      }),
    onSuccess: (p: Prompt) => {
      void qc.invalidateQueries({ queryKey: ['prompts'] })
      setSelectedId(p.id)
      setError(null)
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  const saveVersion = useMutation({
    mutationFn: () => promptsApi.addVersion(selectedId!, text, 'manual'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['prompts'] })
      void qc.invalidateQueries({ queryKey: ['prompt-versions', selectedId] })
    },
  })

  const updateMeta = useMutation({
    mutationFn: () =>
      promptsApi.update(selectedId!, {
        title,
        category_id: Number(categoryId),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['prompts'] }),
  })

  const deletePrompt = useMutation({
    mutationFn: () => promptsApi.remove(selectedId!),
    onSuccess: () => {
      setSelectedId(null)
      void qc.invalidateQueries({ queryKey: ['prompts'] })
    },
  })

  async function improve() {
    setImproving(true)
    setError(null)
    try {
      const catName = cats.data?.find((c) => c.id === categoryId)?.name
      const { improved_text } = await assistantApi.improve(text, catName)
      setText(improved_text)
      if (selectedId != null) {
        await promptsApi.addVersion(selectedId, improved_text, 'assistant')
        void qc.invalidateQueries({ queryKey: ['prompts'] })
        void qc.invalidateQueries({ queryKey: ['prompt-versions', selectedId] })
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Не удалось улучшить промпт')
    } finally {
      setImproving(false)
    }
  }

  function startNew() {
    setSelectedId(null)
    setTitle('')
    setText('')
    setMode('t2i')
    setError(null)
    if (cats.data?.length) setCategoryId(cats.data[0].id)
  }

  function onCreateCat(e: FormEvent) {
    e.preventDefault()
    if (!newCat.trim()) return
    createCat.mutate(newCat.trim())
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_220px_1fr] gap-4 min-h-[70vh]">
      <aside className="bg-card border border-line rounded-xl p-3 space-y-3">
        <div className="font-medium text-sm">Категории</div>
        <button
          type="button"
          onClick={() => setActiveCat('all')}
          className={`w-full text-left px-2 py-1.5 rounded-md text-sm ${
            activeCat === 'all' ? 'bg-ink text-paper' : 'hover:bg-line/40'
          }`}
        >
          Все
        </button>
        <ul className="space-y-1">
          {cats.data?.map((c) => (
            <li key={c.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveCat(c.id)}
                className={`flex-1 text-left px-2 py-1.5 rounded-md text-sm ${
                  activeCat === c.id ? 'bg-ink text-paper' : 'hover:bg-line/40'
                }`}
              >
                {c.name}
              </button>
              <button
                type="button"
                title="Удалить"
                className="text-muted hover:text-bad px-1"
                onClick={() => {
                  if (confirm(`Удалить категорию «${c.name}»?`)) deleteCat.mutate(c.id)
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={onCreateCat} className="flex gap-1 pt-2 border-t border-line">
          <input
            className="flex-1 rounded-md border border-line bg-paper px-2 py-1 text-sm"
            placeholder="Новая…"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-md bg-accent text-white px-2 text-sm"
            disabled={createCat.isPending}
          >
            +
          </button>
        </form>
      </aside>

      <aside className="bg-card border border-line rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">Промпты</div>
          <button
            type="button"
            onClick={startNew}
            className="text-xs text-accent hover:underline"
          >
            + новый
          </button>
        </div>
        <ul className="space-y-1 max-h-[60vh] overflow-auto">
          {prompts.data?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left px-2 py-2 rounded-md text-sm ${
                  selectedId === p.id ? 'bg-ink text-paper' : 'hover:bg-line/40'
                }`}
              >
                <div className="font-medium truncate">{p.title}</div>
                <div
                  className={`text-[11px] truncate mt-0.5 ${
                    selectedId === p.id ? 'text-paper/70' : 'text-muted'
                  }`}
                >
                  v{p.current_version?.version ?? 0} · {p.mode === 'i2i' ? 'i2i' : 't2i'}
                </div>
              </button>
            </li>
          ))}
          {prompts.data?.length === 0 && (
            <li className="text-xs text-muted px-2 py-4">Нет промптов</li>
          )}
        </ul>
      </aside>

      <section className="bg-card border border-line rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">
            {selectedId ? 'Редактор промпта' : 'Новый промпт'}
          </h1>
          {selected && (
            <span className="text-xs text-muted">
              текущая версия v{selected.current_version?.version} ·{' '}
              {selected.mode === 'i2i' ? 'i2i (нужен референс)' : 't2i'}
            </span>
          )}
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
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
            >
              {cats.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {!selectedId && (
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

        <label className="text-sm block">
          <span className="text-muted">Текст промпта</span>
          <textarea
            className="mt-1 w-full min-h-[180px] rounded-lg border border-line bg-paper px-3 py-2 resize-y"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="На основе референсного изображения человека + сумки…"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {!selectedId ? (
            <button
              type="button"
              disabled={!text || !categoryId || createPrompt.isPending}
              onClick={() => createPrompt.mutate()}
              className="rounded-lg bg-accent hover:bg-accent-hover text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Создать
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={!text || saveVersion.isPending}
                onClick={() => {
                  void updateMeta.mutateAsync().then(() => saveVersion.mutate())
                }}
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
          <button
            type="button"
            disabled={!text || improving}
            onClick={() => void improve()}
            className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-line/40 disabled:opacity-50"
          >
            {improving ? 'Улучшаем…' : 'Улучшить промпт'}
          </button>
        </div>

        {selectedId && versions.data && versions.data.length > 0 && (
          <div className="pt-4 border-t border-line">
            <div className="text-sm font-medium mb-2">История версий</div>
            <ul className="space-y-2 max-h-56 overflow-auto">
              {versions.data.map((v) => (
                <li
                  key={v.id}
                  className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-line/20 cursor-pointer"
                  onClick={() => setText(v.text)}
                >
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>
                      v{v.version} · {v.source === 'assistant' ? 'ассистент' : 'вручную'}
                    </span>
                    <span>{new Date(v.created_at).toLocaleString('ru-RU')}</span>
                  </div>
                  <div className="line-clamp-2">{v.text}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!cats.data?.length && (
          <div className="text-sm text-muted border border-dashed border-line rounded-lg p-4">
            Сначала создайте категорию (например «мода» или «отпуск»)
          </div>
        )}
      </section>
    </div>
  )
}
