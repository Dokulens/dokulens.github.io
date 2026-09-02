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
  RotateCw, Trash2, GripVertical, Loader2, Plus, Sparkles, Image as ImageIcon, FileText, SlidersHorizontal,
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import ProgressBar from '../../components/ProgressBar'
import { pdfjsLib, renderPageToDataUrl } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

/* ─── Helper: Convert image file to PNG Uint8Array bytes ─── */
async function convertImageToPngBytes(file) {
  const url = URL.createObjectURL(file)
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const dataUrl = canvas.toDataURL('image/png')
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/* ─── Sortable Page Card Component ─── */
function SortablePageCard({ id, page, index, onRotate, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  const isImg = page.type === 'image'

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
        <span className="font-semibold text-[11px] truncate max-w-[90px] flex items-center gap-1" title={page.fileName}>
          {isImg ? <ImageIcon size={11} className="text-emerald-500 shrink-0" /> : <FileText size={11} className="text-blue-500 shrink-0" />}
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
            alt={page.fileName}
            style={{ transform: `rotate(${page.rotation}deg)` }}
            className="max-h-full max-w-full object-contain transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Loader2 size={16} className="animate-spin text-[--color-brand]" />
            <span className="text-[10px] text-[--color-text-3]">Memuat...</span>
          </div>
        )}

        {/* Global Sequence Badge */}
        <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          #{index + 1}
        </span>

        {/* Page Origin Badge */}
        <span className={`absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[9px] font-bold text-white shadow ${
          isImg ? 'bg-emerald-600' : 'bg-[--color-brand]'
        }`}>
          {isImg ? 'GAMBAR' : `p.${page.pdfPageNumber}`}
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
  const [files, setFiles] = useState([]) // [{ id, file, type, firstPageWidth, firstPageHeight }]
  const [pages, setPages] = useState([]) // [{ id, fileId, type, fileName, pageIndex, pdfPageNumber, rotation, preview, pdfLibDoc, file }]
  const [widthOption, setWidthOption] = useState('original') // 'original' | 'file-0' | 'file-1' | etc.
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

  const loadFiles = useCallback(async (newFilesList) => {
    setLoading(true)
    setError('')
    setProgress(0)

    try {
      const addedFiles = []
      const addedPages = []

      for (let fIdx = 0; fIdx < newFilesList.length; fIdx++) {
        const file = newFilesList[fIdx]
        const fileId = crypto.randomUUID()
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

        if (isPdf) {
          const arrayBuf = await readAsArrayBuffer(file)
          const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf.slice(0)) }).promise
          const pdfLibDoc = await PDFDocument.load(arrayBuf, { ignoreEncryption: true })
          const totalPages = pdfjsDoc.numPages
          const firstPage = pdfLibDoc.getPage(0)
          const firstPageWidth = firstPage ? firstPage.getWidth() : 595.28
          const firstPageHeight = firstPage ? firstPage.getHeight() : 841.89

          addedFiles.push({
            id: fileId,
            file,
            type: 'pdf',
            pdfjsDoc,
            pdfLibDoc,
            firstPageWidth,
            firstPageHeight,
          })

          for (let p = 0; p < totalPages; p++) {
            addedPages.push({
              id: crypto.randomUUID(),
              fileId,
              type: 'pdf',
              fileName: file.name,
              pageIndex: p,
              pdfPageNumber: p + 1,
              rotation: 0,
              preview: null,
              pdfLibDoc,
            })
          }
        } else {
          // Image File (JPG, PNG, WebP, etc.)
          const previewUrl = URL.createObjectURL(file)
          let imgW = 600
          let imgH = 800
          try {
            const bitmap = await createImageBitmap(file)
            imgW = bitmap.width
            imgH = bitmap.height
          } catch {
            // fallback
          }

          addedFiles.push({
            id: fileId,
            file,
            type: 'image',
            firstPageWidth: imgW,
            firstPageHeight: imgH,
          })
          addedPages.push({
            id: crypto.randomUUID(),
            fileId,
            type: 'image',
            fileName: file.name,
            pageIndex: 0,
            pdfPageNumber: 1,
            rotation: 0,
            preview: previewUrl,
            file,
          })
        }
        setProgress(Math.round(((fIdx + 1) / newFilesList.length) * 40))
      }

      setFiles((prev) => [...prev, ...addedFiles])
      setPages((prev) => [...prev, ...addedPages])

      // Render PDF page thumbnails progressively
      for (let i = 0; i < addedPages.length; i++) {
        const pObj = addedPages[i]
        if (pObj.type === 'pdf') {
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
        }
        setProgress(40 + Math.round(((i + 1) / addedPages.length) * 60))
      }
    } catch (e) {
      setError(`Gagal memuat file: ${e.message}`)
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }, [])

  useIncomingFile((f) => loadFiles([f]))

  const handleFilesAdded = (newFiles) => {
    if (!newFiles || !newFiles.length) return
    setResult(null)
    loadFiles(newFiles)
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
    setWidthOption('original')
  }

  /* Save & Merge PDF with page width scaling options */
  const savePDF = async () => {
    if (!pages.length) {
      setError('Tidak ada halaman tersisa untuk disimpan.')
      return
    }
    setProcessing(true)
    setError('')

    try {
      const outDoc = await PDFDocument.create()

      // Calculate target page width if scaled option selected
      let targetWidth = null
      if (widthOption === 'a4') {
        targetWidth = 595.28
      } else if (widthOption === 'letter') {
        targetWidth = 612
      } else if (widthOption !== 'original' && widthOption.startsWith('file-')) {
        const fileIdx = parseInt(widthOption.replace('file-', ''), 10)
        if (files[fileIdx] && files[fileIdx].firstPageWidth) {
          targetWidth = files[fileIdx].firstPageWidth
        }
      }

      for (const pObj of pages) {
        if (pObj.type === 'pdf') {
          const [copiedPage] = await outDoc.copyPages(pObj.pdfLibDoc, [pObj.pageIndex])
          if (pObj.rotation > 0) {
            const origAngle = copiedPage.getRotation().angle
            copiedPage.setRotation(degrees((origAngle + pObj.rotation) % 360))
          }
          if (targetWidth && targetWidth > 0) {
            const curW = copiedPage.getWidth()
            if (curW && Math.abs(curW - targetWidth) > 1) {
              const scale = targetWidth / curW
              copiedPage.scale(scale, scale)
            }
          }
          outDoc.addPage(copiedPage)
        } else {
          // Embed image file into PDF page
          let embeddedImg
          const imgBuf = await readAsArrayBuffer(pObj.file)
          const isJpg = pObj.file.type === 'image/jpeg' || pObj.file.name.toLowerCase().endsWith('.jpg') || pObj.file.name.toLowerCase().endsWith('.jpeg')
          const isPng = pObj.file.type === 'image/png' || pObj.file.name.toLowerCase().endsWith('.png')

          if (isJpg) {
            embeddedImg = await outDoc.embedJpg(imgBuf)
          } else if (isPng) {
            try {
              embeddedImg = await outDoc.embedPng(imgBuf)
            } catch {
              const pngBytes = await convertImageToPngBytes(pObj.file)
              embeddedImg = await outDoc.embedPng(pngBytes)
            }
          } else {
            const pngBytes = await convertImageToPngBytes(pObj.file)
            embeddedImg = await outDoc.embedPng(pngBytes)
          }

          let finalW = embeddedImg.width
          let finalH = embeddedImg.height

          if (targetWidth && targetWidth > 0 && Math.abs(finalW - targetWidth) > 1) {
            const scale = targetWidth / finalW
            finalW = targetWidth
            finalH = finalH * scale
          }

          const newPage = outDoc.addPage([finalW, finalH])
          newPage.drawImage(embeddedImg, { x: 0, y: 0, width: finalW, height: finalH })
          if (pObj.rotation > 0) {
            newPage.setRotation(degrees(pObj.rotation))
          }
        }
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
    ? 'merged_document.pdf'
    : (files[0] ? `${stripExt(files[0].file.name)}_organize.pdf` : 'output.pdf')

  return (
    <ToolShell
      title="Rotate, Reorder & Merge PDF / Gambar"
      description="Gabungkan file PDF dan gambar (JPG, PNG, WebP), atur orientasi & susunan halaman, samakan lebar halaman, dan hapus halaman yang tidak terpakai menjadi satu dokumen PDF murni."
    >
      <DropZone
        accept=".pdf,application/pdf,image/*,.jpg,.jpeg,.png,.webp,.bmp"
        multiple
        onFiles={handleFilesAdded}
        disabled={loading}
        label="Pilih atau drop file PDF / Gambar"
        hint="Dapat memilih beberapa file PDF dan Gambar (JPG, PNG, WebP) sekaligus"
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
                {pages.length} Halaman {isMultiFile ? `(dari ${files.length} file)` : ''}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf,image/*,.jpg,.jpeg,.png,.webp,.bmp"
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
                <Plus size={13} /> Tambah PDF / Gambar
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

          {/* Page Width Option Selector (Only visible when multi-files uploaded) */}
          {files.length > 1 && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-3 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-[--color-text]">
                <SlidersHorizontal size={14} className="text-[--color-brand]" />
                <span>Opsi Ukuran / Lebar Halaman Hasil Merge:</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-[--color-text-2]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="widthOption"
                    value="original"
                    checked={widthOption === 'original'}
                    onChange={() => setWidthOption('original')}
                    className="accent-[--color-brand]"
                  />
                  <span className="font-medium">Asli <span className="text-[--color-text-3]">(Proporsi masing-masing file)</span></span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="widthOption"
                    value="a4"
                    checked={widthOption === 'a4'}
                    onChange={() => setWidthOption('a4')}
                    className="accent-[--color-brand]"
                  />
                  <span className="font-medium">Standar A4 <span className="text-[--color-text-3]">(595pt / 210mm)</span></span>
                </label>

                {files.map((f, idx) => {
                  const fileW = f.firstPageWidth ? Math.round(f.firstPageWidth) : null
                  const isImg = f.type === 'image'
                  return (
                    <label key={f.id} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="widthOption"
                        value={`file-${idx}`}
                        checked={widthOption === `file-${idx}`}
                        onChange={() => setWidthOption(`file-${idx}`)}
                        className="accent-[--color-brand]"
                      />
                      <span>
                        Ikuti Lebar File {idx + 1}{' '}
                        <span className="text-[--color-text-3]">
                          ({isImg ? 'Gambar' : 'PDF'}: {f.file.name.length > 15 ? f.file.name.substring(0, 12) + '...' : f.file.name}
                          {fileW ? ` • ${fileW}pt` : ''})
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

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
            ? `Gabungkan & Simpan ${pages.length} Halaman`
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
