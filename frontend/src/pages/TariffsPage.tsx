import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tariffsApi } from '../api'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import type {
  LimitPeriod,
  LimitResourceKind,
  TariffLimitDraft,
  TariffPlan,
} from '../types'

const RESOURCE_LABELS: Record<LimitResourceKind, string> = {
  image: 'Изображения',
  video: 'Видео',
}

const PERIOD_LABELS: Record<LimitPeriod, string> = {
  daily: 'в день',
  weekly: 'в неделю',
  monthly: 'в месяц',
  total: 'всего',
}

type PlanDraft = {
  name: string
  description: string
  is_default: boolean
  is_active: boolean
  limits: TariffLimitDraft[]
}

function toDraft(plan: TariffPlan): PlanDraft {
  return {
    name: plan.name,
    description: plan.description ?? '',
    is_default: plan.is_default,
    is_active: plan.is_active,
    limits: plan.limits.map((l) => ({
      resource_kind: l.resource_kind,
      period: l.period,
      max_count: l.max_count,
      credit_cost: l.credit_cost,
    })),
  }
}

function emptyDraft(): PlanDraft {
  return { name: '', description: '', is_default: false, is_active: true, limits: [] }
}

function describeLimits(plan: TariffPlan): string[] {
  if (plan.limits.length === 0) return ['Лимиты не заданы — ресурсы без ограничений']
  return plan.limits.map((l) => {
    const quota = l.max_count == null ? 'безлимит' : `${l.max_count} ${PERIOD_LABELS[l.period]}`
    return `${RESOURCE_LABELS[l.resource_kind]}: ${quota}, кредитов сверх квоты: ${l.credit_cost}`
  })
}

const inputCls = 'rounded-lg border border-line bg-paper px-3 py-2 text-sm'
const selectCls = 'rounded-lg border border-line bg-paper px-2 py-1.5 text-sm'

