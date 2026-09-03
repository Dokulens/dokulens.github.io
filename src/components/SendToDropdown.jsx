import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreVertical, Send, Pencil, Download } from 'lucide-react'
import { getTargetsForOutput } from '../utils/toolRegistry'

function splitExt(name) {
  const m = (name || '').match(/^(.*?)(\.[^.]+)?$/)
  return { base: m[1] || name, ext: m[2] || '' }
}

/**
 * Dropdown hasil: rename file (opsional) + "kirim ke tool lain".
 * blob + fileName + outputMimeType; menu memuat target berdasarkan format.
 * onRename(name) dipanggil saat user ubah nama (sinkron dgn tombol download tool).
 * onDownload() opsional — kalau tool tak punya tombol unduh sendiri.
 */
export default function SendToDropdown({ blob, fileName, outputMimeType, excludeRoute, onRename, onDownload }) {
  const init = splitExt(fileName)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('actions')
  const [nameBase, setNameBase] = useState(init.base)
  const [ext] = useState(init.ext)
  const menuRef = useRef(null)
  const navigate = useNavigate()

  const targets = outputMimeType && blob ? getTargetsForOutput(outputMimeType, excludeRoute) : []
  const finalName = nameBase.trim() ? `${nameBase.trim()}${ext}` : fileName

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const close = () => { setOpen(false); setTab('actions') }
  const applyRename = () => {
    if (onRename) onRename(finalName)
    close()
  }

  const sendTo = (t) => {
    setOpen(false)
    navigate(`/${t.route}`, { state: { file: blob, fileName: finalName } })
  }

  return (
    <div className="relative">
      <button
        onClick={() => { if (!open) { setNameBase(init.base) } setOpen(!open) }}
        className="rounded p-1.5 text-(--color-text-3) hover:bg-(--color-surface-3) hover:text-(--color-text-2) transition-colors cursor-pointer"
        title="Opsi hasil"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={menuRef}
            className="absolute right-0 bottom-full mb-1 z-50 w-60 overflow-hidden rounded-lg border shadow-lg"
            style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #e5e7eb)' }}
          >
            {tab === 'rename' ? (
              <div className="p-2.5 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--color-text-3, #6b7280)' }}>
                  Rename file
                </span>
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={nameBase}
                    onChange={(e) => setNameBase(e.target.value.replace(/[\\/:*?"<>|]/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyRename() }}
                    className="w-full min-w-0 flex-1 rounded border px-1.5 py-1 text-sm outline-none"
                    style={{ borderColor: 'var(--color-border, #e5e7eb)', color: 'var(--color-text, #111)', background: 'var(--color-surface, #fff)' }}
                  />
                  <span className="text-sm select-none" style={{ color: 'var(--color-text-3, #6b7280)' }}>{ext}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={applyRename} className="flex-1 rounded-md bg-(--color-brand) px-2 py-1.5 text-xs font-bold text-white hover:bg-(--color-brand-hover) transition-colors cursor-pointer">Simpan</button>
                  <button onClick={() => setTab('actions')} className="rounded-md border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--color-border, #e5e7eb)', color: 'var(--color-text-2, #374151)' }}>Batal</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--color-text-3, #6b7280)' }}>
                    <Send size={10} /> Opsi Hasil
                  </span>
                  <button onClick={() => setTab('rename')} className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-semibold hover:bg-(--color-surface-3) cursor-pointer" style={{ color: 'var(--color-brand, #2563eb)' }}>
                    <Pencil size={10} /> Rename
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  {onDownload && (
                    <button onClick={() => { onDownload(); close() }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-(--color-surface-3) transition-colors cursor-pointer" style={{ color: 'var(--color-text-2, #374151)' }}>
                      <Download size={14} /> <span className="truncate">{finalName}</span>
                    </button>
                  )}
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
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

