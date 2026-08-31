import { useState, useRef, useEffect } from 'react'
import {
  Loader2, Wand2, Paintbrush, ShieldCheck, Eraser,
  RotateCcw, Download, Eye, Layers, Sparkles
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ProgressBar from '../../components/ProgressBar'
import {
  calculateEnergyMap, findVerticalSeam, removeVerticalSeam,
  transposeImageData, transposeMask
} from '../../utils/seamCarving'
import { fmtBytes, stripExt } from '../../utils/helpers'

export default function ImageCarver() {
  const [file, setFile] = useState(null)
  const [origImgData, setOrigImgData] = useState(null)
  const [currentImgData, setCurrentImgData] = useState(null)
  const [targetWidth, setTargetWidth] = useState(0)
  const [targetHeight, setTargetHeight] = useState(0)
  const [brushMode, setBrushMode] = useState('remove') // 'remove' | 'protect' | 'eraser'
  const [brushSize, setBrushSize] = useState(20)
  const [showSeams, setShowSeams] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [resultBlob, setResultBlob] = useState(null)
  const [error, setError] = useState('')

  const canvasRef = useRef(null)
  const maskCanvasRef = useRef(null)
  const isPaintingRef = useRef(false)
  const isCancelledRef = useRef(false)

  const handleFile = ([f]) => {
    setFile(f)
    setResultBlob(null)
    setError('')
    setProgress(0)

    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      // Limit max processing resolution for smooth in-browser responsiveness
      const MAX_DIM = 800
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) {
          h = Math.round((h * MAX_DIM) / w)
          w = MAX_DIM
        } else {
          w = Math.round((w * MAX_DIM) / h)
          h = MAX_DIM
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h)

      setOrigImgData(data)
      setCurrentImgData(data)
      setTargetWidth(w)
      setTargetHeight(h)

      // Initialize drawing canvas
      initCanvases(data)
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  const initCanvases = (imgData) => {
    if (!canvasRef.current || !maskCanvasRef.current) return
    const { width, height } = imgData

    canvasRef.current.width = width
    canvasRef.current.height = height
    const ctx = canvasRef.current.getContext('2d')
    ctx.putImageData(imgData, 0, 0)

    maskCanvasRef.current.width = width
    maskCanvasRef.current.height = height
    const mCtx = maskCanvasRef.current.getContext('2d')
    mCtx.clearRect(0, 0, width, height)
  }

  // Sync canvas render
  useEffect(() => {
    if (currentImgData && canvasRef.current) {
      canvasRef.current.width = currentImgData.width
      canvasRef.current.height = currentImgData.height
      const ctx = canvasRef.current.getContext('2d')
      ctx.putImageData(currentImgData, 0, 0)
    }
  }, [currentImgData])

  // Brush drawing on mask layer
  const handleMouseDown = (e) => {
    isPaintingRef.current = true
    paintBrush(e)
  }

  const handleMouseMove = (e) => {
    if (!isPaintingRef.current) return
    paintBrush(e)
  }

  const handleMouseUp = () => {
    isPaintingRef.current = false
  }

  const paintBrush = (e) => {
    if (!maskCanvasRef.current) return
    const rect = maskCanvasRef.current.getBoundingClientRect()
    const scaleX = maskCanvasRef.current.width / rect.width
    const scaleY = maskCanvasRef.current.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    const ctx = maskCanvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)

    if (brushMode === 'remove') {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.75)' // Red mask for object removal
      ctx.fill()
    } else if (brushMode === 'protect') {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.75)' // Green mask to protect areas
      ctx.fill()
    } else if (brushMode === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  const clearMask = () => {
    if (!maskCanvasRef.current) return
    const ctx = maskCanvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height)
  }

  const resetAll = () => {
    if (!origImgData) return
    setCurrentImgData(origImgData)
    setTargetWidth(origImgData.width)
    setTargetHeight(origImgData.height)
    setResultBlob(null)
    clearMask()
  }

  const runSeamCarving = async () => {
    if (!currentImgData || processing) return
    setProcessing(true)
    setError('')
    isCancelledRef.current = false

    try {
      let workingImg = new ImageData(
        new Uint8ClampedArray(currentImgData.data),
        currentImgData.width,
        currentImgData.height
      )

      const mCtx = maskCanvasRef.current.getContext('2d')
      let workingMask = mCtx.getImageData(0, 0, workingImg.width, workingImg.height).data

      const deltaW = workingImg.width - targetWidth
      const deltaH = workingImg.height - targetHeight
      const totalSteps = Math.max(0, deltaW) + Math.max(0, deltaH)
      let stepCount = 0

      // 1. Remove Vertical Seams (Reduce Width)
      for (let i = 0; i < deltaW; i++) {
        if (isCancelledRef.current) break
        const energy = calculateEnergyMap(workingImg, workingMask)
        const seam = findVerticalSeam(energy, workingImg.width, workingImg.height)

        // Draw seam visualization on canvas if enabled
        if (showSeams && canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d')
          ctx.fillStyle = '#ef4444'
          for (let y = 0; y < workingImg.height; y++) {
            ctx.fillRect(seam[y], y, 1, 1)
          }
        }

        const res = removeVerticalSeam(workingImg, seam, workingMask)
        workingImg = res.imgData
        workingMask = res.maskData

        stepCount++
        if (i % 2 === 0) {
          setProgress(Math.round((stepCount / totalSteps) * 100))
          setProgressText(`Memproses seam carving lebar (${workingImg.width}px)…`)
          setCurrentImgData(workingImg)
          await new Promise((r) => setTimeout(r, 0)) // yield to event loop
        }
      }

      // 2. Remove Horizontal Seams (Reduce Height) via transposing
      if (deltaH > 0) {
        workingImg = transposeImageData(workingImg)
        workingMask = transposeMask(workingMask, workingImg.height, workingImg.width)

        for (let i = 0; i < deltaH; i++) {
          if (isCancelledRef.current) break
          const energy = calculateEnergyMap(workingImg, workingMask)
          const seam = findVerticalSeam(energy, workingImg.width, workingImg.height)

          const res = removeVerticalSeam(workingImg, seam, workingMask)
          workingImg = res.imgData
          workingMask = res.maskData

          stepCount++
          if (i % 2 === 0) {
            setProgress(Math.round((stepCount / totalSteps) * 100))
            setProgressText(`Memproses seam carving tinggi (${workingImg.height}px)…`)
            await new Promise((r) => setTimeout(r, 0))
          }
        }

        workingImg = transposeImageData(workingImg)
      }

      setCurrentImgData(workingImg)
      setProgress(100)

      // Create output blob
      const outCanvas = document.createElement('canvas')
      outCanvas.width = workingImg.width
      outCanvas.height = workingImg.height
      outCanvas.getContext('2d').putImageData(workingImg, 0, 0)

      const blob = await new Promise((res) => outCanvas.toBlob(res, 'image/png'))
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
      title="Image Carver (Content-Aware Editor)"
      description="Teknologi Seam Carving untuk resize foto pintar tanpa mendistorsi objek utama, serta hapus objek yang tidak diinginkan dengan kuas cerdas."
    >
      <DropZone
        accept="image/*,.jpg,.jpeg,.png,.webp"
        onFiles={handleFile}
        label="Pilih foto / gambar untuk di-carve"
        hint="JPG, PNG, WebP — resize cerdas & hapus objek"
      />

      {origImgData && (
        <div className="space-y-4 animate-fade-in">
          {/* Controls Bar */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[--color-border] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                  Dimensi Target:
                </span>
                <span className="text-xs font-semibold text-[--color-text]">
                  {targetWidth} x {targetHeight} px
                </span>
                <span className="text-[10px] text-[--color-text-3]">
                  (Asli: {origImgData.width} x {origImgData.height})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={resetAll}
                  disabled={processing}
                  className="flex items-center gap-1 text-xs text-[--color-text-2] hover:text-[--color-text] disabled:opacity-40"
                >
                  <RotateCcw size={13} /> Reset Asli
                </button>
              </div>
            </div>

            {/* Target Width Slider */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-[--color-text-2]">
                    Kecilkan Lebar (Width)
                  </label>
                  <span className="text-xs font-bold text-[--color-brand]">{targetWidth} px</span>
                </div>
                <input
                  type="range"
                  min={Math.round(origImgData.width * 0.3)}
                  max={origImgData.width}
                  value={targetWidth}
                  disabled={processing}
                  onChange={(e) => setTargetWidth(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-[--color-text-2]">
                    Kecilkan Tinggi (Height)
                  </label>
                  <span className="text-xs font-bold text-[--color-brand]">{targetHeight} px</span>
                </div>
                <input
                  type="range"
                  min={Math.round(origImgData.height * 0.3)}
                  max={origImgData.height}
                  value={targetHeight}
                  disabled={processing}
                  onChange={(e) => setTargetHeight(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {/* Brush selection for content-aware object removal/protection */}
            <div className="pt-2 border-t border-[--color-border] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[--color-text-3]">Kuas Masking:</span>
                <button
                  type="button"
                  onClick={() => setBrushMode('remove')}
                  className={[
                    'flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition-colors',
                    brushMode === 'remove'
                      ? 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400 font-semibold'
                      : 'border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3]',
                  ].join(' ')}
                >
                  <Wand2 size={13} />
                  Hapus Objek (Merah)
                </button>
                <button
                  type="button"
                  onClick={() => setBrushMode('protect')}
                  className={[
                    'flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition-colors',
                    brushMode === 'protect'
                      ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400 font-semibold'
                      : 'border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3]',
                  ].join(' ')}
                >
                  <ShieldCheck size={13} />
                  Lindungi Objek (Hijau)
                </button>
                <button
                  type="button"
                  onClick={() => setBrushMode('eraser')}
                  className={[
                    'flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-colors',
                    brushMode === 'eraser'
                      ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand]'
                      : 'border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3]',
                  ].join(' ')}
                >
                  <Eraser size={13} />
                  Penghapus
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[--color-text-3]">Ukuran Kuas:</span>
                  <input
                    type="range"
                    min="6"
                    max="60"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-20"
                  />
                </div>
                <button
                  onClick={clearMask}
                  className="text-xs text-[--color-text-3] hover:text-[--color-danger]"
                >
                  Hapus Kuas
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Canvas Canvas Area */}
          <div className="relative flex justify-center rounded-lg border border-[--color-border] bg-[--color-surface-2] p-4 overflow-auto min-h-[350px]">
            <div
              className="relative inline-block border border-[--color-border] shadow-xs cursor-crosshair select-none bg-black/5"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              {/* Base image canvas */}
              <canvas ref={canvasRef} className="block max-h-[500px] w-auto pointer-events-none" />
              {/* Overlay mask canvas */}
              <canvas
                ref={maskCanvasRef}
                className="absolute inset-0 block h-full w-full pointer-events-auto opacity-80"
              />
            </div>
          </div>

          {processing && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2 animate-fade-in">
              <ProgressBar value={progress} label={progressText} />
            </div>
          )}

          {error && (
            <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger] animate-fade-in">
              {error}
            </p>
          )}

          {origImgData && !resultBlob && (
            <button
              onClick={runSeamCarving}
              disabled={processing || (targetWidth === currentImgData?.width && targetHeight === currentImgData?.height)}
              className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-50 transition-all active:scale-[0.99]"
            >
              {processing && <Loader2 size={16} className="animate-spin" />}
              {processing ? 'Menghitung Jalur Seams & Memotong…' : 'Mulai Content-Aware Carve (Resize / Hapus Objek)'}
            </button>
          )}

          {resultBlob && (
            <div className="rounded-lg border border-[--color-success-light] bg-[--color-success-light] p-4 animate-fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-[--color-success] flex items-center gap-1">
                    <Sparkles size={16} /> Hasil Seam Carving Selesai!
                  </p>
                  <p className="mt-0.5 text-sm text-[--color-text-2]">
                    Ukuran baru: {currentImgData.width} x {currentImgData.height} px ({fmtBytes(resultBlob.size)})
                  </p>
                </div>
                <button
                  onClick={resetAll}
                  className="rounded p-1 text-[--color-text-3] hover:bg-[--color-surface-3]"
                >
                  ✕
                </button>
              </div>
              <a
                href={URL.createObjectURL(resultBlob)}
                download={`${base}_carved.png`}
                className="mt-3 flex items-center justify-center gap-2 rounded bg-[--color-success] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity no-underline"
              >
                <Download size={16} /> Download Gambar Hasil
              </a>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  )
}
