import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, MoreVertical, Send, Check, Pencil } from 'lucide-react'
import DownloadButton from './DownloadButton'
import { getTargetsForOutput } from '../utils/toolRegistry'

function splitExt(name) {
  const m = (name || '').match(/^(.*?)(\.[^.]+)?$/)
  return { base: m[1] || name, ext: m[2] || '' }
}

export default function ResultCard({ fileName, blob, onReset, extraInfo, outputMimeType, sourceRoute }) {
  const initial = splitExt(fileName)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nameBase, setNameBase] = useState(initial.base)
  const [ext] = useState(initial.ext)
  const menuRef = useRef(null)
  const navigate = useNavigate()

  const finalName = nameBase.trim() ? `${nameBase.trim()}${ext}` : fileName

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
    navigate(`/${target.route}`, { state: { file: blob, fileName: finalName } })
  }

  const commit = () => { setEditing(false); setMenuOpen(false) }

  return (
    <div className="rounded-lg border border-(--color-success-light) bg-(--color-success-light) p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-(--color-success)">✓ Selesai diproses</p>
          {/* Editable filename row */}
          <div className="mt-0.5 flex items-center gap-1.5">
            {editing ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={nameBase}
                  onChange={(e) => setNameBase(e.target.value.replace(/[\\/:*?"<>|]/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setNameBase(initial.base); setEditing(false) } }}
                  className="w-40 rounded border border-(--color-border) bg-(--color-surface) px-1.5 py-0.5 text-sm text-(--color-text) outline-none focus:border-(--color-brand)"
                />
                <span className="text-sm text-(--color-text-3) select-none">{ext}</span>
                <button onClick={commit} className="rounded p-0.5 text-(--color-success) hover:bg-(--color-surface-3)" title="Simpan nama"><Check size={14} /></button>
              </div>
            ) : (
              <>
                <span className="truncate text-sm text-(--color-text-2)" title={finalName}>{finalName}</span>
                <button onClick={() => { setEditing(true); setMenuOpen(false) }} className="shrink-0 rounded p-1 text-(--color-text-3) hover:bg-(--color-surface-3)" title="Rename file">
                  <Pencil size={12} />
                </button>
              </>
            )}
          </div>
          {extraInfo && <p className="mt-0.5 text-xs text-(--color-text-3)">{extraInfo}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0 relative">
          {targets.length > 0 && (
            <>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="rounded p-1 text-(--color-text-3) hover:bg-(--color-surface-3)"
                title="Kirim ke..."
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div
                    ref={menuRef}
                    className="absolute right-0 bottom-full mb-2 z-50 w-56 rounded-lg border shadow-lg overflow-hidden"
                    style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #e5e7eb)' }}
                  >
                    <div
                      className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b"
                      style={{ color: 'var(--color-text-3, #6b7280)', borderColor: 'var(--color-border, #e5e7eb)' }}
                    >
                      <Send size={10} className="inline mr-1" />
                      Kirim ke
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1">
                      {targets.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => handleSendTo(t)}
                          className="w-full px-3 py-2 text-left text-sm hover:opacity-80 flex items-center gap-2"
                          style={{ color: 'var(--color-text-2, #374151)' }}
                        >
                          <span className="truncate">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
          <button
            onClick={onReset}
            className="rounded p-1 text-(--color-text-3) hover:bg-(--color-surface-3)"
            title="Reset"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {blob && (
        <DownloadButton
          blob={blob}
          fileName={finalName}
          onNameChange={(n) => { setNameBase(splitExt(n).base) }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-(--color-success) px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity no-underline"
        >
          <Download size={16} />
          Download
        </DownloadButton>
      )}
    </div>
  )
}
