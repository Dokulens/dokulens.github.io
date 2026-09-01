import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Loader2 } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import { readAsArrayBuffer, fmtBytes } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

const PAGE_SIZES = {
  fit: 'Ukuran Asli Gambar',
  a4_portrait: 'A4 Portrait',
  a4_landscape: 'A4 Landscape',
  letter_portrait: 'Letter Portrait',
  letter_landscape: 'Letter Landscape',
}

const DIMS = {
  a4_portrait: [595.28, 841.89],
  a4_landscape: [841.89, 595.28],
  letter_portrait: [612, 792],
  letter_landscape: [792, 612],
}

function SortableItem({ id, item, index, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded border border-[--color-border] bg-[--color-surface] p-2"
    >
      <button {...attributes} {...listeners} className="cursor-grab text-[--color-text-3]">
        <GripVertical size={16} />
      </button>
      <img src={item.preview} alt="" className="h-12 w-12 rounded object-cover border border-[--color-border]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[--color-text]">{item.file.name}</p>
        <p className="text-xs text-[--color-text-3]">{fmtBytes(item.file.size)}</p>
      </div>
      <span className="text-xs text-[--color-text-3]">Hal {index + 1}</span>
      <button onClick={() => onRemove(id)} className="text-[--color-text-3] hover:text-[--color-danger]">
        <X size={16} />
      </button>
    </div>
  )
}

export default function ImageToPDF() {
  const [items, setItems] = useState([]) // [{id, file, preview}]
  useIncomingFile((f) => setItems(prev => [...prev, { id: crypto.randomUUID(), file: f, preview: URL.createObjectURL(f) }]))
  const [pageSize, setPageSize] = useState('fit')
  const [margin, setMargin] = useState(0) // pt
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleFiles = (files) => {
    const newItems = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
    }))
    setItems((prev) => [...prev, ...newItems])
    setResult(null)
    setError('')
  }

  const removeItem = (id) => setItems((prev) => prev.filter((it) => it.id !== id))

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over?.id) {
      setItems((prev) => {
        const oldIdx = prev.findIndex((i) => i.id === active.id)
        const newIdx = prev.findIndex((i) => i.id === over.id)
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  const convert = async () => {
    if (!items.length) return
    setProcessing(true)
    setError('')
    try {
      const doc = await PDFDocument.create()

      for (const { file } of items) {
        const buf = await readAsArrayBuffer(file)
        const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')

        let img
        if (isPng) {
          img = await doc.embedPng(buf)
        } else {
          // For JPG/WebP/others, convert to JPG via canvas first if needed
          if (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) {
            img = await doc.embedJpg(buf)
          } else {
            // Fallback render to JPG canvas
            const blobUrl = URL.createObjectURL(file)
            const htmlImg = await new Promise((res, rej) => {
              const i = new Image()
              i.onload = () => res(i)
              i.onerror = rej
              i.src = blobUrl
            })
            const canvas = document.createElement('canvas')
            canvas.width = htmlImg.naturalWidth
            canvas.height = htmlImg.naturalHeight
            canvas.getContext('2d').drawImage(htmlImg, 0, 0)
            const jpgData = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
            const jpgBuf = await readAsArrayBuffer(jpgData)
            img = await doc.embedJpg(jpgBuf)
            URL.revokeObjectURL(blobUrl)
          }
        }

        const { width: imgW, height: imgH } = img.scale(1)

        if (pageSize === 'fit') {
          const page = doc.addPage([imgW + margin * 2, imgH + margin * 2])
          page.drawImage(img, { x: margin, y: margin, width: imgW, height: imgH })
        } else {
          const [pw, ph] = DIMS[pageSize]
          const page = doc.addPage([pw, ph])
          const availW = pw - margin * 2
          const availH = ph - margin * 2
          const scale = Math.min(availW / imgW, availH / imgH)
          const dw = imgW * scale
          const dh = imgH * scale
          const x = margin + (availW - dw) / 2
          const y = margin + (availH - dh) / 2
          page.drawImage(img, { x, y, width: dw, height: dh })
        }
      }

      const bytes = await doc.save()
      setResult(new Blob([bytes], { type: 'application/pdf' }))
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <ToolShell
      title="Gambar → PDF"
      description="Gabung gambar (JPG, PNG, WebP) menjadi satu file PDF."
    >
      <DropZone
        accept="image/*,.jpg,.jpeg,.png,.webp"
        multiple
        onFiles={handleFiles}
        label="Pilih atau drop file gambar"
        hint="JPG, PNG, WebP — drag untuk mengatur urutan halaman"
      />
      {items.length > 0 && <FilePreview file={items[0]?.file} />}

      {items.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
                Ukuran Halaman
              </label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value)}
                className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm outline-none focus:border-[--color-brand]"
              >
                {Object.entries(PAGE_SIZES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
                Margin: {margin} pt
              </label>
              <input
                type="range"
                min="0"
                max="50"
                step="5"
                value={margin}
                onChange={(e) => setMargin(Number(e.target.value))}
                className="w-full mt-2"
              />
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <SortableItem key={item.id} id={item.id} item={item} index={i} onRemove={removeItem} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {error && <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger]">{error}</p>}

      {items.length > 0 && !result && (
        <button
          onClick={convert}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-colors"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Memproses…' : `Konversi ${items.length} Gambar ke PDF`}
        </button>
      )}

      {result && (
        <ResultCard
          fileName="images.pdf"
          blob={result}
          extraInfo={`${items.length} gambar → ${fmtBytes(result.size)}`}
          outputMimeType="application/pdf"
          sourceRoute="image-to-pdf"
          onReset={() => {
            setResult(null)
            setItems([])
          }}
        />
      )}
    </ToolShell>
  )
}
