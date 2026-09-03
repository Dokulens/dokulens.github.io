import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreVertical, Send } from 'lucide-react'
import { getTargetsForOutput } from '../utils/toolRegistry'

/**
 * Dropdown "kirim hasil ke tool lain" (titik tiga).
 * Pasang di panel hasil tool yang render preview custom (bukan ResultCard).
 * blob + fileName + outputMimeType cukup; menu memuat target berdasarkan format.
 */
export default function SendToDropdown({ blob, fileName, outputMimeType, excludeRoute }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()

  const targets = outputMimeType && blob ? getTargetsForOutput(outputMimeType, excludeRoute) : []

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (!targets.length) return null

  const sendTo = (t) => {
    setOpen(false)
    navigate(`/${t.route}`, { state: { file: blob, fileName } })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded p-1.5 text-(--color-text-3) hover:bg-(--color-surface-3) hover:text-(--color-text-2) transition-colors cursor-pointer"
        title="Kirim ke tool lain"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={menuRef}
            className="absolute right-0 bottom-full mb-1 z-50 w-56 overflow-hidden rounded-lg border shadow-lg"
            style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #e5e7eb)' }}
          >
            <div className="border-b px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-3, #6b7280)', borderColor: 'var(--color-border, #e5e7eb)' }}>
              <Send size={10} className="mr-1 inline" /> Kirim ke
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {targets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => sendTo(t)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-(--color-surface-3) transition-colors cursor-pointer"
                  style={{ color: 'var(--color-text-2, #374151)' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
