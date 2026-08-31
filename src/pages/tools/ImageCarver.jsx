import { useState, useRef, useEffect } from 'react'
import {
  Shrink, Trash2, Download, Eye, Sparkles,
  MousePointer, RotateCcw, Activity, Sliders, Maximize2, X,
  ZoomIn, ZoomOut, Paintbrush, Check, AlertTriangle, StopCircle
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
  const [originalSize, setOriginalSize] = useState(null)
  const [workingSize, setWorkingSize] = useState(null)
  const [resizedImgSrc, setResizedImgSrc] = useState(null)

  // Sliders default to 80% width and 90% height
  const [toWidthScale, setToWidthScale] = useState(80)
  const [toHeightScale, setToHeightScale] = useState(90)
  const [useHigherQuality, setUseHigherQuality] = useState(false)
  const [showEnergyMap, setShowEnergyMap] = useState(true)
  const [showSeams, setShowSeams] = useState(true)
  const [isResizing, setIsResizing] = useState(false)
  const [progress, setProgress] = useState(0)

  // Pop-up Mask Modal state
  const [isMaskModalOpen, setIsMaskModalOpen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [brushSize, setBrushSize] = useState(24)
  const [hasMask, setHasMask] = useState(false)
  const [maskCanvasElement, setMaskCanvasElement] = useState(null)
  const [error, setError] = useState('')

  const imgRef = useRef(null)
  const origOverlayCanvasRef = useRef(null)
  const workingCanvasRef = useRef(null)
  const energyCanvasRef = useRef(null)
  const seamsCanvasRef = useRef(null)

  // Modal drawing refs
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
    isCancelledRef.current = true
    setIsResizing(false)
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
    renderOriginalOverlayMask()
  }

  // Render mask on the original image card overlay
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

  // When modal opens, sync mask canvas size to image natural resolution
  useEffect(() => {
    if (isMaskModalOpen && modalCanvasRef.current && imgRef.current) {
      const canvas = modalCanvasRef.current
      canvas.width = imgRef.current.naturalWidth
      canvas.height = imgRef.current.naturalHeight
      const ctx = canvas.getContext('2d')
      if (maskCanvasElement) {
        ctx.drawImage(maskCanvasElement, 0, 0)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
  }, [isMaskModalOpen])

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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  onChange={(e) => setToWidthScale(Number(e.target.value))}
                  className="w-full"
                />
              </div>

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
                  onChange={(e) => setToHeightScale(Number(e.target.value))}
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
                  Buka Kanvas Masking (Pop-up & Zoom)
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-[--color-brand]">
                  <Activity size={16} className="animate-pulse" />
                  <span>Memproses Seam Carving… ({progress}%)</span>
                </div>
                <button
                  onClick={cancelCarving}
                  className="flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                >
                  <StopCircle size={14} /> Batal / Hentikan Proses
                </button>
              </div>
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
                {/* Live Mask Overlay Canvas on Original Image Card */}
                <canvas
                  ref={origOverlayCanvasRef}
                  className="absolute inset-0 block h-full w-full pointer-events-none opacity-80"
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

          {/* Pop-up Fullscreen Masking & Zoom Modal */}
          {isMaskModalOpen && (
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
                        Kanvas Masking Objek (Hapus Objek Tertarget)
                      </h3>
                      <p className="text-[11px] text-[--color-text-3]">
                        Warnai area merah pada objek yang ingin dihilangkan dari foto
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
                      onClick={() => setIsMaskModalOpen(false)}
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
                      onClick={clearModalMask}
                      className="flex items-center gap-1 text-xs text-[--color-danger] hover:underline"
                    >
                      <Trash2 size={13} /> Bersihkan Semua Mask
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
