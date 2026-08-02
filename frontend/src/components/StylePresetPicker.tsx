import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { assistantApi, imagesApi, stylesApi } from '../api'
import { ApiError } from '../api/client'
import { insertSnippet, removeSnippet, snippetOf } from '../lib/styleSnippets'
import { AuthedImage } from './AuthedImage'
import { Modal } from './Modal'
import type { MediaImage, StylePreset } from '../types'

type Props = {
  kind: 'image' | 'video'
  text: string
  onChange: (next: string) => void
}

export function StylePresetPicker({ kind, text, onChange }: Props) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [activeCat, setActiveCat] = useState<string | 'all'>('all')
  const [styleFromImageOpen, setStyleFromImageOpen] = useState(false)
  const [extractingId, setExtractingId] = useState<number | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)

  const styles = useQuery({
    queryKey: ['styles', kind],
    queryFn: () => stylesApi.list(kind),
  })

  const sourceImages = useQuery({
    queryKey: ['images', 'style-source'],
    queryFn: () =>
      imagesApi.list({ page_size: 24, sort: 'created_at', order: 'desc' }),
    enabled: styleFromImageOpen,
  })

  async function extractFromImage(img: MediaImage) {
    setExtractingId(img.id)
    setExtractError(null)
    try {
      const { text: styleText } = await assistantApi.extractStyle(img.id)
      const title = window.prompt('Название нового стиля', 'Стиль из изображения')
      if (title?.trim()) {
        await stylesApi.create({
          title: title.trim(),
          category: 'Из изображений',
          kind,
          text: styleText,
          description: `Извлечён из изображения #${img.id}`,
        })
        await qc.invalidateQueries({ queryKey: ['styles'] })
        setStyleFromImageOpen(false)
      }
    } catch (e) {
      setExtractError(e instanceof ApiError ? e.detail : 'Не удалось извлечь стиль')
    } finally {
      setExtractingId(null)
    }
  }

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

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-line/40"
        >
          {open ? 'Скрыть стили' : 'Стиль'}
        </button>
        <button
          type="button"
          onClick={() => {
            setExtractError(null)
            setStyleFromImageOpen(true)
          }}
          title="Извлечь художественный стиль из изображения (vision)"
          className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-line/40"
        >
          Из изображения…
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

      {styleFromImageOpen && (
        <Modal
          onClose={() => setStyleFromImageOpen(false)}
          label="Стиль из изображения"
          className="max-w-2xl"
        >
          {(close) => (
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Стиль из изображения</h2>
                  <p className="text-xs text-muted mt-1">
                    Выберите изображение — ИИ извлечёт из него художественный стиль
                    и сохранит как новый пресет.
                  </p>
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

              {extractError && (
                <div className="rounded-md bg-bad/10 text-bad text-sm px-3 py-2">
                  {extractError}
                </div>
              )}

              {sourceImages.isLoading && (
                <div className="text-sm text-muted">Загрузка изображений…</div>
              )}
              {sourceImages.data && sourceImages.data.items.length === 0 && (
                <div className="text-sm text-muted border border-dashed border-line rounded-lg p-4">
                  Нет загруженных изображений — сначала загрузите референсы.
                </div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-auto">
                {sourceImages.data?.items.map((img) => {
                  const extracting = extractingId === img.id
                  return (
                    <button
                      key={img.id}
                      type="button"
                      disabled={extractingId != null}
                      onClick={() => void extractFromImage(img)}
                      className="relative rounded-lg overflow-hidden border border-line hover:border-accent transition disabled:opacity-60"
                      title={`Изображение #${img.id}`}
                    >
                      <AuthedImage
                        src={img.thumb_url}
                        alt={`Изображение #${img.id}`}
                        className="w-full aspect-square object-cover"
                      />
                      {extracting && (
                        <span className="absolute inset-0 grid place-items-center bg-ink/50 text-paper text-xs">
                          Извлекаем…
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
