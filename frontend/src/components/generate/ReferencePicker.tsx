import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { imagesApi } from '../../api'
import { AuthedImage } from '../AuthedImage'

type Props = {
  refs: number[]
  onToggle: (id: number) => void
  needsRef: boolean
  hasReference: boolean
}

export function ReferencePicker({ refs, onToggle, needsRef, hasReference }: Props) {
  const refsList = useQuery({
    queryKey: ['images', 'refs-for-gen'],
    queryFn: () => imagesApi.list({ page_size: 100, sort: 'created_at', order: 'desc' }),
  })
  const refSet = new Set(refs)

  return (
    <aside
      className={`bg-card border rounded-xl p-3 space-y-3 ${
        needsRef && !hasReference ? 'border-bad/60' : 'border-line'
      }`}
    >
      <div>
        <div className="font-medium text-sm">Референсы</div>
        <p className="text-xs text-muted mt-0.5">
          Выберите изображения (человек, сумка, очки…)
        </p>
        {needsRef && !hasReference && (
          <p className="text-xs text-bad mt-1">
            Для этого промпта нужен референс — выберите изображение
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-auto">
        {refsList.data?.items.map((img) => {
          const on = refSet.has(img.id)
          return (
            <button
              key={img.id}
              type="button"
              onClick={() => onToggle(img.id)}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                on ? 'border-accent' : 'border-transparent'
              }`}
            >
              <AuthedImage
                src={img.thumb_url}
                alt={`ref-${img.id}`}
                className="w-full h-full object-cover"
              />
              {on && (
                <span className="absolute top-1 right-1 bg-accent text-white text-[10px] rounded px-1">
                  {refs.indexOf(img.id) + 1}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {!refsList.data?.items.length && (
        <div className="text-xs text-muted">
          Нет изображений.{' '}
          <Link to="/" className="text-accent hover:underline">
            Загрузите референс
          </Link>
        </div>
      )}
    </aside>
  )
}
