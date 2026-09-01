import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import { Loader2 } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import ProgressBar from '../../components/ProgressBar'
import { pdfjsLib, renderPageToDataUrl } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

const COMPRESSION_LEVELS = [
  { label: 'Rendah (Kualitas Tinggi)', scale: 1.5, quality: 0.85, desc: 'Pengurangan ukuran ~30-50%, kualitas visual tetap sangat baik' },
  { label: 'Sedang (Rekomendasi)', scale: 1.2, quality: 0.7, desc: 'Pengurangan ukuran ~50-70%, seimbang kualitas dan ukuran' },
  { label: 'Tinggi (Ukuran Terkecil)', scale: 0.9, quality: 0.5, desc: 'Pengurangan ukuran ~70-90%, cocok untuk dokumen teks/arsip' },
]

export default function CompressPDF() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [levelIdx, setLevelIdx] = useState(1)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const handleFile = ([f]) => {
    setFile(f)
    setResult(null)
    setError('')
    setProgress(0)
  }

  const compress = async () => {
    if (!file) return
    setProcessing(true)
    setError('')
    setProgress(0)
    try {
      const { scale, quality } = COMPRESSION_LEVELS[levelIdx]
      const arrayBuf = await readAsArrayBuffer(file)

      // 1. Load via pdfjs to render pages
      setProgressText('Membaca struktur PDF…')
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) })
      const pdfDoc = await loadingTask.promise
      const totalPages = pdfDoc.numPages

      // 2. Create new output PDF with pdf-lib
      const outDoc = await PDFDocument.create()

      for (let i = 1; i <= totalPages; i++) {
        setProgressText(`Mengompresi halaman ${i} dari ${totalPages}…`)
        setProgress(Math.round((i / totalPages) * 90))

        const { dataUrl, width, height } = await renderPageToDataUrl(pdfDoc, i, scale)
        const jpgBytes = await fetch(dataUrl).then((r) => r.arrayBuffer())
        const jpgImage = await outDoc.embedJpg(jpgBytes)

        // Add page matching original aspect ratio
        const page = outDoc.addPage([width / scale, height / scale])
        page.drawImage(jpgImage, {
          x: 0,
          y: 0,
          width: width / scale,
          height: height / scale,
        })
      }

      setProgressText('Menyimpan file hasil…')
      setProgress(95)
      const outBytes = await outDoc.save()
      const blob = new Blob([outBytes], { type: 'application/pdf' })
      setProgress(100)
      setResult(blob)
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const base = file ? stripExt(file.name) : 'document'
  const savedPct = result && file ? Math.round(((file.size - result.size) / file.size) * 100) : 0

  return (
    <ToolShell
      title="Compress PDF"
      description="Kurangi ukuran file PDF dengan kompresi visual client-side. Cocok untuk upload yang memiliki batas ukuran."
    >
      <DropZone
        accept=".pdf,application/pdf"
        onFiles={handleFile}
        label="Pilih file PDF untuk dikompresi"
      />
      {file && <FilePreview file={file} />}

      {file && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[--color-text] truncate">{file.name}</span>
            <span className="shrink-0 text-[--color-text-3] ml-2">{fmtBytes(file.size)}</span>
          </div>

          <div>
            <label className="block mb-2 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
              Tingkat Kompresi
            </label>
            <div className="space-y-2">
              {COMPRESSION_LEVELS.map((lvl, idx) => (
                <label
                  key={lvl.label}
                  className={[
                    'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                    levelIdx === idx
                      ? 'border-[--color-brand] bg-[--color-brand-light]'
                      : 'border-[--color-border] bg-[--color-surface] hover:border-[--color-border-strong]',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="compression"
                    checked={levelIdx === idx}
                    onChange={() => setLevelIdx(idx)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-[--color-text]">{lvl.label}</p>
                    <p className="text-xs text-[--color-text-2] mt-0.5">{lvl.desc}</p>
                  </div>
                </label>
              ))}
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
          onClick={compress}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-colors"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Mengompresi…' : 'Kompresi PDF'}
        </button>
      )}

      {result && (
        <ResultCard
          fileName={`${base}_compressed.pdf`}
          blob={result}
          extraInfo={`${fmtBytes(file.size)} → ${fmtBytes(result.size)} (${savedPct > 0 ? `hemat ${savedPct}%` : 'ukuran berubah'})`}
          outputMimeType="application/pdf"
          sourceRoute="compress-pdf"
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
