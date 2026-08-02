import { Link } from 'react-router-dom'
import { haptic, telegramGreetingName, useTelegramUser } from '../twa/telegram'

function IconSparkles() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z" />
      <path d="M19 14l.9 2.1 2.1.9-2.1.9L19 20l-.9-2.1-2.1-.9 2.1-.9L19 14z" />
      <path d="M5 16l.7 1.8 1.8.7-1.8.7L5 21l-.7-1.8-1.8-.7 1.8-.7L5 16z" />
    </svg>
  )
}

function IconVideo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="5" width="14" height="14" rx="3" />
      <path d="M16.5 10.5 21.5 7v10l-5-3.5" />
    </svg>
  )
}

function IconGrid() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  )
}

function IconPrompt() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16M4 10h16M4 15h9" />
      <path d="m17 16 2.5 2.5L17 21" />
    </svg>
  )
}

function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function IconArrowRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </svg>
  )
}

const quickActions = [
  {
    to: '/create',
    icon: <IconVideo />,
    title: 'Видео',
    caption: 'Оживлятор, Режиссёр, Сторимейкер',
  },
  {
    to: '/media',
    icon: <IconGrid />,
    title: 'Медиатека',
    caption: 'Все изображения и видео',
  },
  {
    to: '/media',
    icon: <IconPrompt />,
    title: 'Промпты',
    caption: 'Категории и версии',
  },
  {
    to: '/media',
    icon: <IconSparkles />,
    title: 'Стили',
    caption: 'Пресеты оформления',
  },
]

export function HomePage() {
  const user = useTelegramUser()
  const name = telegramGreetingName(user)

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3 anim-fade-up">
        <img
          src="/logo.png"
          alt=""
          width={52}
          height={52}
          className="size-13 rounded-2xl shadow-md ring-1 ring-line anim-float"
        />
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">
            Привет, {name}!
          </h1>
          <p className="text-sm text-muted">Что создадим сегодня?</p>
        </div>
      </header>

      <section
        aria-label="Быстрый старт"
        className="relative overflow-hidden rounded-3xl p-5 text-white bg-gradient-to-br from-grad-from via-grad-via to-grad-to shadow-lg anim-fade-up"
        style={{ animationDelay: '60ms' }}
      >
        <div
          aria-hidden
          className="absolute -top-10 -right-10 size-36 rounded-full bg-white/15 blur-2xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-14 -left-6 size-40 rounded-full bg-pink/30 blur-3xl"
        />
        <div className="relative flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider bg-white/20 rounded-full px-2.5 py-1">
              <IconSparkles />
              Nexora
            </span>
            <h2 className="mt-2.5 text-lg font-bold leading-snug">
              Генерация изображений
            </h2>
            <p className="mt-1 text-sm text-white/80 leading-snug">
              Опишите идею — автопайплайн доведёт результат до качества
            </p>
            <Link
              to="/create"
              onClick={() => haptic('medium')}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-white text-[#4a2a80] text-sm font-semibold px-4 py-2.5 shadow active:scale-95 transition-transform"
            >
              Создать изображение
              <IconArrowRight />
            </Link>
          </div>
          <img
            src="/logo.png"
            alt=""
            width={104}
            height={104}
            className="hidden min-[380px]:block size-26 drop-shadow-xl anim-float"
            style={{ animationDelay: '0.8s' }}
          />
        </div>
      </section>

      <section aria-label="Разделы" className="anim-fade-up" style={{ animationDelay: '120ms' }}>
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2.5 px-1">
          Разделы
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          {quickActions.map((a) => (
            <Link
              key={a.title}
              to={a.to}
              onClick={() => haptic()}
              className="group flex flex-col gap-2 rounded-2xl border border-line bg-card p-3.5 active:scale-[0.98] transition-transform"
            >
              <span className="flex items-center justify-between">
                <span className="inline-flex items-center justify-center size-10 rounded-xl bg-accent-soft text-accent">
                  {a.icon}
                </span>
                <span className="text-muted/60 group-active:text-accent transition-colors">
                  <IconChevron />
                </span>
              </span>
              <span>
                <span className="block text-sm font-semibold">{a.title}</span>
                <span className="block text-xs text-muted mt-0.5 leading-snug">
                  {a.caption}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Недавние генерации" className="anim-fade-up" style={{ animationDelay: '180ms' }}>
        <div className="flex items-baseline justify-between mb-2.5 px-1">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
            Недавнее
          </h3>
          <Link to="/media" className="text-xs font-medium text-accent">
            Все файлы
          </Link>
        </div>
        <div className="rounded-2xl border-2 border-dashed border-line bg-card/60 px-5 py-8 text-center">
          <div className="mx-auto mb-3 inline-flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
            <IconGrid />
          </div>
          <p className="text-sm font-medium">Пока пусто</p>
          <p className="mt-1 text-xs text-muted leading-relaxed">
            Здесь появятся ваши последние генерации.
            <br />
            Начните с кнопки «Создать» ниже.
          </p>
        </div>
      </section>
    </div>
  )
}
