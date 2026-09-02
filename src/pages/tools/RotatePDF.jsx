import { useState, useCallback, useRef } from 'react'
import { PDFDocument, degrees } from 'pdf-lib'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  rectSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  RotateCw, Trash2, GripVertical, Loader2, Plus, Sparkles, FileText,
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import ProgressBar from '../../components/ProgressBar'
import { pdfjsLib, renderPageToDataUrl } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

/* ─── Sortable Page Card Component ─── */
function SortablePageCard({ id, page, index, totalPages, onRotate, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col items-center rounded-lg border border-[--color-border] bg-[--color-surface] p-2 select-none transition-all ${
        isDragging ? 'shadow-xl ring-2 ring-[--color-brand]' : 'hover:border-[--color-brand-light]'
      }`}
    >
      {/* Top Bar */}
      <div className="flex w-full items-center justify-between px-1 mb-1 text-xs text-[--color-text-3]">
        <button {...attributes} {...listeners} className="cursor-grab text-[--color-text-3] hover:text-[--color-text] p-0.5">
          <GripVertical size={14} />
        </button>
        <span className="font-semibold text-[11px] truncate max-w-[90px]" title={page.fileName}>
          {page.fileName}
        </span>
        <button onClick={() => onRemove(id)} className="text-[--color-text-3] hover:text-[--color-danger] p-0.5" title="Hapus Halaman">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Thumbnail */}
      <div className="relative w-full aspect-[3/4] overflow-hidden rounded bg-[--color-surface-3] flex items-center justify-center border border-[--color-border]">
        {page.preview ? (
          <img
            src={page.preview}
            alt={`Page ${page.pdfPageNumber}`}
            style={{ transform: `rotate(${page.rotation}deg)` }}
            className="max-h-full max-w-full object-contain transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Loader2 size={16} className="animate-spin text-[--color-brand]" />
            <span className="text-[10px] text-[--color-text-3]">Hal {page.pdfPageNumber}</span>
          </div>
        )}

        {/* Global Sequence Badge */}
        <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          #{index + 1}
        </span>

        {/* Page Origin Badge */}
        <span className="absolute bottom-1 right-1 rounded bg-[--color-brand] px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
          p.{page.pdfPageNumber}
        </span>
      </div>

      {/* Bottom Rotation Button */}
      <div className="mt-2 flex w-full items-center justify-between px-1">
        <span className="text-[10px] text-[--color-text-3]">
          {page.rotation > 0 ? `${page.rotation}°` : '0°'}
        </span>
        <button
          onClick={() => onRotate(id)}
          className="flex items-center gap-1 rounded border border-[--color-border] bg-[--color-surface-2] px-2 py-1 text-[11px] font-medium text-[--color-brand] hover:bg-[--color-brand] hover:text-white transition-colors cursor-pointer"
          title="Putar 90° Searah Jarum Jam"
        >
          <RotateCw size={11} /> Putar
        </button>
      </div>
    </div>
  )
}

export default function RotatePDF() {
  const [files, setFiles] = useState([]) // [{ id, file, pdfjsDoc, pdfLibDoc }]
  const [pages, setPages] = useState([]) // [{ id, fileId, fileName, pageIndex, pdfPageNumber, rotation, preview, pdfLibDoc }]
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const fileInputRef = useRef(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const loadPdfFiles = useCallback(async (newFilesList) => {
    setLoading(true)
    setError('')
    setProgress(0)

    try {
      const addedFiles = []
      const addedPages = []

      for (let fIdx = 0; fIdx < newFilesList.length; fIdx++) {
        const file = newFilesList[fIdx]
        const fileId = crypto.randomUUID()
        const arrayBuf = await readAsArrayBuffer(file)
        const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf.slice(0)) }).promise
        const pdfLibDoc = await PDFDocument.load(arrayBuf, { ignoreEncryption: true })
        const totalPages = pdfjsDoc.numPages

        addedFiles.push({
          id: fileId,
          file,
          pdfjsDoc,
          pdfLibDoc,
        })

        for (let p = 0; p < totalPages; p++) {
          addedPages.push({
            id: crypto.randomUUID(),
            fileId,
            fileName: file.name,
            pageIndex: p,
            pdfPageNumber: p + 1,
            rotation: 0,
            preview: null,
            pdfLibDoc,
          })
        }
        setProgress(Math.round(((fIdx + 1) / newFilesList.length) * 40))
      }

      setFiles((prev) => [...prev, ...addedFiles])
      setPages((prev) => [...prev, ...addedPages])

      // Render thumbnails progressively
      for (let i = 0; i < addedPages.length; i++) {
        const pObj = addedPages[i]
        const parentFile = addedFiles.find((f) => f.id === pObj.fileId)
        if (parentFile) {
          try {
            const page = await parentFile.pdfjsDoc.getPage(pObj.pageIndex + 1)
            const origRotation = typeof page.getRotation === 'function' ? page.getRotation() : (page.rotation || 0)
            const { dataUrl } = await renderPageToDataUrl(parentFile.pdfjsDoc, pObj.pageIndex + 1, 0.4, origRotation)
            setPages((prev) => prev.map((p) => p.id === pObj.id ? { ...p, preview: dataUrl, rotation: origRotation } : p))
          } catch {
            // thumbnail fallback
          }
        }
        setProgress(40 + Math.round(((i + 1) / addedPages.length) * 60))
      }
    } catch (e) {
      setError(`Gagal memuat PDF: ${e.message}`)
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }, [])

  useIncomingFile((f) => loadPdfFiles([f]))

  const handleFilesAdded = (newFiles) => {
    if (!newFiles || !newFiles.length) return
    setResult(null)
    loadPdfFiles(newFiles)
  }

  const rotatePage = (pageId) => {
    setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, rotation: (p.rotation + 90) % 360 } : p)))
    setResult(null)
  }

  const rotateAllPages = (angle = 90) => {
    setPages((prev) => prev.map((p) => ({ ...p, rotation: (p.rotation + angle) % 360 })))
    setResult(null)
  }

  const removePage = (pageId) => {
    setPages((prev) => prev.filter((p) => p.id !== pageId))
    setResult(null)
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over?.id) {
      setPages((prev) => {
        const oldIdx = prev.findIndex((p) => p.id === active.id)
        const newIdx = prev.findIndex((p) => p.id === over.id)
        return arrayMove(prev, oldIdx, newIdx)
      })
      setResult(null)
    }
  }

  const clearAll = () => {
    setFiles([])
    setPages([])
    setResult(null)
    setError('')
  }

  /* Vector-lossless PDF saving & merging via pdf-lib */
  const savePDF = async () => {
    if (!pages.length) {
      setError('Tidak ada halaman tersisa untuk disimpan.')
      return
    }
    setProcessing(true)
    setError('')

    try {
      const outDoc = await PDFDocument.create()

      for (const pObj of pages) {
        const [copiedPage] = await outDoc.copyPages(pObj.pdfLibDoc, [pObj.pageIndex])
        if (pObj.rotation > 0) {
          const origAngle = copiedPage.getRotation().angle
          copiedPage.setRotation(degrees((origAngle + pObj.rotation) % 360))
        }
        outDoc.addPage(copiedPage)
      }

      const bytes = await outDoc.save()
      setResult(new Blob([bytes], { type: 'application/pdf' }))
    } catch (e) {
      setError(`Gagal menyimpan PDF: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const isMultiFile = files.length > 1
  const outputFileName = isMultiFile
    ? 'merged_rotated_document.pdf'
    : (files[0] ? `${stripExt(files[0].file.name)}_organize.pdf` : 'output.pdf')

  return (
    <ToolShell
      title="Rotate, Reorder & Merge PDF"
      description="Putar orientasi halaman, atur susunan urutan halaman, hapus halaman tidak terpakai, dan gabungkan beberapa file PDF sekaligus menjadi satu dokumen murni."
    >
      <DropZone
        accept=".pdf,application/pdf"
        multiple
        onFiles={handleFilesAdded}
        disabled={loading}
        label="Pilih atau drop file PDF"
        hint="Bisa pilih beberapa file PDF sekaligus untuk digabungkan"
      />

      {loading && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[--color-brand]">
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Memuat dokumen & membuat pratinjau halaman...
            </span>
            <span>{progress}%</span>
          </div>
          <ProgressBar value={progress} />
        </div>
      )}

      {pages.length > 0 && !loading && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[--color-border] bg-[--color-surface] p-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[--color-text]">
                {pages.length} Halaman {isMultiFile ? `(dari ${files.length} file PDF)` : ''}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length) {
                    handleFilesAdded(Array.from(e.target.files))
                    e.target.value = ''
                  }
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded border border-[--color-brand] bg-[--color-brand-light] px-3 py-1.5 text-xs font-semibold text-[--color-brand] hover:bg-[--color-brand] hover:text-white transition-colors cursor-pointer"
              >
                <Plus size={13} /> Tambah PDF
              </button>

              <button
                onClick={() => rotateAllPages(90)}
                className="flex items-center gap-1 rounded border border-[--color-border] bg-[--color-surface-2] px-2.5 py-1.5 text-xs font-medium text-[--color-text-2] hover:bg-[--color-brand-light] hover:text-[--color-brand] cursor-pointer"
              >
                <RotateCw size={12} /> Putar Semua (+90°)
              </button>

              <button
                onClick={clearAll}
                className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white cursor-pointer"
              >
                <Trash2 size={12} /> Bersihkan
              </button>
            </div>
          </div>

          {/* Sortable Grid View */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {pages.map((p, i) => (
                  <SortablePageCard
                    key={p.id}
                    id={p.id}
                    page={p}
                    index={i}
                    totalPages={pages.length}
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

      {/* Save / Merge Button */}
      {pages.length > 0 && !result && !loading && (
        <button
          onClick={savePDF}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[--color-brand] px-4 py-3 text-sm font-bold text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-colors cursor-pointer shadow-md"
        >
          {processing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {processing
            ? 'Memproses PDF...'
            : isMultiFile
            ? `Gabungkan & Simpan ${pages.length} Halaman PDF`
            : `Simpan ${pages.length} Halaman PDF Baru`}
        </button>
      )}

      {/* Result Card */}
      {result && (
        <ResultCard
          fileName={outputFileName}
          blob={result}
          extraInfo={`${pages.length} halaman ${isMultiFile ? `(digabung dari ${files.length} file)` : ''} → ${fmtBytes(result.size)}`}
          outputMimeType="application/pdf"
          sourceRoute="rotate-pdf"
          onReset={clearAll}
        />
      )}
    </ToolShell>
  )
}
