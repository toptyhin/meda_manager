import { useEffect, useRef, useState } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { TabBar } from './TabBar'
import { useTelegramTheme } from '../theme/useTelegramTheme'

const TAB_BAR_HEIGHT = 'pb-20'

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
    }, 120)
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
  useTelegramTheme()
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()

  useEffect(() => {
    mainRef.current?.scrollTo?.(0, 0)
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="min-h-full flex flex-col">
      <main ref={mainRef} className={`flex-1 w-full max-w-lg mx-auto px-4 pt-4 ${TAB_BAR_HEIGHT}`}>
        <AnimatedOutlet />
      </main>
      <TabBar />
    </div>
  )
}
