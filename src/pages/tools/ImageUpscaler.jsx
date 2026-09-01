import { useState, useRef, useCallback } from 'react'
import { Download, Loader2, ZoomIn } from 'lucide-react'
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

  const handleFile = ([f]) => {
    if (!f) return
    setFile(f)
    setResult(null)
    setError('')
    setResultInfo('')
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

      // Step 1: draw original to temp canvas
      const tmpCanvas = document.createElement('canvas')
      tmpCanvas.width = srcW
      tmpCanvas.height = srcH
      const tmpCtx = tmpCanvas.getContext('2d')
      tmpCtx.drawImage(img, 0, 0)

      // Step 2: progressive upscale for better quality (2x steps)
      let currentCanvas = tmpCanvas
      let currentW = srcW
      let currentH = srcH
      let remaining = scale

      while (remaining > 1) {
        const step = remaining >= 2 ? 2 : remaining
        const stepW = currentW * step
        const stepH = currentH * step

        const stepCanvas = document.createElement('canvas')
        stepCanvas.width = stepW
        stepCanvas.height = stepH
        const stepCtx = stepCanvas.getContext('2d')

        // Use high-quality interpolation
        stepCtx.imageSmoothingEnabled = true
        stepCtx.imageSmoothingQuality = 'high'
        stepCtx.drawImage(currentCanvas, 0, 0, stepW, stepH)

        currentCanvas = stepCanvas
        currentW = stepW
        currentH = stepH
        remaining /= step
      }

      // Step 3: final output
      const fmt = OUTPUT_FORMATS.find((f) => f.ext === outputFormat)
      const blob = await new Promise((resolve) => {
        currentCanvas.toBlob(resolve, fmt.mime, quality / 100)
      })

      const outName = `${stripExt(file.name)}_${scale}x.${fmt.ext}`
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
          {/* Original info */}
          {originalDims && (
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-[--color-text] truncate">{file.name}</span>
              <span className="shrink-0 text-[--color-text-3] ml-2 font-mono text-xs">
                {originalDims.w}×{originalDims.h} → {originalDims.w * scale}×{originalDims.h * scale}
              </span>
            </div>
          )}

          {/* Scale */}
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

          {/* Output format */}
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

          {/* Quality (for lossy formats) */}
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
            setOriginalDims(null)
          }}
        />
      )}
    </ToolShell>
  )
}
