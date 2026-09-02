import { useState, useCallback, useEffect, useRef } from 'react'
import { PDFDocument, degrees } from 'pdf-lib'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  rectSortingStrategy, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, X, RotateCw, Trash2, Loader2,
  Grid, List, SlidersHorizontal, CheckCircle2, RefreshCw, FileText, Sparkles,
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import ProgressBar from '../../components/ProgressBar'
import { pdfjsLib, renderPageToDataUrl } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

/* ─── Parse page range string (e.g. "1-3, 5" or "ganjil" or "genap") ─── */
function parsePageRange(rangeStr, maxPages) {
  if (!rangeStr || rangeStr.trim() === '' || rangeStr.trim().toLowerCase() === 'semua' || rangeStr.trim().toLowerCase() === 'all') {
    return Array.from({ length: maxPages }, (_, i) => i)
  }
  const str = rangeStr.trim().toLowerCase()
  if (str === 'ganjil' || str === 'odd') {
    return Array.from({ length: maxPages }, (_, i) => i).filter((i) => (i + 1) % 2 !== 0)
  }
  if (str === 'genap' || str === 'even') {
    return Array.from({ length: maxPages }, (_, i) => i).filter((i) => (i + 1) % 2 === 0)
  }

  const indices = new Set()
  const parts = str.split(',')
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map((n) => parseInt(n.trim(), 10))
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.max(1, Math.min(start, end))
        const max = Math.min(maxPages, Math.max(start, end))
        for (let p = min; p <= max; p++) {
          indices.add(p - 1)
        }
      }
    } else {
      const p = parseInt(trimmed, 10)
      if (!isNaN(p) && p >= 1 && p <= maxPages) {
        indices.add(p - 1)
      }
    }
  }
  return Array.from(indices).sort((a, b) => a - b)
}

