import { useState, useRef, useEffect } from 'react'
import {
  Shrink, Trash2, Download, Eye, Sparkles,
  MousePointer, RotateCcw, Activity, Layers, Sliders, Check
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ProgressBar from '../../components/ProgressBar'
import {
  resizeImage,
  normalizeEnergyMap,
  getPixel,
  setPixel,
  ALPHA_DELETE_THRESHOLD,
  MAX_WIDTH_LIMIT,
  MAX_HEIGHT_LIMIT,
} from '../../utils/contentAwareResizer'
import { fmtBytes, stripExt } from '../../utils/helpers'

export default function ImageCarver() {
  const [imageSrc, setImageSrc] = useState(null)
  const [file, setFile] = useState(null)
  const [originalSize, setOriginalSize] = useState(null) // { w, h }
  const [workingSize, setWorkingSize] = useState(null) // { w, h }
  const [resizedImgSrc, setResizedImgSrc] = useState(null)
  const [toWidthScale, setToWidthScale] = useState(75)
  const [toHeightScale, setToHeightScale] = useState(85)
  const [useHigherQuality, setUseHigherQuality] = useState(false)
  const [showEnergyMap, setShowEnergyMap] = useState(true)
  const [showSeams, setShowSeams] = useState(true)
  const [isResizing, setIsResizing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [maskData, setMaskData] = useState(null)
  const [hasMask, setHasMask] = useState(false)
  const [error, setError] = useState('')

  const imgRef = useRef(null)
  const workingCanvasRef = useRef(null)
  const energyCanvasRef = useRef(null)
  const seamsCanvasRef = useRef(null)
  const maskCanvasRef = useRef(null)
  const isPaintingRef = useRef(false)
  const isCancelledRef = useRef(false)

  const handleFile = ([f]) => {
    setFile(f)
    onReset()
    const url = URL.createObjectURL(f)
    setImageSrc(url)
  }

  const onReset = () => {
    setResizedImgSrc(null)
    setWorkingSize(null)
    setProgress(0)
    setError('')
    isCancelledRef.current = true
    setIsResizing(false)
  }

  const onImgLoad = () => {
    if (!imgRef.current) return
    const w = imgRef.current.naturalWidth
    const h = imgRef.current.naturalHeight
    setOriginalSize({ w, h })
    initMaskCanvas()
  }

  const initMaskCanvas = () => {
    if (!maskCanvasRef.current || !imgRef.current) return
    const canvas = maskCanvasRef.current
    canvas.width = imgRef.current.clientWidth || 400
    canvas.height = imgRef.current.clientHeight || 300
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasMask(false)
    setMaskData(null)
  }

  // Brush drawing on original image mask
  const startPaint = (e) => {
    if (isResizing) return
    isPaintingRef.current = true
    paint(e)
  }

  const paint = (e) => {
    if (!isPaintingRef.current || !maskCanvasRef.current) return
    const canvas = maskCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'rgba(239, 68, 68, 0.75)'
    ctx.beginPath()
    ctx.arc(x, y, 12, 0, Math.PI * 2)
    ctx.fill()
    setHasMask(true)
  }

  const stopPaint = () => {
    if (!isPaintingRef.current) return
    isPaintingRef.current = false
    if (maskCanvasRef.current) {
      const ctx = maskCanvasRef.current.getContext('2d')
      setMaskData(ctx.getImageData(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height))
    }
  }

  const clearMask = () => {
    initMaskCanvas()
  }

  const applyMaskToImageData = (img) => {
    if (!maskData) return
    const wRatio = maskData.width / img.width
    const hRatio = maskData.height / img.height

    for (let y = 0; y < img.height; y += 1) {
      for (let x = 0; x < img.width; x += 1) {
        const maskX = Math.floor(x * wRatio)
        const maskY = Math.floor(y * hRatio)
        const maskIdx = (maskY * maskData.width + maskX) * 4
        const maskAlpha = maskData.data[maskIdx + 3]

        if (maskAlpha > 30) {
          const pixel = getPixel(img, { x, y })
          setPixel(img, { x, y }, [pixel[0], pixel[1], pixel[2], ALPHA_DELETE_THRESHOLD])
        }
      }
    }
  }

  const startCarving = async () => {
    if (!imgRef.current || isResizing) return
    onReset()
    setIsResizing(true)
    isCancelledRef.current = false
    setError('')

    const srcImg = imgRef.current
    let w = useHigherQuality ? srcImg.naturalWidth : (srcImg.clientWidth || 500)
    let h = useHigherQuality ? srcImg.naturalHeight : (srcImg.clientHeight || 350)
    const ratio = w / h

    if (w > MAX_WIDTH_LIMIT) {
      w = MAX_WIDTH_LIMIT
      h = Math.floor(w / ratio)
    }
    if (h > MAX_HEIGHT_LIMIT) {
      h = MAX_HEIGHT_LIMIT
      w = Math.floor(h * ratio)
    }

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = w
    tempCanvas.height = h
    const tempCtx = tempCanvas.getContext('2d')
    tempCtx.drawImage(srcImg, 0, 0, w, h)

    const img = tempCtx.getImageData(0, 0, w, h)
    applyMaskToImageData(img)

    const toWidth = Math.max(10, Math.floor((toWidthScale * w) / 100))
    const toHeight = Math.max(10, Math.floor((toHeightScale * h) / 100))

    setWorkingSize({ w, h })

    try {
      const onIteration = async ({ seam, img: currentImg, size, energyMap, step, steps }) => {
        // 1. Render working canvas
        if (workingCanvasRef.current) {
          workingCanvasRef.current.width = size.w
          workingCanvasRef.current.height = size.h
          const ctx = workingCanvasRef.current.getContext('2d')
          ctx.putImageData(currentImg, 0, 0, 0, 0, size.w, size.h)
        }

        // 2. Render seam line on seams canvas
        if (showSeams && seamsCanvasRef.current) {
          seamsCanvasRef.current.width = size.w
          seamsCanvasRef.current.height = size.h
          const sCtx = seamsCanvasRef.current.getContext('2d')
          sCtx.clearRect(0, 0, size.w, size.h)
          sCtx.fillStyle = 'rgba(239, 68, 68, 0.95)'
          seam.forEach(({ x, y }) => {
            sCtx.fillRect(x, y, 1, 1)
          })
        }

        // 3. Render normalized Energy Map
        if (showEnergyMap && energyCanvasRef.current && energyMap) {
          energyCanvasRef.current.width = size.w
          energyCanvasRef.current.height = size.h
          const eCtx = energyCanvasRef.current.getContext('2d')
          const eImgData = eCtx.getImageData(0, 0, size.w, size.h)
          const normalized = normalizeEnergyMap(energyMap, size.w, size.h)

          for (let ey = 0; ey < size.h; ey += 1) {
            for (let ex = 0; ex < size.w; ex += 1) {
              const val = normalized[ey][ex]
              setPixel(eImgData, { x: ex, y: ey }, [val, val, val, 255])
            }
          }
          eCtx.putImageData(eImgData, 0, 0)
        }

        setWorkingSize({ w: size.w, h: size.h })
        setProgress(Math.round((step / steps) * 100))
      }

      const res = await resizeImage({
        img,
        toWidth,
        toHeight,
        onIteration,
        isCancelled: () => isCancelledRef.current,
      })

      if (!isCancelledRef.current && workingCanvasRef.current) {
        workingCanvasRef.current.toBlob((blob) => {
          if (blob) {
            setResizedImgSrc(URL.createObjectURL(blob))
          }
        }, 'image/png')
      }
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setIsResizing(false)
    }
  }

  const base = file ? stripExt(file.name) : 'image'

  return (
    <ToolShell
      title="Image Carver (Content-Aware Seam Carving)"
      description="Implementasi lengkap algoritma Seam Carving murni di browser (terinspirasi dari js-image-carver). Kecilkan resolusi gambar tanpa merusak proporsi objek utama & hapus objek foto dengan kuas seleksi."
    >
      <DropZone
        accept="image/*,.jpg,.jpeg,.png,.webp"
        onFiles={handleFile}
        label="Pilih foto untuk di-carve"
        hint="JPG, PNG, WebP — Content-Aware Image Resizing"
      />

      {imageSrc && (
        <div className="space-y-4 animate-fade-in">
          {/* Controls Bar */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[--color-border] pb-3 text-xs">
              <div className="flex items-center gap-2">
                <Sliders size={15} className="text-[--color-brand]" />
                <span className="font-bold text-[--color-text]">Skala Target:</span>
                <span className="text-[--color-text-2]">
                  Lebar <strong>{toWidthScale}%</strong> × Tinggi <strong>{toHeightScale}%</strong>
                </span>
                {originalSize && (
                  <span className="text-[--color-text-3]">
                    (Asli: {originalSize.w} × {originalSize.h} px)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-[--color-text-2] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useHigherQuality}
                    onChange={(e) => setUseHigherQuality(e.target.checked)}
                    disabled={isResizing}
                  />
                  <span>Kualitas Tinggi (Full Resolusi)</span>
                </label>
              </div>
            </div>

            {/* Scale Sliders */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="flex justify-between items-center mb-1 text-xs">
                  <span className="font-semibold text-[--color-text-2]">Lebar (Width)</span>
                  <span className="font-bold text-[--color-brand]">{toWidthScale}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={toWidthScale}
                  disabled={isResizing}
                  onChange={(e) => setToWidthScale(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1 text-xs">
                  <span className="font-semibold text-[--color-text-2]">Tinggi (Height)</span>
                  <span className="font-bold text-[--color-brand]">{toHeightScale}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={toHeightScale}
                  disabled={isResizing}
                  onChange={(e) => setToHeightScale(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {/* Visualization toggles */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[--color-border] pt-3 text-xs">
              <div className="flex items-center gap-4 text-[--color-text-2]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSeams}
                    onChange={(e) => setShowSeams(e.target.checked)}
                  />
                  <span>Tampilkan Jalur Seam (Merah)</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showEnergyMap}
                    onChange={(e) => setShowEnergyMap(e.target.checked)}
                  />
                  <span>Tampilkan Energy Map</span>
                </label>
              </div>

              {hasMask && (
                <button
                  onClick={clearMask}
                  disabled={isResizing}
                  className="flex items-center gap-1 text-xs text-[--color-danger] hover:underline"
                >
                  <Trash2 size={13} /> Hapus Mask Merah
                </button>
              )}
            </div>
          </div>

          {/* Action button & Progress */}
          {!resizedImgSrc && (
            <button
              onClick={startCarving}
              disabled={isResizing}
              className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-all active:scale-[0.99]"
            >
              {isResizing ? (
                <>
                  <Activity size={16} className="animate-pulse" />
                  Memproses Seam Carving ({progress}%)…
                </>
              ) : (
                <>
                  <Shrink size={16} />
                  Mulai Content-Aware Resize
                </>
              )}
            </button>
          )}

          {isResizing && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2 animate-fade-in">
              <ProgressBar value={progress} label={`Menghitung energi piksel & memotong seams… ${progress}%`} />
            </div>
          )}

          {error && (
            <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger] animate-fade-in">
              {error}
            </p>
          )}

          {/* Real-time Work Stages Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 1. Original Image with Mask Canvas */}
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                  1. Gambar Asli & Masking Objek
                </span>
                <span className="flex items-center gap-1 text-[11px] text-[--color-text-3]">
                  <MousePointer size={12} /> Kuas merah untuk hapus objek
                </span>
              </div>
              <div className="relative inline-block overflow-hidden rounded border border-[--color-border] bg-[--color-surface-2] cursor-crosshair">
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Original"
                  onLoad={onImgLoad}
                  className="block max-h-[360px] w-auto pointer-events-none select-none"
                />
                <canvas
                  ref={maskCanvasRef}
                  onMouseDown={startPaint}
                  onMouseMove={paint}
                  onMouseUp={stopPaint}
                  onMouseLeave={stopPaint}
                  className="absolute inset-0 block h-full w-full pointer-events-auto opacity-75"
                />
              </div>
            </div>

            {/* 2. Real-time Live Resized Canvas + Seams */}
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                  2. Preview Proses Carving {workingSize ? `(${workingSize.w} × ${workingSize.h} px)` : ''}
                </span>
                {isResizing && (
                  <span className="text-[11px] font-bold text-[--color-brand] animate-pulse">
                    ● Real-Time
                  </span>
                )}
              </div>
              <div className="relative flex items-center justify-center min-h-[260px] overflow-hidden rounded border border-[--color-border] bg-[--color-surface-2] p-2">
                <canvas ref={workingCanvasRef} className="block max-h-[360px] w-auto border border-dashed border-gray-400" />
                {showSeams && (
                  <canvas ref={seamsCanvasRef} className="absolute inset-0 block h-full w-full pointer-events-none" />
                )}
              </div>
            </div>

            {/* 3. Live Mathematical Energy Map Canvas */}
            {showEnergyMap && (
              <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2 lg:col-span-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3] flex items-center gap-1.5">
                    <Activity size={14} className="text-[--color-brand]" />
                    3. Dual-Gradient Energy Map (Visualisasi Matriks Gradien Energi)
                  </span>
                  <span className="text-[11px] text-[--color-text-3]">
                    Piksel putih = energi tinggi (dilindungi) | Piksel hitam = energi rendah (dipotong)
                  </span>
                </div>
                <div className="flex items-center justify-center min-h-[160px] overflow-hidden rounded border border-[--color-border] bg-black/90 p-2">
                  <canvas ref={energyCanvasRef} className="block max-h-[300px] w-auto" />
                </div>
              </div>
            )}
          </div>

          {/* Download Result Card */}
          {resizedImgSrc && (
            <div className="rounded-lg border border-[--color-success-light] bg-[--color-success-light] p-4 animate-fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-[--color-success] flex items-center gap-1.5">
                    <Sparkles size={16} /> Content-Aware Resize Berhasil!
                  </p>
                  <p className="mt-0.5 text-sm text-[--color-text-2]">
                    Ukuran baru: {workingSize?.w} × {workingSize?.h} px
                  </p>
                </div>
                <button
                  onClick={onReset}
                  className="rounded p-1 text-[--color-text-3] hover:bg-[--color-surface-3]"
                >
                  ✕
                </button>
              </div>
              <a
                href={resizedImgSrc}
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
