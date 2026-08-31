import { Menu, Moon, Sun } from 'lucide-react'
import { useLocation, Link } from 'react-router-dom'
import { NAV_GROUPS } from '../navConfig'
import { useTheme } from '../context/ThemeContext'

function getCurrentMeta(pathname) {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === `/${item.path}`) {
        return { label: item.label, group: group.label }
      }
    }
  }
  return { label: 'Beranda', group: null }
}

export default function TopBar({ onMenuClick }) {
  const location = useLocation()
  const { label, group } = getCurrentMeta(location.pathname)
  const { isDark, toggleTheme } = useTheme()

  return (
    <header className="flex h-14 items-center justify-between border-b border-[--color-border] bg-[--color-surface] px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="flex h-9 w-9 items-center justify-center rounded border border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3] hover:text-[--color-text] lg:hidden"
          title="Buka Menu"
        >
          <Menu size={18} />
        </button>

        <div className="flex items-center gap-2 text-sm">
          {group ? (
            <>
              <Link
                to="/"
                className="text-[--color-text-3] hover:text-[--color-text] no-underline transition-colors hidden sm:inline"
              >
                Tools
              </Link>
              <span className="text-[--color-text-3] hidden sm:inline">/</span>
              <span className="text-[--color-text-3] text-xs font-semibold uppercase tracking-wider">
                {group}
              </span>
              <span className="text-[--color-text-3]">/</span>
              <span className="font-semibold text-[--color-text]">{label}</span>
            </>
          ) : (
            <span className="font-semibold text-[--color-text]">DokuLens</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Dark mode switch */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded border border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3] hover:text-[--color-text] transition-colors"
          title={isDark ? 'Beralih ke Light Mode' : 'Beralih ke Dark Mode'}
        >
          {isDark ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  )
}
