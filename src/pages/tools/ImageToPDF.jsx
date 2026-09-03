import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import { Loader2, FileImage } from 'lucide-react'
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

export default function ImageToPDF() {
  const [file, setFile] = useState(null)
  useIncomingFile((f) => setFile(f))
  const [pageSize, setPageSize] = useState('fit')
  const [margin, setMargin] = useState(0) // pt
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const handleFiles = (files) => {
    if (!files || !files.length) return
    setFile(files[0])
    setResult(null)
    setError('')
  }

  const convert = async () => {
    if (!file) return
    setProcessing(true)
    setError('')
    try {
      const doc = await PDFDocument.create()
      const buf = await readAsArrayBuffer(file)
      const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')

      let img
      if (isPng) {
        img = await doc.embedPng(buf)
      } else if (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) {
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
        canvas.width = htmlImg.naturalWidth || htmlImg.width
        canvas.height = htmlImg.naturalHeight || htmlImg.height
        canvas.getContext('2d').drawImage(htmlImg, 0, 0)
        const jpgData = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
        const jpgBuf = await readAsArrayBuffer(jpgData)
        img = await doc.embedJpg(jpgBuf)
        URL.revokeObjectURL(blobUrl)
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

      const bytes = await doc.save()
      setResult(new Blob([bytes], { type: 'application/pdf' }))
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const outputName = file ? `${file.name.replace(/\.[^/.]+$/, '')}.pdf` : 'converted.pdf'

  return (
    <ToolShell
      title="Gambar → PDF"
      description="Konversi 1 file gambar (JPG, PNG, WebP) menjadi dokumen PDF murni."
    >
      <DropZone
        accept="image/*,.jpg,.jpeg,.png,.webp"
        multiple={false}
        onFiles={handleFiles}
        label="Pilih atau drop 1 file gambar"
        hint="JPG, PNG, WebP — maksimal 1 gambar per konversi"
      />
      {file && <FilePreview file={file} />}

      {file && (
        <div className="space-y-4">
          <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-(--color-text-3)">
                Ukuran Halaman
              </label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value)}
                className="w-full rounded border border-(--color-border) bg-(--color-surface) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-brand)"
              >
                {Object.entries(PAGE_SIZES).map(([k, v]) => (
                  <option key={k} value={k} className="bg-white text-gray-900 dark:bg-slate-800 dark:text-white">
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-(--color-text-3)">
                Margin: {margin} pt
              </label>
              <input
                type="range"
                min="0"
                max="50"
                step="5"
                value={margin}
                onChange={(e) => setMargin(Number(e.target.value))}
                className="w-full mt-2 accent-(--color-brand)"
              />
            </div>
          </div>
        </div>
      )}

      {error && <p className="rounded border border-(--color-danger-light) bg-(--color-danger-light) px-3 py-2 text-sm text-(--color-danger)">{error}</p>}

      {file && !result && (
        <button
          onClick={convert}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded bg-(--color-brand) px-4 py-2.5 text-sm font-medium text-white hover:bg-(--color-brand-hover) disabled:opacity-60 transition-colors cursor-pointer"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Memproses…' : 'Konversi Gambar ke PDF'}
        </button>
      )}

      {result && (
        <ResultCard
          fileName={outputName}
          blob={result}
          extraInfo={`Gambar dikonversi ke PDF → ${fmtBytes(result.size)}`}
          outputMimeType="application/pdf"
          sourceRoute="image-to-pdf"
          onReset={() => {
            setResult(null)
            setFile(null)
          }}
        />
      )}
    </ToolShell>
  )
}
