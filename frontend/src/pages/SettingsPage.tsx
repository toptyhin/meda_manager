import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../api'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import type { ProviderSettings } from '../types'

type Draft = {
  api_key: string
  base_url: string
  chat_model: string
  enabled: boolean
}

function emptyDraft(p: ProviderSettings): Draft {
  return {
    api_key: '',
    base_url: p.base_url,
    chat_model: p.chat_model,
    enabled: p.enabled,
  }
}

export function SettingsPage() {
  const { user, loading } = useAuth()
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const providers = useQuery({
    queryKey: ['settings-providers'],
    queryFn: settingsApi.listProviders,
    enabled: !!user?.is_admin,
  })

  useEffect(() => {
    if (!providers.data) return
    setDrafts((prev) => {
      const next = { ...prev }
      for (const p of providers.data) {
        if (!next[p.id]) next[p.id] = emptyDraft(p)
      }
      return next
    })
  }, [providers.data])

  const save = useMutation({
    mutationFn: async (providerId: string) => {
      const d = drafts[providerId]
      const current = providers.data?.find((p) => p.id === providerId)
      if (!d || !current) throw new Error('Unknown provider')

      const body: Parameters<typeof settingsApi.updateProvider>[1] = {
        enabled: d.enabled,
      }
      if (d.api_key.trim()) body.api_key = d.api_key.trim()
      if (d.base_url.trim() !== current.base_url) {
        if (!d.base_url.trim()) body.clear_base_url = true
        else body.base_url = d.base_url.trim()
      }
      if (d.chat_model.trim() !== current.chat_model) {
        if (!d.chat_model.trim()) body.clear_chat_model = true
        else body.chat_model = d.chat_model.trim()
      }
      return settingsApi.updateProvider(providerId, body)
    },
    onSuccess: (row) => {
      setError(null)
      setSavedId(row.id)
      setDrafts((prev) => ({
        ...prev,
        [row.id]: { ...emptyDraft(row), api_key: '' },
      }))
      void qc.invalidateQueries({ queryKey: ['settings-providers'] })
      void qc.invalidateQueries({ queryKey: ['providers'] })
      void qc.invalidateQueries({ queryKey: ['provider-models'] })
      setTimeout(() => setSavedId((cur) => (cur === row.id ? null : cur)), 1500)
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  const clearKey = useMutation({
    mutationFn: (providerId: string) =>
      settingsApi.updateProvider(providerId, { clear_api_key: true }),
    onSuccess: (row) => {
      setError(null)
      setDrafts((prev) => ({
        ...prev,
        [row.id]: { ...emptyDraft(row), api_key: '' },
      }))
      void qc.invalidateQueries({ queryKey: ['settings-providers'] })
      void qc.invalidateQueries({ queryKey: ['providers'] })
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  if (loading) {
    return <div className="text-sm text-muted">Загрузка…</div>
  }
  if (!user?.is_admin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Настройки провайдеров</h1>
        <p className="text-sm text-muted mt-0.5">
          API-ключи и включение провайдеров. Значения из окружения используются как fallback,
          пока ключ не сохранён в базе.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-bad/10 text-bad text-sm px-3 py-2">{error}</div>
      )}

      {providers.isLoading && <div className="text-sm text-muted">Загрузка…</div>}
      {providers.isError && (
        <div className="rounded-lg bg-bad/10 text-bad text-sm px-3 py-2">
          {(providers.error as Error).message}
        </div>
      )}

      <div className="space-y-4">
        {(providers.data ?? []).map((p) => {
          const d = drafts[p.id] ?? emptyDraft(p)
          const busy =
            (save.isPending && save.variables === p.id) ||
            (clearKey.isPending && clearKey.variables === p.id)
          return (
            <section
              key={p.id}
              className="rounded-xl border border-line bg-card p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{p.name}</h2>
                  <p className="text-xs text-muted mt-0.5">
                    id: {p.id}
                    {p.configured
                      ? ` · ключ: ${p.api_key_masked ?? '***'} (${p.key_source})`
                      : ' · ключ не задан'}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [p.id]: { ...d, enabled: e.target.checked },
                      }))
                    }
                  />
                  Включён
                </label>
              </div>

              <label className="block space-y-1 text-sm">
                <span className="text-muted">API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={d.api_key}
                  placeholder={
                    p.api_key_masked
                      ? `Текущий: ${p.api_key_masked}`
                      : 'Вставьте ключ…'
                  }
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [p.id]: { ...d, api_key: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2"
                />
              </label>

              <label className="block space-y-1 text-sm">
                <span className="text-muted">Base URL</span>
                <input
                  type="url"
                  value={d.base_url}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [p.id]: { ...d, base_url: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs sm:text-sm"
                />
              </label>

              <label className="block space-y-1 text-sm">
                <span className="text-muted">Chat model по умолчанию</span>
                <input
                  type="text"
                  value={d.chat_model}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [p.id]: { ...d, chat_model: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs sm:text-sm"
                />
              </label>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => save.mutate(p.id)}
                  className="rounded-lg bg-accent hover:bg-accent-hover text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                >
                  {savedId === p.id ? 'Сохранено' : busy ? 'Сохраняем…' : 'Сохранить'}
                </button>
                {p.key_source === 'db' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => clearKey.mutate(p.id)}
                    className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-line/40 disabled:opacity-50"
                  >
                    Сбросить ключ в БД
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
