import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  rectSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { RotateCw, Trash2, GripVertical, Loader2 } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import ProgressBar from '../../components/ProgressBar'
import { pdfjsLib, renderPageToDataUrl } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

function SortablePageCard({ id, pageNum, preview, rotation, onRotate, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col items-center rounded-lg border border-[--color-border] bg-[--color-surface] p-2 select-none"
    >
      <div className="flex w-full items-center justify-between px-1 mb-1 text-xs text-[--color-text-3]">
        <button {...attributes} {...listeners} className="cursor-grab hover:text-[--color-text]">
          <GripVertical size={14} />
        </button>
        <span className="font-semibold">Hal {pageNum}</span>
        <button onClick={() => onRemove(id)} className="hover:text-[--color-danger]">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-[--color-surface-3] flex items-center justify-center">
        {preview ? (
          <img
            src={preview}
            alt={`Page ${pageNum}`}
            style={{ transform: `rotate(${rotation}deg)` }}
            className="max-h-full max-w-full object-contain transition-transform duration-200"
          />
        ) : (
          <Loader2 size={16} className="animate-spin text-[--color-text-3]" />
        )}
      </div>

      <button
        onClick={() => onRotate(id)}
        className="mt-2 flex items-center gap-1 text-xs text-[--color-brand] hover:underline"
      >
        <RotateCw size={12} />
        Putar (+90°)
      </button>
    </div>
  )
}

export default function RotatePDF() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [pages, setPages] = useState([]) // [{id, origIndex, pageNum, preview, rotation}]
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleFile = async ([f]) => {
    setFile(f)
    setPages([])
    setResult(null)
    setError('')
    setLoading(true)
    setProgress(0)

    try {
      const arrayBuf = await readAsArrayBuffer(f)
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) })
      const pdfDoc = await loadingTask.promise
      const totalPages = pdfDoc.numPages

      const initialPages = Array.from({ length: totalPages }, (_, i) => ({
        id: crypto.randomUUID(),
        origIndex: i,
        pageNum: i + 1,
        preview: null,
        rotation: 0,
      }))
      setPages(initialPages)

      // Render previews progressively
      for (let i = 1; i <= totalPages; i++) {
        const { dataUrl } = await renderPageToDataUrl(pdfDoc, i, 0.4)
        setPages((prev) =>
          prev.map((p) => (p.pageNum === i ? { ...p, preview: dataUrl } : p)),
        )
        setProgress(Math.round((i / totalPages) * 100))
      }
    } catch (e) {
      setError(`Gagal memuat PDF: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const rotatePage = (id) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p)),
    )
  }

  const rotateAll = () => {
    setPages((prev) => prev.map((p) => ({ ...p, rotation: (p.rotation + 90) % 360 })))
  }

  const removePage = (id) => {
    setPages((prev) => prev.filter((p) => p.id !== id))
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over?.id) {
      setPages((prev) => {
        const oldIdx = prev.findIndex((p) => p.id === active.id)
        const newIdx = prev.findIndex((p) => p.id === over.id)
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  const savePDF = async () => {
    if (!pages.length) {
      setError('Tidak ada halaman yang tersisa.')
      return
    }
    setProcessing(true)
    setError('')
    try {
      const arrayBuf = await readAsArrayBuffer(file)
      const srcDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise
      const outDoc = await PDFDocument.create()

      for (const p of pages) {
        const page = await srcDoc.getPage(p.origIndex)
        const viewport = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')

        const isSwap = p.rotation === 90 || p.rotation === 270
        canvas.width = isSwap ? viewport.height : viewport.width
        canvas.height = isSwap ? viewport.width : viewport.height

        const ctx = canvas.getContext('2d')
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.translate(-viewport.width / 2, -viewport.height / 2)
        await page.render({ canvasContext: ctx, viewport }).promise

        const imgDataUrl = canvas.toDataURL('image/png')
        const imgBytes = Uint8Array.from(atob(imgDataUrl.split(',')[1]), (c) => c.charCodeAt(0))
        const img = await outDoc.embedPng(imgBytes)

        const newPage = outDoc.addPage([img.width, img.height])
        newPage.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
      }

      const bytes = await outDoc.save()
      setResult(new Blob([bytes], { type: 'application/pdf' }))
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const base = file ? stripExt(file.name) : 'document'

  return (
    <ToolShell
      title="Rotate / Reorder PDF"
      description="Putar orientasi dan ubah susunan halaman PDF dengan mudah."
    >
      <DropZone accept=".pdf,application/pdf" onFiles={handleFile} label="Pilih file PDF" />
      {file && <FilePreview file={file} />}

      {loading && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
          <ProgressBar value={progress} label="Membuat preview halaman…" />
        </div>
      )}

      {pages.length > 0 && !loading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[--color-text-3]">{pages.length} halaman tersisa</span>
            <button
              onClick={rotateAll}
              className="flex items-center gap-1 rounded border border-[--color-border] bg-[--color-surface] px-2.5 py-1 text-xs font-medium text-[--color-text-2] hover:bg-[--color-surface-3]"
            >
              <RotateCw size={12} />
              Putar Semua (+90°)
            </button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {pages.map((p) => (
                  <SortablePageCard
                    key={p.id}
                    id={p.id}
                    pageNum={p.pageNum}
                    preview={p.preview}
                    rotation={p.rotation}
                    onRotate={rotatePage}
                    onRemove={removePage}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {error && (
        <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger]">
          {error}
        </p>
      )}

      {pages.length > 0 && !result && !loading && (
        <button
          onClick={savePDF}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-colors"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Menyimpan…' : 'Simpan PDF Baru'}
        </button>
      )}

      {result && (
        <ResultCard
          fileName={`${base}_rotated.pdf`}
          blob={result}
          extraInfo={`${pages.length} halaman — ${fmtBytes(result.size)}`}
          outputMimeType="application/pdf"
          sourceRoute="rotate-pdf"
          onReset={() => {
            setResult(null)
            setFile(null)
            setPages([])
          }}
        />
      )}
    </ToolShell>
  )
}
