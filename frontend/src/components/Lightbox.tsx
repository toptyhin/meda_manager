import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthedImage } from './AuthedImage'
import { Modal } from './Modal'
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
  const [copied, setCopied] = useState(false)

  async function copyPrompt() {
    if (!image.prompt_text) return
    try {
      await navigator.clipboard.writeText(image.prompt_text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <Modal onClose={onClose} label={`Изображение #${image.id}`} className="max-w-5xl">
      {(close) => (
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
                onClick={close}
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
            {image.prompt_text && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-xs text-muted">Промпт</div>
                  <button
                    type="button"
                    onClick={() => void copyPrompt()}
                    className="text-[11px] text-accent hover:underline"
                  >
                    {copied ? 'Скопировано' : 'Копировать'}
                  </button>
                </div>
                <div className="max-h-40 overflow-auto whitespace-pre-wrap text-xs rounded-lg border border-line bg-paper/60 p-2 leading-relaxed">
                  {image.prompt_text}
                </div>
              </div>
            )}
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
      )}
    </Modal>
  )
}
