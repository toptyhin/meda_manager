import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCurrentUser } from '../api/auth'
import { limitsApi, type QuotaResource } from '../api/limits'
import { referralsApi, type ReferralUserBrief } from '../api/referrals'
import { getWebApp, haptic, hapticNotify, useTelegramUser } from '../twa/telegram'

const RESOURCE_LABELS: Record<QuotaResource['resource_kind'], string> = {
  image: 'Изображения',
  video: 'Видео',
}

const PERIOD_LABELS: Record<QuotaResource['period'], string> = {
  daily: 'в день',
  weekly: 'в неделю',
  monthly: 'в месяц',
  total: 'всего',
}

function fmtReset(resetAt: string | null): string | null {
  if (!resetAt) return null
  const d = new Date(resetAt)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('ru-RU')
}

function fmtShortDate(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU')
}

function displayReferralName(u: ReferralUserBrief): string {
  if (u.username) return `@${u.username}`
  return u.first_name || String(u.telegram_id)
}

function QuotaCard() {
  const quota = useQuery({ queryKey: ['limits-me'], queryFn: limitsApi.me })

  if (quota.isLoading) {
    return <p className="px-4 py-3 text-sm text-muted">Загрузка лимитов…</p>
  }
  if (quota.isError || !quota.data) {
    return <p className="px-4 py-3 text-sm text-muted">Не удалось загрузить лимиты</p>
  }

  const q = quota.data
  if (!q.enforcement_enabled) {
    return (
      <p className="px-4 py-3 text-sm text-muted">
        Лимиты пока не настроены — генерации без ограничений.
      </p>
    )
  }

  const rows: Array<[string, string]> = q.resources.map((r) => {
    const label = `${RESOURCE_LABELS[r.resource_kind]} ${PERIOD_LABELS[r.period]}`
    if (r.limit == null) return [label, 'безлимит']
    const reset = fmtReset(r.reset_at)
    const value = `${r.remaining ?? 0} из ${r.limit}${reset ? ` · обновится ${reset}` : ''}`
    return [label, value]
  })
  rows.push(['Кредиты', String(q.credits)])

  return (
    <div className="divide-y divide-line">
      {q.plan && (
        <div className="flex items-center justify-between px-4 py-3 text-sm">
          <span className="text-muted">Тариф</span>
          <span className="font-medium">
            {q.plan.name}
            {q.plan.expires_at && (
              <span className="text-muted text-xs"> · до {fmtReset(q.plan.expires_at)}</span>
            )}
          </span>
        </div>
      )}
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span className="text-muted">{label}</span>
          <span className="font-medium text-right">{value}</span>
        </div>
      ))}
    </div>
  )
}

function ReferralsCard() {
  const [copied, setCopied] = useState(false)
  const referrals = useQuery({ queryKey: ['referrals-me'], queryFn: referralsApi.me, retry: false })

  if (referrals.isLoading) {
    return <p className="px-4 py-3 text-sm text-muted">Загрузка…</p>
  }
  if (referrals.isError || !referrals.data) {
    return (
      <p className="px-4 py-3 text-sm text-muted">
        Реферальная программа доступна после входа через Telegram.
      </p>
    )
  }

  const data = referrals.data
  const shareText = 'Присоединяйся — генерируй изображения и видео с ИИ'
  const shareUrl = data.link
    ? `https://t.me/share/url?url=${encodeURIComponent(data.link)}&text=${encodeURIComponent(shareText)}`
    : null

  async function copyLink() {
    const text = data.link ?? data.code
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      hapticNotify('success')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      hapticNotify('error')
    }
  }

  function share() {
    if (!shareUrl) return
    haptic('light')
    const wa = getWebApp()
    if (wa?.openTelegramLink) wa.openTelegramLink(shareUrl)
    else window.open(shareUrl, '_blank')
  }

  return (
    <div className="divide-y divide-line">
      <div className="px-4 py-3 space-y-2">
        <p className="text-sm text-muted">
          Поделитесь ссылкой — друзья и их приглашённые попадут в вашу сеть до 3 уровней.
        </p>
        {data.link ? (
          <p className="text-xs font-mono break-all text-ink/80 bg-paper rounded-lg px-3 py-2 border border-line">
            {data.link}
          </p>
        ) : (
          <p className="text-xs text-muted">
            Код: <span className="font-mono text-ink">{data.code}</span>
            <span className="block mt-1">Ссылка появится после настройки TELEGRAM_APP_URL.</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyLink()}
            className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white"
          >
            {copied ? 'Скопировано' : data.link ? 'Копировать ссылку' : 'Копировать код'}
          </button>
          {shareUrl && (
            <button
              type="button"
              onClick={share}
              className="rounded-xl border border-line bg-paper px-3 py-2 text-sm font-medium"
            >
              Поделиться
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-line">
        {(
          [
            ['L1', data.counts.l1],
            ['L2', data.counts.l2],
            ['L3', data.counts.l3],
          ] as const
        ).map(([label, count]) => (
          <div key={label} className="px-3 py-3 text-center">
            <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
            <div className="text-lg font-bold tabular-nums">{count}</div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Прямые рефералы</h3>
          <span className="text-xs text-muted">всего {data.counts.total}</span>
        </div>
        {data.levels.l1.length === 0 ? (
          <p className="text-sm text-muted">Пока никого нет — отправьте ссылку друзьям.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.levels.l1.map((u) => (
              <li
                key={u.telegram_id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate font-medium">{displayReferralName(u)}</span>
                <span className="text-xs text-muted shrink-0">{fmtShortDate(u.referred_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function ProfilePage() {
  const user = useTelegramUser()
  // Dev-вход без Telegram: профиль веб-аккаунта из JWT
  const me = useCurrentUser(user === null)
  const devUser = user === null ? me.data : undefined
  const displayName = user
    ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`
    : (devUser?.username ?? 'Гость')
  const initials = (user?.first_name?.[0] ?? devUser?.username?.[0] ?? '?').toUpperCase()
  const metaRows: Array<[string, string]> = user
    ? [
        ['ID Telegram', String(user.id)],
        ['Язык', user.language_code ?? '—'],
        ['Premium', user.is_premium ? 'Да' : 'Нет'],
      ]
    : [
        ['Логин', devUser?.username ?? '…'],
        ['ID', devUser ? String(devUser.id) : '…'],
        ['Права', devUser ? (devUser.is_admin ? 'Админ' : 'Пользователь') : '…'],
      ]

  return (
    <div className="flex flex-col gap-5 anim-fade-up">
      <div className="flex items-center gap-3.5 pt-2">
        {user?.photo_url ? (
          <img
            src={user.photo_url}
            alt=""
            width={56}
            height={56}
            className="size-14 rounded-full ring-2 ring-accent/40"
          />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-grad-from via-grad-via to-grad-to text-white text-xl font-bold">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">{displayName}</h1>
          {user?.username && <p className="text-sm text-muted">@{user.username}</p>}
          {!user && devUser?.is_admin && <p className="text-sm text-muted">администратор</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-card divide-y divide-line">
        {metaRows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-muted">{label}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">Тариф и лимиты</h2>
        <div className="rounded-2xl border border-line bg-card">
          <QuotaCard />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
          Пригласить друзей
        </h2>
        <div className="rounded-2xl border border-line bg-card">
          <ReferralsCard />
        </div>
      </section>

      <p className="text-center text-xs text-muted">
        Настройки генерации и уведомлений появятся позже.
      </p>
    </div>
  )
}
