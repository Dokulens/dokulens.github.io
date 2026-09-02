import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Shrink, Download, Sparkles, Activity, Sliders, Maximize2, X,
  Paintbrush, Check, AlertTriangle, StopCircle, Trash2,
  ZoomIn, ZoomOut, Eye, EyeOff, MousePointer
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
import { stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

const defaultWidthScale = 80
const defaultHeightScale = 90

export default function ImageCarver() {
  const [imageSrc, setImageSrc] = useState(null)
  useIncomingFile((f) => {
    const url = URL.createObjectURL(f)
    setImageSrc(url)
    setFile(f)
  })
  const [file, setFile] = useState(null)
  const [originalImgSize, setOriginalImgSize] = useState(null)
  const [workingImgSize, setWorkingImgSize] = useState(null)
  const [resizedImgSrc, setResizedImgSrc] = useState(null)
  const [energyMap, setEnergyMap] = useState(null)
  const [seam, setSeam] = useState(null)
  const [toWidthScale, setToWidthScale] = useState(defaultWidthScale)
  const [toHeightScale, setToHeightScale] = useState(defaultHeightScale)
  const [useNaturalSize, setUseNaturalSize] = useState(false)
  const [showEnergyMap, setShowEnergyMap] = useState(true)
  const [showSeams, setShowSeams] = useState(true)
  const [isResizing, setIsResizing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const [isMaskModalOpen, setIsMaskModalOpen] = useState(false)
  const [brushSize, setBrushSize] = useState(16)
  const [maskImgData, setMaskImgData] = useState(null)
  const [maskRevision, setMaskRevision] = useState(0)

  const imgRef = useRef(null)
  const canvasRef = useRef(null)
  const modalImgRef = useRef(null)
  const modalCanvasRef = useRef(null)
  const isPaintingRef = useRef(false)
  const isCancelledRef = useRef(false)

  const onReset = () => {
    setResizedImgSrc(null)
    setWorkingImgSize(null)
    setEnergyMap(null)
    setSeam(null)
    setProgress(0)
    setError('')
  }

  const onFileSelect = (files) => {
    if (!files || !files.length) return
    onReset()
    setMaskImgData(null)
    setMaskRevision(0)
    const url = URL.createObjectURL(files[0])
    setImageSrc(url)
    setFile(files[0])
  }

  const onFinish = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      setResizedImgSrc(URL.createObjectURL(blob))
      setIsResizing(false)
    }, 'image/png')
  }, [])

  const applyMask = useCallback((img) => {
    if (!maskImgData) return
    const wRatio = maskImgData.width / img.width
    const hRatio = maskImgData.height / img.height
    for (let y = 0; y < img.height; y += 1) {
      for (let x = 0; x < img.width; x += 1) {
        const maskX = Math.floor(x * wRatio)
        const maskY = Math.floor(y * hRatio)
        const maskIdx = (maskY * maskImgData.width + maskX) * 4
        const mA = maskImgData.data[maskIdx + 3]
        if (mA) {
          const [iR, iG, iB] = getPixel(img, { x, y })
          setPixel(img, { x, y }, [iR, iG, iB, ALPHA_DELETE_THRESHOLD])
        }
      }
    }
  }, [maskImgData])

  const onIteration = useCallback(async (args) => {
    const {
      seam: currentSeam,
      img,
      energyMap: nrgMap,
      size: { w, h },
      step,
      steps,
    } = args

    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.putImageData(img, 0, 0, 0, 0, w, h)

    setEnergyMap(nrgMap)
    setSeam(currentSeam)
    setWorkingImgSize({ w, h })
    setProgress(Math.round((step / steps) * 100))
  }, [])

  const onResize = () => {
    const srcImg = imgRef.current
    if (!srcImg) return
    const canvas = canvasRef.current
    if (!canvas) return

    onReset()
    setIsResizing(true)
    isCancelledRef.current = false

    let w = useNaturalSize ? srcImg.naturalWidth : srcImg.width
    let h = useNaturalSize ? srcImg.naturalHeight : srcImg.height
    const ratio = w / h

    if (w > MAX_WIDTH_LIMIT) {
      w = MAX_WIDTH_LIMIT
      h = Math.floor(w / ratio)
    }
    if (h > MAX_HEIGHT_LIMIT) {
      h = MAX_HEIGHT_LIMIT
      w = Math.floor(h * ratio)
    }

    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(srcImg, 0, 0, w, h)
    const img = ctx.getImageData(0, 0, w, h)

    applyMask(img)

    const toWidth = Math.max(10, Math.floor((toWidthScale * w) / 100))
    const toHeight = Math.max(10, Math.floor((toHeightScale * h) / 100))

    resizeImage({
      img,
      toWidth,
      toHeight,
      onIteration,
      isCancelled: () => isCancelledRef.current,
      hasMask: !!maskImgData,
    }).then(() => {
      onFinish()
    }).catch((e) => {
      setError(`Gagal: ${e.message}`)
      setIsResizing(false)
    })
  }

  const cancelCarving = () => {
    isCancelledRef.current = true
    setIsResizing(false)
    setProgress(0)
  }

  const handleImgLoad = () => {
    if (!imgRef.current) return
    setOriginalImgSize({
      w: imgRef.current.naturalWidth,
      h: imgRef.current.naturalHeight,
    })
  }

  const onMaskDrawEnd = useCallback((imgData) => {
    setMaskImgData(imgData)
  }, [])

  const onClearMask = () => {
    setMaskRevision(maskRevision + 1)
    setMaskImgData(null)
  }

  const base = file ? stripExt(file.name) : 'image'

  return (
    <ToolShell
      title="Image Carver (Content-Aware Seam Carving)"
      description="Implementasi algoritma Seam Carving (terinspirasi dari trekhleb/js-image-carver). Kecilkan resolusi gambar tanpa merusak proporsi objek utama & hapus objek dengan masking."
    >
      <DropZone
        accept="image/*,.jpg,.jpeg,.png,.webp"
        onFiles={onFileSelect}
        label="Pilih foto untuk di-carve"
        hint="JPG, PNG, WebP — Content-Aware Image Resizing"
      />

      {imageSrc && (
        <div className="space-y-4 animate-fade-in">
          {/* Controls */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[--color-border] pb-3 text-xs">
              <div className="flex items-center gap-2">
                <Sliders size={15} className="text-[--color-brand]" />
                <span className="font-bold text-[--color-text]">Ukuran Target:</span>
                <span className="text-[--color-text-2]">
                  {originalImgSize
                    ? `${Math.round((toWidthScale * originalImgSize.w) / 100)} × ${Math.round((toHeightScale * originalImgSize.h) / 100)} px (${toWidthScale}% × ${toHeightScale}%)`
                    : `${toWidthScale}% × ${toHeightScale}%`}
                </span>
                {originalImgSize && (
                  <span className="text-[--color-text-3]">
                    (Asli: {originalImgSize.w} × {originalImgSize.h} px)
                  </span>
                )}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-[--color-text-2] cursor-pointer">
                <input
                  type="checkbox"
                  checked={useNaturalSize}
                  onChange={(e) => setUseNaturalSize(e.target.checked)}
                  disabled={isResizing}
                />
                <span>Kualitas Tinggi</span>
              </label>
            </div>

            {useNaturalSize && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span><strong>Peringatan:</strong> Mode kualitas tinggi memproses seluruh piksel asli. Proses lebih berat.</span>
              </div>
            )}

            {/* Sliders */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-end">
              <div>
                <div className="flex justify-between items-center mb-1 text-xs">
                  <span className="font-semibold text-[--color-text-2]">Lebar</span>
                  <span className="font-bold text-[--color-brand]">{toWidthScale}%</span>
                </div>
                <input
                  type="range" min="1" max="100" value={toWidthScale}
                  disabled={isResizing}
                  onChange={(e) => setToWidthScale(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1 text-xs">
                  <span className="font-semibold text-[--color-text-2]">Tinggi</span>
                  <span className="font-bold text-[--color-brand]">{toHeightScale}%</span>
                </div>
                <input
                  type="range" min="1" max="100" value={toHeightScale}
                  disabled={isResizing}
                  onChange={(e) => setToHeightScale(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {/* Mask + Options */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[--color-border] pt-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMaskModalOpen(true)}
                  disabled={isResizing}
                  className="flex items-center gap-1.5 rounded border border-[--color-brand] bg-[--color-brand-light] px-3 py-1.5 font-semibold text-[--color-brand] hover:bg-[--color-brand] hover:text-white transition-colors disabled:opacity-50"
                >
                  <Maximize2 size={13} />
                  Masking Objek
                </button>
                {maskImgData && (
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
                      Mask Aktif
                    </span>
                    <button onClick={onClearMask} className="text-xs text-[--color-text-3] hover:text-[--color-danger]">
                      (Hapus)
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 text-[--color-text-2]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={showSeams} onChange={(e) => setShowSeams(e.target.checked)} />
                  <span>Seam</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={showEnergyMap} onChange={(e) => setShowEnergyMap(e.target.checked)} />
                  <span>Energy Map</span>
                </label>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {!resizedImgSrc && !isResizing && (
            <button
              onClick={onResize}
              className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] transition-all active:scale-[0.99]"
            >
              <Shrink size={16} />
              Mulai Content-Aware Resize ({toWidthScale}% × {toHeightScale}%)
            </button>
          )}

          {isResizing && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-semibold text-[--color-brand]">
                  <Activity size={16} className="animate-pulse" />
                  <span>Memproses Seam Carving... ({progress}%)</span>
                </div>
                <button
                  onClick={cancelCarving}
                  className="flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                >
                  <StopCircle size={14} /> Batal
                </button>
              </div>
              <ProgressBar value={progress} label={`Menghitung energi & memotong seams... ${progress}%`} />
            </div>
          )}

          {error && (
            <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger]">
              {error}
            </p>
          )}

          {/* Working / Result Canvas */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                {resizedImgSrc ? 'Hasil Resize' : 'Proses Carving'} {workingImgSize ? `(${workingImgSize.w} × ${workingImgSize.h} px)` : ''}
              </span>
              {isResizing && (
                <span className="text-[11px] font-bold text-[--color-brand] animate-pulse">● Real-Time</span>
              )}
            </div>
            <div className="flex justify-center overflow-auto rounded border border-[--color-border] bg-[--color-surface-2] p-2 min-h-[200px]">
              <div className="relative inline-block">
                <canvas ref={canvasRef} className="block max-h-[400px] w-auto" />
                {showSeams && seam && workingImgSize && !resizedImgSrc && (
                  <svg
                    className="absolute top-0 left-0 pointer-events-none"
                    width={workingImgSize.w}
                    height={workingImgSize.h}
                  >
                    {seam.map(({ x, y }, i) => (
                      <rect key={i} x={x} y={y} width={1} height={1} fill="rgba(239, 68, 68, 0.9)" />
                    ))}
                  </svg>
                )}
              </div>
            </div>

              {/* Download */}
              {resizedImgSrc && (
                <div className="flex items-center justify-between rounded-lg border border-[--color-success-light] bg-[--color-success-light] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[--color-success] flex items-center gap-1.5">
                      <Sparkles size={16} /> Resize Berhasil!
                    </p>
                    <p className="mt-0.5 text-sm text-[--color-text-2]">
                      {workingImgSize?.w} × {workingImgSize?.h} px
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={onReset} className="rounded p-1 text-[--color-text-3] hover:bg-[--color-surface-3]">✕</button>
                    <a
                      href={resizedImgSrc}
                      download={`${base}_carved.png`}
                      className="flex items-center gap-2 rounded bg-[--color-success] px-4 py-2 text-sm font-medium text-white hover:opacity-90 no-underline"
                    >
                      <Download size={16} /> Download
                    </a>
                  </div>
                </div>
              )}
            </div>

          {/* Energy Map */}
          {showEnergyMap && energyMap && workingImgSize && !resizedImgSrc && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3] flex items-center gap-1.5">
                <Activity size={14} className="text-[--color-brand]" />
                Energy Map
              </span>
              <div className="flex justify-center overflow-auto rounded border border-[--color-border] bg-black/90 p-2">
                <EnergyMapCanvas energyMap={energyMap} width={workingImgSize.w} height={workingImgSize.h} />
              </div>
            </div>
          )}

          {/* Original Image */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                Gambar Asli {originalImgSize ? `(${originalImgSize.w} × ${originalImgSize.h} px)` : ''}
              </span>
              <div className="flex items-center gap-2">
                {maskImgData && (
                  <span className="rounded bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
                    Mask Aktif
                  </span>
                )}
                <button
                  onClick={() => setIsMaskModalOpen(true)}
                  disabled={isResizing}
                  className="text-xs text-[--color-brand] hover:underline flex items-center gap-1 font-medium disabled:opacity-50"
                >
                  <Paintbrush size={12} /> {maskImgData ? 'Ubah Mask' : 'Masking'}
                </button>
              </div>
            </div>
            <div className="relative inline-block overflow-hidden rounded border border-[--color-border] bg-[--color-surface-2]">
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Original"
                onLoad={handleImgLoad}
                className="block max-h-[360px] w-auto select-none"
              />
            </div>
          </div>

          {/* Mask Modal */}
          {isMaskModalOpen && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={(e) => e.target === e.currentTarget && setIsMaskModalOpen(false)}>
              <div className="relative w-[92%] max-w-[700px] rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 shadow-2xl overflow-hidden border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                      <Paintbrush size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold leading-tight">Masking Objek</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Gambar area yang ingin dihapus</p>
                    </div>
                  </div>
                  <button onClick={() => setIsMaskModalOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700">
                    <X size={18} />
                  </button>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <p className="text-xs text-gray-600 dark:text-gray-400">Warnai area objek yang ingin dihapus. Area merah akan direkonstruksi oleh algoritma.</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Kuas:</span>
                    <input type="range" min="4" max="60" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="flex-1 h-1.5 accent-blue-600" />
                    <span className="text-[11px] font-mono text-gray-500 w-8">{brushSize}px</span>
                  </div>
                  <div className="relative flex justify-center rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 p-2 overflow-hidden min-h-[300px] max-h-[65vh]">
                    <div className="relative inline-flex items-center justify-center">
                      <img
                        ref={modalImgRef}
                        src={imageSrc}
                        alt="Mask Target"
                        className="block max-h-[60vh] max-w-full rounded pointer-events-none"
                      />
                      <MaskCanvas
                        width={modalImgRef.current?.naturalWidth || 400}
                        height={modalImgRef.current?.naturalHeight || 300}
                        brushSize={brushSize}
                        revision={maskRevision}
                        onDrawEnd={onMaskDrawEnd}
                        disabled={isResizing}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                  <button onClick={onClearMask} className="text-xs text-red-500 hover:underline font-semibold">
                    <Trash2 size={12} className="inline mr-1" />Hapus
                  </button>
                  <button
                    onClick={() => setIsMaskModalOpen(false)}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
                  >
                    <Check size={14} className="inline mr-1" />Selesai
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

/* ─── Energy Map Canvas ─── */
function EnergyMapCanvas({ energyMap, width, height }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !energyMap) return
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    const imgData = ctx.createImageData(width, height)
    const normalized = normalizeEnergyMap(energyMap, width, height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const val = normalized[y][x]
        setPixel(imgData, { x, y }, [val, val, val, 255])
      }
    }
    ctx.putImageData(imgData, 0, 0)
  }, [energyMap, width, height])

  return <canvas ref={ref} className="block max-h-[300px] w-auto" />
}

/* ─── Mask Canvas (inline component matching trekhleb/Mask.tsx) ─── */
function MaskCanvas({ width, height, brushSize, revision, onDrawEnd, disabled }) {
  const canvasRef = useRef(null)
  const [isPainting, setIsPainting] = useState(false)
  const [mousePosition, setMousePosition] = useState(null)

  const getCoordinates = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return { x: e.clientX - canvas.getBoundingClientRect().left, y: e.clientY - canvas.getBoundingClientRect().top }
  }, [])

  const startPaint = useCallback((e) => {
    if (disabled) return
    const coord = getCoordinates(e)
    if (coord) { setMousePosition(coord); setIsPainting(true) }
  }, [disabled, getCoordinates])

  const paint = useCallback((e) => {
    if (!isPainting || !canvasRef.current || disabled) return
    const newPos = getCoordinates(e)
    if (mousePosition && newPos) {
      const ctx = canvasRef.current.getContext('2d')
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'
      ctx.lineJoin = 'round'
      ctx.lineWidth = brushSize
      ctx.beginPath()
      ctx.moveTo(mousePosition.x, mousePosition.y)
      ctx.lineTo(newPos.x, newPos.y)
      ctx.closePath()
      ctx.stroke()
      setMousePosition(newPos)
    }
  }, [isPainting, mousePosition, brushSize, disabled, getCoordinates])

  const exitPaint = useCallback(() => {
    if (canvasRef.current && onDrawEnd) {
      const ctx = canvasRef.current.getContext('2d')
      onDrawEnd(ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height))
    }
    setIsPainting(false)
    setMousePosition(null)
  }, [onDrawEnd])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    c.addEventListener('mousedown', startPaint)
    c.addEventListener('mousemove', paint)
    c.addEventListener('mouseup', exitPaint)
    c.addEventListener('mouseleave', exitPaint)
    c.addEventListener('touchstart', startPaint)
    c.addEventListener('touchmove', paint)
    c.addEventListener('touchend', exitPaint)
    c.addEventListener('touchcancel', exitPaint)
    return () => {
      c.removeEventListener('mousedown', startPaint)
      c.removeEventListener('mousemove', paint)
      c.removeEventListener('mouseup', exitPaint)
      c.removeEventListener('mouseleave', exitPaint)
      c.removeEventListener('touchstart', startPaint)
      c.removeEventListener('touchmove', paint)
      c.removeEventListener('touchend', exitPaint)
      c.removeEventListener('touchcancel', exitPaint)
    }
  }, [startPaint, paint, exitPaint])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
  }, [revision])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute top-0 left-0 pointer-events-auto opacity-80 rounded"
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
    />
  )
}
