import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'

export default function DropZone({ accept, multiple = false, onFiles, label, hint }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const files = [...e.dataTransfer.files]
    const filtered = accept
      ? files.filter((f) => {
          const types = accept.split(',').map((s) => s.trim())
          return types.some((t) => {
            if (t.startsWith('.')) return f.name.toLowerCase().endsWith(t)
            if (t.endsWith('/*')) return f.type.startsWith(t.replace('/*', '/'))
            return f.type === t
          })
        })
      : files
    if (filtered.length) onFiles(multiple ? filtered : [filtered[0]])
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current.click()}
      className={[
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors select-none',
        dragging
          ? 'border-[--color-brand] bg-[--color-brand-light] drop-active'
          : 'border-[--color-border-strong] bg-[--color-surface] hover:border-[--color-brand] hover:bg-[--color-brand-light]',
      ].join(' ')}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[--color-surface-3]">
        <Upload size={24} className="text-[--color-text-2]" />
      </div>
      <div>
        <p className="font-semibold text-[--color-text]">
          {label || 'Drag & drop atau klik untuk pilih file'}
        </p>
        {hint && <p className="mt-1 text-sm text-[--color-text-3]">{hint}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = [...e.target.files]
          if (files.length) onFiles(multiple ? files : [files[0]])
          e.target.value = ''
        }}
      />
    </div>
  )
}
