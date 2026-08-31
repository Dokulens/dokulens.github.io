import { useState, useRef, useEffect } from 'react'
import {
  Sparkles, Wand2, Paintbrush, Trash2, Download,
  Loader2, Check, Eye, Sliders, RefreshCw, ZoomIn, ZoomOut,
  Maximize2, X, ShieldAlert, Cpu
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import ProgressBar from '../../components/ProgressBar'
import {
  reverseAlphaBlend,
  inpaintWatermark,
  detectGeminiWatermark
} from '../../utils/watermarkRemover'
import { fmtBytes, stripExt } from '../../utils/helpers'

export default function WatermarkRemover() {
  const [file, setFile] = useState(null)
  const [imageSrc, setImageSrc] = useState(null)
  const [origDims, setOrigDims] = useState({ w: 0, h: 0 })

  // Removal Mode: 'alpha' (Reverse Alpha Lossless) | 'inpaint' (Fast-Marching Telea)
  const [removalMode, setRemovalMode] = useState('inpaint')
  const [brushSize, setBrushSize] = useState(24)
  const [inpaintRadius, setInpaintRadius] = useState(6)
  const [alphaStrength, setAlphaStrength] = useState(1.0)
  const [hasMask, setHasMask] = useState(false)

  // Gemini detection
  const [detectedBox, setDetectedBox] = useState(null)

  // Pop-up Zoomable Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)

  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [resultBlob, setResultBlob] = useState(null)
  const [error, setError] = useState('')

  const imgRef = useRef(null)
  const maskCanvasRef = useRef(null)
  const modalCanvasRef = useRef(null)
  const isPaintingRef = useRef(false)

  const handleFile = ([f]) => {
    setFile(f)
    setResultBlob(null)
    setError('')
    setHasMask(false)

    const url = URL.createObjectURL(f)
    setImageSrc(url)

    const img = new Image()
    img.onload = () => {
      setOrigDims({ w: img.naturalWidth, h: img.naturalHeight })
      const det = detectGeminiWatermark(img.naturalWidth, img.naturalHeight)
      setDetectedBox(det)
      initMaskCanvas(img.naturalWidth, img.naturalHeight)
    }
    img.src = url
  }

  const initMaskCanvas = (w, h) => {
    if (!maskCanvasRef.current) return
    const canvas = maskCanvasRef.current
    canvas.width = w || origDims.w
    canvas.height = h || origDims.h
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const autoSelectGeminiWatermark = () => {
    if (!detectedBox || !maskCanvasRef.current) return
    const canvas = maskCanvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)'
    ctx.fillRect(detectedBox.x, detectedBox.y, detectedBox.width, detectedBox.height)
    setHasMask(true)
    setRemovalMode('alpha') // Gemini watermarks use reverse alpha
  }

  // Brush drawing in pop-up modal
  const startModalPaint = (e) => {
    isPaintingRef.current = true
    paintModal(e)
  }

  const paintModal = (e) => {
    if (!isPaintingRef.current || !modalCanvasRef.current) return
    const canvas = modalCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)'
    ctx.beginPath()
    ctx.arc(x, y, (brushSize * scaleX) / 2, 0, Math.PI * 2)
    ctx.fill()
    setHasMask(true)
  }

  const stopModalPaint = () => {
    isPaintingRef.current = false
  }

  const clearMask = () => {
    initMaskCanvas(origDims.w, origDims.h)
    if (modalCanvasRef.current) {
      const ctx = modalCanvasRef.current.getContext('2d')
      ctx.clearRect(0, 0, modalCanvasRef.current.width, modalCanvasRef.current.height)
    }
    setHasMask(false)
  }

  const saveModalMask = () => {
    if (modalCanvasRef.current && maskCanvasRef.current) {
      const ctx = maskCanvasRef.current.getContext('2d')
      ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height)
      ctx.drawImage(modalCanvasRef.current, 0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height)
    }
    setIsModalOpen(false)
  }

  // Sync canvas when modal opens
  useEffect(() => {
    if (isModalOpen && modalCanvasRef.current && maskCanvasRef.current) {
      const modalCanvas = modalCanvasRef.current
      modalCanvas.width = origDims.w
      modalCanvas.height = origDims.h
      const ctx = modalCanvas.getContext('2d')
      ctx.drawImage(maskCanvasRef.current, 0, 0)
    }
  }, [isModalOpen])

  const processWatermarkRemoval = async () => {
    if (!imageSrc || !hasMask) return
    setProcessing(true)
    setError('')
    setProgress(20)

    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((res, rej) => {
        img.onload = res
        img.onerror = rej
        img.src = imageSrc
      })

      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const maskCtx = maskCanvasRef.current.getContext('2d')
      const maskImgData = maskCtx.getImageData(0, 0, canvas.width, canvas.height)

      setProgress(50)

      if (removalMode === 'alpha' && detectedBox) {
        // Reverse Alpha Blending Mode
        reverseAlphaBlend(imgData, maskImgData.data, {
          x: detectedBox.x,
          y: detectedBox.y,
          width: detectedBox.width,
          height: detectedBox.height,
          strength: alphaStrength,
        })
      } else {
        // Fast Marching Inpainting Mode (Arbitrary Watermarks)
        inpaintWatermark(imgData, maskImgData.data, inpaintRadius)
      }

      setProgress(85)
      ctx.putImageData(imgData, 0, 0)

      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
      setProgress(100)
      setResultBlob(blob)
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const base = file ? stripExt(file.name) : 'image'

  return (
    <ToolShell
      title="Hapus Watermark (Watermark Remover)"
      description="Hapus logo, cap air, tanggal, dan watermark AI (Gemini/Imagen/Midjourney) dari foto langsung di browser dengan algoritma Reverse Alpha Blending & Fast-Marching Inpainting."
    >
      <DropZone
        accept="image/*,.jpg,.jpeg,.png,.webp"
        onFiles={handleFile}
        label="Pilih gambar untuk dihapus watermark-nya"
        hint="JPG, PNG, WebP — hapus logo, cap air & watermark AI"
      />

      {imageSrc && (
        <div className="space-y-4 animate-fade-in">
          {/* Quick Gemini Auto-Detect Banner */}
          {detectedBox && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[--color-brand] bg-[--color-brand-light] p-3 text-xs animate-fade-in">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="shrink-0 text-[--color-brand]" />
                <span className="text-[--color-brand-text]">
                  <strong>Watermark AI Terdeteksi:</strong> Ditemukan posisi standar cap air AI ({detectedBox.width}×{detectedBox.height} px) di sudut kanan bawah.
                </span>
              </div>
              <button
                onClick={autoSelectGeminiWatermark}
                className="shrink-0 rounded bg-[--color-brand] px-3 py-1 font-bold text-white hover:bg-[--color-brand-hover] transition-colors"
              >
                Pilih Otomatis (Gemini AI)
              </button>
            </div>
          )}

          {/* Controls Bar */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4">
            {/* Algorithm Selection Mode */}
            <div>
              <label className="block mb-2 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                Metode Penghapusan Watermark
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setRemovalMode('inpaint')}
                  className={[
                    'flex flex-col items-start rounded border p-3 text-left transition-all',
                    removalMode === 'inpaint'
                      ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand-text] font-bold shadow-xs'
                      : 'border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3]',
                  ].join(' ')}
                >
                  <span className="text-xs font-bold">Fast-Marching Inpainting (Rekomendasi)</span>
                  <span className="text-[11px] font-normal opacity-80 mt-0.5">
                    Cocok untuk logo padat, cap teks, tanggal kamera, dan watermark bebas.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRemovalMode('alpha')}
                  className={[
                    'flex flex-col items-start rounded border p-3 text-left transition-all',
                    removalMode === 'alpha'
                      ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand-text] font-bold shadow-xs'
                      : 'border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3]',
                  ].join(' ')}
                >
                  <span className="text-xs font-bold">Reverse Alpha Blending (Lossless)</span>
                  <span className="text-[11px] font-normal opacity-80 mt-0.5">
                    Pemulihan warna matematis murni untuk watermark semi-transparan / Gemini AI.
                  </span>
                </button>
              </div>
            </div>

            {/* Masking controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[--color-border] pt-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-1.5 rounded border border-[--color-brand] bg-[--color-brand-light] px-3 py-1.5 font-bold text-[--color-brand] hover:bg-[--color-brand] hover:text-white transition-colors"
                >
                  <Maximize2 size={13} />
                  Buka Kanvas Seleksi (Pop-up & Zoom)
                </button>
                {hasMask && (
                  <span className="rounded bg-red-500/10 px-2 py-1 text-xs font-bold text-red-600 dark:text-red-400">
                    ✓ Area Ditandai
                  </span>
                )}
              </div>

              {hasMask && (
                <button
                  onClick={clearMask}
                  className="flex items-center gap-1 text-xs text-[--color-danger] hover:underline"
                >
                  <Trash2 size={13} /> Hapus Tanda Merah
                </button>
              )}
            </div>
          </div>

          {/* Interactive Document Preview */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-[--color-text-3]">
                Pratinjau Gambar & Masking
              </span>
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-1 text-[--color-brand] hover:underline font-semibold"
              >
                <Paintbrush size={12} /> {hasMask ? 'Ubah Seleksi' : 'Tandai Watermark'}
              </button>
            </div>

            <div className="relative flex justify-center rounded border border-[--color-border] bg-[--color-surface-2] p-2 overflow-hidden">
              <div className="relative inline-block select-none">
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Original"
                  className="block max-h-[420px] w-auto pointer-events-none"
                />
                <canvas
                  ref={maskCanvasRef}
                  className="absolute inset-0 block h-full w-full pointer-events-none opacity-80"
                />
              </div>
            </div>
          </div>

          {processing && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2 animate-fade-in">
              <ProgressBar value={progress} label="Merekontruksi piksel dan menghapus watermark…" />
            </div>
          )}

          {error && (
            <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger] animate-fade-in">
              {error}
            </p>
          )}

          {/* Action button */}
          {!resultBlob && (
            <button
              onClick={processWatermarkRemoval}
              disabled={processing || !hasMask}
              className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-all active:scale-[0.99]"
            >
              {processing && <Loader2 size={16} className="animate-spin" />}
              {processing
                ? 'Menghapus Watermark…'
                : hasMask
                ? 'Hapus Watermark dari Gambar'
                : 'Tandai Area Watermark untuk Memulai'}
            </button>
          )}

          {/* Result Card */}
          {resultBlob && (
            <ResultCard
              fileName={`${base}_clean.png`}
              blob={resultBlob}
              extraInfo={`Watermark berhasil dihapus — ${fmtBytes(resultBlob.size)}`}
              onReset={() => {
                setResultBlob(null)
                setHasMask(false)
                clearMask()
              }}
            />
          )}

          {/* Pop-up Fullscreen Masking & Zoom Modal */}
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in">
              <div className="flex h-[92vh] w-[95vw] max-w-6xl flex-col rounded-xl border border-[--color-border] bg-[--color-surface] shadow-2xl overflow-hidden">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-[--color-border] px-5 py-3 bg-[--color-surface]">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded bg-[--color-brand-light] text-[--color-brand]">
                      <Paintbrush size={16} />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-[--color-text]">
                        Kanvas Seleksi Watermark
                      </h3>
                      <p className="text-[11px] text-[--color-text-3]">
                        Warnai area merah persis di atas logo/teks watermark yang ingin dihapus
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={saveModalMask}
                      className="flex items-center gap-1.5 rounded bg-[--color-brand] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[--color-brand-hover] transition-colors"
                    >
                      <Check size={14} /> Selesai & Terapkan
                    </button>
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="rounded p-1.5 text-[--color-text-3] hover:bg-[--color-surface-3] hover:text-[--color-text]"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Modal Toolbar: Zoom & Brush Controls */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[--color-border] bg-[--color-surface-2] px-5 py-2 text-xs">
                  {/* Zoom Controls */}
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[--color-text-3]">Zoom:</span>
                    <button
                      onClick={() => setZoomLevel((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                      className="flex h-7 w-7 items-center justify-center rounded border border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3]"
                      title="Zoom Out"
                    >
                      <ZoomOut size={14} />
                    </button>
                    <span className="w-12 text-center font-mono font-bold text-[--color-text]">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <button
                      onClick={() => setZoomLevel((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                      className="flex h-7 w-7 items-center justify-center rounded border border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3]"
                      title="Zoom In"
                    >
                      <ZoomIn size={14} />
                    </button>
                    <button
                      onClick={() => setZoomLevel(1)}
                      className="text-xs text-[--color-brand] hover:underline ml-1"
                    >
                      Reset (100%)
                    </button>
                  </div>

                  {/* Brush Size Controls */}
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-[--color-text-3]">Ukuran Kuas:</span>
                    <input
                      type="range"
                      min="6"
                      max="80"
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-28"
                    />
                    <span className="w-8 font-mono text-xs text-[--color-text]">{brushSize}px</span>
                  </div>

                  {/* Clear button */}
                  <div>
                    <button
                      onClick={clearMask}
                      className="flex items-center gap-1 text-xs text-[--color-danger] hover:underline"
                    >
                      <Trash2 size={13} /> Bersihkan Tanda
                    </button>
                  </div>
                </div>

                {/* Modal Interactive Canvas Scrollable Body */}
                <div className="relative flex-1 overflow-auto bg-neutral-900 p-8 flex items-center justify-center cursor-crosshair select-none">
                  <div
                    className="relative inline-block shadow-2xl transition-transform duration-100 origin-center"
                    style={{ transform: `scale(${zoomLevel})` }}
                  >
                    <img
                      src={imageSrc}
                      alt="Mask Target"
                      className="block max-h-[70vh] w-auto max-w-[80vw] object-contain pointer-events-none select-none"
                    />
                    <canvas
                      ref={modalCanvasRef}
                      onMouseDown={startModalPaint}
                      onMouseMove={paintModal}
                      onMouseUp={stopModalPaint}
                      onMouseLeave={stopModalPaint}
                      className="absolute inset-0 block h-full w-full pointer-events-auto opacity-75"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  )
}
