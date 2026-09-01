import { useState, useCallback } from 'react'
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

function SortableFile({ id, file, index, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded border border-[--color-border] bg-[--color-surface] px-3 py-2"
    >
      <button {...attributes} {...listeners} className="cursor-grab text-[--color-text-3]">
        <GripVertical size={16} />
      </button>
      <span className="w-5 shrink-0 text-center text-xs text-[--color-text-3]">{index + 1}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-[--color-text]">{file.name}</span>
      <span className="shrink-0 text-xs text-[--color-text-3]">{fmtBytes(file.size)}</span>
      <button onClick={() => onRemove(id)} className="shrink-0 text-[--color-text-3] hover:text-[--color-danger]">
        <X size={16} />
      </button>
    </div>
  )
}

export default function MergePDF() {
  const [files, setFiles] = useState([]) // [{id, file}]
  useIncomingFile((f) => setFiles(prev => [...prev, { id: crypto.randomUUID(), file: f }]))
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const addFiles = useCallback((newFiles) => {
    const items = newFiles.map((f) => ({ id: crypto.randomUUID(), file: f }))
    setFiles((prev) => [...prev, ...items])
    setResult(null)
    setError('')
  }, [])

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id))

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over?.id) {
      setFiles((prev) => {
        const oldIdx = prev.findIndex((f) => f.id === active.id)
        const newIdx = prev.findIndex((f) => f.id === over.id)
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  const merge = async () => {
    if (files.length < 2) { setError('Pilih minimal 2 file PDF.'); return }
    setProcessing(true)
    setError('')
    try {
      const merged = await PDFDocument.create()
      for (const { file } of files) {
        const buf = await readAsArrayBuffer(file)
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true })
        const pages = await merged.copyPages(doc, doc.getPageIndices())
        pages.forEach((p) => merged.addPage(p))
      }
      const bytes = await merged.save()
      setResult(new Blob([bytes], { type: 'application/pdf' }))
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <ToolShell
      title="Merge PDF"
      description="Gabung beberapa file PDF menjadi satu. Drag untuk mengatur urutan."
    >
      <DropZone
        accept=".pdf,application/pdf"
        multiple
        onFiles={addFiles}
        label="Pilih atau drop file PDF"
        hint="Bisa pilih beberapa file sekaligus"
      />
      {files.length > 0 && <FilePreview file={files[0]?.file} />}

      {files.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={files.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {files.map((item, i) => (
                <SortableFile key={item.id} id={item.id} file={item.file} index={i} onRemove={removeFile} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {error && <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger]">{error}</p>}

      {files.length >= 2 && !result && (
        <button
          onClick={merge}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-colors"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Memproses…' : `Gabungkan ${files.length} File`}
        </button>
      )}

      {result && (
        <ResultCard
          fileName="merged.pdf"
          blob={result}
          extraInfo={`${files.length} file digabung → ${fmtBytes(result.size)}`}
          outputMimeType="application/pdf"
          sourceRoute="merge-pdf"
          onReset={() => { setResult(null); setFiles([]) }}
        />
      )}
    </ToolShell>
  )
}
