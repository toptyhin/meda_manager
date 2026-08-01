import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { categoriesApi, promptsApi } from '../api'
import { CategoriesModal } from '../components/prompts/CategoriesModal'
import { PromptEditorModal } from '../components/prompts/PromptEditorModal'
import { SettingsIconButton } from '../components/SettingsIconButton'

export function PromptsPage() {
  const [activeCat, setActiveCat] = useState<number | 'all'>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [showCategories, setShowCategories] = useState(false)

  const cats = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })
  const prompts = useQuery({
    queryKey: ['prompts', activeCat],
    queryFn: () => promptsApi.list(activeCat === 'all' ? undefined : activeCat),
  })

  const activeCatName =
    activeCat === 'all'
      ? 'Все'
      : (cats.data?.find((c) => c.id === activeCat)?.name ?? 'Категория')

  function startNew() {
    setSelectedId(null)
    setEditorOpen(true)
  }

  function openPrompt(id: number) {
    setSelectedId(id)
    setEditorOpen(true)
  }

  return (
    <div className="space-y-4 min-h-[70vh]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Промпты</h1>
          <p className="text-sm text-muted mt-1">
            Библиотека промптов
            {activeCat !== 'all' ? (
              <>
                {' '}
                · фильтр: <span className="text-ink">{activeCatName}</span>
              </>
            ) : null}
          </p>
        </div>
        <SettingsIconButton
          onClick={() => setShowCategories(true)}
          label="Категории"
        />
      </div>

      <section className="bg-card border border-line rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-muted">
            {prompts.data?.length ?? 0}{' '}
            {(prompts.data?.length ?? 0) === 1 ? 'промпт' : 'промптов'}
          </div>
          <button
            type="button"
            onClick={startNew}
            className="rounded-lg bg-accent hover:bg-accent-hover text-white px-3 py-1.5 text-sm font-medium"
          >
            + новый
          </button>
        </div>

        {!prompts.data?.length ? (
          <div className="text-sm text-muted px-1 py-10 text-center border border-dashed border-line rounded-lg">
            Нет промптов.{' '}
            <button
              type="button"
              onClick={startNew}
              className="text-accent hover:underline"
            >
              Создать первый
            </button>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {prompts.data.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => openPrompt(p.id)}
                  className={`w-full text-left rounded-lg border px-3 py-3 transition-colors ${
                    selectedId === p.id && editorOpen
                      ? 'border-accent bg-accent/5'
                      : 'border-line hover:border-accent/40 hover:bg-line/20'
                  }`}
                >
                  <div className="font-medium truncate">{p.title}</div>
                  <div className="text-[11px] text-muted truncate mt-1">
                    v{p.current_version?.version ?? 0} ·{' '}
                    {p.mode === 'i2i' ? 'i2i' : 't2i'}
                    {(() => {
                      const cat = cats.data?.find((c) => c.id === p.category_id)
                      return cat ? ` · ${cat.name}` : ''
                    })()}
                  </div>
                  {p.current_version?.text && (
                    <div className="text-xs text-muted line-clamp-2 mt-2">
                      {p.current_version.text}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showCategories && (
        <CategoriesModal
          activeCat={activeCat}
          onSelect={setActiveCat}
          onClose={() => setShowCategories(false)}
        />
      )}

      {editorOpen && (
        <PromptEditorModal
          key={selectedId ?? 'new'}
          promptId={selectedId}
          onClose={() => setEditorOpen(false)}
          onCreated={setSelectedId}
        />
      )}
    </div>
  )
}
