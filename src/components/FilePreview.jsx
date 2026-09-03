import { useState, useEffect } from 'react'
import { FileText, FileImage, File } from 'lucide-react'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif', 'image/svg+xml']
const PDF_TYPES = ['application/pdf']
const DOCX_TYPES = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']

function fmtBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export default function FilePreview({ file }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    if (!file) return
    if (IMAGE_TYPES.includes(file.type)) {
      const objectUrl = URL.createObjectURL(file)
      setUrl(objectUrl)
      return () => URL.revokeObjectURL(objectUrl)
    }
    setUrl(null)
  }, [file])

  if (!file) return null

  const isImage = IMAGE_TYPES.includes(file.type)
  const isPdf = PDF_TYPES.includes(file.type)
  const isDocx = DOCX_TYPES.includes(file.type)

  return (
    <div className="rounded-lg border border-(--color-border) bg-(--color-surface) overflow-hidden animate-fade-in">
      {isImage && url ? (
        <div className="relative">
          <img
            src={url}
            alt={file.name}
            className="block max-h-48 w-full object-contain bg-(--color-surface-2)"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
            <p className="text-xs text-white truncate">{file.name}</p>
            <p className="text-[10px] text-white/70">{fmtBytes(file.size)}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3">
          <div className={`shrink-0 rounded-lg p-2.5 ${isPdf ? 'bg-red-100 dark:bg-red-900/30' : isDocx ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
            {isPdf ? (
              <FileText size={24} className="text-red-500" />
            ) : isDocx ? (
              <FileText size={24} className="text-blue-500" />
            ) : (
              <File size={24} className="text-gray-400" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-(--color-text) truncate">{file.name}</p>
            <p className="text-xs text-(--color-text-3)">{fmtBytes(file.size)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
