import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { stylesApi } from '../api'
import { insertSnippet, removeSnippet, snippetOf } from '../lib/styleSnippets'
import type { StylePreset } from '../types'

type Props = {
  kind: 'image' | 'video'
  text: string
  onChange: (next: string) => void
}

export function StylePresetPicker({ kind, text, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [activeCat, setActiveCat] = useState<string | 'all'>('all')

  const styles = useQuery({
    queryKey: ['styles', kind],
    queryFn: () => stylesApi.list(kind),
  })

  const filtered = useMemo(() => styles.data ?? [], [styles.data])

  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const p of filtered) cats.add(p.category)
    return Array.from(cats)
  }, [filtered])

  const visible = useMemo(() => {
    if (activeCat === 'all') return filtered
    return filtered.filter((p) => p.category === activeCat)
  }, [filtered, activeCat])

  const applied = useMemo(() => {
    const lower = text.toLowerCase()
    return filtered.filter((p) => {
      const snip = snippetOf(p.text)
      return snip.length > 0 && lower.includes(snip.toLowerCase())
    })
  }, [filtered, text])

  function apply(preset: StylePreset) {
    onChange(insertSnippet(text, snippetOf(preset.text)))
  }

  function remove(preset: StylePreset) {
    onChange(removeSnippet(text, snippetOf(preset.text)))
  }

  return (
    <div className="space-y-2">
      {applied.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {applied.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => remove(p)}
              title="Убрать стиль из промпта"
              className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/15 text-accent px-2.5 py-0.5 text-xs hover:bg-accent/25"
            >
              <span>{p.title}</span>
              <span aria-hidden className="opacity-70">
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-line/40"
        >
          {open ? 'Скрыть стили' : 'Стиль'}
        </button>
      </div>

      {open && (
        <div className="rounded-xl border border-line bg-card p-3 space-y-2">
          {styles.isLoading && (
            <div className="text-xs text-muted">Загрузка стилей…</div>
          )}
          {styles.isError && (
            <div className="text-xs text-bad">Не удалось загрузить стили</div>
          )}
          {!styles.isLoading && !filtered.length && (
            <div className="text-xs text-muted">Нет доступных стилей</div>
          )}

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActiveCat('all')}
                className={`rounded-full px-2.5 py-0.5 text-xs border ${
                  activeCat === 'all'
                    ? 'bg-ink text-paper border-ink'
                    : 'border-line text-muted hover:bg-line/40'
                }`}
              >
                Все
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCat(cat)}
                  className={`rounded-full px-2.5 py-0.5 text-xs border ${
                    activeCat === cat
                      ? 'bg-ink text-paper border-ink'
                      : 'border-line text-muted hover:bg-line/40'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-auto">
            {visible.map((p) => {
              const isOn = applied.some((a) => a.id === p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => (isOn ? remove(p) : apply(p))}
                  title={p.description ?? p.title}
                  className={`rounded-md border px-2.5 py-1 text-xs transition ${
                    isOn
                      ? 'border-accent/40 bg-accent/15 text-accent'
                      : 'border-line hover:bg-line/40'
                  }`}
                >
                  {p.title}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
