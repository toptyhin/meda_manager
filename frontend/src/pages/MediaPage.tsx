import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoriesApi, imagesApi } from '../api'
import { AuthedImage } from '../components/AuthedImage'
import { Lightbox } from '../components/Lightbox'
import { Stars } from '../components/Stars'
import { useLocalStorageState } from '../lib/storage'
import type { ImageKind, MediaImage } from '../types'

type MediaFilters = {
  kind: ImageKind | ''
  categoryId: number | ''
  ratingMin: number | ''
  sort: 'created_at' | 'rating'
  order: 'asc' | 'desc'
}

const DEFAULT_FILTERS: MediaFilters = {
  kind: '',
  categoryId: '',
  ratingMin: '',
  sort: 'created_at',
  order: 'desc',
}

export function MediaPage() {
  const qc = useQueryClient()
  const [filtersState, setFiltersState] = useLocalStorageState<MediaFilters>(
    'mm-media-filters',
    DEFAULT_FILTERS,
  )
  const { kind, categoryId, ratingMin, sort, order } = filtersState
  const setKind = (v: ImageKind | '') => setFiltersState((f) => ({ ...f, kind: v }))
  const setCategoryId = (v: number | '') => setFiltersState((f) => ({ ...f, categoryId: v }))
  const setRatingMin = (v: number | '') => setFiltersState((f) => ({ ...f, ratingMin: v }))
  const setSort = (v: 'created_at' | 'rating') => setFiltersState((f) => ({ ...f, sort: v }))
  const setOrder = (v: 'asc' | 'desc') => setFiltersState((f) => ({ ...f, order: v }))
  const [selected, setSelected] = useState<MediaImage | null>(null)
  const [uploading, setUploading] = useState(false)

  const cats = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })

  const filters = useMemo(
    () => ({
      kind,
      category_id: categoryId,
      rating_min: ratingMin,
      sort,
      order,
      page_size: 96,
    }),
    [kind, categoryId, ratingMin, sort, order],
  )

  const images = useQuery({
    queryKey: ['images', filters],
    queryFn: () => imagesApi.list(filters),
  })

  const rateMut = useMutation({
    mutationFn: ({ id, rating }: { id: number; rating: number }) =>
      imagesApi.update(id, { rating }),
    onSuccess: (img) => {
      void qc.invalidateQueries({ queryKey: ['images'] })
      setSelected((s) => (s && s.id === img.id ? img : s))
    },
  })

  const delMut = useMutation({
    mutationFn: (id: number) => imagesApi.remove(id),
    onSuccess: () => {
      setSelected(null)
      void qc.invalidateQueries({ queryKey: ['images'] })
    },
  })

  async function onUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await imagesApi.upload(file, categoryId === '' ? undefined : categoryId)
      }
      void qc.invalidateQueries({ queryKey: ['images'] })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Медиа</h1>
          <p className="text-sm text-muted mt-1">
            {images.data ? `${images.data.total} изображений` : 'Загрузка…'}
          </p>
        </div>
        <label className="inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-accent-hover text-white px-4 py-2 text-sm font-medium cursor-pointer">
          {uploading ? 'Загрузка…' : 'Загрузить референс'}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => void onUpload(e.target.files)}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end bg-card border border-line rounded-xl p-3">
        <label className="text-sm min-w-0">
          <span className="text-muted block mb-1">Тип</span>
          <select
            className="w-full lg:w-auto rounded-md border border-line bg-paper px-2 py-1.5"
            value={kind}
            onChange={(e) => setKind(e.target.value as ImageKind | '')}
          >
            <option value="">Все</option>
            <option value="reference">Референсы</option>
            <option value="generated">Сгенерированные</option>
          </select>
        </label>
        <label className="text-sm min-w-0">
          <span className="text-muted block mb-1">Категория</span>
          <select
            className="w-full lg:w-auto rounded-md border border-line bg-paper px-2 py-1.5"
            value={categoryId}
            onChange={(e) =>
              setCategoryId(e.target.value ? Number(e.target.value) : '')
            }
          >
            <option value="">Все</option>
            {cats.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm min-w-0">
          <span className="text-muted block mb-1">Мин. оценка</span>
          <select
            className="w-full lg:w-auto rounded-md border border-line bg-paper px-2 py-1.5"
            value={ratingMin}
            onChange={(e) =>
              setRatingMin(e.target.value ? Number(e.target.value) : '')
            }
          >
            <option value="">Любая</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm min-w-0">
          <span className="text-muted block mb-1">Сортировка</span>
          <select
            className="w-full lg:w-auto rounded-md border border-line bg-paper px-2 py-1.5"
            value={sort}
            onChange={(e) => setSort(e.target.value as 'created_at' | 'rating')}
          >
            <option value="created_at">По дате</option>
            <option value="rating">По оценке</option>
          </select>
        </label>
        <label className="text-sm min-w-0">
          <span className="text-muted block mb-1">Порядок</span>
          <select
            className="w-full lg:w-auto rounded-md border border-line bg-paper px-2 py-1.5"
            value={order}
            onChange={(e) => setOrder(e.target.value as 'asc' | 'desc')}
          >
            <option value="desc">↓</option>
            <option value="asc">↑</option>
          </select>
        </label>
      </div>

      {images.isError && (
        <div className="text-bad text-sm">Не удалось загрузить изображения</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {images.data?.items.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setSelected(img)}
            className="group relative aspect-square rounded-xl overflow-hidden border border-line bg-card text-left focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <AuthedImage
              src={img.thumb_url}
              alt={`thumb-${img.id}`}
              className="w-full h-full object-cover transition group-hover:scale-[1.03]"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition">
              <Stars value={img.rating} size="sm" />
            </div>
            <span className="absolute top-1.5 left-1.5 text-[10px] uppercase tracking-wide bg-card/90 px-1.5 py-0.5 rounded border border-line">
              {img.kind === 'reference' ? 'ref' : 'gen'}
            </span>
          </button>
        ))}
      </div>

      {images.data && images.data.items.length === 0 && (
        <div className="text-center text-muted py-16 border border-dashed border-line rounded-2xl">
          Пока пусто — загрузите референс или сгенерируйте изображение
        </div>
      )}

      {selected && (
        <Lightbox
          image={selected}
          onClose={() => setSelected(null)}
          onRate={(rating) => rateMut.mutate({ id: selected.id, rating })}
          onDelete={() => {
            if (confirm('Удалить изображение?')) delMut.mutate(selected.id)
          }}
        />
      )}
    </div>
  )
}
