import { useState, useRef, useCallback, useEffect } from 'react'
import { Download, Loader2, ZoomIn, GripVertical } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import { fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

const SCALE_OPTIONS = [
  { value: 2, label: '2×', desc: 'Dua kali lipat' },
  { value: 3, label: '3×', desc: 'Tiga kali lipat' },
  { value: 4, label: '4×', desc: 'Empat kali lipat' },
]

const OUTPUT_FORMATS = [
  { ext: 'png', mime: 'image/png', label: 'PNG (Lossless)' },
  { ext: 'jpg', mime: 'image/jpeg', label: 'JPG (Kompresi)' },
  { ext: 'webp', mime: 'image/webp', label: 'WebP (Ringan)' },
]

function BeforeAfterSlider({ beforeSrc, afterSrc, beforeLabel, afterLabel }) {
  const containerRef = useRef(null)
  const [pos, setPos] = useState(50)
  const isDragging = useRef(false)

  const updatePos = (e) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left
    setPos(Math.max(2, Math.min(98, (x / rect.width) * 100)))
  }

  useEffect(() => {
    const onMove = (e) => {
      if (!isDragging.current) return
      e.preventDefault()
      updatePos(e)
    }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [])

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative rounded-lg border border-[--color-border] overflow-hidden cursor-ew-resize select-none bg-[--color-surface-2]"
        onMouseDown={(e) => { isDragging.current = true; updatePos(e) }}
        onTouchStart={(e) => { isDragging.current = true; updatePos(e) }}
      >
        {/* After (full width, behind) */}
        <img src={afterSrc} alt="After" className="block w-full h-auto" draggable={false} />

        {/* Before (clipped) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${pos}%` }}
        >
          <img
            src={beforeSrc}
            alt="Before"
            className="block h-auto"
            style={{ width: containerRef.current ? `${containerRef.current.offsetWidth}px` : '100%' }}
            draggable={false}
          />
        </div>

        {/* Divider line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10"
          style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 border-2 border-[--color-brand] shadow-lg flex items-center justify-center">
            <GripVertical size={14} className="text-[--color-brand]" />
          </div>
        </div>

        {/* Labels */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold uppercase tracking-wider z-20">
          {beforeLabel}
        </div>
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold uppercase tracking-wider z-20">
          {afterLabel}
        </div>
      </div>
    </div>
  )
}

export default function ImageUpscaler() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [scale, setScale] = useState(2)
  const [outputFormat, setOutputFormat] = useState('png')
  const [quality, setQuality] = useState(92)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [resultInfo, setResultInfo] = useState('')
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [originalDims, setOriginalDims] = useState(null)
  const [resultUrl, setResultUrl] = useState(null)

  const handleFile = ([f]) => {
    if (!f) return
    setFile(f)
    setResult(null)
    setError('')
    setResultInfo('')
    setResultUrl(null)
    const url = URL.createObjectURL(f)
    setPreviewUrl(url)
    const img = new Image()
    img.onload = () => setOriginalDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
  }

  const upscale = useCallback(async () => {
    if (!file) return
    setProcessing(true)
    setError('')

    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = URL.createObjectURL(file)
      })

      const srcW = img.naturalWidth
      const srcH = img.naturalHeight
      const dstW = srcW * scale
      const dstH = srcH * scale

      // Draw original
      const srcCanvas = document.createElement('canvas')
      srcCanvas.width = srcW
      srcCanvas.height = srcH
      srcCanvas.getContext('2d').drawImage(img, 0, 0)

      // Upscale in 2x steps for quality
      let input = srcCanvas
      let inputW = srcW
      let inputH = srcH
      let mult = scale

      while (mult > 1) {
        const step = mult >= 2 ? 2 : mult
        const outW = Math.round(inputW * step)
        const outH = Math.round(inputH * step)

        const outCanvas = document.createElement('canvas')
        outCanvas.width = outW
        outCanvas.height = outH
        const ctx = outCanvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(input, 0, 0, outW, outH)

        input = outCanvas
        inputW = outW
        inputH = outH
        mult /= step
      }

      // Convert to blob via toDataURL (more reliable than toBlob)
      const fmt = OUTPUT_FORMATS.find((f) => f.ext === outputFormat)
      const dataUrl = input.toDataURL(fmt.mime, quality / 100)
      const res = await fetch(dataUrl)
      const blob = await res.blob()

      const url = URL.createObjectURL(blob)
      setResultUrl(url)
      setResultInfo(`${srcW}×${srcH} → ${dstW}×${dstH} (${scale}×) — ${fmtBytes(blob.size)}`)
      setResult(blob)
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }, [file, scale, outputFormat, quality])

  const base = file ? stripExt(file.name) : 'image'

  return (
    <ToolShell
      title="Upscale Gambar"
      description="Perbesar resolusi gambar hingga 4× dengan interpolasi berkualitas tinggi. 100% Client-Side."
    >
      <DropZone
        accept="image/png,image/jpeg,image/webp"
        onFiles={handleFile}
        label="Pilih gambar untuk di-upscale"
        hint="JPG, PNG, WebP — akan diperbesar sesuai pilihan"
      />
      {file && <FilePreview file={file} />}

      {file && !result && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4">
          {originalDims && (
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-[--color-text] truncate">{file.name}</span>
              <span className="shrink-0 text-[--color-text-3] ml-2 font-mono text-xs">
                {originalDims.w}×{originalDims.h} → {originalDims.w * scale}×{originalDims.h * scale}
              </span>
            </div>
          )}

          <div>
            <label className="block mb-2 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
              Upscale Factor
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SCALE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setScale(opt.value)}
                  className={`flex flex-col items-center rounded-lg border p-3 text-center transition-all ${
                    scale === opt.value
                      ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand] font-bold shadow-xs'
                      : 'border-[--color-border] bg-[--color-surface-3] text-[--color-text-2] hover:bg-[--color-surface]'
                  }`}
                >
                  <span className="text-lg font-bold">{opt.label}</span>
                  <span className="text-[10px] opacity-70">{opt.desc}</span>
                  <span className="text-[9px] opacity-50 mt-0.5">
                    {originalDims && `${originalDims.w * opt.value}×${originalDims.h * opt.value}`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block mb-2 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
              Format Output
            </label>
            <div className="grid grid-cols-3 gap-2">
              {OUTPUT_FORMATS.map((fmt) => (
                <button
                  key={fmt.ext}
                  onClick={() => setOutputFormat(fmt.ext)}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
                    outputFormat === fmt.ext
                      ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand]'
                      : 'border-[--color-border] bg-[--color-surface-3] text-[--color-text-3]'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {outputFormat !== 'png' && (
            <div>
              <label className="block mb-1 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                Kualitas: {quality}%
              </label>
              <input
                type="range"
                min="50"
                max="100"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-[--color-brand]"
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger]">
          {error}
        </p>
      )}

      {file && !result && (
        <button
          onClick={upscale}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-colors"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Upscaling…' : `Upscale ${scale}×`}
        </button>
      )}

      {/* Before / After Slider */}
      {result && previewUrl && resultUrl && (
        <BeforeAfterSlider
          beforeSrc={previewUrl}
          afterSrc={resultUrl}
          beforeLabel="Original"
          afterLabel={`${scale}× Upscaled`}
        />
      )}

      {result && (
        <ResultCard
          fileName={`${base}_${scale}x.${outputFormat}`}
          blob={result}
          extraInfo={resultInfo}
          outputMimeType={OUTPUT_FORMATS.find((f) => f.ext === outputFormat)?.mime || 'image/png'}
          sourceRoute="image-upscale"
          onReset={() => {
            setResult(null)
            setFile(null)
            setResultInfo('')
            setResultUrl(null)
            setOriginalDims(null)
          }}
        />
      )}
    </ToolShell>
  )
}
