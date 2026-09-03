import { useState, useCallback, useRef, useEffect } from 'react'
import { PDFDocument, degrees } from 'pdf-lib'
import JSZip from 'jszip'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, rectSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, X, RotateCw, Trash2, Loader2,
  Grid, List, SlidersHorizontal, FileText, Image as ImageIcon, Sparkles, Plus, ArrowDown, ArrowRight, FolderArchive,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import SendToDropdown from '../../components/SendToDropdown'
import DropZone from '../../components/DropZone'
import ProgressBar from '../../components/ProgressBar'
import { pdfjsLib, renderPageToDataUrl } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'
import { BTN_SEG_ACTIVE, BTN_SEG_INACTIVE, BTN_CARD_ACTIVE, BTN_CARD_INACTIVE } from '../../utils/activeButtonStyles'

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

/* ─── Parse page range string ─── */
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
  const isImg = page.type === 'image'
  const isLandscape = page.rotation === 90 || page.rotation === 270

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col items-center rounded-lg border border-(--color-border) bg-(--color-surface) p-2 select-none transition-all duration-300 ${
        isDragging ? 'shadow-xl ring-2 ring-(--color-brand)' : 'hover:border-(--color-brand-light)'
      }`}
    >
      <div className="flex w-full items-center justify-between px-1 mb-1 text-xs text-(--color-text-3)">
        <button {...attributes} {...listeners} className="cursor-grab text-(--color-text-3) hover:text-(--color-text) p-0.5">
          <GripVertical size={14} />
        </button>
        <span className="font-semibold text-[11px] truncate max-w-[90px]" title={page.fileName}>
          {page.fileName}
        </span>
        <button onClick={() => onRemove(id)} className="text-(--color-text-3) hover:text-(--color-danger) p-0.5" title="Hapus Halaman">
          <X size={14} />
        </button>
      </div>

      <div className={`relative w-full overflow-hidden rounded bg-(--color-surface-3) flex items-center justify-center border border-(--color-border) transition-all duration-300 ${
        isLandscape ? 'aspect-[4/3]' : 'aspect-[3/4]'
      }`}>
        {page.preview ? (
          <img
            src={page.preview}
            alt={page.fileName}
            style={{ transform: `rotate(${page.rotation}deg)` }}
            className={`max-h-full max-w-full object-contain transition-transform duration-300 ${
              isLandscape ? 'scale-125' : ''
            }`}
          />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Loader2 size={16} className="animate-spin text-(--color-brand)" />
            <span className="text-[10px] text-(--color-text-3)">Hal {page.pdfPageNumber}</span>
          </div>
        )}

        <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          #{index + 1}
        </span>
        <span className={`absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[9px] font-bold text-white shadow ${
          isImg ? 'bg-emerald-600' : 'bg-(--color-brand)'
        }`}>
          {isImg ? 'GAMBAR' : `p.${page.pdfPageNumber}`}
        </span>
      </div>

      <div className="mt-2 flex w-full items-center justify-between px-1">
        <span className="text-[10px] font-mono font-bold text-(--color-brand)">
          {page.rotation > 0 ? `${page.rotation}°` : '0°'}
        </span>
        <button
          onClick={() => onRotate(id)}
          className="flex items-center gap-1 rounded border border-(--color-border) bg-(--color-surface-2) px-2 py-1 text-[11px] font-medium text-(--color-brand) hover:bg-(--color-brand) hover:text-white transition-colors cursor-pointer"
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
  const isImg = fileData.type === 'image'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3.5 space-y-3"
    >
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} className="cursor-grab text-(--color-text-3) hover:text-(--color-text)">
          <GripVertical size={16} />
        </button>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--color-surface-3) text-xs font-bold text-(--color-text-2)">
          {index + 1}
        </span>
        {isImg ? <ImageIcon size={16} className="shrink-0 text-emerald-500" /> : <FileText size={16} className="shrink-0 text-(--color-brand)" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-(--color-text)">{fileData.file.name}</p>
          <p className="text-xs text-(--color-text-3)">
            {fmtBytes(fileData.file.size)} • {fileData.totalPages} Halaman • Lebar ~{Math.round(fileData.firstPageWidth || 595)}pt
          </p>
        </div>
        <button onClick={() => onRemove(id)} className="text-(--color-text-3) hover:text-(--color-danger) p-1">
          <X size={16} />
        </button>
      </div>

      {!isImg && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-(--color-surface-2) p-2.5 text-xs border border-(--color-border)">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <span className="font-semibold text-(--color-text-2) shrink-0">Halaman:</span>
            <input
              type="text"
              value={fileData.pageRangeInput}
              onChange={(e) => onRangeChange(id, e.target.value)}
              placeholder="misal: 1-3, 5 atau ganjil"
              className="w-full rounded border border-(--color-border) bg-(--color-surface) px-2.5 py-1 text-xs text-(--color-text) focus:border-(--color-brand) focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onSelectPreset(id, 'all')}
              className="rounded border border-(--color-border) bg-(--color-surface) px-2 py-1 text-[11px] text-(--color-text-2) hover:bg-(--color-brand-light) hover:text-(--color-brand)"
            >
              Semua
            </button>
            <button
              onClick={() => onSelectPreset(id, 'ganjil')}
              className="rounded border border-(--color-border) bg-(--color-surface) px-2 py-1 text-[11px] text-(--color-text-2) hover:bg-(--color-brand-light) hover:text-(--color-brand)"
            >
              Ganjil
            </button>
            <button
              onClick={() => onSelectPreset(id, 'genap')}
              className="rounded border border-(--color-border) bg-(--color-surface) px-2 py-1 text-[11px] text-(--color-text-2) hover:bg-(--color-brand-light) hover:text-(--color-brand)"
            >
              Genap
            </button>
            <button
              onClick={() => onRotateAll(id)}
              className="flex items-center gap-1 rounded border border-(--color-border) bg-(--color-surface) px-2 py-1 text-[11px] font-semibold text-(--color-brand) hover:bg-(--color-brand) hover:text-white transition-colors"
            >
              <RotateCw size={11} /> Putar +90°
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   CollageCustomPreview – Interactive drag & resize collage editor
   ────────────────────────────────────────────────────────────────────────── */
function CollageCustomPreview({ pages, canvasWidth, canvasHeight, items, setItems }) {
  const containerRef = useRef(null)
  const wrapperRef = useRef(null)
  const [previewScale, setPreviewScale] = useState(1)
  const [dragging, setDragging] = useState(null)
  const [resizing, setResizing] = useState(null)
  const [pageImages, setPageImages] = useState({})
  const [activeItem, setActiveItem] = useState(null)

  // Dynamically fill available width from parent
  useEffect(() => {
    const calcScale = () => {
      const parent = wrapperRef.current?.parentElement
      if (!parent) return
      const availW = parent.clientWidth - 32
      const availH = Math.max(400, window.innerHeight * 0.55)
      setPreviewScale(Math.min(availW / canvasWidth, availH / canvasHeight, 1))
    }
    calcScale()
    window.addEventListener('resize', calcScale)
    return () => window.removeEventListener('resize', calcScale)
  }, [canvasWidth, canvasHeight])

  useEffect(() => {
    const loadImages = async () => {
      const imgs = {}
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        if (page.preview) {
          imgs[i] = page.preview
        } else if (page.type === 'pdf' && page.pdfDoc) {
          try {
            const pdfPage = await page.pdfDoc.getPage(page.pageIndex)
            const viewport = pdfPage.getViewport({ scale: 0.5 })
            const canvas = document.createElement('canvas')
            canvas.width = viewport.width
            canvas.height = viewport.height
            const ctx = canvas.getContext('2d')
            await pdfPage.render({ canvasContext: ctx, viewport }).promise
            imgs[i] = canvas.toDataURL('image/png')
          } catch { /* skip */ }
        }
      }
      setPageImages(imgs)
    }
    loadImages()
  }, [pages])

  useEffect(() => {
    if (items.length === 0 && pages.length > 0) {
      const cols = Math.ceil(Math.sqrt(pages.length))
      const rows = Math.ceil(pages.length / cols)
      const cellW = Math.floor(canvasWidth / cols)
      const cellH = Math.floor(canvasHeight / rows)
      setItems(pages.map((_, i) => ({
        pageIndex: i,
        x: (i % cols) * cellW,
        y: Math.floor(i / cols) * cellH,
        width: cellW,
        height: cellH,
      })))
    }
  }, [pages, canvasWidth, canvasHeight, items.length, setItems])

  const toCanvas = (clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: Math.round((clientX - rect.left) / previewScale),
      y: Math.round((clientY - rect.top) / previewScale),
    }
  }

  const handleMouseDown = (e, index, handle) => {
    e.preventDefault()
    e.stopPropagation()
    setActiveItem(index)
    const pos = toCanvas(e.clientX, e.clientY)
    const item = items[index]
    document.body.style.userSelect = 'none'
    document.body.style.cursor = handle ? `${handle}-resize` : 'move'
    if (handle) {
      setResizing({ index, startX: pos.x, startY: pos.y, origW: item.width, origH: item.height, origX: item.x, origY: item.y, handle })
    } else {
      setDragging({ index, startX: pos.x, startY: pos.y, origX: item.x, origY: item.y })
    }
  }

  useEffect(() => {
    if (!dragging && !resizing) return
    const handleMouseMove = (e) => {
      const pos = toCanvas(e.clientX, e.clientY)
      if (dragging) {
        const dx = pos.x - dragging.startX
        const dy = pos.y - dragging.startY
        setItems((prev) => prev.map((item, i) => {
          if (i !== dragging.index) return item
          return { ...item, x: Math.max(0, Math.min(canvasWidth - item.width, dragging.origX + dx)), y: Math.max(0, Math.min(canvasHeight - item.height, dragging.origY + dy)) }
        }))
      }
      if (resizing) {
        const dx = pos.x - resizing.startX
        const dy = pos.y - resizing.startY
        const h = resizing.handle
        setItems((prev) => prev.map((item, i) => {
          if (i !== resizing.index) return item
          let newX = resizing.origX, newY = resizing.origY, newW = resizing.origW, newH = resizing.origH
          if (h.includes('e')) newW = Math.max(40, resizing.origW + dx)
          if (h.includes('w')) { newW = Math.max(40, resizing.origW - dx); newX = resizing.origX + (resizing.origW - newW) }
          if (h.includes('s')) newH = Math.max(40, resizing.origH + dy)
          if (h.includes('n')) { newH = Math.max(40, resizing.origH - dy); newY = resizing.origY + (resizing.origH - newH) }
          newX = Math.max(0, Math.min(canvasWidth - newW, newX))
          newY = Math.max(0, Math.min(canvasHeight - newH, newY))
          return { ...item, x: newX, y: newY, width: newW, height: newH }
        }))
      }
    }
    const handleMouseUp = () => {
      setDragging(null)
      setResizing(null)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp) }
  }, [dragging, resizing, canvasWidth, canvasHeight, setItems])

  const pw = Math.round(canvasWidth * previewScale)
  const ph = Math.round(canvasHeight * previewScale)

  const cursors = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }

  return (
    <div ref={wrapperRef} className="space-y-2 pt-3 border-t border-(--color-border)/60">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-(--color-text-2)">Preview Kolase Custom</span>
        <span className="text-[10px] text-(--color-text-3)">{canvasWidth} × {canvasHeight} px &middot; {items.length} gambar</span>
      </div>
      <div className="text-[10px] text-(--color-text-3)">Geser gambar untuk posisi &middot; Tarik tepi/pojok untuk resize</div>
      <div
        ref={containerRef}
        className="relative border-2 border-dashed border-(--color-border-strong) rounded-lg bg-gray-100 mx-auto"
        style={{ width: pw, height: ph, touchAction: 'none' }}
        onMouseDown={() => { setActiveItem(null) }}
      >
        {/* Grid dots for visual reference */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dots" x="0" y="0" width={20 * previewScale} height={20 * previewScale} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={0.8} fill="#999" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>

        {items.map((item, i) => {
          const img = pageImages[item.pageIndex]
          const isActive = activeItem === i
          const isDragging = dragging?.index === i
          return (
            <div
              key={i}
              className={`absolute group select-none ${isDragging ? 'z-20' : 'z-10'}`}
              style={{
                left: item.x * previewScale,
                top: item.y * previewScale,
                width: item.width * previewScale,
                height: item.height * previewScale,
                cursor: isDragging ? 'grabbing' : 'grab',
              }}
              onMouseDown={(e) => handleMouseDown(e, i, null)}
            >
              {/* Image content */}
              <div className={`w-full h-full border-2 overflow-hidden ${isActive ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-emerald-500'} rounded-sm transition-shadow`}>
                {img ? (
                  <img src={img} alt="" className="w-full h-full object-cover pointer-events-none" draggable={false} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-200 text-xs text-gray-500">#{item.pageIndex + 1}</div>
                )}
              </div>

              {/* Label */}
              <div className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm pointer-events-none">
                #{i + 1}
              </div>

              {/* Size label when active */}
              {isActive && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-blue-600/90 px-1.5 py-0.5 text-[8px] font-mono font-bold text-white pointer-events-none whitespace-nowrap">
                  {Math.round(item.width)}×{Math.round(item.height)}
                </div>
              )}

              {/* Resize handles — always visible when active, hover otherwise */}
              {['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].map((h) => (
                <div
                  key={h}
                  className={`absolute bg-white border-2 border-emerald-600 rounded-sm transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  style={{
                    width: h === 'n' || h === 's' ? 20 : 10,
                    height: h === 'e' || h === 'w' ? 20 : 10,
                    ...(h.includes('n') ? { top: -5 } : h.includes('s') ? { bottom: -5 } : { top: 'calc(50% - 5px)' }),
                    ...(h.includes('w') ? { left: -5 } : h.includes('e') ? { right: -5 } : { left: 'calc(50% - 5px)' }),
                    cursor: cursors[h],
                  }}
                  onMouseDown={(e) => handleMouseDown(e, i, h)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function MergePDF() {
  const [files, setFiles] = useState([]) // [{ id, file, type, totalPages, pdfDoc, pdfLibDoc, firstPageWidth, firstPageHeight, pageRangeInput }]
  const [pages, setPages] = useState([]) // [{ id, fileId, type, fileName, pageIndex, pdfPageNumber, rotation, preview, pdfLibDoc, file, enabled }]
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'file'
  const [widthOption, setWidthOption] = useState('original') // 'original' | 'a4' | 'file-0' | etc.
  const [exportFormat, setExportFormat] = useState('pdf') // 'pdf' | 'png' | 'jpg'
  const [imageLayout, setImageLayout] = useState('vertical') // 'vertical' | 'horizontal' | 'zip' | 'collage'
  const [imageGap, setImageGap] = useState(0) // 0 to 100 px gap
  const [gapBgColor, setGapBgColor] = useState('white') // 'white' | 'black' | 'transparent'
  const [collagePreset, setCollagePreset] = useState('grid-2x2') // 'grid-2x2' | 'grid-3x3' | 'grid-1x2' | 'grid-2x1' | 'custom'
  const [collageWidth, setCollageWidth] = useState(1200)
  const [collageHeight, setCollageHeight] = useState(1600)
  const [collageItems, setCollageItems] = useState([]) // [{ x, y, width, height, pageIndex }]
  const [draggingItem, setDraggingItem] = useState(null)
  const [resizingItem, setResizingItem] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null) // { blob, mime, ext, fileName }
  const [resultName, setResultName] = useState('')
  const [resultPages, setResultPages] = useState([])
  const [resultCurrentPage, setResultCurrentPage] = useState(1)
  const [renderingResult, setRenderingResult] = useState(false)
  const [error, setError] = useState('')

  const fileInputRef = useRef(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

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
            totalPages,
            pdfDoc: pdfjsDoc,
            pdfLibDoc,
            firstPageWidth,
            firstPageHeight,
            pageRangeInput: 'Semua',
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
              pdfDoc: pdfjsDoc,
              enabled: true,
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
            totalPages: 1,
            firstPageWidth: imgW,
            firstPageHeight: imgH,
            pageRangeInput: 'Semua',
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
            enabled: true,
          })
        }
        setLoadProgress(Math.round(((fIdx + 1) / newFilesList.length) * 40))
      }

      setFiles((prev) => [...prev, ...addedFiles])
      setPages((prev) => [...prev, ...addedPages])

      // Render previews progressively for PDF pages
      for (let i = 0; i < addedPages.length; i++) {
        const pObj = addedPages[i]
        if (pObj.type === 'pdf') {
          const parentFile = addedFiles.find((f) => f.id === pObj.fileId)
          if (parentFile) {
            try {
              const { dataUrl } = await renderPageToDataUrl(parentFile.pdfDoc, pObj.pageIndex + 1, 0.4)
              setPages((prev) => prev.map((p) => p.id === pObj.id ? { ...p, preview: dataUrl } : p))
            } catch {
              // fallback
            }
          }
        }
        setLoadProgress(40 + Math.round(((i + 1) / addedPages.length) * 60))
      }
    } catch (e) {
      setError(`Gagal memuat file: ${e.message}`)
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

  const activePages = pages.filter((p) => p.enabled)

  /* ─── Merge PDF / Image Export ─── */
  const merge = async () => {
    if (activePages.length === 0) {
      setError('Tidak ada halaman aktif yang dipilih.')
      return
    }
    setProcessing(true)
    setError('')

    try {
      if (exportFormat === 'pdf') {
        const mergedPdf = await PDFDocument.create()

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

        for (const pageObj of activePages) {
          if (pageObj.type === 'pdf') {
            const [copiedPage] = await mergedPdf.copyPages(pageObj.pdfLibDoc, [pageObj.pageIndex])
            if (pageObj.rotation > 0) {
              const origAngle = copiedPage.getRotation().angle
              copiedPage.setRotation(degrees((origAngle + pageObj.rotation) % 360))
            }
            if (targetWidth && targetWidth > 0) {
              const curW = copiedPage.getWidth()
              if (curW && Math.abs(curW - targetWidth) > 1) {
                const scale = targetWidth / curW
                copiedPage.scale(scale, scale)
              }
            }
            mergedPdf.addPage(copiedPage)
          } else {
            // Embed image file into PDF page
            let embeddedImg
            const imgBuf = await readAsArrayBuffer(pageObj.file)
            const isJpg = pageObj.file.type === 'image/jpeg' || pageObj.file.name.toLowerCase().endsWith('.jpg') || pageObj.file.name.toLowerCase().endsWith('.jpeg')
            const isPng = pageObj.file.type === 'image/png' || pageObj.file.name.toLowerCase().endsWith('.png')

            if (isJpg) {
              embeddedImg = await mergedPdf.embedJpg(imgBuf)
            } else if (isPng) {
              try {
                embeddedImg = await mergedPdf.embedPng(imgBuf)
              } catch {
                const pngBytes = await convertImageToPngBytes(pageObj.file)
                embeddedImg = await mergedPdf.embedPng(pngBytes)
              }
            } else {
              const pngBytes = await convertImageToPngBytes(pageObj.file)
              embeddedImg = await mergedPdf.embedPng(pngBytes)
            }

            let finalW = embeddedImg.width
            let finalH = embeddedImg.height

            if (targetWidth && targetWidth > 0 && Math.abs(finalW - targetWidth) > 1) {
              const scale = targetWidth / finalW
              finalW = targetWidth
              finalH = finalH * scale
            }

            const newPage = mergedPdf.addPage([finalW, finalH])
            newPage.drawImage(embeddedImg, { x: 0, y: 0, width: finalW, height: finalH })
            if (pageObj.rotation > 0) {
              newPage.setRotation(degrees(pageObj.rotation))
            }
          }
        }

        const bytes = await mergedPdf.save()
        const blob = new Blob([bytes], { type: 'application/pdf' })
        setResult({ blob, mime: 'application/pdf', ext: 'pdf', fileName: 'merged_output.pdf' })
        setResultCurrentPage(1)

        // Render result pages for preview
        try {
          setRenderingResult(true)
          const resultDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise
          const pages = []
          for (let p = 1; p <= resultDoc.numPages; p++) {
            const data = await renderPageToDataUrl(resultDoc, p, 0.8)
            pages.push({ pageNum: p, dataUrl: data.dataUrl })
          }
          setResultPages(pages)
        } catch { setResultPages([]) }
        finally { setRenderingResult(false) }
      } else {
        // Export to Image (PNG or JPG)
        const isJpg = exportFormat === 'jpg'
        const mimeType = isJpg ? 'image/jpeg' : 'image/png'
        const ext = isJpg ? 'jpg' : 'png'
        const pageCanvasList = []

        // Determine target width for image export
        let targetWidth = null
        if (widthOption === 'a4') {
          targetWidth = 794 // 595.28pt at 96 DPI
        } else if (widthOption === 'letter') {
          targetWidth = 816 // 612pt at 96 DPI
        } else if (widthOption !== 'original' && widthOption.startsWith('file-')) {
          const fileIdx = parseInt(widthOption.replace('file-', ''), 10)
          if (files[fileIdx] && files[fileIdx].firstPageWidth) {
            targetWidth = Math.round(files[fileIdx].firstPageWidth * 96 / 72) // pt to px at 96 DPI
          }
        }

        for (let i = 0; i < activePages.length; i++) {
          const pageObj = activePages[i]
          let pCanvas
          if (pageObj.type === 'pdf') {
            const parentFile = files.find((f) => f.id === pageObj.fileId)
            const pdfDocToUse = parentFile?.pdfDoc || pageObj.pdfDoc
            if (pdfDocToUse) {
              const { canvas: renderedCanvas } = await renderPageToDataUrl(pdfDocToUse, pageObj.pageIndex + 1, 2.0, pageObj.rotation)
              pCanvas = renderedCanvas
            }
          } else {
            // Image file
            const imgUrl = URL.createObjectURL(pageObj.file)
            const img = new Image()
            await new Promise((res) => { img.onload = res; img.src = imgUrl })
            pCanvas = document.createElement('canvas')
            const rot = pageObj.rotation || 0
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

          // Apply width scaling if target width is set
          if (pCanvas && targetWidth && targetWidth > 0 && Math.abs(pCanvas.width - targetWidth) > 1) {
            const scale = targetWidth / pCanvas.width
            const scaledCanvas = document.createElement('canvas')
            scaledCanvas.width = targetWidth
            scaledCanvas.height = Math.round(pCanvas.height * scale)
            const scaledCtx = scaledCanvas.getContext('2d')
            scaledCtx.imageSmoothingEnabled = true
            scaledCtx.imageSmoothingQuality = 'high'
            scaledCtx.drawImage(pCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height)
            pCanvas = scaledCanvas
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

        if (activePages.length === 1 || imageLayout !== 'zip') {
          // Single stitched image (Vertical or Horizontal) or 1 page
          const gap = imageLayout !== 'zip' && activePages.length > 1 ? imageGap : 0
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
            fileName: activePages.length > 1 ? `merged_image_${imageLayout}.${ext}` : `halaman_1.${ext}`,
          })
          setResultPages([{ pageNum: 1, dataUrl }])
          setResultCurrentPage(1)
        } else if (imageLayout === 'collage') {
          // Collage/Grid layout
          const gap = imageGap
          const isCustom = collagePreset === 'custom'
          const cols = isCustom ? 1 : (collagePreset === 'grid-3x3' ? 3 : collagePreset === 'grid-2x2' ? 2 : collagePreset === 'grid-1x2' ? 1 : 2)
          const rows = isCustom ? 1 : (collagePreset === 'grid-3x3' ? 3 : collagePreset === 'grid-2x2' ? 2 : collagePreset === 'grid-2x1' ? 1 : 2)
          
          const masterCanvas = document.createElement('canvas')
          masterCanvas.width = collageWidth
          masterCanvas.height = collageHeight
          const masterCtx = masterCanvas.getContext('2d')

          // Fill background
          if (isJpg || gapBgColor !== 'transparent') {
            masterCtx.fillStyle = gapBgColor === 'black' ? '#000000' : '#ffffff'
            masterCtx.fillRect(0, 0, collageWidth, collageHeight)
          }

          if (isCustom && collageItems.length > 0) {
            // Custom mode – use saved positions/sizes directly (already in canvas coords)
            for (let i = 0; i < Math.min(pageCanvasList.length, collageItems.length); i++) {
              const ci = collageItems[i]
              const item = pageCanvasList[ci.pageIndex] || pageCanvasList[i]
              if (!item) continue
              masterCtx.drawImage(item.canvas, ci.x, ci.y, ci.width, ci.height)
            }
          } else {
            // Preset grid mode
            const cellW = Math.floor((collageWidth - (cols - 1) * gap) / cols)
            const cellH = Math.floor((collageHeight - (rows - 1) * gap) / rows)

            for (let i = 0; i < Math.min(pageCanvasList.length, cols * rows); i++) {
              const item = pageCanvasList[i]
              const col = i % cols
              const row = Math.floor(i / cols)
              const x = col * (cellW + gap)
              const y = row * (cellH + gap)
              
              const scale = Math.min(cellW / item.width, cellH / item.height)
              const drawW = Math.floor(item.width * scale)
              const drawH = Math.floor(item.height * scale)
              const drawX = x + Math.floor((cellW - drawW) / 2)
              const drawY = y + Math.floor((cellH - drawH) / 2)
              
              masterCtx.drawImage(item.canvas, drawX, drawY, drawW, drawH)
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
            fileName: `collage_${collagePreset}.${ext}`,
          })
          setResultPages([{ pageNum: 1, dataUrl }])
          setResultCurrentPage(1)
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
      setError(`Gagal menggabungkan: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <ToolShell
      title="Merge PDF / Gambar"
      description="Gabung beberapa file PDF dan gambar (JPG, PNG, WebP) menjadi dokumen PDF atau Gambar. Bebas samakan lebar halaman, atur jarak antar-gambar, dan ekspor ke PDF/Gambar."
    >
      <DropZone
        accept=".pdf,application/pdf,image/*,.jpg,.jpeg,.png,.webp,.bmp"
        multiple
        onFiles={addFiles}
        disabled={loading}
        label="Pilih atau drop file PDF / Gambar"
        hint="Pilih beberapa file PDF atau Gambar sekaligus"
      />

      {loading && (
        <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-(--color-brand)">
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
          {/* Controls Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-(--color-border) bg-(--color-surface) p-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-(--color-text)">
                {files.length} File • {activePages.length} Halaman Aktif
              </span>
              <div className="h-4 w-px bg-(--color-border)" />
              <div className="flex items-center gap-1 rounded bg-(--color-surface-2) p-1 border border-(--color-border)">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                    viewMode === 'grid' ? BTN_SEG_ACTIVE : BTN_SEG_INACTIVE
                  }`}
                >
                  <Grid size={13} /> Visual Grid
                </button>
                <button
                  onClick={() => setViewMode('file')}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                    viewMode === 'file' ? BTN_SEG_ACTIVE : BTN_SEG_INACTIVE
                  }`}
                >
                  <List size={13} /> Daftar File
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf,image/*,.jpg,.jpeg,.png,.webp,.bmp"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length) {
                    addFiles(Array.from(e.target.files))
                    e.target.value = ''
                  }
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded border border-(--color-brand) bg-(--color-brand-light) px-3 py-1.5 text-xs font-semibold text-(--color-brand) hover:bg-(--color-brand) hover:text-white transition-colors cursor-pointer"
              >
                <Plus size={13} /> Tambah PDF / Gambar
              </button>
              <button
                onClick={() => rotateAllPagesGlobal(90)}
                className="flex items-center gap-1 rounded border border-(--color-border) bg-(--color-surface-2) px-2 py-1 text-xs font-medium text-(--color-text-2) hover:bg-(--color-brand-light) hover:text-(--color-brand)"
              >
                <RotateCw size={12} /> Putar Semua (+90°)
              </button>
              <button
                onClick={clearAll}
                className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white"
              >
                <Trash2 size={12} /> Bersihkan
              </button>
            </div>
          </div>

          {/* Export Format Option */}
          <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3.5 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-(--color-text)">
              <Sparkles size={14} className="text-(--color-brand)" />
              <span>Format Hasil Output (Export Format):</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-(--color-text-2)">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="mergeExportFormat"
                  value="pdf"
                  checked={exportFormat === 'pdf'}
                  onChange={() => setExportFormat('pdf')}
                  className="accent-(--color-brand)"
                />
                <span className="font-medium">Dokumen PDF <span className="text-(--color-text-3)">(.pdf)</span></span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="mergeExportFormat"
                  value="png"
                  checked={exportFormat === 'png'}
                  onChange={() => setExportFormat('png')}
                  className="accent-(--color-brand)"
                />
                <span className="font-medium">Gambar PNG <span className="text-(--color-text-3)">(.png)</span></span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="mergeExportFormat"
                  value="jpg"
                  checked={exportFormat === 'jpg'}
                  onChange={() => setExportFormat('jpg')}
                  className="accent-(--color-brand)"
                />
                <span className="font-medium">Gambar JPG <span className="text-(--color-text-3)">(.jpg)</span></span>
              </label>
            </div>
          </div>

          {/* Image Layout & Gap Options (Visible when Export Format is PNG or JPG) */}
          {(exportFormat === 'png' || exportFormat === 'jpg') && activePages.length > 1 && (
            <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3.5 space-y-3 text-xs">
              <div className="flex items-center gap-2 font-semibold text-(--color-text)">
                <ImageIcon size={14} className="text-emerald-500" />
                <span>Susunan & Penggabungan Gambar:</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-(--color-text-2)">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="mergeImageLayout"
                    value="vertical"
                    checked={imageLayout === 'vertical'}
                    onChange={() => setImageLayout('vertical')}
                    className="accent-emerald-600"
                  />
                  <span className="font-medium flex items-center gap-1">
                    <ArrowDown size={13} className="text-emerald-500" /> Memanjang ke Bawah <span className="text-(--color-text-3)">(1 Gambar Vertikal)</span>
                  </span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="mergeImageLayout"
                    value="horizontal"
                    checked={imageLayout === 'horizontal'}
                    onChange={() => setImageLayout('horizontal')}
                    className="accent-emerald-600"
                  />
                  <span className="font-medium flex items-center gap-1">
                    <ArrowRight size={13} className="text-emerald-500" /> Memanjang Menyamping <span className="text-(--color-text-3)">(1 Gambar Horisontal)</span>
                  </span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="mergeImageLayout"
                    value="zip"
                    checked={imageLayout === 'zip'}
                    onChange={() => setImageLayout('zip')}
                    className="accent-emerald-600"
                  />
                  <span className="font-medium flex items-center gap-1">
                    <FolderArchive size={13} className="text-emerald-500" /> File Terpisah per Halaman <span className="text-(--color-text-3) font-mono">(.ZIP)</span>
                  </span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="mergeImageLayout"
                    value="collage"
                    checked={imageLayout === 'collage'}
                    onChange={() => setImageLayout('collage')}
                    className="accent-emerald-600"
                  />
                  <span className="font-medium flex items-center gap-1">
                    <Grid size={13} className="text-emerald-500" /> Kolase / Grid <span className="text-(--color-text-3)">(Susun Berpetak)</span>
                  </span>
                </label>
              </div>

              {/* Range / Gap spacing control between images */}
              {imageLayout !== 'zip' && imageLayout !== 'collage' && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 border-t border-(--color-border)/60">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-(--color-text-2)">Jarak / Range Antar Gambar:</span>
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
                      <span className="font-medium text-(--color-text-2)">Warna Jarak:</span>
                      <select
                        value={gapBgColor}
                        onChange={(e) => setGapBgColor(e.target.value)}
                        className="rounded border border-(--color-border) bg-(--color-surface) px-2 py-1 text-xs text-(--color-text) outline-none"
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

              {/* Collage / Grid Presets */}
              {imageLayout === 'collage' && (
                <div className="space-y-3 pt-2 border-t border-(--color-border)/60">
                  <div className="text-xs font-semibold text-(--color-text-2)">Pilih Tata Letak Kolase:</div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { id: 'grid-2x2', label: '2 × 2', desc: '4 gambar' },
                      { id: 'grid-3x3', label: '3 × 3', desc: '9 gambar' },
                      { id: 'grid-1x2', label: '1 × 2', desc: '2 gambar vertikal' },
                      { id: 'grid-2x1', label: '2 × 1', desc: '2 gambar horizontal' },
                      { id: 'custom', label: 'Custom', desc: 'Drag & resize' },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setCollagePreset(preset.id)}
                        className={`flex flex-col items-center justify-center rounded-lg border-2 p-2.5 text-xs text-center transition-all min-h-[60px] ${
                          collagePreset === preset.id
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                            : 'border-(--color-border) bg-(--color-surface) text-(--color-text-2) hover:border-(--color-border-strong)'
                        }`}
                      >
                        <span className="font-bold text-sm">{preset.label}</span>
                        <span className="text-[10px] opacity-70">{preset.desc}</span>
                      </button>
                    ))}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-(--color-text-2)">Lebar:</span>
                      <input
                        type="number"
                        min="200"
                        max="4000"
                        step="100"
                        value={collageWidth}
                        onChange={(e) => setCollageWidth(Math.max(200, Math.min(4000, Number(e.target.value) || 1200)))}
                        className="w-20 rounded border border-(--color-border) bg-(--color-surface) px-2 py-1 text-xs text-(--color-text) outline-none"
                      />
                      <span className="text-[10px] text-(--color-text-3)">px</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-(--color-text-2)">Tinggi:</span>
                      <input
                        type="number"
                        min="200"
                        max="4000"
                        step="100"
                        value={collageHeight}
                        onChange={(e) => setCollageHeight(Math.max(200, Math.min(4000, Number(e.target.value) || 1600)))}
                        className="w-20 rounded border border-(--color-border) bg-(--color-surface) px-2 py-1 text-xs text-(--color-text) outline-none"
                      />
                      <span className="text-[10px] text-(--color-text-3)">px</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-(--color-text-2)">Jarak:</span>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        step="5"
                        value={imageGap}
                        onChange={(e) => setImageGap(Number(e.target.value))}
                        className="w-24 accent-emerald-600 cursor-pointer"
                      />
                      <span className="font-mono text-emerald-500 font-bold text-[11px]">{imageGap}px</span>
                    </div>
                  </div>

                  {/* Custom collage interactive preview */}
                  {collagePreset === 'custom' && (
                    <CollageCustomPreview
                      pages={activePages}
                      canvasWidth={collageWidth}
                      canvasHeight={collageHeight}
                      items={collageItems}
                      setItems={setCollageItems}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Page Width Option Selector (Visible when >1 files uploaded) */}
          {files.length > 1 && (exportFormat === 'pdf' || exportFormat === 'png' || exportFormat === 'jpg') && (
            <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3.5 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-(--color-text)">
                <SlidersHorizontal size={14} className="text-(--color-brand)" />
                <span>Opsi Ukuran / Lebar Halaman Hasil Merge:</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-(--color-text-2)">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="mergeWidthOption"
                    value="original"
                    checked={widthOption === 'original'}
                    onChange={() => setWidthOption('original')}
                    className="accent-(--color-brand)"
                  />
                  <span className="font-medium">Asli <span className="text-(--color-text-3)">(Proporsi masing-masing file)</span></span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="mergeWidthOption"
                    value="a4"
                    checked={widthOption === 'a4'}
                    onChange={() => setWidthOption('a4')}
                    className="accent-(--color-brand)"
                  />
                  <span className="font-medium">Standar A4 <span className="text-(--color-text-3)">(595pt / 210mm)</span></span>
                </label>

                {files.map((f, idx) => {
                  const fileW = f.firstPageWidth ? Math.round(f.firstPageWidth) : null
                  const isImg = f.type === 'image'
                  return (
                    <label key={f.id} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="mergeWidthOption"
                        value={`file-${idx}`}
                        checked={widthOption === `file-${idx}`}
                        onChange={() => setWidthOption(`file-${idx}`)}
                        className="accent-(--color-brand)"
                      />
                      <span>
                        Ikuti Lebar File {idx + 1}{' '}
                        <span className="text-(--color-text-3)">
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

          {/* Mode 1: Grid View */}
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

          {/* Mode 2: File View */}
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

      {error && <p className="rounded border border-(--color-danger-light) bg-(--color-danger-light) px-3 py-2 text-sm text-(--color-danger)">{error}</p>}

      {/* Action Button */}
      {files.length > 0 && !result && (
        <button
          onClick={merge}
          disabled={processing || activePages.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-(--color-brand) px-4 py-3 text-sm font-bold text-white hover:bg-(--color-brand-hover) disabled:opacity-60 transition-colors cursor-pointer shadow-md"
        >
          {processing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {processing
            ? 'Memproses Hasil...'
            : exportFormat === 'pdf'
            ? `Gabungkan ${activePages.length} Halaman ke PDF`
            : (imageLayout === 'zip'
                ? `Ekspor ${activePages.length} Halaman ke ZIP (${exportFormat.toUpperCase()})`
                : `Gabungkan ${activePages.length} Halaman ke 1 Gambar ${exportFormat.toUpperCase()} (${imageLayout === 'vertical' ? 'Kebawah' : 'Menyamping'})`)}
        </button>
      )}

      {/* Result Section */}
      {result && (
        <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-(--color-text)">Hasil</span>
              <p className="text-xs text-(--color-text-3)">{(resultName || result.fileName || 'output')} — {fmtBytes(result.blob.size)}</p>
            </div>
            <div className="flex items-center gap-2">
              <SendToDropdown
                blob={result.blob}
                fileName={resultName || result.fileName || 'output'}
                outputMimeType={result.mime || 'application/pdf'}
                excludeRoute="merge-pdf"
                onRename={(n) => setResultName(n)}
              />
              <button
                onClick={() => { setResult(null); setResultName(''); setResultPages([]); setResultCurrentPage(1) }}
                className="flex h-7 items-center gap-1 rounded border border-(--color-border) bg-(--color-surface) px-2 text-xs text-(--color-text-2) hover:bg-(--color-surface-3) transition-colors"
              >
                <X size={12} /> Tutup
              </button>
              <a
                href={URL.createObjectURL(result.blob)}
                download={resultName || result.fileName || 'output'}
                className="flex h-7 items-center gap-1 rounded bg-(--color-brand) px-3 text-xs font-bold text-white hover:bg-(--color-brand-hover) transition-colors no-underline"
              >
                <ArrowDown size={12} /> Unduh
              </a>
            </div>
          </div>

          {/* Result Preview */}
          {renderingResult && (
            <div className="rounded border border-(--color-border) bg-(--color-surface) p-6 space-y-3">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={28} className="animate-spin text-(--color-brand)" />
                <span className="text-xs font-medium text-(--color-text-3)">Merender preview hasil…</span>
              </div>
            </div>
          )}
          {!renderingResult && resultPages.length > 0 && (
            <div className="rounded border border-(--color-border) bg-(--color-surface) p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-(--color-text-2)">Preview Hasil</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setResultCurrentPage(Math.max(1, resultCurrentPage - 1))} disabled={resultCurrentPage <= 1}
                    className="flex h-6 w-6 items-center justify-center rounded border border-(--color-border) text-(--color-text-2) hover:bg-(--color-surface-3) disabled:opacity-40">
                    <ChevronLeft size={14} />
                  </button>
                  <span className="font-bold text-(--color-text)">{resultCurrentPage} / {resultPages.length}</span>
                  <button onClick={() => setResultCurrentPage(Math.min(resultPages.length, resultCurrentPage + 1))} disabled={resultCurrentPage >= resultPages.length}
                    className="flex h-6 w-6 items-center justify-center rounded border border-(--color-border) text-(--color-text-2) hover:bg-(--color-surface-3) disabled:opacity-40">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
              <div className="flex justify-center rounded border border-(--color-border) bg-(--color-surface-2) p-3 overflow-auto max-h-[600px]">
                {resultPages[resultCurrentPage - 1] && (
                  <img src={resultPages[resultCurrentPage - 1].dataUrl} alt={`Page ${resultCurrentPage}`}
                    className="block max-h-[550px] w-auto shadow-sm" />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  )
}