/* ─── Sortable Page Card (Grid View) ─── */
function SortablePageCard({ id, page, index, onRotate, onRemove }) {
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
      {/* Header controls */}
      <div className="flex w-full items-center justify-between px-1 mb-1 text-xs text-[--color-text-3]">
        <button {...attributes} {...listeners} className="cursor-grab text-[--color-text-3] hover:text-[--color-text] p-0.5">
          <GripVertical size={14} />
        </button>
        <span className="font-semibold text-[11px] truncate max-w-[80px]" title={page.fileName}>
          {page.fileName}
        </span>
        <button onClick={() => onRemove(id)} className="text-[--color-text-3] hover:text-[--color-danger] p-0.5" title="Hapus Halaman">
          <X size={14} />
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

        {/* Global sequence badge */}
        <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          #{index + 1}
        </span>

        {/* Page origin badge */}
        <span className="absolute bottom-1 right-1 rounded bg-[--color-brand] px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
          p.{page.pdfPageNumber}
        </span>
      </div>

      {/* Footer controls */}
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

/* ─── Sortable File Item (List View) ─── */
function SortableFileItem({ id, fileData, index, onRemove, onRangeChange, onRotateAll, onSelectPreset }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-[--color-border] bg-[--color-surface] p-3.5 space-y-3"
    >
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} className="cursor-grab text-[--color-text-3] hover:text-[--color-text]">
          <GripVertical size={16} />
        </button>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[--color-surface-3] text-xs font-bold text-[--color-text-2]">
          {index + 1}
        </span>
        <FileText size={16} className="shrink-0 text-[--color-brand]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[--color-text]">{fileData.file.name}</p>
          <p className="text-xs text-[--color-text-3]">
            {fmtBytes(fileData.file.size)} • {fileData.totalPages} Halaman Total
          </p>
        </div>
        <button onClick={() => onRemove(id)} className="text-[--color-text-3] hover:text-[--color-danger] p-1">
          <X size={16} />
        </button>
      </div>

      {/* Per-file Settings Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[--color-surface-2] p-2.5 text-xs border border-[--color-border]">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <span className="font-semibold text-[--color-text-2] shrink-0">Halaman:</span>
          <input
            type="text"
            value={fileData.pageRangeInput}
            onChange={(e) => onRangeChange(id, e.target.value)}
            placeholder="misal: 1-3, 5 atau ganjil"
            className="w-full rounded border border-[--color-border] bg-[--color-surface] px-2.5 py-1 text-xs text-[--color-text] focus:border-[--color-brand] focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onSelectPreset(id, 'all')}
            className="rounded border border-[--color-border] bg-[--color-surface] px-2 py-1 text-[11px] text-[--color-text-2] hover:bg-[--color-brand-light] hover:text-[--color-brand]"
          >
            Semua
          </button>
          <button
            onClick={() => onSelectPreset(id, 'ganjil')}
            className="rounded border border-[--color-border] bg-[--color-surface] px-2 py-1 text-[11px] text-[--color-text-2] hover:bg-[--color-brand-light] hover:text-[--color-brand]"
          >
            Ganjil
          </button>
          <button
            onClick={() => onSelectPreset(id, 'genap')}
            className="rounded border border-[--color-border] bg-[--color-surface] px-2 py-1 text-[11px] text-[--color-text-2] hover:bg-[--color-brand-light] hover:text-[--color-brand]"
          >
            Genap
          </button>
          <button
            onClick={() => onRotateAll(id)}
            className="flex items-center gap-1 rounded border border-[--color-border] bg-[--color-surface] px-2 py-1 text-[11px] font-semibold text-[--color-brand] hover:bg-[--color-brand] hover:text-white transition-colors"
          >
            <RotateCw size={11} /> Putar +90°
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MergePDF() {
  const [files, setFiles] = useState([]) // [{ id, file, totalPages, pdfDoc, pdfLibDoc, pageRangeInput }]
  const [pages, setPages] = useState([]) // [{ id, fileId, fileName, pageIndex, pdfPageNumber, rotation, preview }]
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'file'
  const [loading, setLoading] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /* Load PDF pages progressively */
  const loadPdfFiles = useCallback(async (newFilesList) => {
    setLoading(true)
    setError('')
    setLoadProgress(0)

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
          totalPages,
          pdfDoc: pdfjsDoc,
          pdfLibDoc,
          pageRangeInput: 'Semua',
        })

        for (let p = 0; p < totalPages; p++) {
          const pageId = crypto.randomUUID()
          addedPages.push({
            id: pageId,
            fileId,
            fileName: file.name,
            pageIndex: p,
            pdfPageNumber: p + 1,
            rotation: 0,
            preview: null,
            enabled: true,
          })
        }
        setLoadProgress(Math.round(((fIdx + 1) / newFilesList.length) * 50))
      }

      setFiles((prev) => [...prev, ...addedFiles])
      setPages((prev) => [...prev, ...addedPages])

      // Render previews progressively
      for (let i = 0; i < addedPages.length; i++) {
        const pObj = addedPages[i]
        const parentFile = addedFiles.find((f) => f.id === pObj.fileId)
        if (parentFile) {
          try {
            const { dataUrl } = await renderPageToDataUrl(parentFile.pdfDoc, pObj.pageIndex + 1, 0.4)
            setPages((prev) => prev.map((p) => p.id === pObj.id ? { ...p, preview: dataUrl } : p))
          } catch {
            // preview render fallback
          }
        }
        setLoadProgress(50 + Math.round(((i + 1) / addedPages.length) * 50))
      }
    } catch (e) {
      setError(`Gagal memuat PDF: ${e.message}`)
    } finally {
      setLoading(false)
      setLoadProgress(0)
    }
  }, [])

  useIncomingFile((f) => loadPdfFiles([f]))

  const addFiles = (newFiles) => {
    if (!newFiles || !newFiles.length) return
    setResult(null)
    loadPdfFiles(newFiles)
  }

  const removeFile = (fileId) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
    setPages((prev) => prev.filter((p) => p.fileId !== fileId))
    setResult(null)
  }

  const removePage = (pageId) => {
    setPages((prev) => prev.filter((p) => p.id !== pageId))
    setResult(null)
  }

  const rotatePage = (pageId) => {
    setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, rotation: (p.rotation + 90) % 360 } : p)))
    setResult(null)
  }

  const rotateAllPagesInFile = (fileId) => {
    setPages((prev) => prev.map((p) => (p.fileId === fileId ? { ...p, rotation: (p.rotation + 90) % 360 } : p)))
    setResult(null)
  }

  const rotateAllPagesGlobal = (angle = 90) => {
    setPages((prev) => prev.map((p) => ({ ...p, rotation: (p.rotation + angle) % 360 })))
    setResult(null)
  }

  const handlePageRangeChange = (fileId, rangeStr) => {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, pageRangeInput: rangeStr } : f)))
    const targetFile = files.find((f) => f.id === fileId)
    if (!targetFile) return
    const validIndices = parsePageRange(rangeStr, targetFile.totalPages)
    setPages((prev) =>
      prev.map((p) => {
        if (p.fileId === fileId) {
          return { ...p, enabled: validIndices.includes(p.pageIndex) }
        }
        return p
      })
    )
    setResult(null)
  }

  const handleSelectPreset = (fileId, preset) => {
    const text = preset === 'all' ? 'Semua' : preset === 'ganjil' ? 'Ganjil' : 'Genap'
    handlePageRangeChange(fileId, text)
  }

  const handleGridDragEnd = (event) => {
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

  const handleFileDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over?.id) {
      setFiles((prev) => {
        const oldIdx = prev.findIndex((f) => f.id === active.id)
        const newIdx = prev.findIndex((f) => f.id === over.id)
        const newFiles = arrayMove(prev, oldIdx, newIdx)

        // Reorder pages array to match new file order
        const reorderedPages = []
        newFiles.forEach((fileObj) => {
          const filePages = pages.filter((p) => p.fileId === fileObj.id)
          reorderedPages.push(...filePages)
        })
        setPages(reorderedPages)
        return newFiles
      })
      setResult(null)
    }
  }

  const activePages = pages.filter((p) => p.enabled)

  /* ─── Merge PDF with exact page settings ─── */
  const merge = async () => {
    if (activePages.length === 0) {
      setError('Tidak ada halaman aktif yang dipilih.')
      return
    }
    setProcessing(true)
    setError('')

    try {
      const mergedPdf = await PDFDocument.create()

      for (const pageObj of activePages) {
        const fileObj = files.find((f) => f.id === pageObj.fileId)
        if (!fileObj) continue

        const [copiedPage] = await mergedPdf.copyPages(fileObj.pdfLibDoc, [pageObj.pageIndex])
        if (pageObj.rotation > 0) {
          const origAngle = copiedPage.getRotation().angle
          copiedPage.setRotation(degrees((origAngle + pageObj.rotation) % 360))
        }
        mergedPdf.addPage(copiedPage)
      }

      const bytes = await mergedPdf.save()
      setResult(new Blob([bytes], { type: 'application/pdf' }))
    } catch (e) {
      setError(`Gagal menggabungkan PDF: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <ToolShell
      title="Merge PDF (Pengaturan Per-Halaman)"
      description="Gabung file PDF dengan fleksibilitas penuh: atur urutan per-halaman, putar rotasi, pilih rentang halaman per-file, dan hapus halaman tak terpakai."
    >
      <DropZone
        accept=".pdf,application/pdf"
        multiple
        onFiles={addFiles}
        disabled={loading}
        label="Tambah atau drop file PDF"
        hint="Pilih beberapa file sekaligus untuk digabungkan"
      />

      {loading && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[--color-brand]">
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Memuat dokumen & membuat pratinjau halaman...
            </span>
            <span>{loadProgress}%</span>
          </div>
          <ProgressBar value={loadProgress} />
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-4">
          {/* Header Bar Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[--color-border] bg-[--color-surface] p-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-[--color-text]">
                {files.length} File • {activePages.length} Halaman Aktif
              </span>
              <div className="h-4 w-px bg-[--color-border]" />
              <div className="flex items-center gap-1 rounded bg-[--color-surface-2] p-1 border border-[--color-border]">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                    viewMode === 'grid' ? 'bg-[--color-brand] text-white' : 'text-[--color-text-2] hover:text-[--color-text]'
                  }`}
                >
                  <Grid size={13} /> Visual Grid
                </button>
                <button
                  onClick={() => setViewMode('file')}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                    viewMode === 'file' ? 'bg-[--color-brand] text-white' : 'text-[--color-text-2] hover:text-[--color-text]'
                  }`}
                >
                  <List size={13} /> Pengaturan File
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => rotateAllPagesGlobal(90)}
                className="flex items-center gap-1 rounded border border-[--color-border] bg-[--color-surface-2] px-2.5 py-1 text-xs font-medium text-[--color-text-2] hover:bg-[--color-brand-light] hover:text-[--color-brand]"
              >
                <RotateCw size={12} /> Putar Semua (+90°)
              </button>
              <button
                onClick={() => { setFiles([]); setPages([]); setResult(null) }}
                className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white"
              >
                <Trash2 size={12} /> Bersihkan
              </button>
            </div>
          </div>

          {/* Mode 1: Grid View (Visual Drag & Drop per-halaman) */}
          {viewMode === 'grid' && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGridDragEnd}>
              <SortableContext items={activePages.map((p) => p.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {activePages.map((page, i) => (
                    <SortablePageCard
                      key={page.id}
                      id={page.id}
                      page={page}
                      index={i}
                      onRotate={rotatePage}
                      onRemove={removePage}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Mode 2: File View (Grouped controls per-file & Page Range input) */}
          {viewMode === 'file' && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFileDragEnd}>
              <SortableContext items={files.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {files.map((fileObj, i) => (
                    <SortableFileItem
                      key={fileObj.id}
                      id={fileObj.id}
                      fileData={fileObj}
                      index={i}
                      onRemove={removeFile}
                      onRangeChange={handlePageRangeChange}
                      onRotateAll={rotateAllPagesInFile}
                      onSelectPreset={handleSelectPreset}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      {error && <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger]">{error}</p>}

      {/* Action Button */}
      {files.length > 0 && !result && (
        <button
          onClick={merge}
          disabled={processing || activePages.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[--color-brand] px-4 py-3 text-sm font-bold text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-colors cursor-pointer shadow-md"
        >
          {processing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {processing ? 'Menggabungkan PDF...' : `Gabungkan ${activePages.length} Halaman PDF`}
        </button>
      )}

      {/* Result Card */}
      {result && (
        <ResultCard
          fileName="merged_output.pdf"
          blob={result}
          extraInfo={`${activePages.length} halaman digabung dari ${files.length} file → ${fmtBytes(result.size)}`}
          outputMimeType="application/pdf"
          sourceRoute="merge-pdf"
          onReset={() => { setResult(null); setFiles([]); setPages([]) }}
        />
      )}
    </ToolShell>
  )
}
