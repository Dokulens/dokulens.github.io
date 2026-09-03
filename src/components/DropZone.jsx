import { useRef, useState, useEffect } from 'react'
import { Upload, Clipboard, AlertCircle, X } from 'lucide-react'

export default function DropZone({ accept, multiple = false, onFiles, label, hint }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)
  const [formatError, setFormatError] = useState('')

  const isAcceptedFile = (file) => {
    if (!accept) return true
    const types = accept.split(',').map((s) => s.trim().toLowerCase())
    const fileName = file.name ? file.name.toLowerCase() : ''
    const fileType = file.type ? file.type.toLowerCase() : ''

    return types.some((t) => {
      if (t.startsWith('.')) return fileName.endsWith(t)
      if (t.endsWith('/*')) return fileType.startsWith(t.replace('/*', '/'))
      return fileType === t
    })
  }

  const getFormatDescription = () => {
    if (!accept) return 'Semua format'
    if (accept.includes('pdf')) return 'PDF (.pdf)'
    if (accept.includes('docx')) return 'Word (.docx)'
    if (accept.includes('image')) return 'Gambar (JPG, PNG, WebP, dll)'
    return accept
  }

  const processFiles = (fileList) => {
    setFormatError('')
    const files = Array.from(fileList).filter((f) => f instanceof File || f instanceof Blob)
    if (!files.length) return

    const validFiles = files.filter(isAcceptedFile)
    const invalidFiles = files.filter((f) => !isAcceptedFile(f))

    if (invalidFiles.length > 0 && validFiles.length === 0) {
      setFormatError(
        `File tidak sesuai format! Halaman ini hanya menerima format ${getFormatDescription()}. File "${invalidFiles[0].name || invalidFiles[0].type || 'item'}" ditolak.`
      )
      return
    }

    if (validFiles.length) {
      onFiles(multiple ? validFiles : [validFiles[0]])
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      processFiles(e.dataTransfer.files)
    }
  }

  // Global Ctrl+V / Command+V clipboard paste handler
  useEffect(() => {
    const handlePaste = (e) => {
      // Don't intercept if user is typing text inside an active text input or textarea
      const targetTag = e.target.tagName?.toLowerCase()
      const isInputFocused = targetTag === 'input' || targetTag === 'textarea' || e.target.isContentEditable

      const clipboardItems = e.clipboardData?.items
      const clipboardFiles = e.clipboardData?.files

      const hasFiles = (clipboardFiles && clipboardFiles.length > 0) ||
        (clipboardItems && Array.from(clipboardItems).some((item) => item.kind === 'file'))

      // If user is focused on text input and pasted plain text, let normal paste happen
      if (isInputFocused && !hasFiles) {
        return
      }

      if (hasFiles) {
        e.preventDefault()
        const filesToProcess = []

        if (clipboardFiles && clipboardFiles.length > 0) {
          for (let i = 0; i < clipboardFiles.length; i++) {
            filesToProcess.push(clipboardFiles[i])
          }
        } else if (clipboardItems) {
          for (let i = 0; i < clipboardItems.length; i++) {
            if (clipboardItems[i].kind === 'file') {
              const f = clipboardItems[i].getAsFile()
              if (f) filesToProcess.push(f)
            }
          }
        }

        if (filesToProcess.length > 0) {
          processFiles(filesToProcess)
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [accept, multiple])

  return (
    <div className="space-y-2">
      {/* Format Mismatch Alert */}
      {formatError && (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{formatError}</span>
          </div>
          <button
            onClick={() => setFormatError('')}
            className="rounded p-0.5 hover:bg-red-500/20 text-red-600 dark:text-red-400"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          'group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-all select-none',
          dragging
            ? 'border-(--color-brand) bg-(--color-brand-light) drop-active scale-[1.01]'
            : 'border-(--color-border-strong) bg-(--color-surface) hover:border-(--color-brand) hover:bg-(--color-brand-light)',
        ].join(' ')}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-(--color-surface-3) text-(--color-text-2) group-hover:text-(--color-brand) group-hover:scale-110 transition-transform duration-150">
          <Upload size={24} />
        </div>

        <div>
          <p className="font-semibold text-sm text-(--color-text)">
            {label || 'Drag & drop atau klik untuk pilih file'}
          </p>
          {hint ? (
            <p className="mt-1 text-xs text-(--color-text-3)">{hint}</p>
          ) : accept ? (
            <p className="mt-1 text-xs text-(--color-text-3)">Format diterima: {getFormatDescription()}</p>
          ) : null}
        </div>

        {/* Ctrl+V Paste Shortcut Tag */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-surface-2) px-3 py-1 text-[11px] font-medium text-(--color-text-2) group-hover:border-(--color-brand) transition-colors">
          <Clipboard size={12} className="text-(--color-brand)" />
          <span>Bisa Paste langsung (<kbd className="font-mono font-semibold">Ctrl+V</kbd> / <kbd className="font-mono font-semibold">⌘V</kbd>)</span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length) {
              processFiles(e.target.files)
            }
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
