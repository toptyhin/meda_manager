import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ThemeToggle } from './ThemeToggle'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition ${
    isActive ? 'bg-ink text-paper' : 'text-muted hover:text-ink hover:bg-line/50'
  }`

export function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-line bg-card/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center gap-x-4 md:h-14 md:flex-nowrap md:gap-6">
          <div className="order-1 h-14 md:h-auto flex items-center font-semibold tracking-tight text-ink">
            Media <span className="text-accent">Manager</span>
          </div>
          <nav className="order-3 w-full md:order-2 md:w-auto flex gap-1 overflow-x-auto pb-2 md:pb-0 -mx-1 px-1">
            <NavLink to="/" end className={linkClass}>
              Медиа
            </NavLink>
            <NavLink to="/prompts" className={linkClass}>
              Промпты
            </NavLink>
            <NavLink to="/generate" className={linkClass}>
              Генерация
            </NavLink>
            {user?.is_admin && (
              <NavLink to="/invites" className={linkClass}>
                Инвайты
              </NavLink>
            )}
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
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
