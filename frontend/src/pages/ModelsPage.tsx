import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { providersApi } from '../api'
import { ApiError } from '../api/client'
import type { ModelInfo, ProviderInfo } from '../types'

function formatContext(n: number | null) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function formatPrice(model: ModelInfo) {
  const p = model.pricing
  if (!p) return '—'
  if (p.prompt_per_1m != null || p.completion_per_1m != null) {
    const inn = p.prompt_per_1m != null ? `$${p.prompt_per_1m.toFixed(2)}` : '?'
    const out = p.completion_per_1m != null ? `$${p.completion_per_1m.toFixed(2)}` : '?'
    return `${inn} / ${out} за 1M`
  }
  if (p.image != null) return `$${p.image} / image`
  if (p.request != null) return `$${p.request} / req`
  return '—'
}

const KIND_OPTIONS = [
  { id: 'chat', label: 'Chat' },
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'all', label: 'Все' },
] as const

function providerLabel(p: ProviderInfo) {
  const bits = [p.name]
  if (!p.configured) bits.push('нет ключа')
  return bits.join(' · ')
}

export function ModelsPage() {
  const qc = useQueryClient()
  const [providerId, setProviderId] = useState<string | null>(null)
  const [kind, setKind] = useState<(typeof KIND_OPTIONS)[number]['id']>('chat')
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.list,
  })

  const preference = useQuery({
    queryKey: ['chat-model'],
    queryFn: providersApi.getChatModel,
  })

  const activeProvider =
    providerId ??
    preference.data?.provider ??
    providers.data?.find((p) => p.configured)?.id ??
    providers.data?.[0]?.id ??
    null

  const models = useQuery({
    queryKey: ['provider-models', activeProvider, kind],
    enabled: !!activeProvider,
    queryFn: () =>
      providersApi.models(activeProvider!, {
        kind: kind === 'all' ? undefined : kind,
      }),
  })

  const selectModel = useMutation({
    mutationFn: ({ provider, model }: { provider: string; model: string }) =>
      providersApi.setChatModel(provider, model),
    onSuccess: () => {
      setError(null)
      void qc.invalidateQueries({ queryKey: ['chat-model'] })
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  const refresh = useMutation({
    mutationFn: () =>
      providersApi.models(activeProvider!, {
        kind: kind === 'all' ? undefined : kind,
        refresh: true,
      }),
    onSuccess: (data) => {
      setError(null)
      qc.setQueryData(['provider-models', activeProvider, kind], data)
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  const items = useMemo(() => {
    const list = models.data?.items ?? []
    const q = filter.trim().toLowerCase()
    if (!q) return list
    return list.filter((m) => m.id.toLowerCase().includes(q))
  }, [models.data, filter])

  const selectedKey = preference.data
    ? `${preference.data.provider}::${preference.data.model}`
    : null

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Модели</h1>
          <p className="text-sm text-muted mt-0.5">
            Каталог провайдеров и выбор chat-модели для ассистента (improve / vision)
          </p>
        </div>
        <button
          type="button"
          disabled={!activeProvider || refresh.isPending}
          onClick={() => refresh.mutate()}
          className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-line/40 disabled:opacity-50"
        >
          {refresh.isPending ? 'Обновляем…' : 'Обновить каталог'}
        </button>
      </div>

      {preference.data && (
        <div className="rounded-xl border border-line bg-card px-4 py-3 text-sm">
          <span className="text-muted">Выбрано: </span>
          <span className="font-medium">
            {preference.data.provider} / {preference.data.model}
          </span>
          {preference.data.source === 'default' && (
            <span className="text-muted"> (по умолчанию)</span>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-bad/10 text-bad text-sm px-3 py-2">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {(providers.data ?? []).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setProviderId(p.id)}
            className={`rounded-lg px-3 py-1.5 text-sm border transition ${
              activeProvider === p.id
                ? 'bg-ink text-paper border-ink'
                : 'border-line hover:bg-line/40'
            } ${!p.configured ? 'opacity-60' : ''}`}
            title={providerLabel(p)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {KIND_OPTIONS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            className={`rounded-md px-2.5 py-1 text-xs border ${
              kind === k.id ? 'bg-accent text-white border-accent' : 'border-line text-muted'
            }`}
          >
            {k.label}
          </button>
        ))}
        <label className="ml-auto min-w-[12rem] flex-1 max-w-xs block">
          <span className="sr-only">Фильтр по id модели</span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Фильтр по id…"
            className="w-full rounded-lg border border-line bg-card px-3 py-1.5 text-sm"
          />
        </label>
      </div>

      {providers.isLoading || models.isLoading ? (
        <div className="text-sm text-muted">Загрузка моделей…</div>
      ) : models.isError ? (
        <div className="rounded-lg bg-bad/10 text-bad text-sm px-3 py-2">
          {(models.error as Error).message}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-3 py-2 font-medium">Модель</th>
                <th className="px-3 py-2 font-medium">Тип</th>
                <th className="px-3 py-2 font-medium">Контекст</th>
                <th className="px-3 py-2 font-medium">Цена</th>
                <th className="px-3 py-2 font-medium w-28" />
              </tr>
            </thead>
            <tbody>
              {items.map((m) => {
                const key = `${m.provider}::${m.id}`
                const selected = selectedKey === key
                const selectable = m.kind === 'chat'
                return (
                  <tr key={key} className="border-b border-line/70 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs sm:text-sm break-all">
                      {m.id}
                    </td>
                    <td className="px-3 py-2 text-muted">{m.kind}</td>
                    <td className="px-3 py-2 text-muted">
                      {formatContext(m.context_length)}
                    </td>
                    <td className="px-3 py-2 text-muted whitespace-nowrap">
                      {formatPrice(m)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {selectable ? (
                        <button
                          type="button"
                          disabled={selected || selectModel.isPending}
                          onClick={() =>
                            selectModel.mutate({ provider: m.provider, model: m.id })
                          }
                          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                            selected
                              ? 'bg-ok/15 text-ok'
                              : 'bg-accent hover:bg-accent-hover text-white disabled:opacity-50'
                          }`}
                        >
                          {selected ? 'Выбрана' : 'Выбрать'}
                        </button>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted">
                    Нет моделей для выбранного фильтра
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
