import { Link } from 'react-router-dom'
import { haptic } from '../twa/telegram'

function IconPhoto() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="m21 15-4.2-4.2a1.5 1.5 0 0 0-2.1 0L6 19.5" />
    </svg>
  )
}

function IconVideo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="5" width="14" height="14" rx="3" />
      <path d="M16.5 10.5 21.5 7v10l-5-3.5" />
    </svg>
  )
}

function IconChevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}

export function CreatePage() {
  return (
    <div className="flex flex-col gap-5 pt-2 anim-fade-up">
      <header className="flex items-start gap-2">
        <Link
          to="/"
          onClick={() => haptic()}
          aria-label="Назад"
          className="inline-flex items-center justify-center size-9 shrink-0 rounded-xl border border-line bg-card text-muted active:scale-95 transition-transform"
        >
          <IconBack />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">Создать</h1>
          <p className="mt-1 text-sm text-muted">Выберите, что хотите сгенерировать</p>
        </div>
      </header>

      <div className="flex flex-col gap-2.5">
        <Link
          to="/create/photo"
          onClick={() => haptic('medium')}
          className="group flex items-center gap-3.5 rounded-2xl border border-line bg-card p-4 active:scale-[0.98] transition-transform"
        >
          <span className="inline-flex shrink-0 items-center justify-center size-12 rounded-xl bg-gradient-to-br from-grad-from via-grad-via to-grad-to text-white shadow-md">
            <IconPhoto />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-base font-semibold">Фото</span>
            <span className="block text-xs text-muted mt-0.5 leading-snug">
              Изображение по текстовому описанию
            </span>
          </span>
          <span className="text-muted/60 group-active:text-accent transition-colors">
            <IconChevron />
          </span>
        </Link>

        <div
          aria-disabled
          className="flex items-center gap-3.5 rounded-2xl border border-line bg-card/60 p-4 opacity-60 select-none"
        >
          <span className="inline-flex shrink-0 items-center justify-center size-12 rounded-xl bg-accent-soft text-accent">
            <IconVideo />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-base font-semibold">Видео</span>
            <span className="block text-xs text-muted mt-0.5 leading-snug">
              Генерация роликов появится позже
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-accent-soft text-accent text-[11px] font-semibold px-2.5 py-1">
            Скоро
          </span>
        </div>
      </div>
    </div>
  )
}
