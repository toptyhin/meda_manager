import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assistantApi } from '../api'
import { ApiError } from '../api/client'
import { Modal } from './Modal'
import type { ImproveKind, ImproveTemplateVersion } from '../types'

type Props = {
  kind: ImproveKind
  onClose: () => void
}

export function ImproveTemplateModal({ kind, onClose }: Props) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const template = useQuery({
    queryKey: ['improve-template', kind],
    queryFn: () => assistantApi.getTemplate(kind),
  })

  useEffect(() => {
    if (template.data && !dirty) {
      setDraft(template.data.text)
    }
  }, [template.data, dirty])

  const save = useMutation({
    mutationFn: (text: string) => assistantApi.addTemplateVersion(kind, text),
    onSuccess: async () => {
      setDirty(false)
      setError(null)
      await qc.invalidateQueries({ queryKey: ['improve-template', kind] })
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.detail : 'Не удалось сохранить')
    },
  })

  function loadVersion(v: ImproveTemplateVersion) {
    setDraft(v.text)
    setDirty(true)
    setError(null)
  }

  function resetToDefault() {
    if (!template.data) return
    setDraft(template.data.default_text)
    setDirty(true)
    setError(null)
  }

  const title =
    kind === 'image' ? 'Промпт улучшения изображений' : 'Промпт улучшения видео'
  const currentVersion = template.data?.version
  const canSave =
    draft.trim().length > 0 &&
    !save.isPending &&
    draft.trim() !== (template.data?.text ?? '').trim()

  return (
    <Modal onClose={onClose} label={title} className="max-w-3xl">
      {(close) => (
      <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-xs text-muted mt-1">
                Системный промпт для кнопки «Улучшить». Изменения сохраняются как
                новые версии.
                {template.data?.is_default
                  ? ' Сейчас используется значение по умолчанию.'
                  : currentVersion != null
                    ? ` Текущая версия: v${currentVersion}.`
                    : ''}
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

          {error && (
            <div className="rounded-md bg-bad/10 text-bad text-sm px-3 py-2">{error}</div>
          )}
          {template.isError && (
            <div className="rounded-md bg-bad/10 text-bad text-sm px-3 py-2">
              Не удалось загрузить шаблон
            </div>
          )}

          <textarea
            aria-label="Текст шаблона"
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs font-mono leading-relaxed min-h-[220px]"
            rows={14}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setDirty(true)
            }}
            disabled={template.isLoading}
            spellCheck={false}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSave}
              onClick={() => save.mutate(draft.trim())}
              className="rounded-lg bg-accent hover:bg-accent-hover text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {save.isPending ? 'Сохраняем…' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={resetToDefault}
              disabled={!template.data}
              className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-line/40 disabled:opacity-50"
            >
              Сбросить к умолчанию
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-line/40 ml-auto"
            >
              Закрыть
            </button>
          </div>

          <div className="pt-3 border-t border-line">
            <div className="text-sm font-medium mb-2">История версий</div>
            {!template.data?.versions.length ? (
              <p className="text-xs text-muted">
                Пока нет сохранённых версий — используется шаблон по умолчанию.
              </p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-auto">
                {template.data.versions.map((v) => {
                  const isCurrent = v.version === currentVersion
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => loadVersion(v)}
                        className="w-full text-left rounded-lg border border-line px-3 py-2 text-sm hover:bg-line/20"
                      >
                        <div className="flex justify-between text-xs text-muted mb-1 gap-2">
                          <span className="flex items-center gap-2">
                            v{v.version}
                            {isCurrent && (
                              <span className="rounded-full bg-accent/15 text-accent px-1.5 py-0.5 text-[10px]">
                                текущая
                              </span>
                            )}
                          </span>
                          <span>
                            {new Date(v.created_at).toLocaleString('ru-RU')}
                          </span>
                        </div>
                        <div className="text-xs line-clamp-2 whitespace-pre-wrap">
                          {v.text}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
