import { useState, useRef, useEffect } from 'react'
import {
  Crop, RotateCw, RotateCcw, FlipHorizontal, FlipVertical,
  Download, Loader2, Sparkles, Check, Sliders, RefreshCw
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import { fmtBytes, stripExt } from '../../utils/helpers'

const ASPECT_RATIOS = [
  { id: 'free', label: 'Bebas (Free)', ratio: null },
  { id: '1:1', label: '1:1 (Persegi)', ratio: 1 },
  { id: '4:3', label: '4:3 (Standar)', ratio: 4 / 3 },
  { id: '16:9', label: '16:9 (Widescreen)', ratio: 16 / 9 },
  { id: '3:2', label: '3:2 (Foto 35mm)', ratio: 3 / 2 },
  { id: '9:16', label: '9:16 (Story/Reels)', ratio: 9 / 16 },
]

export default function ImageCropRotate() {
  const [file, setFile] = useState(null)
  const [imageSrc, setImageSrc] = useState(null)
  const [origDims, setOrigDims] = useState({ w: 0, h: 0 })

  // Transform states
  const [rotation, setRotation] = useState(0) // degrees (0, 90, 180, 270)
  const [fineAngle, setFineAngle] = useState(0) // -45 to 45
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [aspectId, setAspectId] = useState('free')

  // Crop Box state in percentage (0 to 100)
  const [cropBox, setCropBox] = useState({ x: 10, y: 10, w: 80, h: 80 })
  const [exportFormat, setExportFormat] = useState('png') // 'png' | 'jpg' | 'webp'

  const [processing, setProcessing] = useState(false)
  const [resultBlob, setResultBlob] = useState(null)
  const [error, setError] = useState('')

  const containerRef = useRef(null)
  const imgRef = useRef(null)
  const isDraggingRef = useRef(null) // 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w'
  const dragStartRef = useRef({ x: 0, y: 0, box: { ...cropBox } })

  const handleFile = ([f]) => {
    setFile(f)
    setResultBlob(null)
    setError('')
    setRotation(0)
    setFineAngle(0)
    setFlipH(false)
    setFlipV(false)
    setCropBox({ x: 10, y: 10, w: 80, h: 80 })

    const url = URL.createObjectURL(f)
    setImageSrc(url)

    const img = new Image()
    img.onload = () => {
      setOrigDims({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.src = url
  }

  // Adjust crop box when aspect ratio preset changes
  const applyAspect = (id) => {
    setAspectId(id)
    const selected = ASPECT_RATIOS.find((a) => a.id === id)
    if (!selected || !selected.ratio || !origDims.w || !origDims.h) return

    const targetRatio = selected.ratio // target width / target height
    const currentImgRatio = origDims.w / origDims.h

    let newW = 70
    let newH = (newW / targetRatio) * currentImgRatio

    if (newH > 80) {
      newH = 80
      newW = newH * targetRatio * (1 / currentImgRatio)
    }

    setCropBox({
      x: Math.max(0, (100 - newW) / 2),
      y: Math.max(0, (100 - newH) / 2),
      w: Math.min(100, newW),
      h: Math.min(100, newH),
    })
  }

  // Drag handles for crop box
  const startDrag = (e, handle) => {
    e.stopPropagation()
    isDraggingRef.current = handle
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      box: { ...cropBox },
    }

    const onMouseMove = (moveEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const dxPct = ((moveEvent.clientX - dragStartRef.current.startX) / rect.width) * 100
      const dyPct = ((moveEvent.clientY - dragStartRef.current.startY) / rect.height) * 100
      const startB = dragStartRef.current.box

      let { x, y, w, h } = startB
      const hType = isDraggingRef.current

      if (hType === 'move') {
        x = Math.max(0, Math.min(100 - w, startB.x + dxPct))
        y = Math.max(0, Math.min(100 - h, startB.y + dyPct))
      } else {
        if (hType.includes('e')) {
          w = Math.max(10, Math.min(100 - startB.x, startB.w + dxPct))
        }
        if (hType.includes('s')) {
          h = Math.max(10, Math.min(100 - startB.y, startB.h + dyPct))
        }
        if (hType.includes('w')) {
          const maxW = startB.x + startB.w
          w = Math.max(10, Math.min(maxW, startB.w - dxPct))
          x = maxW - w
        }
        if (hType.includes('n')) {
          const maxH = startB.y + startB.h
          h = Math.max(10, Math.min(maxH, startB.h - dyPct))
          y = maxH - h
        }
      }

      setCropBox({ x, y, w, h })
    }

    const onMouseUp = () => {
      isDraggingRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const rotate90 = (delta) => {
    setRotation((prev) => (prev + delta + 360) % 360)
  }

  const applyCropAndRotate = async () => {
    if (!imageSrc) return
    setProcessing(true)
    setError('')

    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((res, rej) => {
        img.onload = res
        img.onerror = rej
        img.src = imageSrc
      })

      const totalAngle = (rotation + fineAngle) * (Math.PI / 180)

      // 1. Create transformation canvas
      const transformCanvas = document.createElement('canvas')
      const rad = totalAngle
      const sin = Math.abs(Math.sin(rad))
      const cos = Math.abs(Math.cos(rad))
      const tW = Math.round(img.naturalWidth * cos + img.naturalHeight * sin)
      const tH = Math.round(img.naturalWidth * sin + img.naturalHeight * cos)

      transformCanvas.width = tW
      transformCanvas.height = tH
      const tCtx = transformCanvas.getContext('2d')

      tCtx.translate(tW / 2, tH / 2)
      tCtx.rotate(rad)
      tCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
      tCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)

      // 2. Crop area from the transformed canvas
      const cropX = Math.round((cropBox.x / 100) * tW)
      const cropY = Math.round((cropBox.y / 100) * tH)
      const cropW = Math.round((cropBox.w / 100) * tW)
      const cropH = Math.round((cropBox.h / 100) * tH)

      const outCanvas = document.createElement('canvas')
      outCanvas.width = Math.max(1, cropW)
      outCanvas.height = Math.max(1, cropH)
      const outCtx = outCanvas.getContext('2d')

      if (exportFormat === 'jpg') {
        outCtx.fillStyle = '#FFFFFF'
        outCtx.fillRect(0, 0, cropW, cropH)
      }

      outCtx.drawImage(
        transformCanvas,
        cropX, cropY, cropW, cropH,
        0, 0, cropW, cropH
      )

      const mime = exportFormat === 'jpg' ? 'image/jpeg' : exportFormat === 'webp' ? 'image/webp' : 'image/png'
      const blob = await new Promise((res) => outCanvas.toBlob(res, mime, 0.92))
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
      title="Crop & Putar Gambar (Rotate & Flip)"
      description="Potong area gambar dengan drag & drop manual, putar sudut 90° atau sudut presisi, balik horizontal/vertikal, dan pilih rasio aspek."
    >
      <DropZone
        accept="image/*,.jpg,.jpeg,.png,.webp"
        onFiles={handleFile}
        label="Pilih foto / gambar"
        hint="JPG, PNG, WebP — crop manual & rotasi"
      />

      {imageSrc && (
        <div className="space-y-4 animate-fade-in">
          {/* Main Controls Panel */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4">
            {/* Rotation & Flip Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[--color-border] pb-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[--color-text-3] mr-1">Putar:</span>
                <button
                  type="button"
                  onClick={() => rotate90(-90)}
                  className="flex items-center gap-1 rounded border border-[--color-border] bg-[--color-surface] px-2.5 py-1 text-xs font-semibold text-[--color-text-2] hover:bg-[--color-surface-3] transition-colors"
                  title="Putar -90° Berlawanan Arah Jarum Jam"
                >
                  <RotateCcw size={14} /> -90°
                </button>
                <button
                  type="button"
                  onClick={() => rotate90(90)}
                  className="flex items-center gap-1 rounded border border-[--color-border] bg-[--color-surface] px-2.5 py-1 text-xs font-semibold text-[--color-text-2] hover:bg-[--color-surface-3] transition-colors"
                  title="Putar +90° Searah Jarum Jam"
                >
                  <RotateCw size={14} /> +90°
                </button>
                <span className="font-mono font-bold text-[--color-brand] ml-1">
                  {rotation}°
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-[--color-text-3]">Balik:</span>
                <button
                  type="button"
                  onClick={() => setFlipH(!flipH)}
                  className={[
                    'flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition-colors',
                    flipH
                      ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand] font-bold'
                      : 'border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3]',
                  ].join(' ')}
                >
                  <FlipHorizontal size={14} /> Flip Horizontal
                </button>
                <button
                  type="button"
                  onClick={() => setFlipV(!flipV)}
                  className={[
                    'flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition-colors',
                    flipV
                      ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand] font-bold'
                      : 'border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3]',
                  ].join(' ')}
                >
                  <FlipVertical size={14} /> Flip Vertical
                </button>
              </div>
            </div>

            {/* Fine Angle Slider */}
            <div className="flex items-center gap-4 text-xs">
              <span className="font-semibold text-[--color-text-2] shrink-0">Sudut Halus (Fine Angle):</span>
              <input
                type="range"
                min="-45"
                max="45"
                value={fineAngle}
                onChange={(e) => setFineAngle(Number(e.target.value))}
                className="w-full"
              />
              <span className="w-12 font-mono font-bold text-[--color-text] text-right">{fineAngle}°</span>
              {fineAngle !== 0 && (
                <button
                  onClick={() => setFineAngle(0)}
                  className="text-xs text-[--color-brand] hover:underline shrink-0"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Aspect Ratio Buttons */}
            <div>
              <label className="block mb-2 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                Rasio Aspek Potongan (Aspect Ratio)
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {ASPECT_RATIOS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyAspect(item.id)}
                    className={[
                      'rounded border py-1.5 px-2 text-xs font-medium transition-all text-center',
                      aspectId === item.id
                        ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand-text] font-bold'
                        : 'border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3]',
                    ].join(' ')}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive Drag-and-Drop Crop Stage */}
          <div className="relative flex justify-center rounded-lg border border-[--color-border] bg-neutral-900 p-6 overflow-hidden select-none min-h-[420px]">
            <div
              ref={containerRef}
              className="relative inline-block overflow-hidden"
              style={{
                transform: `rotate(${rotation + fineAngle}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
                transition: 'transform 0.15s ease',
              }}
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Crop Target"
                className="block max-h-[500px] w-auto pointer-events-none select-none"
              />

              {/* Darkened overlay outside crop box */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'rgba(0, 0, 0, 0.55)',
                  clipPath: `polygon(0% 0%, 0% 100%, ${cropBox.x}% 100%, ${cropBox.x}% ${cropBox.y}%, ${cropBox.x + cropBox.w}% ${cropBox.y}%, ${cropBox.x + cropBox.w}% ${cropBox.y + cropBox.h}%, ${cropBox.x}% ${cropBox.y + cropBox.h}%, ${cropBox.x}% 100%, 100% 100%, 100% 0%)`,
                }}
              />

              {/* Interactive Resizable Crop Box */}
              <div
                onMouseDown={(e) => startDrag(e, 'move')}
                className="absolute border-2 border-white cursor-move"
                style={{
                  left: `${cropBox.x}%`,
                  top: `${cropBox.y}%`,
                  width: `${cropBox.w}%`,
                  height: `${cropBox.h}%`,
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                }}
              >
                {/* 3x3 Grid Guidelines */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                  <div className="border-r border-b border-white" />
                  <div className="border-r border-b border-white" />
                  <div className="border-b border-white" />
                  <div className="border-r border-b border-white" />
                  <div className="border-r border-b border-white" />
                  <div className="border-b border-white" />
                  <div className="border-r border-white" />
                  <div className="border-r border-white" />
                  <div />
                </div>

                {/* 4 Corner Resize Handles */}
                <div
                  onMouseDown={(e) => startDrag(e, 'nw')}
                  className="absolute -left-2 -top-2 h-4 w-4 bg-white border-2 border-blue-600 rounded-full cursor-nw-resize"
                />
                <div
                  onMouseDown={(e) => startDrag(e, 'ne')}
                  className="absolute -right-2 -top-2 h-4 w-4 bg-white border-2 border-blue-600 rounded-full cursor-ne-resize"
                />
                <div
                  onMouseDown={(e) => startDrag(e, 'se')}
                  className="absolute -right-2 -bottom-2 h-4 w-4 bg-white border-2 border-blue-600 rounded-full cursor-se-resize"
                />
                <div
                  onMouseDown={(e) => startDrag(e, 'sw')}
                  className="absolute -left-2 -bottom-2 h-4 w-4 bg-white border-2 border-blue-600 rounded-full cursor-sw-resize"
                />
              </div>
            </div>
          </div>

          {/* Export Options & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[--color-border] bg-[--color-surface] p-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[--color-text-3]">Format Hasil:</span>
              {['png', 'jpg', 'webp'].map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setExportFormat(fmt)}
                  className={[
                    'rounded border px-2.5 py-1 font-bold uppercase transition-colors',
                    exportFormat === fmt
                      ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand]'
                      : 'border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3]',
                  ].join(' ')}
                >
                  {fmt}
                </button>
              ))}
            </div>

            <button
              onClick={applyCropAndRotate}
              disabled={processing}
              className="flex items-center gap-2 rounded bg-[--color-brand] px-5 py-2 text-sm font-semibold text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-all active:scale-[0.99]"
            >
              {processing && <Loader2 size={16} className="animate-spin" />}
              {processing ? 'Memproses Hasil…' : 'Potong & Simpan Gambar'}
            </button>
          </div>

          {error && (
            <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger] animate-fade-in">
              {error}
            </p>
          )}

          {/* Result Card */}
          {resultBlob && (
            <ResultCard
              fileName={`${base}_cropped.${exportFormat}`}
              blob={resultBlob}
              extraInfo={`Gambar berhasil dipotong & diputar — ${fmtBytes(resultBlob.size)}`}
              onReset={() => setResultBlob(null)}
            />
          )}
        </div>
      )}
    </ToolShell>
  )
}
