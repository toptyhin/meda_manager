import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, fetchAuthedBlob } from '../api/client'
import { imagesApi, type MediaImage } from '../api/images'
import { VIDEO_MODE_LABELS, videosApi, type MediaVideo } from '../api/videos'
import { AuthedImage } from '../components/AuthedImage'
import { AuthedVideo } from '../components/AuthedVideo'
import { haptic, hapticNotify } from '../twa/telegram'

type Filter = 'all' | 'image' | 'video'

type LibraryItem =
  | { type: 'image'; id: number; created_at: string; data: MediaImage }
  | { type: 'video'; id: number; created_at: string; data: MediaVideo }

function IconPlay() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.5v13l11-6.5-11-6.5z" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4v12m0 0-4.5-4.5M12 16l4.5-4.5" />
      <path d="M4 20h16" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 13h8l1-13" />
    </svg>
  )
}

function IconSparkles() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z" />
      <path d="M19 14l.9 2.1 2.1.9-2.1.9L19 20l-.9-2.1-2.1-.9 2.1-.9L19 14z" />
    </svg>
  )
}

function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  )
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00'
  const s = Math.round(sec)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic()
        onClick()
      }}
      className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
        active ? 'bg-accent text-white' : 'bg-card border border-line text-muted'
      }`}
    >
      {children}
    </button>
  )
}

function MediaViewer({
  item,
  onClose,
  onDelete,
  deleting,
}: {
  item: LibraryItem
  onClose: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [downloading, setDownloading] = useState(false)
  const prompt = item.data.prompt_text
  const fileUrl = item.data.file_url
  const downloadName =
    item.type === 'image' ? `image-${item.id}.png` : `video-${item.id}.mp4`

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (!el.open) el.showModal()
    function onCancel(e: Event) {
      e.preventDefault()
      onClose()
    }
    el.addEventListener('cancel', onCancel)
    return () => el.removeEventListener('cancel', onCancel)
  }, [onClose])

  async function download() {
    if (downloading) return
    setDownloading(true)
    try {
      const blob = await fetchAuthedBlob(fileUrl)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      hapticNotify('success')
    } catch {
      hapticNotify('error')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={item.type === 'image' ? 'Просмотр изображения' : 'Просмотр видео'}
      className="fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none border-0 bg-backdrop/90 p-0 open:flex open:flex-col"
    >
      <header className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={() => {
            haptic()
            onClose()
          }}
          aria-label="Закрыть"
          className="inline-flex size-9 items-center justify-center rounded-xl bg-white/10 text-white"
        >
          <IconClose />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {item.type === 'image'
              ? item.data.kind === 'reference'
                ? 'Референс'
                : 'Изображение'
              : VIDEO_MODE_LABELS[item.data.mode]}
          </p>
          {item.type === 'video' && (
            <p className="text-xs text-white/60">
              {item.data.width}×{item.data.height} · {formatDuration(item.data.duration)}
            </p>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-2">
        {item.type === 'image' ? (
          <AuthedImage
            src={item.data.file_url}
            alt={prompt ?? `image-${item.id}`}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        ) : (
          <AuthedVideo
            src={item.data.file_url}
            autoPlay
            className="max-h-full max-w-full rounded-xl bg-black"
          />
        )}
      </div>

      {prompt && (
        <p className="mx-3 mt-2 line-clamp-3 text-xs leading-snug text-white/75">{prompt}</p>
      )}

      <div className="grid grid-cols-2 gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={() => void download()}
          disabled={downloading || deleting}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-white/15 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {downloading ? <Spinner /> : <IconDownload />}
          Скачать
        </button>
        <button
          type="button"
          onClick={() => {
            haptic()
            onDelete()
          }}
          disabled={deleting || downloading}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-bad/80 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {deleting ? <Spinner /> : <IconTrash />}
          Удалить
        </button>
      </div>
    </dialog>
  )
}

export function MediaLibraryPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<LibraryItem | null>(null)

  const imagesQuery = useQuery({
    queryKey: ['images', 'library'],
    queryFn: () =>
      imagesApi.list({
        page_size: 96,
        sort: 'created_at',
        order: 'desc',
      }),
  })

  const videosQuery = useQuery({
    queryKey: ['videos', 'library'],
    queryFn: () => videosApi.list({ page_size: 48 }),
  })

  const items = useMemo(() => {
    const list: LibraryItem[] = []
    for (const img of imagesQuery.data?.items ?? []) {
      list.push({ type: 'image', id: img.id, created_at: img.created_at, data: img })
    }
    for (const vid of videosQuery.data?.items ?? []) {
      list.push({ type: 'video', id: vid.id, created_at: vid.created_at, data: vid })
    }
    list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    if (filter === 'image') return list.filter((i) => i.type === 'image')
    if (filter === 'video') return list.filter((i) => i.type === 'video')
    return list
  }, [imagesQuery.data, videosQuery.data, filter])

  const deleteMut = useMutation({
    mutationFn: async (item: LibraryItem) => {
      if (item.type === 'image') await imagesApi.remove(item.id)
      else await videosApi.remove(item.id)
    },
    onSuccess: () => {
      setSelected(null)
      void qc.invalidateQueries({ queryKey: ['images'] })
      void qc.invalidateQueries({ queryKey: ['videos'] })
      hapticNotify('success')
    },
    onError: (e) => {
      hapticNotify('error')
      window.alert(e instanceof ApiError ? e.detail : 'Не удалось удалить')
    },
  })

  const loading = imagesQuery.isLoading || videosQuery.isLoading
  const errored = imagesQuery.isError || videosQuery.isError
  const imageTotal = imagesQuery.data?.total ?? 0
  const videoTotal = videosQuery.data?.total ?? 0
  const total = imageTotal + videoTotal

  function confirmDelete(item: LibraryItem) {
    const label = item.type === 'image' ? 'изображение' : 'видео'
    if (!window.confirm(`Удалить ${label}?`)) return
    deleteMut.mutate(item)
  }

  return (
    <div className="flex flex-col gap-4 anim-fade-up">
      <header>
        <h1 className="text-xl font-bold tracking-tight">Медиатека</h1>
        <p className="mt-1 text-sm text-muted">
          {loading
            ? 'Загрузка…'
            : total === 0
              ? 'Здесь появятся ваши генерации'
              : `${imageTotal} фото · ${videoTotal} видео`}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          Все
        </FilterChip>
        <FilterChip active={filter === 'image'} onClick={() => setFilter('image')}>
          Фото
        </FilterChip>
        <FilterChip active={filter === 'video'} onClick={() => setFilter('video')}>
          Видео
        </FilterChip>
      </div>

      {errored && (
        <p className="rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-2.5 text-sm text-bad">
          Не удалось загрузить медиатеку
        </p>
      )}

      {loading && (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl skeleton" />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-line bg-card/60 px-5 py-10 text-center">
          <div className="mx-auto mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <IconSparkles />
          </div>
          <p className="text-sm font-semibold">Пока пусто</p>
          <p className="mt-1 text-xs text-muted leading-relaxed">
            Создайте изображение — оно появится здесь автоматически.
          </p>
          <Link
            to="/create/photo"
            onClick={() => haptic('medium')}
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
          >
            Создать фото
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              onClick={() => {
                haptic()
                setSelected(item)
              }}
              className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-card text-left focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {item.type === 'image' ? (
                <AuthedImage
                  src={item.data.thumb_url}
                  alt={item.data.prompt_text ?? `image-${item.id}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-accent-soft text-accent">
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent text-white shadow">
                    <IconPlay />
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums">
                    {formatDuration(item.data.duration)}
                  </span>
                </div>
              )}
              <span className="absolute left-1 top-1 rounded bg-card/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted ring-1 ring-line">
                {item.type === 'image'
                  ? item.data.kind === 'reference'
                    ? 'ref'
                    : 'img'
                  : 'vid'}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <MediaViewer
          item={selected}
          onClose={() => setSelected(null)}
          onDelete={() => confirmDelete(selected)}
          deleting={deleteMut.isPending}
        />
      )}
    </div>
  )
}
