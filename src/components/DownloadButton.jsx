import { useState, useRef, useEffect } from 'react'
import { Download, Check, X } from 'lucide-react'
import { downloadBlob } from '../utils/helpers'

function splitExt(name) {
  const m = (name || '').match(/^(.*?)(\.[^.]+)?$/)
  return { base: m[1] || name, ext: m[2] || '' }
}

/**
 * Tombol unduh yang membuka popup rename opsional.
 * Klik → popup: isi nama, "Unduh" langsung (nama saat ini) atau edit lalu unduh.
 */
export default function DownloadButton({
  blob,
  fileName,
  children,
  className,
  onNameChange,
  onDownload,
}) {
  const init = splitExt(fileName)
  const [open, setOpen] = useState(false)
  const [nameBase, setNameBase] = useState(init.base)
  const [ext] = useState(init.ext)
  const popRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    inputRef.current?.select()
    const onClick = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const doDownload = (name) => {
    setOpen(false)
    const trimmed = name && name.trim() ? name : fileName
    if (name && name.trim() !== init.base && onNameChange) onNameChange(name)
    if (onDownload) onDownload(trimmed)
    else if (blob) downloadBlob(blob, trimmed)
  }

  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} className={className}>
        {children}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={popRef}
            className="absolute right-0 top-full z-50 mt-1.5 w-64 space-y-2 rounded-lg border p-2.5 shadow-lg"
            style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #e5e7eb)' }}
          >
            <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-3, #6b7280)' }}>
              Nama file
            </span>
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                value={nameBase}
                onChange={(e) => setNameBase(e.target.value.replace(/[\\/:*?"<>|]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') doDownload(`${nameBase}${ext}`); if (e.key === 'Escape') setOpen(false) }}
                className="min-w-0 flex-1 rounded border px-1.5 py-1 text-sm outline-none focus:border-(--color-brand)"
                style={{ borderColor: 'var(--color-border, #e5e7eb)', color: 'var(--color-text, #111)', background: 'var(--color-surface, #fff)' }}
              />
              <span className="select-none text-sm" style={{ color: 'var(--color-text-3, #6b7280)' }}>{ext}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => doDownload(fileName)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer"
                style={{ background: 'var(--color-brand, #2563eb)' }}
              >
                <Download size={13} /> Unduh
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
                style={{ borderColor: 'var(--color-border, #e5e7eb)', color: 'var(--color-text-2, #374151)' }}
              >
                Batal
              </button>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--color-text-3, #9ca3af)' }}>
              Nama file: <span className="font-mono">{nameBase || '(kosong)'}{ext}</span>
            </p>
          </div>
        </>
      )}
    </div>
  )
}
