import { useState, useRef, useEffect, useCallback } from 'react'
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib'
import { Loader2, RotateCw, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import { pdfjsLib, renderPageToDataUrl } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'
import { BTN_TOGGLE_ACTIVE, BTN_TOGGLE_INACTIVE, BTN_CARD_ACTIVE, BTN_CARD_INACTIVE } from '../../utils/activeButtonStyles'

const COLORS = [
  '#ff0000', '#000000', '#ffffff', '#0000ff', '#00ff00',
  '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#808080',
]

export default function WatermarkPDF() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [totalPages, setTotalPages] = useState(0)
  const [pageImages, setPageImages] = useState([])
  const [currentPage, setCurrentPage] = useState(1)

  const [text, setText] = useState('CONFIDENTIAL')
  const [fontSize, setFontSize] = useState(48)
  const [opacity, setOpacity] = useState(30)
  const [color, setColor] = useState('#ff0000')
  const [isBold, setIsBold] = useState(true)
  const [rotation, setRotation] = useState(45)

  const [position, setPosition] = useState({ x: 50, y: 50 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef(null)

  const [applyMode, setApplyMode] = useState('all') // 'all' | 'custom'
  const [selectedPages, setSelectedPages] = useState(new Set())
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const canvasRef = useRef(null)
  const previewCanvasRef = useRef(null)
  const rafRef = useRef(null)

  // Load PDF
  useEffect(() => {
    if (!file) return
    let cancelled = false
    ;(async () => {
      try {
        const buf = await readAsArrayBuffer(file)
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
        if (cancelled) return
        setPdfDoc(doc)
        setTotalPages(doc.numPages)
        setSelectedPages(new Set(Array.from({ length: doc.numPages }, (_, i) => i + 1)))
        setCurrentPage(1)

        const imgs = []
        for (let i = 1; i <= doc.numPages; i++) {
          const { dataUrl } = await renderPageToDataUrl(doc, i, 1.2)
          imgs.push(dataUrl)
        }
        if (!cancelled) setPageImages(imgs)
      } catch (e) {
        if (!cancelled) setError(`Gagal load PDF: ${e.message}`)
      }
    })()
    return () => { cancelled = true }
  }, [file])

  // Draw preview with watermark
  const drawPreview = useCallback(() => {
    const canvas = previewCanvasRef.current
    if (!canvas || !pageImages[currentPage - 1]) return

    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      ctx.drawImage(img, 0, 0)

      if (text.trim()) {
        const REF = 800
        const scale = Math.max(canvas.width, canvas.height) / REF
        const scaledFont = Math.round(fontSize * scale)
        const fontName = isBold ? 'bold ' : ''

        ctx.save()
        ctx.globalAlpha = opacity / 100
        ctx.fillStyle = color
        ctx.font = `${fontName}${scaledFont}px Helvetica, Arial, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        const markX = (position.x / 100) * canvas.width
        const markY = (position.y / 100) * canvas.height

        ctx.translate(markX, markY)
        ctx.rotate((rotation * Math.PI) / 180)
        ctx.fillText(text, 0, 0)
        ctx.restore()
      }
    }
    img.src = pageImages[currentPage - 1]
  }, [pageImages, currentPage, text, fontSize, opacity, color, isBold, rotation, position])

  useEffect(() => {
    if (pageImages.length) drawPreview()
  }, [pageImages, currentPage, drawPreview])

  // Drag handlers
  const handleMouseDown = (e) => {
    if (!previewCanvasRef.current) return
    e.preventDefault()
    const canvas = previewCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    const mx = (e.clientX - rect.left) * sx
    const my = (e.clientY - rect.top) * sy

    const markX = (position.x / 100) * canvas.width
    const markY = (position.y / 100) * canvas.height

    dragStart.current = { offsetX: mx - markX, offsetY: my - markY }
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e) => {
      const canvas = previewCanvasRef.current
      if (!canvas || !dragStart.current) return
      const rect = canvas.getBoundingClientRect()
      const mx = (e.clientX - rect.left) * (canvas.width / rect.width)
      const my = (e.clientY - rect.top) * (canvas.height / rect.height)
      const newPos = {
        x: Math.max(2, Math.min(98, ((mx - dragStart.current.offsetX) / canvas.width) * 100)),
        y: Math.max(2, Math.min(98, ((my - dragStart.current.offsetY) / canvas.height) * 100)),
      }
      setPosition(newPos)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(drawPreview)
    }
    const onUp = () => {
      setIsDragging(false)
      dragStart.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, drawPreview])

  const togglePage = (p) => {
    setSelectedPages((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedPages.size === totalPages) {
      setSelectedPages(new Set())
    } else {
      setSelectedPages(new Set(Array.from({ length: totalPages }, (_, i) => i + 1)))
    }
  }

  // Apply watermark to PDF
  const applyWatermark = async () => {
    if (!file || !text.trim()) return
    setProcessing(true)
    setError('')
    try {
      const buf = await readAsArrayBuffer(file)
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true })
      const font = await doc.embedFont(StandardFonts.HelveticaBold)
      const { r, g, b } = hexToRgb(color)
      const op = opacity / 100

      const pages = doc.getPages()
      const targetPages = applyMode === 'all'
        ? pages
        : pages.filter((_, i) => selectedPages.has(i + 1))

      for (const page of targetPages) {
        const { width, height } = page.getSize()
        const textWidth = font.widthOfTextAtSize(text, fontSize)
        const textHeight = font.heightAtSize(fontSize)

        const markX = (position.x / 100) * width - textWidth / 2
        const markY = height - (position.y / 100) * height

        page.drawText(text, {
          x: markX,
          y: markY,
          size: fontSize,
          font,
          color: rgb(r, g, b),
          opacity: op,
          rotate: degrees(rotation),
        })
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
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    return { r, g, b }
  }

  return (
    <ToolShell
      title="Watermark PDF"
      description="Tambahkan teks watermark ke PDF. Drag untuk posisi, pilih per halaman. 100% Client-Side."
    >
      <DropZone accept=".pdf,application/pdf" onFiles={([f]) => { setFile(f); setResult(null); setError(''); setPageImages([]); setPdfDoc(null) }} label="Pilih file PDF" />

      {file && !result && (
        <div className="space-y-4">
          {/* Preview */}
          {pageImages.length > 0 && (
            <div className="space-y-2">
              <div className="relative rounded-lg border border-dashed border-[--color-border] overflow-hidden bg-[--color-surface-2]">
                <canvas
                  ref={previewCanvasRef}
                  className="block max-h-[500px] w-full object-contain cursor-crosshair"
                  onMouseDown={handleMouseDown}
                />
                {isDragging && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-white text-[10px] font-mono animate-pulse pointer-events-none">
                    Menyeret watermark…
                  </div>
                )}
              </div>

              {/* Page nav */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="rounded p-1 hover:bg-[--color-surface-3] disabled:opacity-30"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-xs text-[--color-text-2] font-mono">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="rounded p-1 hover:bg-[--color-surface-3] disabled:opacity-30"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4">
            {/* Text */}
            <div>
              <label className="block mb-1 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                Teks Watermark
              </label>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="CONFIDENTIAL / DRAFT / RAHASIA"
                className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm outline-none focus:border-[--color-brand]"
              />
            </div>

            {/* Size + Opacity */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                  Ukuran: {fontSize}pt
                </label>
                <input type="range" min="12" max="96" step="2" value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))} className="w-full accent-[--color-brand]" />
              </div>
              <div>
                <label className="block mb-1 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                  Transparansi: {opacity}%
                </label>
                <input type="range" min="5" max="100" step="5" value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-[--color-brand]" />
              </div>
            </div>

            {/* Rotation + Bold + Color */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block mb-1 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                  Rotasi: {rotation}°
                </label>
                <input type="range" min="0" max="360" step="5" value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))} className="w-full accent-[--color-brand]" />
              </div>
              <div>
                <label className="block mb-1 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                  Warna
                </label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-5 h-5 rounded-sm border-2 transition-all ${
                        color === c ? 'ring-2 ring-[--color-brand] ring-offset-1 ring-offset-[--color-surface] scale-110' : ''
                      }`}
                      style={{ backgroundColor: c, borderColor: c === '#ffffff' ? '#666' : c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => setIsBold(!isBold)}
                  className={`w-full rounded border px-3 py-2 text-sm font-bold transition-all ${isBold ? BTN_TOGGLE_ACTIVE : BTN_TOGGLE_INACTIVE}`}
                >
                  Bold
                </button>
              </div>
            </div>

            {/* Position indicator */}
            <div className="flex items-center gap-3 text-xs text-[--color-text-3]">
              <span>Posisi: <strong className="text-[--color-text-2]">{Math.round(position.x)}%, {Math.round(position.y)}%</strong></span>
              <span className="opacity-50">— drag pada preview untuk geser</span>
            </div>

            {/* Apply mode */}
            <div>
              <label className="block mb-2 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                Terapkan ke
              </label>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setApplyMode('all')}
                  className={`flex-1 rounded border px-3 py-2 text-xs font-bold transition-all ${applyMode === 'all' ? BTN_CARD_ACTIVE : BTN_CARD_INACTIVE}`}
                >
                  Semua Halaman ({totalPages})
                </button>
                <button
                  onClick={() => setApplyMode('custom')}
                  className={`flex-1 rounded border px-3 py-2 text-xs font-bold transition-all ${applyMode === 'custom' ? BTN_CARD_ACTIVE : BTN_CARD_INACTIVE}`}
                >
                  Pilih Halaman
                </button>
              </div>

              {applyMode === 'custom' && (
                <div className="space-y-2">
                  <button
                    onClick={toggleAll}
                    className="text-[10px] text-[--color-brand] hover:underline font-semibold"
                  >
                    {selectedPages.size === totalPages ? 'Batal Pilih Semua' : 'Pilih Semua'}
                  </button>
                  <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                    {pageImages.map((img, i) => {
                      const p = i + 1
                      const isSelected = selectedPages.has(p)
                      return (
                        <button
                          key={p}
                          onClick={() => togglePage(p)}
                          className={`relative rounded overflow-hidden border-2 transition-all aspect-[3/4] ${
                            isSelected
                              ? 'border-[--color-brand] ring-1 ring-[--color-brand]'
                              : 'border-[--color-border] opacity-50 hover:opacity-80'
                          }`}
                          onClickCapture={() => togglePage(p)}
                        >
                          <img src={img} alt={`Hal ${p}`} className="w-full h-full object-cover" />
                          {isSelected && (
                            <div className="absolute top-0.5 right-0.5 bg-[--color-brand] rounded-full p-0.5">
                              <Check size={8} className="text-white" />
                            </div>
                          )}
                          <span className="absolute bottom-0 left-0 right-0 text-center text-[8px] bg-black/50 text-white py-px">{p}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-[--color-text-3]">
                    {selectedPages.size} dari {totalPages} halaman dipilih
                  </p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger]">
              {error}
            </p>
          )}

          <button
            onClick={applyWatermark}
            disabled={processing || !text.trim() || (applyMode === 'custom' && selectedPages.size === 0)}
            className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-colors"
          >
            {processing && <Loader2 size={16} className="animate-spin" />}
            {processing ? 'Menambahkan Watermark…' : `Terapkan ke ${applyMode === 'all' ? 'Semua Halaman' : `${selectedPages.size} Halaman`}`}
          </button>
        </div>
      )}

      {result && (
        <ResultCard
          fileName={`${base}_watermarked.pdf`}
          blob={result}
          extraInfo={fmtBytes(result.size)}
          outputMimeType="application/pdf"
          sourceRoute="watermark-pdf"
          onReset={() => {
            setResult(null)
            setFile(null)
            setPageImages([])
            setPdfDoc(null)
          }}
        />
      )}
    </ToolShell>
  )
}
