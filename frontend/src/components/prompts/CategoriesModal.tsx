import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoriesApi } from '../../api'
import { Modal } from '../Modal'

type Props = {
  activeCat: number | 'all'
  onSelect: (cat: number | 'all') => void
  onClose: () => void
}

export function CategoriesModal({ activeCat, onSelect, onClose }: Props) {
  const qc = useQueryClient()
  const [newCat, setNewCat] = useState('')
  const cats = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })

  const createCat = useMutation({
    mutationFn: (name: string) => categoriesApi.create(name),
    onSuccess: () => {
      setNewCat('')
      void qc.invalidateQueries({ queryKey: ['categories'] })
    },
  })

  const deleteCat = useMutation({
    mutationFn: (id: number) => categoriesApi.remove(id),
    onSuccess: () => {
      onSelect('all')
      void qc.invalidateQueries({ queryKey: ['categories'] })
      void qc.invalidateQueries({ queryKey: ['prompts'] })
    },
  })

  function onCreateCat(e: FormEvent) {
    e.preventDefault()
    if (!newCat.trim()) return
    createCat.mutate(newCat.trim())
  }

  return (
    <Modal onClose={onClose} label="Категории" className="max-w-md">
      {(close) => (
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Категории</h2>
            <p className="text-xs text-muted mt-1">
              Выберите фильтр списка или управляйте категориями.
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

        <button
          type="button"
          onClick={() => {
            onSelect('all')
            close()
          }}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
            activeCat === 'all' ? 'bg-ink text-paper' : 'hover:bg-line/40'
          }`}
        >
          Все
        </button>
        <ul className="space-y-1">
          {cats.data?.map((c) => (
            <li key={c.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onSelect(c.id)
                  close()
                }}
                className={`flex-1 text-left px-3 py-2 rounded-lg text-sm ${
                  activeCat === c.id ? 'bg-ink text-paper' : 'hover:bg-line/40'
                }`}
              >
                {c.name}
              </button>
              <button
                type="button"
                title="Удалить"
                className="text-muted hover:text-bad px-2 py-1"
                onClick={() => {
                  if (confirm(`Удалить категорию «${c.name}»?`)) {
                    deleteCat.mutate(c.id)
                  }
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={onCreateCat} className="flex gap-2 pt-3 border-t border-line">
          <label className="flex-1 text-sm block">
            <span className="sr-only">Новая категория</span>
            <input
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
              placeholder="Новая категория…"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-accent text-white px-3 text-sm font-medium disabled:opacity-50"
            disabled={createCat.isPending || !newCat.trim()}
            aria-label="Добавить категорию"
          >
            +
          </button>
        </form>
      </div>
      )}
    </Modal>
  )
}
