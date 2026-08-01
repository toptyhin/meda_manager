import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { stylesApi } from '../api'
import { StyleEditor } from '../components/styles/StyleEditor'
import type { StyleKind } from '../types'

const KIND_LABELS: Record<StyleKind, string> = {
  both: 'изо + видео',
  image: 'изображение',
  video: 'видео',
}

export function StylesPage() {
  const [activeCat, setActiveCat] = useState<string | 'all'>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const styles = useQuery({ queryKey: ['styles'], queryFn: () => stylesApi.list() })

  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const p of styles.data ?? []) cats.add(p.category)
    return Array.from(cats).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [styles.data])

  const filtered = useMemo(() => {
    const items = styles.data ?? []
    if (activeCat === 'all') return items
    return items.filter((p) => p.category === activeCat)
  }, [styles.data, activeCat])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_240px_1fr] gap-4 min-h-[70vh]">
      <aside className="bg-card border border-line rounded-xl p-3 space-y-2">
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
        <ul className="space-y-1 max-h-[60vh] overflow-auto">
          {categories.map((cat) => (
            <li key={cat}>
              <button
                type="button"
                onClick={() => setActiveCat(cat)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-sm ${
                  activeCat === cat ? 'bg-ink text-paper' : 'hover:bg-line/40'
                }`}
              >
                {cat}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <aside className="bg-card border border-line rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">Стили</div>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="text-xs text-accent hover:underline"
          >
            + новый
          </button>
        </div>
        <ul className="space-y-1 max-h-[60vh] overflow-auto">
          {filtered.map((p) => (
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
                  {KIND_LABELS[p.kind]}
                </div>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="text-xs text-muted px-2 py-4">
              {styles.isLoading ? 'Загрузка…' : 'Нет стилей'}
            </li>
          )}
        </ul>
      </aside>

      {styles.isPending ? (
        <section className="bg-card border border-line rounded-xl p-5 text-sm text-muted">
          Загрузка…
        </section>
      ) : (
        <StyleEditor
          key={selectedId ?? 'new'}
          selectedId={selectedId}
          defaultCategory={categories[0] ?? ''}
          onCreated={setSelectedId}
          onDeleted={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
