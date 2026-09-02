import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Shrink, Download, Sparkles, Activity, Maximize2, X,
  Paintbrush, Check, StopCircle, Trash2,
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

const defaultWidthScale = 50
const defaultHeightScale = 70
const minScale = 1
const maxScale = 100

export default function ImageCarver() {
  const [useNaturalSize, setUseNaturalSize] = useState(false)
  const [imageSrc, setImageSrc] = useState(null)
  const [file, setFile] = useState(null)
  const [resizedImgSrc, setResizedImgSrc] = useState(null)
  const [energyMap, setEnergyMap] = useState(null)
  const [originalImgSize, setOriginalImgSize] = useState(null)
  const [originalImgViewSize, setOriginalImgViewSize] = useState(null)
  const [workingImgSize, setWorkingImgSize] = useState(null)
  const [seam, setSeam] = useState(null)
  const [isResizing, setIsResizing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [maskImgData, setMaskImgData] = useState(null)
  const [maskRevision, setMaskRevision] = useState(0)
  const [toWidthScale, setToWidthScale] = useState(defaultWidthScale)
  const [toHeightScale, setToHeightScale] = useState(defaultHeightScale)
  const [error, setError] = useState('')
  const [isMaskModalOpen, setIsMaskModalOpen] = useState(false)
  const [brushSize, setBrushSize] = useState(16)
  const [showEnergyMap, setShowEnergyMap] = useState(true)
  const [showSeams, setShowSeams] = useState(true)

  const imgRef = useRef(null)
  const canvasRef = useRef(null)
  const modalImgRef = useRef(null)
  const isCancelledRef = useRef(false)

  useIncomingFile((f) => {
    const url = URL.createObjectURL(f)
    setImageSrc(url)
    setFile(f)
    onReset()
  })

  const onReset = () => {
    setResizedImgSrc(null)
    setSeam(null)
    setWorkingImgSize(null)
    setEnergyMap(null)
    setProgress(0)
    setError('')
    setOriginalImgViewSize(null)
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
    try {
      const dataUrl = canvas.toDataURL('image/png')
      setResizedImgSrc(dataUrl)
      setIsResizing(false)
    } catch {
      canvas.toBlob((blob) => {
        if (!blob) return
        setResizedImgSrc(URL.createObjectURL(blob))
        setIsResizing(false)
      }, 'image/png')
    }
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

    // Build a tight ImageData frame matching current (w, h) to guarantee 100% accurate rendering without row stride mismatch
    const frame = ctx.createImageData(w, h)
    for (let y = 0; y < h; y += 1) {
      const srcStart = y * img.width * 4
      const srcEnd = srcStart + w * 4
      const dstStart = y * w * 4
      frame.data.set(img.data.subarray(srcStart, srcEnd), dstStart)
    }

    // Ensure display frame pixels stay opaque so masked areas don't render black patches during carving
    for (let i = 3; i < frame.data.length; i += 4) {
      if (frame.data[i] === ALPHA_DELETE_THRESHOLD) {
        frame.data[i] = 255
      }
    }

    ctx.putImageData(frame, 0, 0)

    setEnergyMap(nrgMap)
    setSeam(currentSeam)
    setWorkingImgSize({ w, h })
    setProgress(step / steps)
  }, [])

  const onResize = () => {
    const srcImg = imgRef.current
    if (!srcImg) return
    const canvas = canvasRef.current
    if (!canvas) return

    onReset()
    setIsResizing(true)
    isCancelledRef.current = false

    let w = useNaturalSize ? (srcImg.naturalWidth || srcImg.width) : (srcImg.width || srcImg.naturalWidth)
    let h = useNaturalSize ? (srcImg.naturalHeight || srcImg.height) : (srcImg.height || srcImg.naturalHeight)
    const ratio = w / h

    setOriginalImgViewSize({
      w: srcImg.width || w,
      h: srcImg.height || h,
    })

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

    const toWidth = Math.floor((toWidthScale * w) / 100)
    const toHeight = Math.floor((toHeightScale * h) / 100)

    resizeImage({
      img,
      toWidth,
      toHeight,
      onIteration,
      isCancelled: () => isCancelledRef.current,
    }).then(() => {
      onFinish()
    }).catch((e) => {
      setError(`Error: ${e.message}`)
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
    setOriginalImgViewSize({
      w: imgRef.current.width,
      h: imgRef.current.height,
    })
  }

  const onMaskDrawEnd = useCallback((imgData) => {
    setMaskImgData(imgData)
  }, [])

  const onClearMask = () => {
    setMaskRevision((prev) => prev + 1)
    setMaskImgData(null)
  }

  const base = file ? stripExt(file.name) : 'image'

  // ─── Controls (File selector + Resize controls) ───
  const resizerControls = (
    <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <DropZone
          accept="image/*,.jpg,.jpeg,.png,.webp"
          onFiles={onFileSelect}
          disabled={isResizing}
          label="Choose image"
          hint="JPG, PNG, WebP"
        />
        <button
          onClick={onResize}
          disabled={isResizing || !imageSrc}
          className="flex items-center gap-2 rounded bg-[--color-brand] px-4 py-2 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-50 transition-all cursor-pointer"
        >
          <Shrink size={14} /> Resize
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-[--color-text-2]">Width</span>
          <input
            type="number"
            min={minScale}
            max={maxScale}
            value={toWidthScale}
            disabled={isResizing}
            onChange={(e) => setToWidthScale(Math.max(minScale, Math.min(maxScale, Number(e.target.value) || minScale)))}
            className="w-14 text-center rounded border border-[--color-border] bg-[--color-surface-2] px-1 py-0.5 text-[--color-text]"
          />
          <span className="text-[--color-text-3]">%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[--color-text-2]">Height</span>
          <input
            type="number"
            min={minScale}
            max={maxScale}
            value={toHeightScale}
            disabled={isResizing}
            onChange={(e) => setToHeightScale(Math.max(minScale, Math.min(maxScale, Number(e.target.value) || minScale)))}
            className="w-14 text-center rounded border border-[--color-border] bg-[--color-surface-2] px-1 py-0.5 text-[--color-text]"
          />
          <span className="text-[--color-text-3]">%</span>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={useNaturalSize} onChange={(e) => setUseNaturalSize(e.target.checked)} disabled={isResizing} />
          <span>Higher quality <span className="text-[--color-text-3]">(takes longer)</span></span>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[--color-border] pt-3 text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMaskModalOpen(true)}
            disabled={isResizing || !imageSrc}
            className="flex items-center gap-1.5 rounded border border-[--color-brand] bg-[--color-brand-light] px-3 py-1.5 font-semibold text-[--color-brand] hover:bg-[--color-brand] hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Maximize2 size={13} /> Masking
          </button>
          {maskImgData && (
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-600 dark:text-red-400">Mask Active</span>
              <button onClick={onClearMask} className="text-[--color-text-3] hover:text-[--color-danger] text-[11px] cursor-pointer">(Clear)</button>
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
  )

  // ─── Progress Bar ───
  const progressBar = isResizing ? (
    <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 font-semibold text-[--color-brand]">
          <Activity size={16} className="animate-pulse" />
          <span>Resizing image... ({Math.round(progress * 100)}%)</span>
        </div>
        <button
          onClick={cancelCarving}
          className="flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
        >
          <StopCircle size={14} /> Cancel
        </button>
      </div>
      <ProgressBar value={Math.round(progress * 100)} label={`Processing seam carving... ${Math.round(progress * 100)}%`} />
    </div>
  ) : null

  // ─── Working Image (Canvas) ───
  const workingImage = (
    <div className={`rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2 ${(resizedImgSrc || !energyMap) ? 'hidden' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
          Resized image {workingImgSize ? `(${workingImgSize.w} × ${workingImgSize.h} px)` : ''}
        </span>
        {isResizing && <span className="text-[11px] font-bold text-[--color-brand] animate-pulse">● Real-Time</span>}
      </div>
      <div className="overflow-auto rounded border border-[--color-border] bg-[--color-surface-2] p-2">
        <div className="relative inline-block">
          <canvas ref={canvasRef} className="block" />
          {showSeams && seam && workingImgSize && (
            <svg className="absolute top-0 left-0 pointer-events-none" width={workingImgSize.w} height={workingImgSize.h}>
              {seam.map(({ x, y }, i) => (
                <rect key={i} x={x} y={y} width={1} height={1} fill="rgba(239, 68, 68, 0.9)" />
              ))}
            </svg>
          )}
        </div>
      </div>
    </div>
  )

  // ─── Result Image ───
  const resultImage = workingImgSize && resizedImgSrc ? (
    <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
          Resized image ({workingImgSize.w} × {workingImgSize.h} px)
        </span>
      </div>
      <img src={resizedImgSrc} alt="Resized" className="block max-w-full h-auto rounded border border-[--color-border]" />
      <div className="flex items-center justify-between rounded-lg border border-[--color-success-light] bg-[--color-success-light] p-3">
        <p className="text-sm font-semibold text-[--color-success] flex items-center gap-1.5">
          <Sparkles size={16} /> Resize Complete!
        </p>
        <div className="flex items-center gap-2">
          <button onClick={onReset} className="rounded p-1 text-[--color-text-3] hover:bg-[--color-surface-3] cursor-pointer">✕</button>
          <a href={resizedImgSrc} download={`${base}_carved.png`}
            className="flex items-center gap-2 rounded bg-[--color-success] px-4 py-2 text-sm font-medium text-white hover:opacity-90 no-underline cursor-pointer">
            <Download size={16} /> Download
          </a>
        </div>
      </div>
    </div>
  ) : null

  // ─── Energy Map Canvas ───
  const debugEnergyMap = showEnergyMap && workingImgSize ? (
    <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
      <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3] flex items-center gap-1.5">
        <Activity size={14} className="text-[--color-brand]" /> Energy Map
      </span>
      <div className="flex justify-center overflow-auto rounded border border-[--color-border] bg-black/90 p-2">
        <EnergyMapCanvas energyMap={energyMap} width={workingImgSize.w} height={workingImgSize.h} />
      </div>
    </div>
  ) : null

  // ─── Original Image ───
  const originalImage = imageSrc ? (
    <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
          Original image {originalImgSize ? `(${originalImgSize.w} × ${originalImgSize.h} px)` : ''}
        </span>
        <div className="flex items-center gap-2 text-[10px] text-[--color-text-3]">
          <span>👆 Mask to remove</span>
          <button onClick={() => setIsMaskModalOpen(true)} disabled={isResizing}
            className="text-[--color-brand] hover:underline font-medium disabled:opacity-50 cursor-pointer">
            <Paintbrush size={11} className="inline" /> {maskImgData ? 'Edit Mask' : 'Mask'}
          </button>
        </div>
      </div>
      <div className="relative inline-block overflow-hidden rounded border border-[--color-border] bg-[--color-surface-2]">
        <img ref={imgRef} src={imageSrc} alt="Original" onLoad={handleImgLoad}
          className="block max-h-[360px] w-auto select-none" />
      </div>
    </div>
  ) : null

  // ─── Error ───
  const errorBar = error ? (
    <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger]">{error}</p>
  ) : null

  return (
    <ToolShell
      title="Image Carver (Content-Aware Seam Carving)"
      description="Content-aware image resizer based on trekhleb/js-image-carver reference implementation. Shrink image dimensions while retaining key object proportions."
    >
      {resizerControls}
      {progressBar}
      {errorBar}
      {workingImage}
      {resultImage}
      {debugEnergyMap}
      {originalImage}

      {/* Mask Modal */}
      {isMaskModalOpen && imageSrc && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={(e) => e.target === e.currentTarget && setIsMaskModalOpen(false)}>
          <div className="relative w-[92%] max-w-[700px] rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 shadow-2xl overflow-hidden border border-gray-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Paintbrush size={16} />
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight">Mask Object to Remove</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Draw over areas you want deleted first during resize</p>
                </div>
              </div>
              <button onClick={() => setIsMaskModalOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-600 dark:text-gray-400">Paint red over target objects. Marked areas will have lowest energy and be carved first.</p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Brush:</span>
                <input type="range" min="4" max="60" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="flex-1 h-1.5 accent-blue-600 cursor-pointer" />
                <span className="text-[11px] font-mono text-gray-500 w-8">{brushSize}px</span>
              </div>
              <div className="relative flex justify-center rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 p-2 overflow-hidden min-h-[300px] max-h-[65vh]">
                <div className="relative inline-flex items-center justify-center">
                  <img ref={modalImgRef} src={imageSrc} alt="Mask Target"
                    className="block max-h-[60vh] max-w-full rounded pointer-events-none" />
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
              <button onClick={onClearMask} className="text-xs text-red-500 hover:underline font-semibold cursor-pointer">
                <Trash2 size={12} className="inline mr-1" />Clear Mask
              </button>
              <button onClick={() => setIsMaskModalOpen(false)}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors cursor-pointer">
                <Check size={14} className="inline mr-1" />Done
              </button>
            </div>
          </div>
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
        setPixel(imgData, { x, y }, [normalized[y][x], normalized[y][x], normalized[y][x], 255])
      }
    }
    ctx.putImageData(imgData, 0, 0)
  }, [energyMap, width, height])
  return <canvas ref={ref} className="block max-h-[300px] w-auto" />
}

/* ─── Mask Canvas ─── */
function MaskCanvas({ width, height, brushSize, revision, onDrawEnd, disabled }) {
  const canvasRef = useRef(null)
  const [isPainting, setIsPainting] = useState(false)
  const [mousePos, setMousePos] = useState(null)

  const getCoords = useCallback((e) => {
    const c = canvasRef.current
    if (!c) return null
    const rect = c.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const startPaint = useCallback((e) => {
    if (disabled) return
    const coord = getCoords(e)
    if (coord) { setMousePos(coord); setIsPainting(true) }
  }, [disabled, getCoords])

  const paint = useCallback((e) => {
    if (!isPainting || !canvasRef.current || disabled) return
    const newPos = getCoords(e)
    if (mousePos && newPos) {
      const ctx = canvasRef.current.getContext('2d')
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'
      ctx.lineJoin = 'round'
      ctx.lineWidth = brushSize
      ctx.beginPath()
      ctx.moveTo(mousePos.x, mousePos.y)
      ctx.lineTo(newPos.x, newPos.y)
      ctx.closePath()
      ctx.stroke()
      setMousePos(newPos)
    }
  }, [isPainting, mousePos, brushSize, disabled, getCoords])

  const exitPaint = useCallback(() => {
    if (canvasRef.current && onDrawEnd) {
      const ctx = canvasRef.current.getContext('2d')
      onDrawEnd(ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height))
    }
    setIsPainting(false)
    setMousePos(null)
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
    <canvas ref={canvasRef} width={width} height={height}
      className="absolute top-0 left-0 pointer-events-auto opacity-80 rounded"
      style={{ width: '100%', height: '100%', touchAction: 'none' }} />
  )
}
