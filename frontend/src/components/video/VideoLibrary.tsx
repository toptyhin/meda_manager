import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { videosApi } from '../../api'
import { ApiError } from '../../api/client'
import { AuthedVideo } from '../AuthedVideo'
import { VideoLightbox } from '../VideoLightbox'
import { useVideoFormStore } from '../../lib/videoFormStore'
import { MODE_LABELS } from '../../lib/videoPresets'
import type { MediaVideo, VideoMode } from '../../types'

export function VideoLibrary() {
  const qc = useQueryClient()
  const reproduce = useVideoFormStore((s) => s.reproduce)
  const [libraryMode, setLibraryMode] = useState<VideoMode | ''>('')
  const [selected, setSelected] = useState<MediaVideo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const library = useQuery({
    queryKey: ['videos', libraryMode],
    queryFn: () =>
      videosApi.list({
        mode: libraryMode || undefined,
        page_size: 24,
      }),
  })

  function onReproduce(video: MediaVideo) {
    reproduce(video)
    setSelected(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removeVideo(id: number): Promise<boolean> {
    if (!confirm('Удалить это видео?')) return false
    try {
      await videosApi.remove(id)
      void qc.invalidateQueries({ queryKey: ['videos'] })
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Не удалось удалить')
      return false
    }
  }

  return (
    <section className="space-y-3 pt-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">Библиотека видео</h2>
        <label className="text-sm">
          <span className="sr-only">Фильтр по режиму</span>
          <select
            className="rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
            value={libraryMode}
            onChange={(e) => setLibraryMode((e.target.value || '') as VideoMode | '')}
          >
            <option value="">Все режимы</option>
            <option value="i2v">Оживлятор</option>
            <option value="t2v">Режиссёр</option>
            <option value="keyframes">Сторимейкер</option>
          </select>
        </label>
      </div>
      {error && (
        <div className="rounded-md bg-bad/10 text-bad text-sm px-3 py-2">{error}</div>
      )}
      {!library.data?.items.length && (
        <p className="text-sm text-muted">Пока нет сгенерированных видео.</p>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {library.data?.items.map((v) => (
          <article
            key={v.id}
            className="rounded-xl border border-line bg-card overflow-hidden flex flex-col hover:border-accent/50 transition-colors"
          >
            <button
              type="button"
              onClick={() => setSelected(v)}
              aria-label={`Открыть видео #${v.id}`}
              className="text-left"
            >
              <AuthedVideo
                src={v.file_url}
                className="w-full aspect-video bg-ink/5 object-contain pointer-events-none"
              />
            </button>
            <div className="p-3 space-y-2 text-sm flex-1 flex flex-col">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium rounded-full bg-line/50 px-2 py-0.5">
                  {MODE_LABELS[v.mode]}
                </span>
                <span className="text-xs text-muted">
                  {v.width}×{v.height} · ~{v.duration.toFixed(1)}с
                </span>
              </div>
              <p className="text-xs text-muted line-clamp-3 flex-1">{v.prompt_text}</p>
              {v.seed != null && (
                <div className="text-[11px] text-muted">seed: {v.seed}</div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onReproduce(v)}
                  className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-line/40"
                >
                  Воспроизвести
                </button>
                <button
                  type="button"
                  onClick={() => void removeVideo(v.id)}
                  className="rounded-md border border-line px-2.5 py-1 text-xs text-bad hover:bg-bad/10"
                >
                  Удалить
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {selected && (
        <VideoLightbox
          video={selected}
          onClose={() => setSelected(null)}
          onReproduce={onReproduce}
          onDelete={() => {
            void removeVideo(selected.id).then((ok) => {
              if (ok) setSelected(null)
            })
          }}
        />
      )}
    </section>
  )
}
