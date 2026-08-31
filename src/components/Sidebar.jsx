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
      className={active ? 'text-[--color-brand]' : 'text-[--color-text-3] group-hover:text-[--color-text]'}
    />
  )
}

export default function Sidebar({ onClose, isCollapsed, onToggleCollapse }) {
  const location = useLocation()

  return (
    <div
      className="flex h-full flex-col bg-[--color-surface] select-none transition-all duration-200"
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      {/* Brand Header */}
      <div className={[
        'flex h-14 items-center border-b border-[--color-border]',
        isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
      ].join(' ')}>
        <NavLink
          to="/"
          onClick={onClose}
          className="flex items-center gap-2.5 text-[--color-text] no-underline transition-opacity hover:opacity-85"
          title="DokuLens Beranda"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[--color-brand] shrink-0">
            <Icons.FileSearch size={18} className="text-white" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <span className="text-sm font-bold tracking-tight block leading-tight text-[--color-text] truncate">
                DokuLens
              </span>
              <span className="text-[10px] text-[--color-text-3] block uppercase tracking-wider font-semibold">
                Client-Side Studio
              </span>
            </div>
          )}
        </NavLink>

        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded border border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3] lg:hidden"
        >
          <X size={16} />
        </button>

        {/* Desktop minimize button */}
        {!isCollapsed && (
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded border border-[--color-border] text-[--color-text-3] hover:bg-[--color-surface-3] hover:text-[--color-text] transition-colors"
            title="Minimize Sidebar"
          >
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-4">
        {/* Landing link */}
        <NavLink
          to="/"
          end
          onClick={onClose}
          title={isCollapsed ? 'Semua Tools' : undefined}
          className={({ isActive }) =>
            [
              'group flex items-center rounded px-2.5 py-2 text-xs font-medium no-underline transition-all',
              isCollapsed ? 'justify-center' : 'justify-between',
              isActive
                ? 'bg-[--color-brand-light] text-[--color-brand-text] font-semibold border-l-2 border-[--color-brand]'
                : 'text-[--color-text-2] hover:bg-[--color-surface-3] hover:text-[--color-text]',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <div className="flex items-center gap-2.5">
                <Home
                  size={18}
                  className={isActive ? 'text-[--color-brand]' : 'text-[--color-text-3] group-hover:text-[--color-text]'}
                />
                {!isCollapsed && <span>Semua Tools</span>}
              </div>
              {isActive && !isCollapsed && (
                <span className="h-1.5 w-1.5 rounded-full bg-[--color-brand]" />
              )}
            </>
          )}
        </NavLink>

        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            {!isCollapsed && (
              <p className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-[--color-text-3]">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const to = `/${item.path}`
              return (
                <NavLink
                  key={item.path}
                  to={to}
                  onClick={onClose}
                  title={isCollapsed ? `${item.label} (${group.label})` : undefined}
                  className={({ isActive }) =>
                    [
                      'group flex items-center rounded px-2.5 py-1.5 text-xs font-medium no-underline transition-all',
                      isCollapsed ? 'justify-center py-2' : 'justify-between',
                      isActive
                        ? 'bg-[--color-brand-light] text-[--color-brand-text] font-semibold border-l-2 border-[--color-brand]'
                        : 'text-[--color-text-2] hover:bg-[--color-surface-3] hover:text-[--color-text]',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <NavIcon name={item.icon} active={isActive} />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </div>
                      {isActive && !isCollapsed && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[--color-brand]" />
                      )}
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Desktop expand button if collapsed */}
      {isCollapsed && (
        <div className="hidden lg:flex justify-center p-2 border-t border-[--color-border]">
          <button
            onClick={onToggleCollapse}
            className="flex h-8 w-8 items-center justify-center rounded border border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3] hover:text-[--color-text] transition-colors"
            title="Expand Sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
      )}

      {/* Footer Info & PWA status */}
      {!isCollapsed && (
        <div className="border-t border-[--color-border] p-3 space-y-2">
          <PWAInstallBanner />
          <div className="rounded border border-[--color-border] bg-[--color-surface-2] p-2.5 text-[11px] text-[--color-text-3]">
            <p className="font-semibold text-[--color-text-2] flex items-center gap-1 mb-0.5">
              <ShieldCheck size={13} className="text-[--color-success]" />
              100% Offline & Privat
            </p>
            <p className="leading-snug">Semua file diproses lokal di browser perangkat Anda.</p>
          </div>
        </div>
      )}
    </div>
  )
}
