import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { X, PanelLeftClose, PanelLeftOpen, ShieldCheck, Home } from 'lucide-react'
import * as Icons from 'lucide-react'
import { NAV_GROUPS } from '../navConfig'
import PWAInstallBanner from './PWAInstallBanner'

function NavIcon({ name, active }) {
  const Comp = Icons[name]
  if (!Comp) return null
  return (
    <Comp
      size={18}
      className={
        active
          ? 'text-(--color-brand) shrink-0 scale-110 transition-transform duration-200'
          : 'text-(--color-text-2) group-hover:text-(--color-text) shrink-0 transition-colors duration-150'
      }
    />
  )
}

export default function Sidebar({ onClose, isCollapsed, onToggleCollapse }) {
  const location = useLocation()

  return (
    <div
      className="flex h-full flex-col bg-(--color-surface) select-none overflow-hidden"
      style={{
        backgroundColor: 'var(--color-surface)',
        transition: 'all 300ms ease-in-out',
      }}
    >
      {/* Brand Header */}
      <div 
        className="flex h-14 items-center border-b border-(--color-border)"
        style={{
          transition: 'padding 300ms ease-in-out',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          paddingLeft: isCollapsed ? 8 : 16,
          paddingRight: isCollapsed ? 8 : 16,
        }}
      >
        <NavLink
          to="/"
          onClick={onClose}
          className="flex items-center gap-2.5 text-(--color-text) no-underline transition-opacity hover:opacity-85"
          title="DokuLens Beranda"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded bg-(--color-brand) shrink-0">
            <Icons.FileSearch size={18} className="text-white" style={{ color: '#ffffff' }} />
          </div>
          <div 
            style={{
              transition: 'all 300ms ease-in-out',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              width: isCollapsed ? 0 : 140,
              opacity: isCollapsed ? 0 : 1,
            }}
          >
            <div className="min-w-0">
              <span className="text-sm font-bold tracking-tight block leading-tight text-(--color-text) truncate">
                DokuLens
              </span>
              <span className="text-[10px] text-(--color-text-3) block uppercase tracking-wider font-semibold">
                Client-Side Studio
              </span>
            </div>
          </div>
        </NavLink>

        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded border border-(--color-border) text-(--color-text-2) hover:bg-(--color-surface-3) lg:hidden"
        >
          <X size={16} />
        </button>
      </div>

      {/* Nav groups (Scrollbar completely hidden on minimize across Chrome & Firefox) */}
      <nav 
        className={[
          'flex-1 overflow-y-auto overflow-x-hidden space-y-3',
          isCollapsed ? 'flex flex-col items-center no-scrollbar' : '',
        ].join(' ')}
        style={{
          transition: 'padding 300ms ease-in-out',
          padding: isCollapsed ? '8px' : '12px',
        }}
      >
        {/* Landing / Home link */}
        <div className="relative group w-full flex justify-center">
          <NavLink
            to="/"
            end
            onClick={onClose}
            className={({ isActive }) =>
              [
                'group relative flex items-center rounded-lg text-xs font-medium no-underline transition-all duration-150',
                isCollapsed
                  ? 'h-9.5 w-9.5 justify-center'
                  : 'w-full justify-between px-3 py-2',
                isActive
                  ? 'bg-(--color-brand-light) text-(--color-brand-text) font-bold shadow-xs border border-(--color-brand)/30 ring-1 ring-(--color-brand)/40'
                  : 'text-(--color-text-2) hover:bg-(--color-surface-3) hover:text-(--color-text)',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {isActive && !isCollapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-(--color-brand) shadow-sm" />
                )}
                  <div className={`flex items-center ${isCollapsed ? 'gap-0' : 'gap-2.5'}`}>
                    <Home
                      size={18}
                      className={
                        isActive
                          ? 'text-(--color-brand) scale-110 transition-transform duration-200'
                          : 'text-(--color-text-2) group-hover:text-(--color-text) transition-colors duration-150'
                      }
                    />
                    <span 
                      style={{
                        transition: 'all 300ms ease-in-out',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        width: isCollapsed ? 0 : 'auto',
                        opacity: isCollapsed ? 0 : 1,
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? 'var(--color-brand-text)' : undefined,
                      }}
                    >
                      Semua Tools
                    </span>
</div>
              </>
            )}
          </NavLink>

          {/* Hover Tooltip when collapsed */}
          {isCollapsed && (
            <div className="absolute left-full ml-2.5 hidden group-hover:flex items-center z-50 rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white whitespace-nowrap shadow-lg">
              Semua Tools
            </div>
          )}
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={isCollapsed ? 'w-full flex flex-col items-center space-y-1' : 'space-y-1'}>
            {/* Divider or Group Label */}
            {isCollapsed ? (
              <div className="w-6 h-px bg-(--color-border) my-1" />
            ) : (
              <p className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-(--color-text-3)">
                {group.label}
              </p>
            )}

            {group.items.map((item) => {
              const to = `/${item.path}`
              return (
                <div key={item.path} className="relative group w-full flex justify-center">
                  <NavLink
                    to={to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      [
                        'group relative flex items-center rounded-lg text-xs font-medium no-underline transition-all duration-150',
                        isCollapsed
                          ? 'h-9.5 w-9.5 justify-center'
                          : 'w-full justify-between px-3 py-2',
                        isActive
                          ? 'bg-(--color-brand-light) text-(--color-brand-text) font-bold shadow-xs border border-(--color-brand)/30 ring-1 ring-(--color-brand)/40'
                          : 'text-(--color-text-2) hover:bg-(--color-surface-3) hover:text-(--color-text)',
                      ].join(' ')
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && !isCollapsed && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-(--color-brand) shadow-sm" />
                        )}

                        <div className={`flex items-center ${isCollapsed ? 'gap-0' : 'gap-2.5'} min-w-0`}>
                          <NavIcon name={item.icon} active={isActive} />
                          <span 
                            style={{
                              transition: 'all 300ms ease-in-out',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              width: isCollapsed ? 0 : 'auto',
                              opacity: isCollapsed ? 0 : 1,
                              fontWeight: isActive ? 700 : 500,
                              color: isActive ? 'var(--color-brand-text)' : undefined,
                              minWidth: 0,
                            }}
                          >
                            {item.label}
                          </span>
                        </div>
                      </>
                    )}
                  </NavLink>

                  {/* Hover Tooltip when collapsed */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2.5 hidden group-hover:flex flex-col z-50 rounded bg-slate-900 dark:bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] text-white whitespace-nowrap shadow-xl">
                      <span className="font-bold">{item.label}</span>
                      <span className="text-[10px] text-slate-300 font-normal">{group.label}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer Info & PWA status */}
      <div 
        style={{
          transition: 'all 300ms ease-in-out',
          overflow: 'hidden',
          maxHeight: isCollapsed ? 0 : 200,
          opacity: isCollapsed ? 0 : 1,
        }}
      >
        <div className="border-t border-(--color-border) p-3 space-y-2">
          <PWAInstallBanner />
          <div className="rounded border border-(--color-border) bg-(--color-surface-2) p-2.5 text-[11px] text-(--color-text-3)">
            <p className="font-semibold text-(--color-text-2) flex items-center gap-1 mb-0.5">
              <ShieldCheck size={13} className="text-(--color-success)" />
              100% Offline & Privat
            </p>
            <p className="leading-snug">Semua file diproses lokal di browser perangkat Anda.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
