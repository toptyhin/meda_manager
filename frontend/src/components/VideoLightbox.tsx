import { useState } from 'react'
import { AuthedVideo } from './AuthedVideo'
import { Modal } from './Modal'
import { MODE_LABELS } from '../lib/videoPresets'
import type { MediaVideo } from '../types'

type Props = {
  video: MediaVideo
  onClose: () => void
  onReproduce: (video: MediaVideo) => void
  onDelete: () => void
}

export function VideoLightbox({ video, onClose, onReproduce, onDelete }: Props) {
  const [copied, setCopied] = useState<'prompt' | 'negative' | null>(null)

  async function copyText(text: string, kind: 'prompt' | 'negative') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <Modal onClose={onClose} label={`Видео #${video.id}`} className="max-w-5xl">
      {(close) => (
      <div className="flex flex-col md:flex-row">
          <div className="flex-1 bg-ink/5 min-h-[280px] flex items-center justify-center p-4">
            <AuthedVideo
              src={video.file_url}
              className="max-h-[50vh] md:max-h-[70vh] max-w-full rounded-lg bg-ink/5"
            />
          </div>
          <div className="w-full md:w-80 p-5 border-t md:border-t-0 md:border-l border-line space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">#{video.id}</div>
                <div className="text-xs text-muted mt-0.5">
                  {MODE_LABELS[video.mode]} · {video.width}×{video.height} · ~
                  {video.duration.toFixed(1)}с
                  {video.seed != null ? ` · seed ${video.seed}` : ''}
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
            <div className="text-xs text-muted">
              {new Date(video.created_at).toLocaleString('ru-RU')}
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-xs text-muted">Промпт</div>
                <button
                  type="button"
                  onClick={() => void copyText(video.prompt_text, 'prompt')}
                  className="text-[11px] text-accent hover:underline"
                >
                  {copied === 'prompt' ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
              <div className="max-h-40 overflow-auto whitespace-pre-wrap text-xs rounded-lg border border-line bg-paper/60 p-2 leading-relaxed">
                {video.prompt_text}
              </div>
            </div>
            {video.negative_prompt && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-xs text-muted">Негативный промпт</div>
                  <button
                    type="button"
                    onClick={() => void copyText(video.negative_prompt!, 'negative')}
                    className="text-[11px] text-accent hover:underline"
                  >
                    {copied === 'negative' ? 'Скопировано' : 'Копировать'}
                  </button>
                </div>
                <div className="max-h-24 overflow-auto whitespace-pre-wrap text-xs rounded-lg border border-line bg-paper/60 p-2 leading-relaxed">
                  {video.negative_prompt}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                className="rounded-lg bg-accent hover:bg-accent-hover text-white py-2 text-sm font-medium"
                onClick={() => onReproduce(video)}
              >
                Воспроизвести настройки
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
