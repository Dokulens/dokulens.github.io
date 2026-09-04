import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { setMeta } from '../utils/seo'

export default function ToolShell({ title, description, children }) {
  const location = useLocation()
  useEffect(() => {
    setMeta({ title, description, path: location.pathname })
  }, [title, description, location.pathname])

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-(--color-text) tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-(--color-text-2) leading-relaxed">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}
