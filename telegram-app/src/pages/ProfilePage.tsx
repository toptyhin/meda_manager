import { useTelegramUser } from '../twa/telegram'

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

      <p className="text-center text-xs text-muted">
        Настройки генерации и уведомлений появятся позже.
      </p>
    </div>
  )
}
