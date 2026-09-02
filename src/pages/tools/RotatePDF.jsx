import { useState, useCallback, useRef } from 'react'
import { PDFDocument, degrees } from 'pdf-lib'
import JSZip from 'jszip'
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
  RotateCw, Trash2, GripVertical, Loader2, Plus, Sparkles, Image as ImageIcon, FileText, SlidersHorizontal, ArrowDown, ArrowRight, FolderArchive, Layers,
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

        <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          #{index + 1}
        </span>

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
  const [files, setFiles] = useState([]) // [{ id, file, type, pdfjsDoc, pdfLibDoc, firstPageWidth }]
  const [pages, setPages] = useState([]) // [{ id, fileId, type, fileName, pageIndex, pdfPageNumber, rotation, preview, pdfLibDoc, file }]
  const [widthOption, setWidthOption] = useState('original') // 'original' | 'a4' | 'file-0' | etc.
  const [exportFormat, setExportFormat] = useState('pdf') // 'pdf' | 'png' | 'jpg'
  const [imageLayout, setImageLayout] = useState('vertical') // 'vertical' | 'horizontal' | 'zip'
  const [imageGap, setImageGap] = useState(0) // 0 to 100 px gap between stitched images
  const [gapBgColor, setGapBgColor] = useState('white') // 'white' | 'black' | 'transparent'
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null) // { blob, mime, ext, fileName }
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

          addedFiles.push({
            id: fileId,
            file,
            type: 'pdf',
            pdfjsDoc,
            pdfLibDoc,
            firstPageWidth,
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
              pdfjsDoc,
            })
          }
        } else {
          // Image File (JPG, PNG, WebP, etc.)
          const previewUrl = URL.createObjectURL(file)
          let imgW = 600
          try {
            const bitmap = await createImageBitmap(file)
            imgW = bitmap.width
          } catch {
            // fallback
          }

          addedFiles.push({
            id: fileId,
            file,
            type: 'image',
            firstPageWidth: imgW,
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
    setExportFormat('pdf')
    setImageLayout('vertical')
    setImageGap(0)
    setGapBgColor('white')
  }

  /* Save Output in PDF or Image format (Stitched Image or ZIP) */
  const savePDF = async () => {
    if (!pages.length) {
      setError('Tidak ada halaman tersisa untuk disimpan.')
      return
    }
    setProcessing(true)
    setError('')

    try {
      if (exportFormat === 'pdf') {
        const outDoc = await PDFDocument.create()

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
        setResult({
          blob: new Blob([bytes], { type: 'application/pdf' }),
          mime: 'application/pdf',
          ext: 'pdf',
          fileName: files.length > 1 ? 'merged_document.pdf' : `${stripExt(files[0]?.file?.name || 'output')}_organize.pdf`,
        })
      } else {
        // Export to Image (PNG or JPG)
        const isJpg = exportFormat === 'jpg'
        const mimeType = isJpg ? 'image/jpeg' : 'image/png'
        const ext = isJpg ? 'jpg' : 'png'
        const pageCanvasList = []

        for (let i = 0; i < pages.length; i++) {
          const pObj = pages[i]
          let pCanvas
          if (pObj.type === 'pdf') {
            const parentFile = files.find((f) => f.id === pObj.fileId)
            const pdfDocToUse = parentFile?.pdfjsDoc || pObj.pdfjsDoc
            if (pdfDocToUse) {
              const { canvas: renderedCanvas } = await renderPageToDataUrl(pdfDocToUse, pObj.pageIndex + 1, 2.0, pObj.rotation)
              pCanvas = renderedCanvas
            }
          } else {
            // Image file: draw to canvas with rotation
            const imgUrl = URL.createObjectURL(pObj.file)
            const img = new Image()
            await new Promise((res) => { img.onload = res; img.src = imgUrl })
            pCanvas = document.createElement('canvas')
            const rot = pObj.rotation || 0
            if (rot === 90 || rot === 270) {
              pCanvas.width = img.naturalHeight || img.height
              pCanvas.height = img.naturalWidth || img.width
            } else {
              pCanvas.width = img.naturalWidth || img.width
              pCanvas.height = img.naturalHeight || img.height
            }
            const ctx = pCanvas.getContext('2d')
            if (rot === 90) {
              ctx.translate(pCanvas.width, 0)
              ctx.rotate(Math.PI / 2)
            } else if (rot === 180) {
              ctx.translate(pCanvas.width, pCanvas.height)
              ctx.rotate(Math.PI)
            } else if (rot === 270) {
              ctx.translate(0, pCanvas.height)
              ctx.rotate(-Math.PI / 2)
            }
            ctx.drawImage(img, 0, 0)
            URL.revokeObjectURL(imgUrl)
          }

          if (pCanvas) {
            pageCanvasList.push({
              canvas: pCanvas,
              width: pCanvas.width,
              height: pCanvas.height,
            })
          }
        }

        if (pageCanvasList.length === 0) {
          throw new Error('Tidak ada halaman yang berhasil diproses.')
        }

        if (pages.length === 1 || imageLayout !== 'zip') {
          // Single stitched image (Vertical or Horizontal) or 1 page
          const gap = imageLayout !== 'zip' && pages.length > 1 ? imageGap : 0
          let masterW, masterH

          if (imageLayout === 'horizontal' && pageCanvasList.length > 1) {
            masterW = pageCanvasList.reduce((sum, item) => sum + item.width, 0) + (pageCanvasList.length - 1) * gap
            masterH = Math.max(...pageCanvasList.map((item) => item.height))
          } else {
            // Vertical (default) or single page
            masterW = Math.max(...pageCanvasList.map((item) => item.width))
            masterH = pageCanvasList.reduce((sum, item) => sum + item.height, 0) + (pageCanvasList.length - 1) * gap
          }

          const masterCanvas = document.createElement('canvas')
          masterCanvas.width = masterW
          masterCanvas.height = masterH
          const masterCtx = masterCanvas.getContext('2d')

          // Fill gap background color
          if (isJpg || gapBgColor !== 'transparent') {
            masterCtx.fillStyle = gapBgColor === 'black' ? '#000000' : '#ffffff'
            masterCtx.fillRect(0, 0, masterW, masterH)
          }

          if (imageLayout === 'horizontal' && pageCanvasList.length > 1) {
            let currentX = 0
            for (let i = 0; i < pageCanvasList.length; i++) {
              const item = pageCanvasList[i]
              const y = Math.floor((masterH - item.height) / 2)
              masterCtx.drawImage(item.canvas, currentX, y)
              currentX += item.width + gap
            }
          } else {
            let currentY = 0
            for (let i = 0; i < pageCanvasList.length; i++) {
              const item = pageCanvasList[i]
              const x = Math.floor((masterW - item.width) / 2)
              masterCtx.drawImage(item.canvas, x, currentY)
              currentY += item.height + gap
            }
          }

          const dataUrl = masterCanvas.toDataURL(mimeType, isJpg ? 0.92 : undefined)
          const base64 = dataUrl.split(',')[1]
          const binary = atob(base64)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

          setResult({
            blob: new Blob([bytes], { type: mimeType }),
            mime: mimeType,
            ext,
            fileName: pages.length > 1 ? `merged_image_${imageLayout}.${ext}` : `halaman_1.${ext}`,
          })
        } else {
          // Multiple pages -> zip
          const zip = new JSZip()
          for (let i = 0; i < pageCanvasList.length; i++) {
            const item = pageCanvasList[i]
            let dataUrl
            if (isJpg) {
              const tempCanvas = document.createElement('canvas')
              tempCanvas.width = item.width
              tempCanvas.height = item.height
              const tCtx = tempCanvas.getContext('2d')
              tCtx.fillStyle = '#ffffff'
              tCtx.fillRect(0, 0, item.width, item.height)
              tCtx.drawImage(item.canvas, 0, 0)
              dataUrl = tempCanvas.toDataURL('image/jpeg', 0.92)
            } else {
              dataUrl = item.canvas.toDataURL('image/png')
            }
            const base64 = dataUrl.split(',')[1]
            zip.file(`halaman_${i + 1}.${ext}`, base64, { base64: true })
          }
          const zipBlob = await zip.generateAsync({ type: 'blob' })
          setResult({
            blob: zipBlob,
            mime: 'application/zip',
            ext: 'zip',
            fileName: 'merged_images.zip',
          })
        }
      }
    } catch (e) {
      setError(`Gagal menyimpan: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const isMultiFile = files.length > 1

  return (
    <ToolShell
      title="Merge PDF / Image (Rotate & Reorder)"
      description="Gabungkan file PDF dan gambar (JPG, PNG, WebP), atur orientasi & susunan halaman, samakan lebar halaman, atur jarak antar-gambar, dan ekspor ke format PDF atau Gambar."
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

          {/* Export Format Option */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-3.5 space-y-3 text-xs">
            <div className="flex items-center gap-2 font-semibold text-[--color-text]">
              <Sparkles size={14} className="text-[--color-brand]" />
              <span>Format Hasil Output (Export Format):</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-[--color-text-2]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="exportFormat"
                  value="pdf"
                  checked={exportFormat === 'pdf'}
                  onChange={() => setExportFormat('pdf')}
                  className="accent-[--color-brand]"
                />
                <span className="font-medium">Dokumen PDF <span className="text-[--color-text-3]">(.pdf)</span></span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="exportFormat"
                  value="png"
                  checked={exportFormat === 'png'}
                  onChange={() => setExportFormat('png')}
                  className="accent-[--color-brand]"
                />
                <span className="font-medium">Gambar PNG <span className="text-[--color-text-3]">(.png)</span></span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="exportFormat"
                  value="jpg"
                  checked={exportFormat === 'jpg'}
                  onChange={() => setExportFormat('jpg')}
                  className="accent-[--color-brand]"
                />
                <span className="font-medium">Gambar JPG <span className="text-[--color-text-3]">(.jpg)</span></span>
              </label>
            </div>
          </div>

          {/* Image Layout & Gap Options (Visible when Export Format is PNG or JPG) */}
          {(exportFormat === 'png' || exportFormat === 'jpg') && pages.length > 1 && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-3.5 space-y-3 text-xs">
              <div className="flex items-center gap-2 font-semibold text-[--color-text]">
                <ImageIcon size={14} className="text-emerald-500" />
                <span>Susunan & Penggabungan Gambar:</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-[--color-text-2]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="imageLayout"
                    value="vertical"
                    checked={imageLayout === 'vertical'}
                    onChange={() => setImageLayout('vertical')}
                    className="accent-emerald-600"
                  />
                  <span className="font-medium flex items-center gap-1">
                    <ArrowDown size={13} className="text-emerald-500" /> Memanjang ke Bawah <span className="text-[--color-text-3]">(1 Gambar Vertikal)</span>
                  </span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="imageLayout"
                    value="horizontal"
                    checked={imageLayout === 'horizontal'}
                    onChange={() => setImageLayout('horizontal')}
                    className="accent-emerald-600"
                  />
                  <span className="font-medium flex items-center gap-1">
                    <ArrowRight size={13} className="text-emerald-500" /> Memanjang Menyamping <span className="text-[--color-text-3]">(1 Gambar Horisontal)</span>
                  </span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="imageLayout"
                    value="zip"
                    checked={imageLayout === 'zip'}
                    onChange={() => setImageLayout('zip')}
                    className="accent-emerald-600"
                  />
                  <span className="font-medium flex items-center gap-1">
                    <FolderArchive size={13} className="text-emerald-500" /> File Terpisah per Halaman <span className="text-[--color-text-3] font-mono">(.ZIP)</span>
                  </span>
                </label>
              </div>

              {/* Range / Gap spacing control between images */}
              {imageLayout !== 'zip' && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 border-t border-[--color-border]/60">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[--color-text-2]">Jarak / Range Antar Gambar:</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={imageGap}
                      onChange={(e) => setImageGap(Number(e.target.value))}
                      className="w-28 accent-emerald-600 cursor-pointer"
                    />
                    <span className="font-mono text-emerald-500 font-bold w-10 text-[11px]">{imageGap}px</span>
                  </div>

                  {imageGap > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[--color-text-2]">Warna Jarak:</span>
                      <select
                        value={gapBgColor}
                        onChange={(e) => setGapBgColor(e.target.value)}
                        className="rounded border border-[--color-border] bg-[--color-surface] px-2 py-1 text-xs text-[--color-text] outline-none"
                      >
                        <option value="white" className="bg-white text-gray-900 dark:bg-slate-800 dark:text-white">Putih</option>
                        <option value="black" className="bg-white text-gray-900 dark:bg-slate-800 dark:text-white">Hitam</option>
                        {exportFormat === 'png' && (
                          <option value="transparent" className="bg-white text-gray-900 dark:bg-slate-800 dark:text-white">Transparan</option>
                        )}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Page Width Option Selector (Visible when >1 files uploaded & export format is PDF) */}
          {files.length > 1 && exportFormat === 'pdf' && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-3.5 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-[--color-text]">
                <SlidersHorizontal size={14} className="text-[--color-brand]" />
                <span>Opsi Ukuran / Lebar Halaman Hasil Merge:</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-[--color-text-2]">
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
            ? 'Memproses Hasil...'
            : exportFormat === 'pdf'
            ? (isMultiFile ? `Gabungkan & Simpan ${pages.length} Halaman PDF` : `Simpan ${pages.length} Halaman PDF Baru`)
            : (imageLayout === 'zip'
                ? `Ekspor ${pages.length} Halaman ke ZIP (${exportFormat.toUpperCase()})`
                : `Gabungkan ${pages.length} Halaman ke 1 Gambar ${exportFormat.toUpperCase()} (${imageLayout === 'vertical' ? 'Kebawah' : 'Menyamping'})`)}
        </button>
      )}

      {/* Result Card */}
      {result && (
        <ResultCard
          fileName={result.fileName || 'output'}
          blob={result.blob}
          extraInfo={`${pages.length} halaman → ${fmtBytes(result.blob.size)}`}
          outputMimeType={result.mime}
          sourceRoute="rotate-pdf"
          onReset={clearAll}
        />
      )}
    </ToolShell>
  )
}
