import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, X, MoreVertical, Send } from 'lucide-react'
import { getTargetsForOutput } from '../utils/toolRegistry'

export default function ResultCard({ fileName, blob, onReset, extraInfo, outputMimeType, sourceRoute }) {
  const url = blob ? URL.createObjectURL(blob) : null
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()

  const targets = outputMimeType ? getTargetsForOutput(outputMimeType, sourceRoute) : []

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const handleSendTo = (target) => {
    if (!blob) return
    setMenuOpen(false)
    navigate(`/${target.route}`, { state: { file: blob, fileName } })
  }

  return (
    <div className="rounded-lg border border-[--color-success-light] bg-[--color-success-light] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[--color-success]">✓ Selesai diproses</p>
          <p className="mt-0.5 truncate text-sm text-[--color-text-2]">{fileName}</p>
          {extraInfo && <p className="mt-0.5 text-xs text-[--color-text-3]">{extraInfo}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {targets.length > 0 && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="rounded p-1 text-[--color-text-3] hover:bg-[--color-surface-3]"
                title="Kirim ke..."
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-[--color-border] bg-[--color-surface] shadow-lg">
                  <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[--color-text-3] border-b border-[--color-border]">
                    <Send size={10} className="inline mr-1" />
                    Kirim ke
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {targets.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleSendTo(t)}
                        className="w-full px-3 py-2 text-left text-sm text-[--color-text-2] hover:bg-[--color-surface-3] flex items-center gap-2"
                      >
                        <span className="truncate">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={onReset}
            className="rounded p-1 text-[--color-text-3] hover:bg-[--color-surface-3]"
            title="Reset"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {url && (
        <a
          href={url}
          download={fileName}
          className="mt-3 flex items-center justify-center gap-2 rounded bg-[--color-success] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity no-underline"
        >
          <Download size={16} />
          Download
        </a>
      )}
    </div>
  )
}
