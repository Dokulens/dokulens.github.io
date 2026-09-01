import { useState, useRef, useCallback, useEffect } from 'react'
import { Eraser, Type, Download, Loader2, MousePointer, Undo2 } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ProgressBar from '../../components/ProgressBar'
import { createWorker } from 'tesseract.js'
import { inpaintWatermark } from '../../utils/watermarkRemover'

const FONT_FAMILIES = [
  { id: 'Arial', label: 'Arial' },
  { id: 'Times New Roman', label: 'Times New Roman' },
  { id: 'Courier New', label: 'Courier New' },
  { id: 'Georgia', label: 'Georgia' },
  { id: 'Verdana', label: 'Verdana' },
  { id: 'Impact', label: 'Impact' },
]

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72]

const FONT_COLORS = [
  '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00',
  '#ff00ff', '#00ffff', '#ffa500', '#808080', '#800000', '#008000',
  '#000080', '#808000', '#008080',
]

export default function ImageEditText() {
  const [sourceImage, setSourceImage] = useState(null)
  const [imageUrl, setImageUrl] = useState(null)
  const [ocrWords, setOcrWords] = useState([])
  const [selectedWord, setSelectedWord] = useState(null)
  const [newText, setNewText] = useState('')
  const [fontFamily, setFontFamily] = useState('Arial')
  const [fontSize, setFontSize] = useState(24)
  const [fontColor, setFontColor] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [status, setStatus] = useState('')
  const [resultUrl, setResultUrl] = useState(null)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [editHistory, setEditHistory] = useState([])
  const [hoveredWord, setHoveredWord] = useState(null)

  const previewRef = useRef(null)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)

  const handleFiles = useCallback((files) => {
    if (!files?.length) return
    const file = files[0]
    setImageUrl(URL.createObjectURL(file))
    setSourceImage(file)
    setOcrWords([])
    setSelectedWord(null)
    setNewText('')
    setResultUrl(null)
    setEditHistory([])
    setOcrProgress(0)
  }, [])

  const runOcr = useCallback(async () => {
    if (!imageUrl) return
    setIsProcessing(true)
    setStatus('Mengenali teks pada gambar...')
    setOcrProgress(0)

    try {
      const worker = await createWorker('eng+ind', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100))
          }
        },
      })

      const { data } = await worker.recognize(imageUrl)
      const words = data.lines.flatMap((line) =>
        line.words.map((w) => ({
          text: w.text,
          bbox: w.bbox,
          confidence: w.confidence,
        }))
      )
      setOcrWords(words)
      setStatus(`Ditemukan ${words.length} kata`)
      await worker.terminate()
    } catch (err) {
      setStatus(`Gagal: ${err.message}`)
    } finally {
      setIsProcessing(false)
      setOcrProgress(0)
    }
  }, [imageUrl])

  useEffect(() => {
    if (imageUrl) runOcr()
  }, [imageUrl, runOcr])

  const getDisplayScale = useCallback(() => {
    if (!previewRef.current || !imgRef.current) return 1
    const img = imgRef.current
    const displayW = img.clientWidth
    const displayH = img.clientHeight
    return displayW / img.naturalWidth
  }, [])

  const handleWordClick = useCallback((word) => {
    setSelectedWord(word)
    setNewText(word.text)
  }, [])

  const applyEdit = useCallback(async () => {
    if (!selectedWord || !imageUrl || !newText.trim()) return
    setIsProcessing(true)
    setStatus('Menghapus teks lama...')

    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = imageUrl
      })

      const w = img.naturalWidth
      const h = img.naturalHeight

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)

      const pad = Math.max(4, Math.round(selectedWord.bbox.width * 0.1))
      const x0 = Math.max(0, Math.round(selectedWord.bbox.x0 - pad))
      const y0 = Math.max(0, Math.round(selectedWord.bbox.y0 - pad))
      const x1 = Math.min(w, Math.round(selectedWord.bbox.x1 + pad))
      const y1 = Math.min(h, Math.round(selectedWord.bbox.y1 + pad))

      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = w
      maskCanvas.height = h
      const maskCtx = maskCanvas.getContext('2d')
      maskCtx.fillStyle = '#ff0000'
      maskCtx.fillRect(x0, y0, x1 - x0, y1 - y0)

      const imageData = ctx.getImageData(0, 0, w, h)
      const maskData = maskCtx.getImageData(0, 0, w, h).data
      inpaintWatermark(imageData, maskData, 6)
      ctx.putImageData(imageData, 0, 0)

      setStatus('Menulis teks baru...')

      const scale = Math.max(w, h) / 800
      const scaledFontSize = Math.round(fontSize * scale)
      const midX = (selectedWord.bbox.x0 + selectedWord.bbox.x1) / 2
      const midY = (selectedWord.bbox.y0 + selectedWord.bbox.y1) / 2

      ctx.save()
      ctx.globalAlpha = 1
      ctx.fillStyle = FONT_COLORS[fontColor]
      ctx.font = `${scaledFontSize}px ${fontFamily}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(newText.trim(), midX, midY)
      ctx.restore()

      const result = canvas.toDataURL('image/png')
      setResultUrl(result)

      setEditHistory((prev) => [
        ...prev,
        {
          word: selectedWord,
          newText: newText.trim(),
          fontFamily,
          fontSize,
          fontColor,
        },
      ])

      setSelectedWord(null)
      setNewText('')
      setStatus('Selesai!')
    } catch (err) {
      setStatus(`Gagal: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }, [selectedWord, imageUrl, newText, fontFamily, fontSize, fontColor])

  const handleUndo = useCallback(() => {
    if (editHistory.length === 0) return
    setEditHistory((prev) => prev.slice(0, -1))
    setResultUrl(null)
    setStatus('Undo — pilih teks lagi')
  }, [editHistory])

  const handleDownload = useCallback(() => {
    if (!resultUrl) return
    const a = document.createElement('a')
    a.href = resultUrl
    a.download = 'edited-image.png'
    a.click()
  }, [resultUrl])

  const displayScale = getDisplayScale()
  const previewSrc = resultUrl || imageUrl

  return (
    <ToolShell
      title="Edit Teks di Gambar"
      description="Deteksi teks otomatis (OCR), hapus dengan inpainting, ganti dengan teks baru — 100% di browser"
    >
      {!imageUrl ? (
        <DropZone
          accept="image/png,image/jpeg,image/webp"
          onFiles={handleFiles}
          label="Upload gambar yang ingin diedit teksnya"
          hint="JPG, PNG, WebP — teks akan dideteksi otomatis"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* Preview */}
          <div className="space-y-3">
            {isProcessing && ocrProgress > 0 && (
              <ProgressBar value={ocrProgress} label="OCR sedang memproses..." />
            )}
            {status && (
              <p className="text-xs text-[--color-text-3] text-center">{status}</p>
            )}

            <div
              ref={previewRef}
              className="relative rounded-lg border border-[--color-border] bg-[--color-surface] overflow-hidden inline-block max-w-full"
            >
              <img
                ref={imgRef}
                src={previewSrc}
                alt="Preview"
                className="block max-h-[500px] w-auto"
                onLoad={() => setOcrProgress(0)}
              />

              {/* OCR word boxes overlay */}
              {displayScale > 0 && ocrWords.map((word, i) => {
                const x = word.bbox.x0 * displayScale
                const y = word.bbox.y0 * displayScale
                const w = (word.bbox.x1 - word.bbox.x0) * displayScale
                const h = (word.bbox.y1 - word.bbox.y0) * displayScale
                const isSelected = selectedWord?.text === word.text && selectedWord?.bbox.x0 === word.bbox.x0
                const isHovered = hoveredWord === i

                return (
                  <div
                    key={`${word.text}-${i}`}
                    className={`absolute border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/20 ring-2 ring-blue-400'
                        : isHovered
                          ? 'border-yellow-400 bg-yellow-400/15'
                          : 'border-green-500/50 bg-green-500/10 hover:border-green-400 hover:bg-green-400/20'
                    }`}
                    style={{
                      left: `${x}px`,
                      top: `${y}px`,
                      width: `${w}px`,
                      height: `${h}px`,
                    }}
                    onClick={() => handleWordClick(word)}
                    onMouseEnter={() => setHoveredWord(i)}
                    onMouseLeave={() => setHoveredWord(null)}
                    title={`${word.text} (${Math.round(word.confidence)}%)`}
                  >
                    <span className="absolute -top-4 left-0 text-[9px] text-green-400 whitespace-nowrap pointer-events-none">
                      {word.text}
                    </span>
                  </div>
                )
              })}

              {/* Hidden canvas for processing */}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Action buttons */}
            {resultUrl && (
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-2 rounded border border-[--color-brand] bg-[--color-brand] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  <Download size={16} />
                  Download Hasil
                </button>
                <button
                  type="button"
                  onClick={handleUndo}
                  className="flex items-center gap-2 rounded border border-[--color-border] bg-[--color-surface] px-4 py-2 text-sm text-[--color-text-2] hover:bg-[--color-surface-3]"
                >
                  <Undo2 size={16} />
                  Undo
                </button>
              </div>
            )}

            {/* Upload new */}
            <div className="text-center">
              <DropZone
                accept="image/png,image/jpeg,image/webp"
                onFiles={handleFiles}
                label="Ganti gambar"
                hint="Upload gambar baru"
              />
            </div>
          </div>

          {/* Sidebar — Edit Controls */}
          <div className="space-y-4">
            {/* Selected word info */}
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <MousePointer size={14} />
                Pilih Teks
              </h3>
              {selectedWord ? (
                <div className="space-y-2">
                  <div className="rounded bg-[--color-surface-3] p-2 text-xs">
                    <span className="text-[--color-text-3]">Teks lama:</span>
                    <p className="font-mono text-[--color-text] mt-1 break-all">"{selectedWord.text}"</p>
                    <span className="text-[10px] text-[--color-text-3]">
                      Confidence: {Math.round(selectedWord.confidence)}%
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs text-[--color-text-3] mb-1">Teks baru:</label>
                    <input
                      type="text"
                      value={newText}
                      onChange={(e) => setNewText(e.target.value)}
                      className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm text-[--color-text] focus:border-[--color-brand] focus:outline-none"
                      placeholder="Ketik teks pengganti..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[--color-text-3] mb-1">Font:</label>
                    <select
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value)}
                      className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm text-[--color-text] focus:border-[--color-brand] focus:outline-none"
                    >
                      {FONT_FAMILIES.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-[--color-text-3] mb-1">Ukuran: {fontSize}px</label>
                    <input
                      type="range"
                      min={12}
                      max={72}
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      className="w-full accent-[--color-brand]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[--color-text-3] mb-1">Warna:</label>
                    <div className="flex flex-wrap gap-1.5">
                      {FONT_COLORS.map((c, i) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setFontColor(i)}
                          className={`w-6 h-6 rounded border-2 transition-all ${
                            fontColor === i
                              ? 'border-[--color-brand] ring-2 ring-[--color-brand] scale-110'
                              : 'border-[--color-border] hover:border-[--color-text-3]'
                          }`}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={applyEdit}
                    disabled={isProcessing || !newText.trim()}
                    className="w-full flex items-center justify-center gap-2 rounded border border-[--color-brand] bg-[--color-brand] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Memproses...
                      </>
                    ) : (
                      <>
                        <Eraser size={16} />
                        Hapus & Ganti Teks
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-[--color-text-3] text-center py-4">
                  Klik kotak hijau pada teks di gambar untuk mulai mengedit
                </p>
              )}
            </div>

            {/* Edit history */}
            {editHistory.length > 0 && (
              <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
                <h3 className="text-sm font-bold">Riwayat Edit</h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {editHistory.map((e, i) => (
                    <div key={i} className="text-xs rounded bg-[--color-surface-3] p-2">
                      <span className="text-[--color-text-3]">"{e.word.text}"</span>
                      <span className="mx-1">→</span>
                      <span className="font-semibold">"{e.newText}"</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Word count */}
            <div className="text-center text-xs text-[--color-text-3]">
              {ocrWords.length} kata terdeteksi — klik untuk edit
            </div>
          </div>
        </div>
      )}
    </ToolShell>
  )
}
