import { useState, useRef, useEffect } from 'react'
import {
  RotateCw, RotateCcw, FlipHorizontal, FlipVertical,
  Download, Loader2, RefreshCw
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import { fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

const ASPECT_RATIOS = [
  { id: 'free', label: 'Bebas', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
]

export default function ImageCropRotate() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [imageSrc, setImageSrc] = useState(null)
  const [origDims, setOrigDims] = useState({ w: 0, h: 0 })

  const [rotation, setRotation] = useState(0)
  const [fineAngle, setFineAngle] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [aspectId, setAspectId] = useState('free')

  const [cropBox, setCropBox] = useState({ x: 10, y: 10, w: 80, h: 80 })
  const [exportFormat, setExportFormat] = useState('png')

  const [processing, setProcessing] = useState(false)
  const [resultBlob, setResultBlob] = useState(null)
  const [error, setError] = useState('')

  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const imgRef = useRef(null)
  const isDraggingRef = useRef(null)
  const dragStartRef = useRef({ x: 0, y: 0, box: { ...cropBox } })

  const handleFile = ([f]) => {
    if (!f) return
    setFile(f)
    setResultBlob(null)
    setError('')
    setRotation(0)
    setFineAngle(0)
    setFlipH(false)
    setFlipV(false)
    setCropBox({ x: 10, y: 10, w: 80, h: 80 })
    setAspectId('free')

    const url = URL.createObjectURL(f)
    setImageSrc(url)

    const img = new Image()
    img.onload = () => {
      setOrigDims({ w: img.naturalWidth, h: img.naturalHeight })
      imgRef.current = img
    }
    img.src = url
  }

  // Draw preview canvas: rotated image with crop overlay
  const drawPreview = () => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return

    const rad = ((rotation + fineAngle) * Math.PI) / 180
    const sin = Math.abs(Math.sin(rad))
    const cos = Math.abs(Math.cos(rad))
    const rW = Math.round(img.naturalWidth * cos + img.naturalHeight * sin)
    const rH = Math.round(img.naturalWidth * sin + img.naturalHeight * cos)

    canvas.width = rW
    canvas.height = rH
    const ctx = canvas.getContext('2d')

    ctx.save()
    ctx.translate(rW / 2, rH / 2)
    ctx.rotate(rad)
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
    ctx.restore()

    // Crop overlay — mapped from original image coords to rotated canvas coords
    const cropX = (cropBox.x / 100) * img.naturalWidth
    const cropY = (cropBox.y / 100) * img.naturalHeight
    const cropW = (cropBox.w / 100) * img.naturalWidth
    const cropH = (cropBox.h / 100) * img.naturalHeight

    // Transform crop corners through the same rotation
    const corners = [
      [cropX, cropY],
      [cropX + cropW, cropY],
      [cropX + cropW, cropY + cropH],
      [cropX, cropY + cropH],
    ].map(([cx, cy]) => {
      // Center, rotate, translate to canvas space
      const dx = cx - img.naturalWidth / 2
      const dy = cy - img.naturalHeight / 2
      const rx = dx * Math.cos(rad) - dy * Math.sin(rad)
      const ry = dx * Math.sin(rad) + dy * Math.cos(rad)
      // Flip
      const fx = flipH ? -rx : rx
      const fy = flipV ? -ry : ry
      return [fx + rW / 2, fy + rH / 2]
    })

    // Draw dark overlay
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(rW, 0)
    ctx.lineTo(rW, rH)
    ctx.lineTo(0, rH)
    ctx.closePath()
    // Cut out the crop polygon
    ctx.moveTo(corners[0][0], corners[0][1])
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i][0], corners[i][1])
    }
    ctx.closePath()
    ctx.fill('evenodd')
    ctx.restore()

    // Draw crop box border
    ctx.save()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(corners[0][0], corners[0][1])
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i][0], corners[i][1])
    }
    ctx.closePath()
    ctx.stroke()
    ctx.restore()
  }

  useEffect(() => {
    if (imageSrc) requestAnimationFrame(drawPreview)
  }, [imageSrc, rotation, fineAngle, flipH, flipV, cropBox])

  const applyAspect = (id) => {
    setAspectId(id)
    const selected = ASPECT_RATIOS.find((a) => a.id === id)
    if (!selected || !selected.ratio || !origDims.w || !origDims.h) return

    const targetRatio = selected.ratio
    let newW = 70
    let newH = (newW / targetRatio) * (origDims.w / origDims.h)
    if (newH > 80) {
      newH = 80
      newW = newH * targetRatio * (origDims.h / origDims.w)
    }

    setCropBox({
      x: Math.max(0, (100 - newW) / 2),
      y: Math.max(0, (100 - newH) / 2),
      w: Math.min(100, newW),
      h: Math.min(100, newH),
    })
  }

  const startDrag = (e, handle) => {
    e.stopPropagation()
    isDraggingRef.current = handle
    dragStartRef.current = { startX: e.clientX, startY: e.clientY, box: { ...cropBox } }

    const onMouseMove = (moveEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const dxPct = ((moveEvent.clientX - dragStartRef.current.startX) / rect.width) * 100
      const dyPct = ((moveEvent.clientY - dragStartRef.current.startY) / rect.height) * 100
      const startB = dragStartRef.current.box

      let { x, y, w, h } = startB
      const ht = isDraggingRef.current

      if (ht === 'move') {
        x = Math.max(0, Math.min(100 - w, startB.x + dxPct))
        y = Math.max(0, Math.min(100 - h, startB.y + dyPct))
      } else {
        if (ht.includes('e')) w = Math.max(5, Math.min(100 - startB.x, startB.w + dxPct))
        if (ht.includes('s')) h = Math.max(5, Math.min(100 - startB.y, startB.h + dyPct))
        if (ht.includes('w')) {
          const maxW = startB.x + startB.w
          w = Math.max(5, Math.min(maxW, startB.w - dxPct))
          x = maxW - w
        }
        if (ht.includes('n')) {
          const maxH = startB.y + startB.h
          h = Math.max(5, Math.min(maxH, startB.h - dyPct))
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

  const applyCropAndRotate = async () => {
    if (!imageSrc) return
    setProcessing(true)
    setError('')

    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imageSrc })

      const totalAngle = (rotation + fineAngle) * (Math.PI / 180)

      // 1. Transform canvas (rotate + flip)
      const sin = Math.abs(Math.sin(totalAngle))
      const cos = Math.abs(Math.cos(totalAngle))
      const tW = Math.round(img.naturalWidth * cos + img.naturalHeight * sin)
      const tH = Math.round(img.naturalWidth * sin + img.naturalHeight * cos)
      const tc = document.createElement('canvas')
      tc.width = tW; tc.height = tH
      const tCtx = tc.getContext('2d')
      tCtx.translate(tW / 2, tH / 2)
      tCtx.rotate(totalAngle)
      tCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
      tCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)

      // 2. Map crop box from original image coords to transformed canvas coords
      const corners = [
        [cropBox.x / 100 * img.naturalWidth, cropBox.y / 100 * img.naturalHeight],
        [(cropBox.x + cropBox.w) / 100 * img.naturalWidth, cropBox.y / 100 * img.naturalHeight],
        [(cropBox.x + cropBox.w) / 100 * img.naturalWidth, (cropBox.y + cropBox.h) / 100 * img.naturalHeight],
        [cropBox.x / 100 * img.naturalWidth, (cropBox.y + cropBox.h) / 100 * img.naturalHeight],
      ].map(([cx, cy]) => {
        const dx = cx - img.naturalWidth / 2
        const dy = cy - img.naturalHeight / 2
        const rx = dx * Math.cos(totalAngle) - dy * Math.sin(totalAngle)
        const ry = dx * Math.sin(totalAngle) + dy * Math.cos(totalAngle)
        return [(flipH ? -rx : rx) + tW / 2, (flipV ? -ry : ry) + tH / 2]
      })

      // 3. Bounding box of transformed crop
      const xs = corners.map(c => c[0])
      const ys = corners.map(c => c[1])
      const bx = Math.round(Math.min(...xs))
      const by = Math.round(Math.min(...ys))
      const bw = Math.round(Math.max(...xs) - bx)
      const bh = Math.round(Math.max(...ys) - by)

      // 4. Draw only the crop region
      const out = document.createElement('canvas')
      out.width = Math.max(1, bw)
      out.height = Math.max(1, bh)
      const oCtx = out.getContext('2d')

      if (exportFormat === 'jpg') {
        oCtx.fillStyle = '#FFFFFF'
        oCtx.fillRect(0, 0, bw, bh)
      }

      // Use polygon clip for precise crop
      oCtx.save()
      oCtx.beginPath()
      oCtx.moveTo(corners[0][0] - bx, corners[0][1] - by)
      for (let i = 1; i < corners.length; i++) {
        oCtx.lineTo(corners[i][0] - bx, corners[i][1] - by)
      }
      oCtx.closePath()
      oCtx.clip()
      oCtx.drawImage(tc, 0, 0)
      oCtx.restore()

      const mime = exportFormat === 'jpg' ? 'image/jpeg' : exportFormat === 'webp' ? 'image/webp' : 'image/png'
      const blob = await new Promise((res) => out.toBlob(res, mime, 0.92))
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
      title="Crop & Putar Gambar"
      description="Potong area gambar dengan drag handles, putar sudut 90° atau halus, balik horizontal/vertikal."
    >
      <DropZone
        accept="image/*"
        onFiles={handleFile}
        label="Pilih foto / gambar"
        hint="JPG, PNG, WebP — crop manual & rotasi"
      />

      {imageSrc && (
        <div className="space-y-3 animate-fade-in">
          {/* Controls */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-3 space-y-3">
            {/* Rotate & Flip */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1">
                <button onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                  className="flex items-center gap-1 rounded border border-[--color-border] bg-[--color-surface] px-2 py-1 text-xs font-semibold text-[--color-text-2] hover:bg-[--color-surface-3] transition">
                  <RotateCcw size={13} /> -90°
                </button>
                <button onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="flex items-center gap-1 rounded border border-[--color-border] bg-[--color-surface] px-2 py-1 text-xs font-semibold text-[--color-text-2] hover:bg-[--color-surface-3] transition">
                  <RotateCw size={13} /> +90°
                </button>
                <span className="ml-1 font-mono font-bold text-[--color-brand]">{rotation}°</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setFlipH(!flipH)}
                  className={`flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition ${flipH ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand] font-bold' : 'border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3]'}`}>
                  <FlipHorizontal size={13} /> Flip H
                </button>
                <button onClick={() => setFlipV(!flipV)}
                  className={`flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition ${flipV ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand] font-bold' : 'border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3]'}`}>
                  <FlipVertical size={13} /> Flip V
                </button>
              </div>
            </div>

            {/* Fine angle */}
            <div className="flex items-center gap-3 text-xs">
              <span className="font-semibold text-[--color-text-2] shrink-0">Sudut Halus:</span>
              <input type="range" min="-45" max="45" value={fineAngle}
                onChange={(e) => setFineAngle(Number(e.target.value))} className="flex-1" />
              <span className="w-10 font-mono font-bold text-[--color-text] text-right">{fineAngle}°</span>
              {fineAngle !== 0 && (
                <button onClick={() => setFineAngle(0)} className="text-xs text-[--color-brand] hover:underline">Reset</button>
              )}
            </div>

            {/* Aspect ratios */}
            <div>
              <label className="block mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[--color-text-3]">Rasio Aspek</label>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {ASPECT_RATIOS.map((item) => (
                  <button key={item.id} onClick={() => applyAspect(item.id)}
                    className={`rounded border py-1 px-2 text-[10px] font-medium transition text-center ${aspectId === item.id ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand] font-bold' : 'border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3]'}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Canvas Preview — full width, no black bars */}
          <div ref={containerRef} className="relative flex justify-center rounded-lg border border-[--color-border] bg-neutral-900 p-4 overflow-hidden select-none">
            <canvas
              ref={canvasRef}
              className="block max-h-[60vh] w-auto"
              style={{ maxWidth: '100%' }}
            />
          </div>

          {/* Export */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[--color-border] bg-[--color-surface] p-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[--color-text-3]">Format:</span>
              {['png', 'jpg', 'webp'].map((fmt) => (
                <button key={fmt} onClick={() => setExportFormat(fmt)}
                  className={`rounded border px-2 py-0.5 font-bold uppercase transition ${exportFormat === fmt ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand]' : 'border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3]'}`}>
                  {fmt}
                </button>
              ))}
            </div>
            <button onClick={applyCropAndRotate} disabled={processing}
              className="flex items-center gap-2 rounded bg-[--color-brand] px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60 transition active:scale-[0.99]">
              {processing && <Loader2 size={14} className="animate-spin" />}
              {processing ? 'Memproses…' : 'Potong & Simpan'}
            </button>
          </div>

          {error && (
            <p className="rounded border border-red-300 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {resultBlob && (
            <ResultCard
              fileName={`${base}_cropped.${exportFormat}`}
              blob={resultBlob}
              extraInfo={`${fmtBytes(resultBlob.size)}`}
              outputMimeType={exportFormat === 'jpg' ? 'image/jpeg' : exportFormat === 'webp' ? 'image/webp' : 'image/png'}
              sourceRoute="image-crop-rotate"
              onReset={() => setResultBlob(null)}
            />
          )}
        </div>
      )}
    </ToolShell>
  )
}
