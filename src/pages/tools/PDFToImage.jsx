import { useState } from 'react'
import JSZip from 'jszip'
import { Loader2 } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import ProgressBar from '../../components/ProgressBar'
import { pdfjsLib, renderPageToBlob } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

const FORMATS = [
  { label: 'PNG (Lossless, Kualitas Terbaik)', ext: 'png', mime: 'image/png' },
  { label: 'JPG (Ukuran Lebih Kecil)', ext: 'jpg', mime: 'image/jpeg' },
]

export default function PDFToImage() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [format, setFormat] = useState('png')
  const [dpi, setDpi] = useState(150) // 150 = ~2x scale
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [resultName, setResultName] = useState('')
  const [error, setError] = useState('')

  const handleFile = ([f]) => {
    setFile(f)
    setResult(null)
    setError('')
    setProgress(0)
  }

  const convert = async () => {
    if (!file) return
    setProcessing(true)
    setError('')
    setProgress(0)
    try {
      const base = stripExt(file.name)
      const scale = dpi / 72
      const selectedFmt = FORMATS.find((f) => f.ext === format)
      const arrayBuf = await readAsArrayBuffer(file)

      setProgressText('Membaca file PDF…')
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) })
      const pdfDoc = await loadingTask.promise
      const totalPages = pdfDoc.numPages

      if (totalPages === 1) {
        // Single page -> direct download image
        setProgressText('Merender halaman…')
        setProgress(50)
        const blob = await renderPageToBlob(pdfDoc, 1, scale, selectedFmt.mime, 0.92)
        setProgress(100)
        setResult(blob)
        setResultName(`${base}_hal1.${format}`)
      } else {
        // Multiple pages -> zip
        const zip = new JSZip()
        for (let i = 1; i <= totalPages; i++) {
          setProgressText(`Merender halaman ${i} dari ${totalPages}…`)
          setProgress(Math.round((i / totalPages) * 90))
          const blob = await renderPageToBlob(pdfDoc, i, scale, selectedFmt.mime, 0.92)
          zip.file(`${base}_hal${String(i).padStart(2, '0')}.${format}`, blob)
        }
        setProgressText('Membuat arsip ZIP…')
        setProgress(95)
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        setProgress(100)
        setResult(zipBlob)
        setResultName(`${base}_images.zip`)
      }
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <ToolShell
      title="PDF → Gambar"
      description="Ekspor semua halaman PDF sebagai file gambar PNG atau JPG."
    >
      <DropZone
        accept=".pdf,application/pdf"
        onFiles={handleFile}
        label="Pilih file PDF"
      />
      {file && <FilePreview file={file} />}

      {file && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[--color-text] truncate">{file.name}</span>
            <span className="shrink-0 text-[--color-text-3] ml-2">{fmtBytes(file.size)}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
                Format Gambar
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm outline-none focus:border-[--color-brand]"
              >
                {FORMATS.map((f) => (
                  <option key={f.ext} value={f.ext}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
                Resolusi: {dpi} DPI
              </label>
              <select
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
                className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm outline-none focus:border-[--color-brand]"
              >
                <option value={72}>72 DPI (Standard Web)</option>
                <option value={150}>150 DPI (Sedang / Seimbang)</option>
                <option value={300}>300 DPI (Kualitas Tinggi / Cetak)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {processing && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
          <ProgressBar value={progress} label={progressText} />
        </div>
      )}

      {error && (
        <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger]">
          {error}
        </p>
      )}

      {file && !result && (
        <button
          onClick={convert}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-colors"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Mengekstrak…' : 'Ekspor Halaman ke Gambar'}
        </button>
      )}

      {result && (
        <ResultCard
          fileName={resultName}
          blob={result}
          extraInfo={fmtBytes(result.size)}
          outputMimeType={format === 'jpg' ? 'image/jpeg' : 'image/png'}
          sourceRoute="pdf-to-image"
          onReset={() => {
            setResult(null)
            setFile(null)
            setProgress(0)
          }}
        />
      )}
    </ToolShell>
  )
}
