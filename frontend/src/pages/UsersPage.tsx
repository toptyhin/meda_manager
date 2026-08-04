import { Fragment, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminUsersApi, tariffsApi } from '../api'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import type {
  CreditKind,
  LimitPeriod,
  LimitResourceKind,
  QuotaSnapshot,
  TgUserListItem,
} from '../types'

const RESOURCE_LABELS: Record<LimitResourceKind, string> = {
  image: 'Изображения',
  video: 'Видео',
}

const PERIOD_LABELS: Record<LimitPeriod, string> = {
  daily: 'день',
  weekly: 'неделя',
  monthly: 'месяц',
  total: 'всего',
}

const CREDIT_KIND_LABELS: Record<Exclude<CreditKind, 'consume'>, string> = {
  paid: 'Оплата',
  bonus: 'Бонус',
  adjustment: 'Корректировка',
}

const PAGE_SIZE = 50
const inputCls = 'rounded-lg border border-line bg-paper px-3 py-2 text-sm'
const btnCls =
  'rounded-lg bg-accent hover:bg-accent-hover text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50'

function fmtDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU')
}

function displayName(u: TgUserListItem): string {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
  return name || '—'
}

function QuotaBlock({ quota }: { quota: QuotaSnapshot | null }) {
  if (!quota) return <p className="text-sm text-muted">Нет данных о квоте.</p>
  if (!quota.enforcement_enabled) {
    return (
      <p className="text-sm text-muted">
        Лимиты не применяются (нет активной подписки и тарифа по умолчанию). Кредиты:{' '}
        {quota.credits}
      </p>
    )
  }
  return (
    <div className="text-sm space-y-1">
      {quota.resources.length === 0 && (
        <p className="text-muted">В тарифе нет лимитов — ресурсы без ограничений.</p>
      )}
      {quota.resources.map((r) => (
        <div key={`${r.resource_kind}/${r.period}`} className="flex flex-wrap gap-x-2">
          <span className="font-medium">
            {RESOURCE_LABELS[r.resource_kind]} / {PERIOD_LABELS[r.period]}:
          </span>
          {r.limit == null ? (
            <span className="text-muted">безлимит</span>
          ) : (
            <span>
              {r.used} / {r.limit} (осталось {r.remaining})
            </span>
          )}
          {r.reset_at && (
            <span className="text-muted text-xs">сброс {fmtDate(r.reset_at)}</span>
          )}
          <span className="text-muted text-xs">кредитов сверх квоты: {r.credit_cost}</span>
        </div>
      ))}
      <div>
        <span className="font-medium">Кредиты:</span> {quota.credits}
      </div>
    </div>
  )
}

