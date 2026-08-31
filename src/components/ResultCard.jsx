import { Download, X } from 'lucide-react'

export default function ResultCard({ fileName, blob, onReset, extraInfo }) {
  const url = blob ? URL.createObjectURL(blob) : null

  return (
    <div className="rounded-lg border border-[--color-success-light] bg-[--color-success-light] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[--color-success]">✓ Selesai diproses</p>
          <p className="mt-0.5 truncate text-sm text-[--color-text-2]">{fileName}</p>
          {extraInfo && <p className="mt-0.5 text-xs text-[--color-text-3]">{extraInfo}</p>}
        </div>
        <button
          onClick={onReset}
          className="shrink-0 rounded p-1 text-[--color-text-3] hover:bg-[--color-surface-3]"
          title="Reset"
        >
          <X size={16} />
        </button>
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
