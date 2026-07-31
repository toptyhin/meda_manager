import { useNavigate } from 'react-router-dom'
import { AuthedImage } from './AuthedImage'
import { Stars } from './Stars'
import type { MediaImage } from '../types'

type Props = {
  image: MediaImage
  onClose: () => void
  onRate: (rating: number) => void
  onDelete: () => void
}

export function Lightbox({ image, onClose, onRate, onDelete }: Props) {
  const navigate = useNavigate()

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <div
        className="bg-card rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-auto border border-line shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col md:flex-row">
          <div className="flex-1 bg-ink/5 min-h-[280px] flex items-center justify-center p-4">
            <AuthedImage
              src={image.file_url}
              alt={`image-${image.id}`}
              className="max-h-[50vh] md:max-h-[70vh] max-w-full object-contain rounded-lg"
            />
          </div>
          <div className="w-full md:w-72 p-5 border-t md:border-t-0 md:border-l border-line space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">#{image.id}</div>
                <div className="text-xs text-muted mt-0.5">
                  {image.kind === 'reference' ? 'Референс' : 'Сгенерировано'}
                  {image.size ? ` · ${image.size}` : ''}
                  {image.ratio ? ` · ${image.ratio}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-muted hover:text-ink text-xl leading-none"
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div>
              <div className="text-xs text-muted mb-1">Оценка</div>
              <Stars value={image.rating} onChange={onRate} />
            </div>
            <div className="text-xs text-muted">
              {new Date(image.created_at).toLocaleString('ru-RU')}
              <br />
              {image.width}×{image.height}
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                className="rounded-lg bg-accent hover:bg-accent-hover text-white py-2 text-sm font-medium"
                onClick={() =>
                  navigate(`/generate?edit=${image.id}`)
                }
              >
                Редактировать через промпт
              </button>
              <button
                type="button"
                className="rounded-lg border border-bad/40 text-bad hover:bg-bad/10 py-2 text-sm"
                onClick={onDelete}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
