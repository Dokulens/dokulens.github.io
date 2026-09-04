import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { setMeta } from '../utils/seo'
import { getSeoForPath, DEFAULT_OG_IMAGE } from '../utils/seoConfig'

export default function ToolShell({ title, description, children }) {
  const location = useLocation()
  useEffect(() => {
    const seo = getSeoForPath(location.pathname)
    if (seo) {
      setMeta({
        title: seo.title,
        description: seo.description,
        path: location.pathname,
        image: DEFAULT_OG_IMAGE,
        keywords: seo.keywords,
      })
    } else {
      setMeta({ title, description, path: location.pathname, image: DEFAULT_OG_IMAGE })
    }
  }, [title, description, location.pathname])

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-(--color-text) tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-(--color-text-2) leading-relaxed">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}
