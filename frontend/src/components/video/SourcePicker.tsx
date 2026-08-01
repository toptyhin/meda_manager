import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { imagesApi } from '../../api'
import { AuthedImage } from '../AuthedImage'
import { useVideoFormStore } from '../../lib/videoFormStore'

export function SourcePicker() {
  const mode = useVideoFormStore((s) => s.mode)
  const sources = useVideoFormStore((s) => s.sources)
  const toggleSource = useVideoFormStore((s) => s.toggleSource)
  const images = useQuery({
    queryKey: ['images', 'refs-for-video'],
    queryFn: () => imagesApi.list({ page_size: 100, sort: 'created_at', order: 'desc' }),
  })

  if (mode === 't2v') return null

  const minSources = mode === 'i2v' ? 1 : 2
  const sourcesOk = sources.length >= minSources && sources.length <= 5
  const srcSet = new Set(sources)

  return (
    <aside
      className={`bg-card border rounded-xl p-3 space-y-3 ${
        !sourcesOk ? 'border-bad/60' : 'border-line'
      }`}
    >
      <div>
        <div className="font-medium text-sm">
          {mode === 'i2v' ? 'Исходное фото' : 'Ключевые кадры'}
        </div>
        <p className="text-xs text-muted mt-0.5">
          {mode === 'i2v'
            ? 'Выберите одно изображение'
            : 'Выберите 2–5 изображений. Порядок = порядок кадров'}
        </p>
        {!sourcesOk && (
          <p className="text-xs text-bad mt-1">
            Нужно {mode === 'i2v' ? '1' : 'от 2 до 5'} изображений
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-auto">
        {images.data?.items.map((img) => {
          const on = srcSet.has(img.id)
          return (
            <button
              key={img.id}
              type="button"
              onClick={() => toggleSource(img.id)}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                on ? 'border-accent' : 'border-transparent'
              }`}
            >
              <AuthedImage
                src={img.thumb_url}
                alt={`src-${img.id}`}
                className="w-full h-full object-cover"
              />
              {on && (
                <span className="absolute top-1 right-1 bg-accent text-white text-[10px] rounded px-1">
                  {sources.indexOf(img.id) + 1}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {!images.data?.items.length && (
        <div className="text-xs text-muted">
          Нет изображений.{' '}
          <Link to="/" className="text-accent hover:underline">
            Загрузите в Медиа
          </Link>
        </div>
      )}
    </aside>
  )
}
