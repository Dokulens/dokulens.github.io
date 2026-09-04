import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('dokulens_sidebar_collapsed') === 'true'
  })

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('dokulens_sidebar_collapsed', String(next))
      return next
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-(--color-surface-2)">
      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden backdrop-blur-xs animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar (Fully Opaque on Mobile Drawer and Desktop) */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex-shrink-0 border-r border-(--color-border) bg-(--color-surface) will-change-transform lg:relative lg:translate-x-0 shadow-2xl lg:shadow-none',
          sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0',
          isCollapsed ? 'lg:w-16' : 'lg:w-64',
        ].join(' ')}
        style={{
          backgroundColor: 'var(--color-surface)',
          transition: 'width 300ms ease-in-out, transform 300ms ease-in-out',
        }}
      >
        <Sidebar
          onClose={() => setSidebarOpen(false)}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          onMenuClick={() => setSidebarOpen(true)}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