function UserDetailPanel({
  user,
  onAction,
  onError,
  onOpenUser,
}: {
  user: TgUserListItem
  onAction: () => void
  onError: (e: Error) => void
  onOpenUser: (telegramId: number) => void
}) {
  const qc = useQueryClient()
  const detail = useQuery({
    queryKey: ['admin-tg-user', user.telegram_id],
    queryFn: () => adminUsersApi.get(user.telegram_id),
  })
  const plans = useQuery({ queryKey: ['tariffs'], queryFn: tariffsApi.list })

  const [planId, setPlanId] = useState<number | ''>('')
  const [expiresAt, setExpiresAt] = useState('')
  const [amount, setAmount] = useState('10')
  const [creditKind, setCreditKind] = useState<Exclude<CreditKind, 'consume'>>('paid')
  const [reason, setReason] = useState('')

  const assign = useMutation({
    mutationFn: () =>
      adminUsersApi.assignPlan(
        user.telegram_id,
        Number(planId),
        expiresAt ? new Date(expiresAt).toISOString() : null,
      ),
    onSuccess: () => {
      setPlanId('')
      setExpiresAt('')
      void qc.invalidateQueries({ queryKey: ['admin-tg-users'] })
      void qc.invalidateQueries({ queryKey: ['admin-tg-user'] })
      onAction()
    },
    onError,
  })

  const grant = useMutation({
    mutationFn: () =>
      adminUsersApi.grantCredits(user.telegram_id, Number(amount), creditKind, reason.trim()),
    onSuccess: () => {
      setReason('')
      void qc.invalidateQueries({ queryKey: ['admin-tg-users'] })
      void qc.invalidateQueries({ queryKey: ['admin-tg-user'] })
      onAction()
    },
    onError,
  })

  if (detail.isLoading) return <div className="px-4 py-3 text-sm text-muted">Загрузка…</div>
  if (detail.isError || !detail.data)
    return <div className="px-4 py-3 text-sm text-bad">Не удалось загрузить детали</div>

  const d = detail.data
  const activePlans = (plans.data ?? []).filter((p) => p.is_active)

  return (
    <div className="px-4 py-4 space-y-5 bg-line/20">
      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold">Квота сейчас</h3>
        <QuotaBlock quota={d.quota} />
      </section>

      {d.referral && (
        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">Рефералы</h3>
          <div className="text-sm space-y-1">
            <div>
              <span className="text-muted">Приглашён:</span>{' '}
              {d.referral.referred_by ? (
                <button
                  type="button"
                  className="text-accent hover:underline font-medium"
                  onClick={() => onOpenUser(d.referral!.referred_by!.telegram_id)}
                >
                  {d.referral.referred_by.username
                    ? `@${d.referral.referred_by.username}`
                    : d.referral.referred_by.first_name || d.referral.referred_by.telegram_id}
                  <span className="text-muted text-xs ml-1">
                    ({d.referral.referred_by.telegram_id})
                  </span>
                </button>
              ) : (
                <span className="text-muted">никто</span>
              )}
              {d.referral.referred_by?.referred_at && (
                <span className="text-muted text-xs ml-2">
                  {fmtDate(d.referral.referred_by.referred_at)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                L1: <span className="font-medium">{d.referral.counts.l1}</span>
              </span>
              <span>
                L2: <span className="font-medium">{d.referral.counts.l2}</span>
              </span>
              <span>
                L3: <span className="font-medium">{d.referral.counts.l3}</span>
              </span>
              <span className="text-muted">всего {d.referral.counts.total}</span>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Назначить тариф</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={planId}
            aria-label="Тариф"
            onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : '')}
            className={inputCls}
          >
            <option value="">Выберите тариф…</option>
            {activePlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="text-xs text-muted flex items-center gap-1.5">
            до (пусто — бессрочно):
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={inputCls}
            />
          </label>
          <button
            type="button"
            disabled={planId === '' || assign.isPending}
            onClick={() => assign.mutate()}
            className={btnCls}
          >
            {assign.isPending ? 'Назначаем…' : 'Назначить'}
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Кредиты (текущий баланс: {d.balance})</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            value={amount}
            aria-label="Сумма кредитов"
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputCls} w-24`}
            title="Положительное — начисление, отрицательное — списание"
          />
          <select
            value={creditKind}
            aria-label="Тип кредита"
            onChange={(e) => setCreditKind(e.target.value as Exclude<CreditKind, 'consume'>)}
            className={inputCls}
          >
            {Object.entries(CREDIT_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="flex-1 min-w-40 block">
            <span className="sr-only">Комментарий</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Комментарий"
              className={`${inputCls} w-full`}
            />
          </label>
          <button
            type="button"
            disabled={!Number(amount) || grant.isPending}
            onClick={() => grant.mutate()}
            className={btnCls}
          >
            {grant.isPending ? 'Применяем…' : 'Применить'}
          </button>
        </div>
      </section>

      {d.subscriptions.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">Подписки</h3>
          <ul className="text-sm space-y-1">
            {d.subscriptions.map((s) => (
              <li key={s.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{s.plan_name}</span>
                <span className={s.active ? 'text-ok text-xs' : 'text-muted text-xs'}>
                  {s.active ? 'активна' : 'истекла'}
                </span>
                <span className="text-muted text-xs">
                  назначена {fmtDate(s.created_at)}, действует до {fmtDate(s.expires_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.transactions.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">Последние транзакции</h3>
          <ul className="text-sm space-y-1">
            {d.transactions.map((t) => (
              <li key={t.id} className="flex flex-wrap gap-x-2">
                <span className={t.amount > 0 ? 'text-ok font-medium' : 'text-bad font-medium'}>
                  {t.amount > 0 ? `+${t.amount}` : t.amount}
                </span>
                <span className="text-xs text-muted">{t.kind}</span>
                {t.reason && <span className="text-xs">{t.reason}</span>}
                <span className="text-xs text-muted">{fmtDate(t.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export function UsersPage() {
  const { user, loading } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim())
      setOffset(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const users = useQuery({
    queryKey: ['admin-tg-users', q, offset],
    queryFn: () => adminUsersApi.list({ q: q || undefined, limit: PAGE_SIZE, offset }),
    enabled: !!user?.is_admin,
  })

  const invalidate = () => {
    setError(null)
    void qc.invalidateQueries({ queryKey: ['admin-tg-users'] })
    void qc.invalidateQueries({ queryKey: ['admin-tg-user'] })
  }
  const onError = (e: Error) => setError(e instanceof ApiError ? e.detail : e.message)

  const toggleBlock = useMutation({
    mutationFn: (u: TgUserListItem) => adminUsersApi.update(u.telegram_id, !u.is_blocked),
    onSuccess: invalidate,
    onError,
  })

  if (loading) {
    return <div className="text-sm text-muted">Загрузка…</div>
  }
  if (!user?.is_admin) {
    return <Navigate to="/" replace />
  }

  const total = users.data?.total ?? 0
  const items = users.data?.items ?? []

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Пользователи Telegram</h1>
          <p className="text-sm text-muted mt-0.5">
            Тарифы, кредиты и блокировки пользователей Mini App
          </p>
        </div>
        <label className="block w-72">
          <span className="sr-only">Поиск пользователей</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: имя, @username или id…"
            className={`${inputCls} w-full`}
          />
        </label>
      </div>

      {error && <div className="rounded-lg bg-bad/10 text-bad text-sm px-4 py-3">{error}</div>}

      <div className="bg-card border border-line rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Пользователь</th>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Тариф</th>
              <th className="px-4 py-3 font-medium">Кредиты</th>
              <th className="px-4 py-3 font-medium">Сегодня</th>
              <th className="px-4 py-3 font-medium">Месяц</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <Fragment key={u.telegram_id}>
                <tr
                  className="border-b border-line/60 cursor-pointer hover:bg-line/20"
                  onClick={() =>
                    setExpandedId((cur) => (cur === u.telegram_id ? null : u.telegram_id))
                  }
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {u.photo_url ? (
                        <img src={u.photo_url} alt="" className="size-8 rounded-full" />
                      ) : (
                        <div className="size-8 rounded-full bg-line/60 flex items-center justify-center text-xs font-semibold">
                          {(u.first_name?.[0] ?? '?').toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{displayName(u)}</div>
                        {u.username && <div className="text-xs text-muted">@{u.username}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{u.telegram_id}</td>
                  <td className="px-4 py-2.5">
                    {u.plan ? (
                      <span className="text-xs rounded-full px-2 py-0.5 bg-accent/10 text-accent">
                        {u.plan.name}
                      </span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{u.balance}</td>
                  <td className="px-4 py-2.5 text-muted">{u.used_today}</td>
                  <td className="px-4 py-2.5 text-muted">{u.used_month}</td>
                  <td className="px-4 py-2.5">
                    {u.is_blocked ? (
                      <span className="text-xs rounded-full px-2 py-0.5 bg-bad/10 text-bad">
                        заблокирован
                      </span>
                    ) : (
                      <span className="text-xs rounded-full px-2 py-0.5 bg-ok/10 text-ok">
                        активен
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={toggleBlock.isPending}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleBlock.mutate(u)
                      }}
                      className={`text-xs hover:underline underline-offset-2 disabled:opacity-50 ${
                        u.is_blocked ? 'text-ok' : 'text-bad'
                      }`}
                    >
                      {u.is_blocked ? 'разблокировать' : 'заблокировать'}
                    </button>
                  </td>
                </tr>
                {expandedId === u.telegram_id && (
                  <tr className="border-b border-line/60">
                    <td colSpan={8} className="p-0">
                      <UserDetailPanel
                        user={u}
                        onAction={invalidate}
                        onError={onError}
                        onOpenUser={(telegramId) => {
                          setSearch(String(telegramId))
                          setQ(String(telegramId))
                          setOffset(0)
                          setExpandedId(telegramId)
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {items.length === 0 && !users.isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted">
                  Пользователи появятся после первого входа в Mini App
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {users.isLoading && (
          <div className="px-4 py-10 text-center text-muted text-sm">Загрузка…</div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} из {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              className="rounded-lg border border-line px-3 py-1.5 hover:bg-line/40 disabled:opacity-50"
            >
              Назад
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              className="rounded-lg border border-line px-3 py-1.5 hover:bg-line/40 disabled:opacity-50"
            >
              Вперёд
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
