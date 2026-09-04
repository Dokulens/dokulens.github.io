import { Menu, Moon, Sun, PanelLeftClose } from 'lucide-react'
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
    <header className="flex h-14 items-center justify-between border-b border-(--color-border) bg-(--color-surface) px-4 lg:px-6 select-none">
      <div className="flex items-center gap-3">
        {/* Mobile menu toggle */}
        <button
          onClick={onMenuClick}
          className="flex h-9 w-9 items-center justify-center rounded border border-(--color-border) text-(--color-text-2) hover:bg-(--color-surface-3) hover:text-(--color-text) lg:hidden"
          title="Buka Menu"
        >
          <Menu size={18} />
        </button>

        {/* Desktop sidebar collapse/expand toggle */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex h-8 w-8 items-center justify-center rounded border border-(--color-border) text-(--color-text-3) hover:bg-(--color-surface-3) hover:text-(--color-text) transition-all duration-300"
          title={isCollapsed ? 'Expand Sidebar' : 'Minimize Sidebar'}
        >
          <span className={`inline-block transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}>
            <PanelLeftClose size={16} />
          </span>
        </button>

        <div className="flex items-center gap-2 text-sm">
          {group ? (
            <>
              <Link
                to="/"
                className="text-(--color-text-3) hover:text-(--color-text) no-underline transition-colors hidden sm:inline"
              >
                Tools
              </Link>
              <span className="text-(--color-text-3) hidden sm:inline">/</span>
              <span className="text-(--color-text-3) text-xs font-semibold uppercase tracking-wider hidden sm:inline">
                {group}
              </span>
              <span className="text-(--color-text-3) hidden sm:inline">/</span>
              <span className="font-semibold text-(--color-text)">{label}</span>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-(--color-text)">DokuLens</span>
              <span className="text-xs text-(--color-text-3)">by</span>
              <a
                href="https://github.com/naufal-backup"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-(--color-text) hover:underline no-underline"
              >
                Naufal Alamsyah
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Donate button */}
        <a
          href="https://saweria.co/Naufal453"
          target="_blank"
          rel="noreferrer"
          className="flex h-9 items-center gap-1.5 rounded border border-(--color-border) bg-(--color-surface) px-2.5 text-(--color-text-2) hover:bg-(--color-surface-3) hover:text-(--color-text) transition-colors no-underline"
          title="Support!"
        >
          <svg viewBox="0 0 314.17 224.5" className="h-5 w-5 shrink-0" xmlns="http://www.w3.org/2000/svg">
            <path fill="#d88b0f" d="M235.87,215.82" transform="translate(-33.88 -43.6)"/>
            <path fill="#fff" stroke="#232323" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" d="M242,151.15l25.1-2.25s16.51,23.49,47.4,15.32,36-42.89,27.32-60S306.2,79.63,286.88,85.59c-22.19,6.84-34.67,33.59-27.83,48.51Z" transform="translate(-33.88 -43.6)"/>
            <path fill="#ffc13a" stroke="#232323" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" d="M300.24,117.93s-6.81-5.62-14.55-1.2-8.77,19,21.95,24.34c0,0,22.13-22.55,11.75-31.83S300.24,117.93,300.24,117.93Z" transform="translate(-33.88 -43.6)"/>
            <path fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="5" d="M312.66,112.22s3.58,1.37,2.3,7.24" transform="translate(-33.88 -43.6)"/>
            <line fill="none" stroke="#fff" strokeLinecap="round" x1="276.82" y1="84.88" x2="277.33" y2="84.11"/>
            <path fill="#ffa401" d="M97.34,100.66l-9.1-12L85,70.35,82.63,54.82l-11.07-8L58.45,50.1,53.68,67.72l4.26,18.55,3.71,9.13,7.44,6.78L74.71,106l6.46,3.15,4.87,1.9L85,115,52.67,160.64l-9.8,17-5.44,15.48,2.92,5.53,6.58-.5,2,2.08L42.49,220.5l2.81,10.08,4,3.53,8.37,6,7,4,5.68.85,4.11,6.68,7.43,8.45L89.17,264l7.4,2,9.71-.89s10.5-2.38,10.69-2.46,8.21-4.67,8.21-4.67l2.7-4,9.25-1.8,10.09,1,9,1.53,8.1,6.15,21.22,2.75,11.72-5.9,6-4.09,3.63-6.25,4.12-3.7,11.69-3.48L236,229.39l3.1-10-2.38-8.68-3.23-8.51,1.19-4,7,1.21,2.21-4.19-6.48-17.69-19.5-31.69L199,119.67l-5.28-5.26,2.22-3.53,11.26-4.5,10.64-8.16,6.15-12,2.66-12.77-.89-13.07-4.6-10.8-8-3.71-11.75,3.19-5.48,8.3-1.51,13.82-1.27,13-6,13.61-4,2.88-8.79-.34L161,97.41l-17.56-1.72L120.84,97l-18.3,5.14-5.2-1.44" transform="translate(-33.88 -43.6)"/>
            <polyline fill="#e56467" stroke="#232323" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" points="94.97 153.4 95.09 159.5 99.5 168.37 102.78 171.57 107.89 172.45 113.59 170.16 116.16 166.24 117.67 158.58 119.52 155.61 116.16 152.11 108.65 147.18 103.88 147.18 101.5 150.84 94.97 153.4"/>
            <ellipse fill="#a585db" cx="105.93" cy="117.94" rx="32.94" ry="15.19"/>
            <path fill="#ffc25f" d="M104.33,101.2s64.21,5.69,69.19,2.24-13.59-5.28-13.59-5.28l-40.11-.45-16.33,2.92" transform="translate(-33.88 -43.6)"/>
            <path fill="#ffc25f" d="M200.07,51.12s16-6.26,17.1,8.93a122.31,122.31,0,0,0,5.18,27.07l1.72-14.43.91-8.8-1.95-8-5.33-7.76-9.59-1.77Z" transform="translate(-33.88 -43.6)"/>
            <path fill="#ffc25f" d="M58,52.05s16.68,0,17.19,24S92.05,97,92.05,97l-4.52-7.89-1.71-9-1-12-1.11-7.64-1.3-7-4.28-4-9.17-3.44L61.78,48.5" transform="translate(-33.88 -43.6)"/>
            <path fill="#ffc25f" d="M221.7,152.42s13.32,44.16,17.5,45.69,2.73-4.25,2.73-4.25L239,184" transform="translate(-33.88 -43.6)"/>
            <path fill="#ffc25f" d="M183.86,218s22.85,12.91,23.29,22.61-3.76-17.1-3.76-17.1L196.8,218l-4.14-.88h-7.53" transform="translate(-33.88 -43.6)"/>
            <path fill="#ffc25f" d="M103.37,223.46s9.25.7,10.21,7.85,16.53,8,17.23,13,1.25-6.68,1.25-6.68l-4.31-5.39-4.66-3.06-5.38,3-2.47-6.38-1.66-3.9Z" transform="translate(-33.88 -43.6)"/>
            <path fill="#d88b0f" d="M72.79,232.52s9.45,29.33,31.53,30.94-14.93,1.36-14.93,1.36l-11.54-8.63s-4.83-5.7-5.06-6.07-5.1-6.24-5.1-6.24l-11.07-4.24L45,230.79" transform="translate(-33.88 -43.6)"/>
            <polyline fill="#d88b0f" points="111.68 199.08 96.27 205.39 96.27 209.22 112.9 209.13 114.69 205.54 111.04 199.08"/>
            <polyline fill="#d88b0f" points="173.84 189.99 192.23 190.92 184.54 199.52 173.3 200.2 174.36 191.6"/>
            <path fill="#d88b0f" d="M146.58,238.69s22.11,22.61,32,23.6-12.8-1.11-12.8-1.11l-6.58-3.94-7.69-5-5-4.5-3.19-7.31" transform="translate(-33.88 -43.6)"/>
            <path fill="#d88b0f" d="M122.52,200.22s5.48,18.26,11.68,18.64,5.44-2.61,5.44-2.61l-8.57-6.71-3-6.7-1.85-3.63-5.3.31" transform="translate(-33.88 -43.6)"/>
            <path fill="#d88b0f" d="M190.05,91.05s8.55,12.47,1.85,12.6-10.41-4.92-10.21-5,3.76-2.16,3.76-2.16l2.94-2.89,1.21-3.7" transform="translate(-33.88 -43.6)"/>
            <path fill="#d88b0f" d="M53.68,67.72s16.05,31.14,25,33.57,6,9.23,6,9.23l-11.34-4-7.68-4.9-6.25-6.89L54.18,82l-.5-9.29Z" transform="translate(-33.88 -43.6)"/>
            <path fill="#d88b0f" d="M71.7,131.74s-24.78,55.31-23.29,64-2.63,1.91-2.63,1.91l-4.53,1.51-5-5.25L37.52,187l6-13.1,14.73-23.74" transform="translate(-33.88 -43.6)"/>
            <path fill="#d88b0f" d="M48.78,197.67s-.12,28,6.86,30,18.19,2.17,18.19,2.17l-7.29,8.81s-8.68-4-9.54-4.17-9.7-3.73-9.7-3.73L42,226.36l-.72-3.25" transform="translate(-33.88 -43.6)"/>
            <ellipse fill="#232323" cx="74.02" cy="104.2" rx="10.89" ry="18.13"/>
            <ellipse fill="#232323" cx="136.25" cy="104.2" rx="10.89" ry="18.13"/>
            <path fill="#232323" d="M160.11,171.05c0,5.19-9.25,9.39-20.66,9.39a38.24,38.24,0,0,1-13.26-2.19c-4.52-1.72-7.4-4.31-7.4-7.2,0-5.18,9.25-9.38,20.66-9.38S160.11,165.87,160.11,171.05Z" transform="translate(-33.88 -43.6)"/>
            <ellipse fill="#232323" cx="105.57" cy="136.07" rx="10.6" ry="7.53"/>
          </svg>
          <span className="text-xs font-semibold hidden sm:inline">Support!</span>
        </a>

        {/* Dark mode switch */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded border border-(--color-border) bg-(--color-surface) text-(--color-text-2) hover:bg-(--color-surface-3) hover:text-(--color-text) transition-colors"
          title={isDark ? 'Beralih ke Light Mode' : 'Beralih ke Dark Mode'}
        >
          {isDark ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  )
}
