import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invitesApi } from '../api'
import { ApiError } from '../api/client'
import type { Invite } from '../types'

function statusOf(inv: Invite) {
  if (inv.used_by != null) return { label: 'Использован', cls: 'bg-line/60 text-muted' }
  if (inv.is_blocked) return { label: 'Заблокирован', cls: 'bg-bad/10 text-bad' }
  return { label: 'Активен', cls: 'bg-ok/10 text-ok' }
}

export function InvitesPage() {
  const qc = useQueryClient()
  const [newCode, setNewCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const invites = useQuery({ queryKey: ['invites'], queryFn: invitesApi.list })

  const onError = (e: Error) => setError(e instanceof ApiError ? e.detail : e.message)

  const create = useMutation({
    mutationFn: invitesApi.create,
    onSuccess: (inv) => {
      setError(null)
      setNewCode(inv.code)
      void qc.invalidateQueries({ queryKey: ['invites'] })
    },
    onError,
  })

  const toggleBlock = useMutation({
    mutationFn: (inv: Invite) => invitesApi.update(inv.id, !inv.is_blocked),
    onSuccess: () => {
      setError(null)
      void qc.invalidateQueries({ queryKey: ['invites'] })
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: number) => invitesApi.remove(id),
    onSuccess: () => {
      setError(null)
      void qc.invalidateQueries({ queryKey: ['invites'] })
    },
    onError,
  })

  async function copyCode(id: number, code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedId(id)
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500)
    } catch {
      setError('Не удалось скопировать код')
    }
  }

  const busy = create.isPending || toggleBlock.isPending || remove.isPending

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Инвайты</h1>
          <p className="text-sm text-muted mt-0.5">
            Пригласительные коды для регистрации новых пользователей
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => create.mutate()}
          className="rounded-lg bg-accent hover:bg-accent-hover text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {create.isPending ? 'Создаём…' : 'Создать инвайт'}
        </button>
      </div>

      {newCode && (
        <div className="rounded-lg bg-ok/10 text-ok px-4 py-3 text-sm flex flex-wrap items-center gap-2">
          <span>
            Новый код: <code className="font-semibold select-all">{newCode}</code>
          </span>
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => void copyCode(-1, newCode)}
          >
            {copiedId === -1 ? 'скопировано' : 'копировать'}
          </button>
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => setNewCode(null)}
          >
            скрыть
          </button>
        </div>
      )}

      {error && <div className="rounded-lg bg-bad/10 text-bad text-sm px-4 py-3">{error}</div>}

      <div className="bg-card border border-line rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Код</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Создал</th>
              <th className="px-4 py-3 font-medium">Использовал</th>
              <th className="px-4 py-3 font-medium">Создан</th>
              <th className="px-4 py-3 font-medium text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {invites.data?.map((inv) => {
              const st = statusOf(inv)
              const used = inv.used_by != null
              return (
                <tr key={inv.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <code className="text-xs bg-line/40 rounded px-1.5 py-0.5 select-all">
                      {inv.code}
                    </code>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {inv.created_by_username ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{inv.used_by_username ?? '—'}</td>
                  <td className="px-4 py-2.5 text-muted whitespace-nowrap">
                    {new Date(inv.created_at).toLocaleString('ru-RU')}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      {!used && (
                        <button
                          type="button"
                          className="text-xs text-accent hover:underline underline-offset-2"
                          onClick={() => void copyCode(inv.id, inv.code)}
                        >
                          {copiedId === inv.id ? 'скопировано' : 'копировать'}
                        </button>
                      )}
                      {!used && (
                        <button
                          type="button"
                          disabled={busy}
                          className={`text-xs hover:underline underline-offset-2 disabled:opacity-50 ${
                            inv.is_blocked ? 'text-ok' : 'text-bad'
                          }`}
                          onClick={() => toggleBlock.mutate(inv)}
                        >
                          {inv.is_blocked ? 'разблокировать' : 'заблокировать'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        className="text-xs text-muted hover:text-bad hover:underline underline-offset-2 disabled:opacity-50"
                        onClick={() => {
                          if (confirm(`Удалить инвайт ${inv.code}?`)) remove.mutate(inv.id)
                        }}
                      >
                        удалить
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {invites.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  Инвайтов пока нет — создайте первый
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {invites.isLoading && (
          <div className="px-4 py-10 text-center text-muted text-sm">Загрузка…</div>
        )}
      </div>
    </div>
  )
}
