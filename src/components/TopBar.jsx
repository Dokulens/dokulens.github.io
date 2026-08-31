import { Menu, Moon, Sun, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
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

export default function TopBar({ onMenuClick, isCollapsed, onToggleCollapse }) {
  const location = useLocation()
  const { label, group } = getCurrentMeta(location.pathname)
  const { isDark, toggleTheme } = useTheme()

  return (
    <header className="flex h-14 items-center justify-between border-b border-[--color-border] bg-[--color-surface] px-4 lg:px-6 select-none">
      <div className="flex items-center gap-3">
        {/* Mobile menu toggle */}
        <button
          onClick={onMenuClick}
          className="flex h-9 w-9 items-center justify-center rounded border border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3] hover:text-[--color-text] lg:hidden"
          title="Buka Menu"
        >
          <Menu size={18} />
        </button>

        {/* Desktop sidebar collapse/expand toggle */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex h-8 w-8 items-center justify-center rounded border border-[--color-border] text-[--color-text-3] hover:bg-[--color-surface-3] hover:text-[--color-text] transition-colors"
          title={isCollapsed ? 'Expand Sidebar' : 'Minimize Sidebar'}
        >
          {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
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
              <span className="text-[--color-text-3] text-xs font-semibold uppercase tracking-wider hidden sm:inline">
                {group}
              </span>
              <span className="text-[--color-text-3] hidden sm:inline">/</span>
              <span className="font-semibold text-[--color-text]">{label}</span>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[--color-text]">DokuLens</span>
              <span className="text-xs text-[--color-text-3]">by</span>
              <a
                href="https://github.com/naufal-backup"
                target="_blank"
                rel="noreferrer"
                className="rounded bg-[--color-surface-3] px-2 py-0.5 text-xs font-semibold text-[--color-brand-text] hover:underline no-underline"
              >
                naufal-backup
              </a>
            </div>
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
