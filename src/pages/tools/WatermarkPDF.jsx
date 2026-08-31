import { useState } from 'react'
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib'
import { Loader2 } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'

const POSITIONS = [
  { id: 'center', label: 'Tengah' },
  { id: 'diagonal', label: 'Diagonal (Tengah)' },
  { id: 'top-right', label: 'Kanan Atas' },
  { id: 'bottom-right', label: 'Kanan Bawah' },
]

export default function WatermarkPDF() {
  const [file, setFile] = useState(null)
  const [text, setText] = useState('CONFIDENTIAL')
  const [fontSize, setFontSize] = useState(48)
  const [opacity, setOpacity] = useState(30) // %
  const [position, setPosition] = useState('diagonal')
  const [color, setColor] = useState('#ff0000')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const handleFile = ([f]) => {
    setFile(f)
    setResult(null)
    setError('')
  }

  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    return { r, g, b }
  }

  const applyWatermark = async () => {
    if (!file || !text.trim()) return
    setProcessing(true)
    setError('')
    try {
      const arrayBuf = await readAsArrayBuffer(file)
      const doc = await PDFDocument.load(arrayBuf, { ignoreEncryption: true })
      const font = await doc.embedFont(StandardFonts.HelveticaBold)
      const { r, g, b } = hexToRgb(color)
      const op = opacity / 100

      const pages = doc.getPages()
      for (const page of pages) {
        const { width, height } = page.getSize()
        const textWidth = font.widthOfTextAtSize(text, fontSize)
        const textHeight = font.heightAtSize(fontSize)

        if (position === 'diagonal') {
          page.drawText(text, {
            x: (width - textWidth) / 2,
            y: (height - textHeight) / 2,
            size: fontSize,
            font,
            color: rgb(r, g, b),
            opacity: op,
            rotate: degrees(45),
          })
        } else if (position === 'center') {
          page.drawText(text, {
            x: (width - textWidth) / 2,
            y: (height - textHeight) / 2,
            size: fontSize,
            font,
            color: rgb(r, g, b),
            opacity: op,
          })
        } else if (position === 'top-right') {
          page.drawText(text, {
            x: width - textWidth - 20,
            y: height - textHeight - 20,
            size: fontSize,
            font,
            color: rgb(r, g, b),
            opacity: op,
          })
        } else if (position === 'bottom-right') {
          page.drawText(text, {
            x: width - textWidth - 20,
            y: 20,
            size: fontSize,
            font,
            color: rgb(r, g, b),
            opacity: op,
          })
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

  const base = file ? stripExt(file.name) : 'document'

  return (
    <ToolShell
      title="Watermark PDF"
      description="Tambahkan teks watermark kustom ke semua halaman file PDF Anda."
    >
      <DropZone accept=".pdf,application/pdf" onFiles={handleFile} label="Pilih file PDF" />

      {file && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[--color-text] truncate">{file.name}</span>
            <span className="shrink-0 text-[--color-text-3] ml-2">{fmtBytes(file.size)}</span>
          </div>

          <div>
            <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
              Teks Watermark
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="CONFIDENTIAL / DRAFT / RAHASIA"
              className="w-full rounded border border-[--color-border] px-3 py-2 text-sm outline-none focus:border-[--color-brand]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
                Ukuran Teks: {fontSize} pt
              </label>
              <input
                type="range"
                min="16"
                max="96"
                step="4"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full mt-2"
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
                Transparansi: {opacity}%
              </label>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full mt-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
                Posisi
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm outline-none focus:border-[--color-brand]"
              >
                {POSITIONS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
                Warna Teks
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-14 cursor-pointer rounded border border-[--color-border]"
                />
                <span className="text-xs text-[--color-text-2] uppercase">{color}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger]">
          {error}
        </p>
      )}

      {file && !result && (
        <button
          onClick={applyWatermark}
          disabled={processing || !text.trim()}
          className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-colors"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Menambahkan Watermark…' : 'Terapkan Watermark'}
        </button>
      )}

      {result && (
        <ResultCard
          fileName={`${base}_watermarked.pdf`}
          blob={result}
          extraInfo={fmtBytes(result.size)}
          onReset={() => {
            setResult(null)
            setFile(null)
          }}
        />
      )}
    </ToolShell>
  )
}
