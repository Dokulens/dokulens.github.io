import { useState, useRef, useEffect } from 'react'
import {
  Shrink, Trash2, Download, Eye, Sparkles,
  MousePointer, RotateCcw, Activity, Sliders, Maximize2, X,
  ZoomIn, ZoomOut, Paintbrush, Wand2, Check, AlertTriangle, StopCircle
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ProgressBar from '../../components/ProgressBar'
import { magicWandAppend } from '../../utils/magicWand'
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
import { useIncomingFile } from '../../hooks/useIncomingFile'

export default function ImageCarver() {
  const [imageSrc, setImageSrc] = useState(null)
  useIncomingFile((f) => {
    setFile(f)
    onReset()
    setToWidthScale(80)
    setToHeightScale(90)
    setHasMask(false)
    setMaskCanvasElement(null)
    const url = URL.createObjectURL(f)
    setImageSrc(url)
  })
  const [file, setFile] = useState(null)
  const [originalSize, setOriginalSize] = useState(null)
  const [workingSize, setWorkingSize] = useState(null)
  const [resizedImgSrc, setResizedImgSrc] = useState(null)

  const [toWidthScale, setToWidthScale] = useState(80)
  const [toHeightScale, setToHeightScale] = useState(90)
  const [lockRatio, setLockRatio] = useState(true)
  const [useHigherQuality, setUseHigherQuality] = useState(false)
  const [showEnergyMap, setShowEnergyMap] = useState(true)
  const [showSeams, setShowSeams] = useState(true)
  const [isResizing, setIsResizing] = useState(false)
  const [progress, setProgress] = useState(0)

  const [isMaskModalOpen, setIsMaskModalOpen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [brushSize, setBrushSize] = useState(24)
  const [maskTool, setMaskTool] = useState('brush') // 'brush' | 'wand'
  const [tolerance, setTolerance] = useState(32)
  const [history, setHistory] = useState([])
  const [hasMask, setHasMask] = useState(false)
  const [maskCanvasElement, setMaskCanvasElement] = useState(null)
  const [error, setError] = useState('')
  const [carvePhase, setCarvePhase] = useState('')

  const imgRef = useRef(null)
  const modalImgRef = useRef(null)
  const origOverlayCanvasRef = useRef(null)
  const workingCanvasRef = useRef(null)
  const energyCanvasRef = useRef(null)
  const seamsCanvasRef = useRef(null)

  const modalCanvasRef = useRef(null)
  const isPaintingRef = useRef(false)
  const isCancelledRef = useRef(false)

  const handleFile = ([f]) => {
    setFile(f)
    onReset()
    setToWidthScale(80)
    setToHeightScale(90)
    setHasMask(false)
    setMaskCanvasElement(null)
    const url = URL.createObjectURL(f)
    setImageSrc(url)
  }

  const onReset = () => {
    setResizedImgSrc(null)
    setWorkingSize(null)
    setProgress(0)
    setError('')
    setCarvePhase('')
    isCancelledRef.current = true
    setIsResizing(false)
    setMaskCanvasElement(null)
    setHasMask(false)
    if (origOverlayCanvasRef.current) {
      const ctx = origOverlayCanvasRef.current.getContext('2d')
      ctx.clearRect(0, 0, origOverlayCanvasRef.current.width, origOverlayCanvasRef.current.height)
    }
    if (imgRef.current && workingCanvasRef.current) {
      const w = imgRef.current.naturalWidth
      const h = imgRef.current.naturalHeight
      workingCanvasRef.current.width = w
      workingCanvasRef.current.height = h
      const ctx = workingCanvasRef.current.getContext('2d')
      ctx.drawImage(imgRef.current, 0, 0)
    }
  }

  const cancelCarving = () => {
    isCancelledRef.current = true
    setIsResizing(false)
    setProgress(0)
  }

  const onImgLoad = () => {
    if (!imgRef.current) return
    const w = imgRef.current.naturalWidth
    const h = imgRef.current.naturalHeight
    setOriginalSize({ w, h })
    setWorkingSize({ w, h })

    if (workingCanvasRef.current) {
      workingCanvasRef.current.width = w
      workingCanvasRef.current.height = h
      const ctx = workingCanvasRef.current.getContext('2d')
      ctx.drawImage(imgRef.current, 0, 0)
    }

    if (seamsCanvasRef.current) {
      seamsCanvasRef.current.width = w
      seamsCanvasRef.current.height = h
      const sctx = seamsCanvasRef.current.getContext('2d')
      sctx.clearRect(0, 0, w, h)
    }

    renderOriginalOverlayMask()
  }

  const renderOriginalOverlayMask = () => {
    if (!origOverlayCanvasRef.current || !imgRef.current) return
    const canvas = origOverlayCanvasRef.current
    canvas.width = imgRef.current.clientWidth || 400
    canvas.height = imgRef.current.clientHeight || 300
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (maskCanvasElement) {
      ctx.drawImage(maskCanvasElement, 0, 0, canvas.width, canvas.height)
    }
  }

  useEffect(() => {
    renderOriginalOverlayMask()
  }, [maskCanvasElement, originalSize])

  useEffect(() => {
    if (!isResizing && origOverlayCanvasRef.current) {
      const ctx = origOverlayCanvasRef.current.getContext('2d')
      ctx.clearRect(0, 0, origOverlayCanvasRef.current.width, origOverlayCanvasRef.current.height)
    }
  }, [isResizing])

  useEffect(() => {
    if (isMaskModalOpen && modalCanvasRef.current && modalImgRef.current) {
      const canvas = modalCanvasRef.current
      canvas.width = modalImgRef.current.naturalWidth
      canvas.height = modalImgRef.current.naturalHeight
      const ctx = canvas.getContext('2d')
      if (maskCanvasElement) {
        ctx.drawImage(maskCanvasElement, 0, 0)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
  }, [isMaskModalOpen])

  const handleModalCanvasMouseDown = (e) => {
    if (maskTool === 'wand') {
      if (!modalCanvasRef.current || !modalImgRef.current) return
      const canvas = modalCanvasRef.current
      const img = modalImgRef.current

      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const startX = Math.floor((e.clientX - rect.left) * scaleX)
      const startY = Math.floor((e.clientY - rect.top) * scaleY)

      const snapshot = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
      setHistory((prev) => [...prev, snapshot])

      const offCanvas = document.createElement('canvas')
      offCanvas.width = canvas.width
      offCanvas.height = canvas.height
      const imgCtx = offCanvas.getContext('2d', { willReadFrequently: true })
      imgCtx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const selCtx = canvas.getContext('2d')

      magicWandAppend({
        imgCtx,
        selCtx,
        width: canvas.width,
        height: canvas.height,
        startX,
        startY,
        tolerance,
        maskColor: { r: 239, g: 68, b: 68, a: 204 }
      })

      setHasMask(true)
    } else {
      startModalPaint(e)
    }
  }

  const handleUndoSelection = () => {
    if (history.length === 0 || !modalCanvasRef.current) return
    const selCtx = modalCanvasRef.current.getContext('2d')
    const last = history[history.length - 1]
    selCtx.putImageData(last, 0, 0)
    setHistory((prev) => prev.slice(0, -1))
  }

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
    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)'
    ctx.beginPath()
    ctx.arc(x, y, (brushSize * scaleX) / 2, 0, Math.PI * 2)
    ctx.fill()
    setHasMask(true)
  }

  const stopModalPaint = () => {
    isPaintingRef.current = false
  }

  const clearModalMask = () => {
    if (!modalCanvasRef.current) return
    const canvas = modalCanvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasMask(false)
    setHistory([])
    setMaskCanvasElement(null)
  }

  const saveModalMask = () => {
    if (modalCanvasRef.current) {
      const clone = document.createElement('canvas')
      clone.width = modalCanvasRef.current.width
      clone.height = modalCanvasRef.current.height
      clone.getContext('2d').drawImage(modalCanvasRef.current, 0, 0)
      setMaskCanvasElement(clone)
    }
    setIsMaskModalOpen(false)
  }

  const applyMaskToImageData = (img) => {
    if (!maskCanvasElement) return
    const maskCtx = maskCanvasElement.getContext('2d')
    const maskData = maskCtx.getImageData(0, 0, maskCanvasElement.width, maskCanvasElement.height)

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
    setCarvePhase('')

    const srcImg = imgRef.current
    let w = useHigherQuality ? srcImg.naturalWidth : Math.min(srcImg.naturalWidth, 600)
    let h = useHigherQuality ? srcImg.naturalHeight : Math.min(srcImg.naturalHeight, Math.round((600 * srcImg.naturalHeight) / srcImg.naturalWidth))
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
      const onIteration = async ({ seam, img: currentImg, size, energyMap, step, steps, phase }) => {
        if (workingCanvasRef.current) {
          workingCanvasRef.current.width = size.w
          workingCanvasRef.current.height = size.h
          const ctx = workingCanvasRef.current.getContext('2d')
          ctx.putImageData(currentImg, 0, 0, 0, 0, size.w, size.h)
        }

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
        if (phase === 'mask-clear') {
          setCarvePhase('mask-clear')
        }
      }

      const res = await resizeImage({
        img,
        toWidth,
        toHeight,
        onIteration,
        isCancelled: () => isCancelledRef.current,
        hasMask,
      })

      if (!isCancelledRef.current) {
        const outCanvas = document.createElement('canvas')
        outCanvas.width = res.size.w
        outCanvas.height = res.size.h
        const outCtx = outCanvas.getContext('2d')
        outCtx.putImageData(res.img, 0, 0, 0, 0, res.size.w, res.size.h)

        outCanvas.toBlob((blob) => {
          if (blob) {
            setResizedImgSrc(URL.createObjectURL(blob))
          }
        }, 'image/png')
      }
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setIsResizing(false)
      setMaskCanvasElement(null)
      setHasMask(false)
      if (origOverlayCanvasRef.current) {
        const ctx = origOverlayCanvasRef.current.getContext('2d')
        ctx.clearRect(0, 0, origOverlayCanvasRef.current.width, origOverlayCanvasRef.current.height)
      }
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
                <span className="font-bold text-[--color-text]">Ukuran Target:</span>
                <span className="text-[--color-text-2]">
                  {originalSize
                    ? `${Math.round((toWidthScale * originalSize.w) / 100)} × ${Math.round((toHeightScale * originalSize.h) / 100)} px (${toWidthScale}% × ${toHeightScale}%)`
                    : `${toWidthScale}% × ${toHeightScale}%`}
                </span>
                {originalSize && (
                  <span className="text-[--color-text-3]">
                    (Ukuran Asli: {originalSize.w} × {originalSize.h} px)
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

            {/* High Quality Warning Banner */}
            {useHigherQuality && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 animate-fade-in">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>
                  <strong>Peringatan Performa:</strong> Mode Kualitas Tinggi (Full Resolusi) memproses seluruh piksel asli foto tanpa downscaling. Proses komputasi pada CPU browser akan lebih berat dan memerlukan waktu lebih lama.
                </span>
              </div>
            )}

            {/* Scale Sliders */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] items-end">
              <div>
                <div className="flex justify-between items-center mb-1 text-xs">
                  <span className="font-semibold text-[--color-text-2]">Lebar (Width)</span>
                  <span className="font-bold text-[--color-brand]">
                    {toWidthScale}% {originalSize ? `(${Math.round((toWidthScale * originalSize.w) / 100)} px)` : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={toWidthScale}
                  disabled={isResizing}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setToWidthScale(v)
                    if (lockRatio) {
                      setToHeightScale(v)
                    }
                  }}
                  className="w-full"
                />
              </div>

              {/* Lock Ratio Toggle */}
              <button
                type="button"
                onClick={() => setLockRatio(!lockRatio)}
                className={[
                  'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-all whitespace-nowrap',
                  lockRatio
                    ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand]'
                    : 'border-[--color-border] bg-[--color-surface-3] text-[--color-text-3]'
                ].join(' ')}
                title={lockRatio ? 'Rasio terkunci — geser salah satu, yang lain ikut' : 'Rasio bebas — atur lebar & tinggi secara independen'}
              >
                {lockRatio ? '🔗 Terkunci' : '🔓 Bebas'}
              </button>

              <div>
                <div className="flex justify-between items-center mb-1 text-xs">
                  <span className="font-semibold text-[--color-text-2]">Tinggi (Height)</span>
                  <span className="font-bold text-[--color-brand]">
                    {toHeightScale}% {originalSize ? `(${Math.round((toHeightScale * originalSize.h) / 100)} px)` : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={toHeightScale}
                  disabled={isResizing}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setToHeightScale(v)
                    if (lockRatio) {
                      setToWidthScale(v)
                    }
                  }}
                  className="w-full"
                />
              </div>
            </div>

            {/* Masking modal trigger button */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[--color-border] pt-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMaskModalOpen(true)}
                  className="flex items-center gap-1.5 rounded border border-[--color-brand] bg-[--color-brand-light] px-3 py-1.5 font-semibold text-[--color-brand] hover:bg-[--color-brand] hover:text-white transition-colors"
                >
                  <Maximize2 size={13} />
                  Buka Kanvas Masking (Pop-up Fullscreen)
                </button>
                {hasMask && (
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
                      ✓ Mask Objek Aktif
                    </span>
                    <button
                      onClick={clearModalMask}
                      className="text-xs text-[--color-text-3] hover:text-[--color-danger]"
                      title="Hapus Mask"
                    >
                      (Hapus)
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 text-[--color-text-2]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSeams}
                    onChange={(e) => setShowSeams(e.target.checked)}
                  />
                  <span>Jalur Seam (Merah)</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showEnergyMap}
                    onChange={(e) => setShowEnergyMap(e.target.checked)}
                  />
                  <span>Energy Map</span>
                </label>
              </div>
            </div>
          </div>

          {/* Action button & Progress */}
          {!resizedImgSrc && !isResizing && (
            <button
              onClick={startCarving}
              disabled={isResizing}
              className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-all active:scale-[0.99]"
            >
              <Shrink size={16} />
              Mulai Content-Aware Resize ({toWidthScale}% × {toHeightScale}%)
            </button>
          )}

          {isResizing && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-semibold text-[--color-brand]">
                  <Activity size={16} className="animate-pulse" />
                  <span>{carvePhase === 'mask-clear' ? 'Membersihkan Masking…' : 'Memproses Seam Carving…'} ({progress}%)</span>
                </div>
                <button
                  onClick={cancelCarving}
                  className="flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                >
                  <StopCircle size={14} /> Batal / Hentikan Proses
                </button>
              </div>
              <ProgressBar value={progress} label={carvePhase === 'mask-clear' ? `Membersihkan area masking… ${progress}%` : `Menghitung energi piksel & memotong seams… ${progress}%`} />
            </div>
          )}

          {error && (
            <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger] animate-fade-in">
              {error}
            </p>
          )}

          {/* Real-time Work Stages Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 1. Original Image View with Masked Area Overlay */}
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                  1. Gambar Asli & Area Masking
                </span>
                <button
                  onClick={() => setIsMaskModalOpen(true)}
                  className="text-xs text-[--color-brand] hover:underline flex items-center gap-1 font-medium"
                >
                  <Paintbrush size={12} /> {hasMask ? 'Ubah Masking' : 'Beri Masking Objek'}
                </button>
              </div>
              <div className="relative inline-block overflow-hidden rounded border border-[--color-border] bg-[--color-surface-2]">
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Original"
                  onLoad={onImgLoad}
                  className="block max-h-[360px] w-auto select-none"
                />
                <canvas
                  ref={origOverlayCanvasRef}
                  className={`absolute inset-0 block h-full w-full pointer-events-none ${hasMask ? 'opacity-80' : 'hidden'}`}
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
                <div className="relative inline-block">
                  <canvas ref={workingCanvasRef} className="block max-h-[360px] max-w-full w-auto border border-dashed border-gray-400" />
                  {showSeams && (
                    <canvas ref={seamsCanvasRef} className="absolute inset-0 block w-full h-full pointer-events-none" />
                  )}
                </div>
              </div>
            </div>

            {/* 3. Live Mathematical Energy Map Canvas */}
            {showEnergyMap && (
              <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2 lg:col-span-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3] flex items-center gap-1.5">
                    <Activity size={14} className="text-[--color-brand]" />
                    3. Dual-Gradient Energy Map (Visualisasi Matriks Energi Piksel)
                  </span>
                  <span className="text-[11px] text-[--color-text-3]">
                    Area hitam = energi rendah (kandidat potong) | Area putih = energi tinggi (dilindungi)
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

          {/* Simple Masking Modal */}
          {isMaskModalOpen && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={(e) => e.target === e.currentTarget && setIsMaskModalOpen(false)}>
              <div className="relative w-[92%] max-w-[700px] rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 shadow-2xl overflow-hidden border border-gray-200 dark:border-slate-700">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                      <Paintbrush size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold leading-tight">Masking Objek</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{originalSize ? `${originalSize.w} × ${originalSize.h} px` : ''}</p>
                    </div>
                  </div>
                  <button onClick={() => setIsMaskModalOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-gray-200">
                    <X size={18} />
                  </button>
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-3">
                  <p className="text-xs text-gray-600 dark:text-gray-400">Pilih alat seleksi lalu tandai area objek yang ingin dilindungi atau dihapus.</p>

                  {/* Mode & Tools Selector */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60 p-2.5">
                    <div className="flex items-center gap-1 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1">
                      <button
                        type="button"
                        onClick={() => setMaskTool('brush')}
                        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                          maskTool === 'brush'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        <Paintbrush size={13} /> Kuas
                      </button>
                      <button
                        type="button"
                        onClick={() => setMaskTool('wand')}
                        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                          maskTool === 'wand'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        <Wand2 size={13} /> Magic Wand
                      </button>
                    </div>

                    {maskTool === 'brush' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Kuas:</span>
                        <input
                          type="range"
                          min="6"
                          max="80"
                          value={brushSize}
                          onChange={(e) => setBrushSize(Number(e.target.value))}
                          className="h-1.5 w-24 sm:w-28 accent-blue-600"
                        />
                        <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 w-8">{brushSize}px</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Toleransi (0-150):</span>
                          <input
                            type="range"
                            min="0"
                            max="150"
                            value={tolerance}
                            onChange={(e) => setTolerance(Number(e.target.value))}
                            className="h-1.5 w-24 sm:w-28 accent-blue-600"
                          />
                          <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 w-6">{tolerance}</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleUndoSelection}
                          disabled={history.length === 0}
                          className="rounded bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          ↩ Undo
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Preview Canvas */}
                  <div className="relative flex justify-center rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 p-2 overflow-hidden min-h-[300px] max-h-[65vh]">
                    <div className="relative inline-flex items-center justify-center">
                      <img
                        ref={(el) => {
                          modalImgRef.current = el
                          if (el && isMaskModalOpen) {
                            el.onload = () => {
                              if (modalCanvasRef.current) {
                                const canvas = modalCanvasRef.current
                                canvas.width = el.naturalWidth
                                canvas.height = el.naturalHeight
                                const ctx = canvas.getContext('2d')
                                ctx.clearRect(0, 0, canvas.width, canvas.height)
                                if (maskCanvasElement) ctx.drawImage(maskCanvasElement, 0, 0)
                              }
                            }
                            if (el.complete && el.naturalWidth > 0) el.onload()
                          }
                        }}
                        src={imageSrc}
                        alt="Mask Target"
                        className="block max-h-[60vh] max-w-full rounded pointer-events-none"
                      />
                      <canvas
                        ref={modalCanvasRef}
                        onMouseDown={handleModalCanvasMouseDown}
                        onMouseMove={paintModal}
                        onMouseUp={stopModalPaint}
                        onMouseLeave={stopModalPaint}
                        className="absolute top-0 left-0 pointer-events-auto opacity-80 rounded cursor-crosshair"
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                  <button onClick={clearModalMask} className="text-xs text-red-500 hover:underline font-semibold">
                    <Trash2 size={12} className="inline mr-1" />Hapus Tanda
                  </button>
                  <button
                    onClick={saveModalMask}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <Check size={14} className="inline mr-1" />Selesai & Terapkan
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  )
}
