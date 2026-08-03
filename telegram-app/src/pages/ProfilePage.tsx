import { useQuery } from '@tanstack/react-query'
import { limitsApi, type QuotaResource } from '../api/limits'
import { useTelegramUser } from '../twa/telegram'

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

export function ProfilePage() {
  const user = useTelegramUser()
  const initials = (user?.first_name?.[0] ?? '?').toUpperCase()

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
          <h1 className="text-xl font-bold tracking-tight truncate">
            {user ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}` : 'Гость'}
          </h1>
          {user?.username && <p className="text-sm text-muted">@{user.username}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-card divide-y divide-line">
        {[
          ['ID Telegram', user ? String(user.id) : '—'],
          ['Язык', user?.language_code ?? '—'],
          ['Premium', user?.is_premium ? 'Да' : 'Нет'],
        ].map(([label, value]) => (
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

      <p className="text-center text-xs text-muted">
        Настройки генерации и уведомлений появятся позже.
      </p>
    </div>
  )
}