function LimitRows({
  limits,
  onChange,
}: {
  limits: TariffLimitDraft[]
  onChange: (next: TariffLimitDraft[]) => void
}) {
  const usedKeys = new Set(limits.map((l) => `${l.resource_kind}/${l.period}`))
  const addRow = () => {
    const resources: LimitResourceKind[] = ['image', 'video']
    const periods: LimitPeriod[] = ['daily', 'weekly', 'monthly', 'total']
    outer: for (const r of resources) {
      for (const p of periods) {
        if (!usedKeys.has(`${r}/${p}`)) {
          onChange([...limits, { resource_kind: r, period: p, max_count: 10, credit_cost: 1 }])
          break outer
        }
      }
    }
  }

  return (
    <div className="space-y-2">
      {limits.map((row, idx) => (
        <div
          key={`${row.resource_kind}/${row.period}`}
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <select
            value={row.resource_kind}
            aria-label="Тип ресурса"
            onChange={(e) =>
              onChange(
                limits.map((r, i) =>
                  i === idx ? { ...r, resource_kind: e.target.value as LimitResourceKind } : r,
                ),
              )
            }
            className={selectCls}
          >
            <option value="image">Изображения</option>
            <option value="video">Видео</option>
          </select>
          <select
            value={row.period}
            aria-label="Период лимита"
            onChange={(e) =>
              onChange(
                limits.map((r, i) =>
                  i === idx ? { ...r, period: e.target.value as LimitPeriod } : r,
                ),
              )
            }
            className={selectCls}
          >
            <option value="daily">в день</option>
            <option value="weekly">в неделю</option>
            <option value="monthly">в месяц</option>
            <option value="total">всего</option>
          </select>
          <label className="inline-flex items-center gap-1.5">
            <span className="sr-only">Максимум за период (пусто — безлимит)</span>
            <input
              type="number"
              min={0}
              placeholder="безлимит"
              value={row.max_count ?? ''}
              onChange={(e) =>
                onChange(
                  limits.map((r, i) =>
                    i === idx
                      ? {
                          ...r,
                          max_count:
                            e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                        }
                      : r,
                  ),
                )
              }
              className={`${inputCls} w-24`}
              title="Максимум генераций за период; пусто — безлимит"
            />
          </label>
          <span className="text-muted text-xs">кредитов за генерацию сверх квоты:</span>
          <input
            type="number"
            min={1}
            aria-label="Кредитов сверх квоты"
            value={row.credit_cost}
            onChange={(e) =>
              onChange(
                limits.map((r, i) =>
                  i === idx ? { ...r, credit_cost: Math.max(1, Number(e.target.value) || 1) } : r,
                ),
              )
            }
            className={`${inputCls} w-20`}
          />
          <button
            type="button"
            onClick={() => onChange(limits.filter((_, i) => i !== idx))}
            className="text-xs text-muted hover:text-bad"
            aria-label="Удалить лимит"
          >
            удалить
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        disabled={usedKeys.size >= 8}
        className="text-xs text-accent hover:underline underline-offset-2 disabled:opacity-50"
      >
        + добавить лимит
      </button>
    </div>
  )
}

function PlanCard({
  plan,
  draft,
  onDraft,
  onSave,
  onDelete,
  saving,
  saved,
  deleting,
}: {
  plan: TariffPlan
  draft: PlanDraft
  onDraft: (d: PlanDraft) => void
  onSave: () => void
  onDelete: () => void
  saving: boolean
  saved: boolean
  deleting: boolean
}) {
  const [editing, setEditing] = useState(false)

  return (
    <section className="rounded-xl border border-line bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="font-semibold truncate">{plan.name}</h2>
          {plan.is_default && (
            <span className="text-xs rounded-full px-2 py-0.5 bg-accent/10 text-accent">
              по умолчанию
            </span>
          )}
          {!plan.is_active && (
            <span className="text-xs rounded-full px-2 py-0.5 bg-bad/10 text-bad">неактивен</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            className="text-accent hover:underline underline-offset-2"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? 'свернуть' : 'редактировать'}
          </button>
          <button
            type="button"
            disabled={deleting}
            className="text-muted hover:text-bad hover:underline underline-offset-2 disabled:opacity-50"
            onClick={onDelete}
          >
            {deleting ? 'удаляем…' : 'удалить'}
          </button>
        </div>
      </div>

      {!editing && (
        <div className="text-sm text-muted space-y-1">
          {plan.description && <p>{plan.description}</p>}
          <ul className="list-disc list-inside">
            {describeLimits(plan).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Название</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => onDraft({ ...draft, name: e.target.value })}
              className={`${inputCls} w-full`}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Описание</span>
            <input
              type="text"
              value={draft.description}
              onChange={(e) => onDraft({ ...draft, description: e.target.value })}
              className={`${inputCls} w-full`}
            />
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) =>
                  onDraft({
                    ...draft,
                    is_active: e.target.checked,
                    is_default: e.target.checked ? draft.is_default : false,
                  })
                }
              />
              Активен
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.is_default}
                disabled={!draft.is_active}
                onChange={(e) => onDraft({ ...draft, is_default: e.target.checked })}
              />
              По умолчанию для новых
            </label>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted">Лимиты</span>
            <LimitRows limits={draft.limits} onChange={(next) => onDraft({ ...draft, limits: next })} />
          </div>
          <div className="pt-1">
            <button
              type="button"
              disabled={saving || !draft.name.trim()}
              onClick={onSave}
              className="rounded-lg bg-accent hover:bg-accent-hover text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {saved ? 'Сохранено' : saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export function TariffsPage() {
  const { user, loading } = useAuth()
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState<Record<number, PlanDraft>>({})
  const [creating, setCreating] = useState<PlanDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<number | null>(null)

  const plans = useQuery({
    queryKey: ['tariffs'],
    queryFn: tariffsApi.list,
    enabled: !!user?.is_admin,
  })

  useEffect(() => {
    if (!plans.data) return
    setDrafts((prev) => {
      const next = { ...prev }
      for (const p of plans.data) {
        if (!next[p.id]) next[p.id] = toDraft(p)
      }
      return next
    })
  }, [plans.data])

  const onError = (e: Error) => setError(e instanceof ApiError ? e.detail : e.message)

  const save = useMutation({
    mutationFn: async ({ id, draft }: { id: number; draft: PlanDraft }) => {
      return tariffsApi.update(id, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        clear_description: !draft.description.trim(),
        is_default: draft.is_default,
        is_active: draft.is_active,
        limits: draft.limits,
      })
    },
    onSuccess: (row) => {
      setError(null)
      setSavedId(row.id)
      setDrafts((prev) => ({ ...prev, [row.id]: toDraft(row) }))
      void qc.invalidateQueries({ queryKey: ['tariffs'] })
      setTimeout(() => setSavedId((cur) => (cur === row.id ? null : cur)), 1500)
    },
    onError,
  })

  const create = useMutation({
    mutationFn: async (draft: PlanDraft) =>
      tariffsApi.create({
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        is_default: draft.is_default,
        is_active: draft.is_active,
        limits: draft.limits,
      }),
    onSuccess: () => {
      setError(null)
      setCreating(null)
      void qc.invalidateQueries({ queryKey: ['tariffs'] })
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: number) => tariffsApi.remove(id),
    onSuccess: () => {
      setError(null)
      void qc.invalidateQueries({ queryKey: ['tariffs'] })
    },
    onError,
  })

  if (loading) {
    return <div className="text-sm text-muted">Загрузка…</div>
  }
  if (!user?.is_admin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Тарифы</h1>
          <p className="text-sm text-muted mt-0.5">
            Планы лимитов генерации для пользователей Telegram. Тариф «по умолчанию» применяется
            к новым пользователям без активной подписки.
          </p>
        </div>
        <button
          type="button"
          disabled={creating !== null}
          onClick={() => setCreating(emptyDraft())}
          className="rounded-lg bg-accent hover:bg-accent-hover text-white px-4 py-2 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
        >
          Создать тариф
        </button>
      </div>

      {error && <div className="rounded-lg bg-bad/10 text-bad text-sm px-4 py-3">{error}</div>}

      {creating !== null && (
        <section className="rounded-xl border border-accent/40 bg-card p-4 space-y-3">
          <h2 className="font-semibold">Новый тариф</h2>
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Название</span>
            <input
              type="text"
              value={creating.name}
              onChange={(e) => setCreating({ ...creating, name: e.target.value })}
              className={`${inputCls} w-full`}
              placeholder="Например: Free"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Описание</span>
            <input
              type="text"
              value={creating.description}
              onChange={(e) => setCreating({ ...creating, description: e.target.value })}
              className={`${inputCls} w-full`}
            />
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={creating.is_default}
                onChange={(e) => setCreating({ ...creating, is_default: e.target.checked })}
              />
              По умолчанию для новых
            </label>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted">Лимиты</span>
            <LimitRows
              limits={creating.limits}
              onChange={(next) => setCreating({ ...creating, limits: next })}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={create.isPending || !creating.name.trim()}
              onClick={() => create.mutate(creating)}
              className="rounded-lg bg-accent hover:bg-accent-hover text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {create.isPending ? 'Создаём…' : 'Создать'}
            </button>
            <button
              type="button"
              onClick={() => setCreating(null)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-line/40"
            >
              Отмена
            </button>
          </div>
        </section>
      )}

      {plans.isLoading && <div className="text-sm text-muted">Загрузка…</div>}
      {plans.data?.length === 0 && creating === null && (
        <div className="rounded-xl border border-line bg-card px-4 py-10 text-center text-muted text-sm">
          Тарифов пока нет. Пока ни одного тарифа не создано, лимиты не применяются.
        </div>
      )}

      <div className="space-y-4">
        {(plans.data ?? []).map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            draft={drafts[plan.id] ?? toDraft(plan)}
            onDraft={(d) => setDrafts((prev) => ({ ...prev, [plan.id]: d }))}
            onSave={() => save.mutate({ id: plan.id, draft: drafts[plan.id] ?? toDraft(plan) })}
            onDelete={() => {
              if (
                confirm(
                  `Удалить тариф «${plan.name}»? Если есть назначенные подписки, тариф будет деактивирован.`,
                )
              )
                remove.mutate(plan.id)
            }}
            saving={save.isPending && save.variables?.id === plan.id}
            saved={savedId === plan.id}
            deleting={remove.isPending && remove.variables === plan.id}
          />
        ))}
      </div>
    </div>
  )
}
