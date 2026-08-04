import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useOutlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ThemeToggle } from './ThemeToggle'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition ${
    isActive ? 'bg-ink text-paper' : 'text-muted hover:text-ink hover:bg-line/50'
  }`

const sideLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2.5 rounded-lg text-sm font-medium transition ${
    isActive ? 'bg-ink text-paper' : 'text-ink hover:bg-line/50'
  }`

function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()
  const [rendered, setRendered] = useState({ key: location.pathname, outlet })
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (location.pathname === rendered.key) return
    setFading(true)
    const timer = setTimeout(() => {
      setRendered({ key: location.pathname, outlet })
      setFading(false)
    }, 150)
    return () => clearTimeout(timer)
  }, [location.pathname, outlet, rendered.key])

  return (
    <div
      className={`transition-opacity duration-150 starting:opacity-0 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {rendered.outlet}
    </div>
  )
}

export function Layout() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    if (menuOpen && !el.open) el.showModal()
    else if (!menuOpen && el.open) el.close()
    function onCancel(e: Event) {
      e.preventDefault()
      setMenuOpen(false)
    }
    function onClick(e: MouseEvent) {
      if (e.target === el) setMenuOpen(false)
    }
    el.addEventListener('cancel', onCancel)
    el.addEventListener('click', onClick)
    return () => {
      el.removeEventListener('cancel', onCancel)
      el.removeEventListener('click', onClick)
    }
  }, [menuOpen])

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-line bg-card/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center gap-x-4 md:h-14 md:flex-nowrap md:gap-6">
          <div className="order-1 h-14 md:h-auto flex items-center gap-2.5 font-semibold tracking-tight text-ink">
            <img src="/logo.png" alt="" className="size-8 rounded-lg" width={32} height={32} />
            <span>
              Media <span className="text-accent">Manager</span>
            </span>
          </div>
          <nav
            aria-label="Основная навигация"
            className="order-3 w-full md:order-2 md:w-auto flex gap-1 overflow-x-auto pb-2 md:pb-0 -mx-1 px-1"
          >
            <NavLink to="/" end className={linkClass}>
              Медиа
            </NavLink>
            <NavLink to="/prompts" className={linkClass}>
              Промпты
            </NavLink>
            <NavLink to="/generate" className={linkClass}>
              Изображения
            </NavLink>
            <NavLink to="/video" className={linkClass}>
              Видео
            </NavLink>
          </nav>
          <div className="order-2 md:order-3 ml-auto flex items-center gap-2 md:gap-3 text-sm">
            <ThemeToggle />
            <span className="text-muted hidden sm:inline">{user?.username}</span>
            <button
              type="button"
              onClick={logout}
              className="px-3 py-1.5 rounded-md border border-line hover:bg-line/40"
            >
              Выйти
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="p-1.5 rounded-md border border-line hover:bg-line/40 text-muted hover:text-ink"
              aria-label="Открыть меню"
              title="Меню"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <AnimatedOutlet />
      </main>

      <dialog
        ref={menuRef}
        aria-label="Меню"
        className="fixed right-0 top-0 left-auto bottom-auto m-0 h-full max-h-none w-72 max-w-[85vw] border-0 border-l border-line bg-card text-ink shadow-xl p-0 translate-x-full open:translate-x-0 starting:open:translate-x-full transition-transform transition-discrete duration-300 ease-out backdrop:bg-backdrop/40 backdrop:opacity-0 open:backdrop:opacity-100 starting:open:backdrop:opacity-0 backdrop:transition-opacity backdrop:transition-discrete backdrop:duration-300"
      >
        <div className="flex items-center justify-between gap-2 px-4 h-14 border-b border-line">
          <span className="font-semibold text-sm">Меню</span>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="text-muted hover:text-ink text-xl leading-none px-1"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <nav aria-label="Дополнительное меню" className="p-3 flex flex-col gap-1">
          <NavLink
            to="/models"
            className={sideLinkClass}
            onClick={() => setMenuOpen(false)}
          >
            Модели
          </NavLink>
          <NavLink
            to="/styles"
            className={sideLinkClass}
            onClick={() => setMenuOpen(false)}
          >
            Стили
          </NavLink>
          <NavLink
            to="/invites"
            className={sideLinkClass}
            onClick={() => setMenuOpen(false)}
          >
            Инвайты
          </NavLink>
          {user?.is_admin && (
            <>
              <NavLink
                to="/tariffs"
                className={sideLinkClass}
                onClick={() => setMenuOpen(false)}
              >
                Тарифы
              </NavLink>
              <NavLink
                to="/users"
                className={sideLinkClass}
                onClick={() => setMenuOpen(false)}
              >
                Пользователи
              </NavLink>
              <NavLink
                to="/prompt-gen"
                className={sideLinkClass}
                onClick={() => setMenuOpen(false)}
              >
                Генератор промптов
              </NavLink>
              <NavLink
                to="/settings"
                className={sideLinkClass}
                onClick={() => setMenuOpen(false)}
              >
                Настройки
              </NavLink>
            </>
          )}
        </nav>
      </dialog>
    </div>
  )
}
