import { NavLink } from 'react-router-dom'
import { haptic } from '../twa/telegram'

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function IconMedia() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  )
}

function IconProfile() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </svg>
  )
}

const tabBase =
  'flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 text-[11px] font-medium transition-colors'

export function TabBar() {
  return (
    <nav
      aria-label="Основная навигация"
      className="fixed bottom-0 inset-x-0 z-20 border-t border-line bg-card/90 backdrop-blur"
    >
      <div className="max-w-lg mx-auto flex items-end px-2 safe-bottom">
        <NavLink
          to="/"
          end
          onClick={() => haptic()}
          className={({ isActive }) =>
            `${tabBase} ${isActive ? 'text-accent' : 'text-muted'}`
          }
        >
          <IconHome />
          Главная
        </NavLink>

        <NavLink
          to="/create"
          onClick={() => haptic('medium')}
          aria-label="Создать"
          className="flex-1 flex flex-col items-center"
        >
          {({ isActive }) => (
            <>
              <span
                className={`-mt-5 flex items-center justify-center size-12 rounded-full shadow-lg transition-transform active:scale-95 bg-gradient-to-br from-grad-from via-grad-via to-grad-to text-white ${
                  isActive ? 'ring-2 ring-accent ring-offset-2 ring-offset-card' : ''
                }`}
              >
                <IconPlus />
              </span>
              <span
                className={`text-[11px] font-medium mt-0.5 ${isActive ? 'text-accent' : 'text-muted'}`}
              >
                Создать
              </span>
            </>
          )}
        </NavLink>

        <NavLink
          to="/media"
          onClick={() => haptic()}
          className={({ isActive }) =>
            `${tabBase} ${isActive ? 'text-accent' : 'text-muted'}`
          }
        >
          <IconMedia />
          Медиа
        </NavLink>

        <NavLink
          to="/profile"
          onClick={() => haptic()}
          className={({ isActive }) =>
            `${tabBase} ${isActive ? 'text-accent' : 'text-muted'}`
          }
        >
          <IconProfile />
          Профиль
        </NavLink>
      </div>
    </nav>
  )
}
