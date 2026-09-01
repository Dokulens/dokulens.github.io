import { useState } from 'react'
import JSZip from 'jszip'
import { Loader2, RefreshCw, SlidersHorizontal, Image as ImageIcon } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import ProgressBar from '../../components/ProgressBar'
import { fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

const TARGET_FORMATS = [
  { label: 'WebP (Kompresi Terbaik & Ringan)', ext: 'webp', mime: 'image/webp' },
  { label: 'JPG / JPEG (Standar Universal)', ext: 'jpg', mime: 'image/jpeg' },
  { label: 'PNG (Lossless, Mendukung Transparansi)', ext: 'png', mime: 'image/png' },
  { label: 'AVIF (Format Modern Efisiensi Tinggi)', ext: 'avif', mime: 'image/avif' },
  { label: 'BMP (Bitmap Tanpa Kompresi)', ext: 'bmp', mime: 'image/bmp' },
  { label: 'ICO (Ikon Favicon)', ext: 'ico', mime: 'image/x-icon' },
]

export default function ImageConvert() {
  const [files, setFiles] = useState([])
  useIncomingFile((f) => setFiles(prev => [...prev, f]))
  const [targetFormat, setTargetFormat] = useState('webp')
  const [quality, setQuality] = useState(82)
  const [resizeMode, setResizeMode] = useState('none') // 'none' | 'width' | 'percent' | 'custom'
  const [targetWidth, setTargetWidth] = useState(1200)
  const [targetHeight, setTargetHeight] = useState(800)
  const [scalePercent, setScalePercent] = useState(75)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [resultName, setResultName] = useState('')
  const [error, setError] = useState('')

  const handleFiles = (f) => {
    setFiles(f)
    setResult(null)
    setError('')
    setProgress(0)
  }

  const processImage = (file) => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        let { naturalWidth: w, naturalHeight: h } = img

        if (targetFormat === 'ico') {
          // Standard favicon sizing
          w = 64
          h = 64
        } else if (resizeMode === 'width' && targetWidth > 0) {
          h = Math.round((h * targetWidth) / w)
          w = targetWidth
        } else if (resizeMode === 'percent') {
          const ratio = scalePercent / 100
          w = Math.round(w * ratio)
          h = Math.round(h * ratio)
        } else if (resizeMode === 'custom') {
          w = targetWidth || w
          h = targetHeight || h
        }

        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, w)
        canvas.height = Math.max(1, h)
        const ctx = canvas.getContext('2d')

        // Fill background white if converting transparent image to non-alpha format (JPG/BMP)
        if (targetFormat === 'jpg' || targetFormat === 'bmp') {
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, w, h)
        }

        ctx.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)

        const fmt = TARGET_FORMATS.find((f) => f.ext === targetFormat)
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              // Fallback for formats not natively exported by certain browser canvas engines (like AVIF/ICO fallback to PNG/WebP)
              canvas.toBlob((fallbackBlob) => {
                if (fallbackBlob) resolve(fallbackBlob)
                else reject(new Error('Gagal memproses gambar'))
              }, 'image/png')
            }
          },
          fmt.mime,
          quality / 100,
        )
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error(`Gagal memuat ${file.name}`))
      }
      img.src = url
    })
  }

  const convert = async () => {
    if (!files.length) return
    setProcessing(true)
    setError('')
    setProgress(0)

    try {
      if (files.length === 1) {
        setProgress(50)
        const blob = await processImage(files[0])
        const outName = `${stripExt(files[0].name)}.${targetFormat}`
        setProgress(100)
        setResult(blob)
        setResultName(outName)
      } else {
        const zip = new JSZip()
        for (let i = 0; i < files.length; i++) {
          const blob = await processImage(files[i])
          const outName = `${stripExt(files[i].name)}.${targetFormat}`
          zip.file(outName, blob)
          setProgress(Math.round(((i + 1) / files.length) * 90))
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        setProgress(100)
        setResult(zipBlob)
        setResultName('converted_images.zip')
      }
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <ToolShell
      title="Konversi & Kompresi Gambar"
      description="Ubah format gambar (WebP, JPG, PNG, AVIF, BMP, ICO), perkecil ukuran file, dan atur dimensi resolusi."
    >
      <DropZone
        accept="image/*,.jpg,.jpeg,.png,.webp,.avif,.bmp,.svg,.ico,.tiff,.heic"
        multiple
        onFiles={handleFiles}
        label="Pilih atau drop file gambar"
        hint="JPG, PNG, WebP, AVIF, BMP, ICO — bisa banyak file sekaligus (hasil jadi ZIP)"
      />

      {files.length > 0 && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4 animate-fade-in">
          {/* File list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                {files.length} File Dipilih {files.length > 1 && <span className="text-[--color-brand]">(hasil jadi ZIP)</span>}
              </span>
              <span className="text-[10px] text-[--color-text-3]">
                Total: {fmtBytes(files.reduce((acc, f) => acc + f.size, 0))}
              </span>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded bg-[--color-surface-3] px-2.5 py-1.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[--color-text-3] font-mono w-5 text-right shrink-0">{i + 1}.</span>
                    <span className="truncate text-[--color-text-2]">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[--color-text-3]">{fmtBytes(f.size)}</span>
                    <button
                      onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-[--color-text-3] hover:text-[--color-danger] transition-colors font-bold"
                      title="Hapus"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
                Format Tujuan
              </label>
              <select
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value)}
                className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm outline-none focus:border-[--color-brand] transition-colors"
              >
                {TARGET_FORMATS.map((f) => (
                  <option key={f.ext} value={f.ext}>{f.label}</option>
                ))}
              </select>
            </div>

            {targetFormat !== 'png' && targetFormat !== 'bmp' && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
                    Kualitas Kompresi
                  </label>
                  <span className="text-xs font-bold text-[--color-brand]">{quality}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full mt-1.5"
                />
                <div className="flex justify-between text-[10px] text-[--color-text-3] mt-1">
                  <span>Ukuran Kecil (10%)</span>
                  <span>Seimbang (80%)</span>
                  <span>Maksimum (100%)</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block mb-2 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
              Pengaturan Ukuran (Resize)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'none', label: 'Ukuran Asli' },
                { id: 'percent', label: 'Skala (%)' },
                { id: 'width', label: 'Lebar Maks (px)' },
                { id: 'custom', label: 'Kustom W x H' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setResizeMode(opt.id)}
                  className={[
                    'rounded border py-2 px-3 text-xs font-medium transition-colors',
                    resizeMode === opt.id
                      ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand] font-semibold'
                      : 'border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3]',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {resizeMode === 'percent' && (
              <div className="mt-3 animate-fade-in">
                <div className="flex justify-between text-xs text-[--color-text-2] mb-1">
                  <span>Persentase Skala</span>
                  <span className="font-bold text-[--color-brand]">{scalePercent}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={scalePercent}
                  onChange={(e) => setScalePercent(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            )}

            {resizeMode === 'width' && (
              <div className="mt-3 flex items-center gap-2 animate-fade-in">
                <input
                  type="number"
                  min="100"
                  max="8000"
                  step="100"
                  value={targetWidth}
                  onChange={(e) => setTargetWidth(Number(e.target.value))}
                  className="w-32 rounded border border-[--color-border] bg-[--color-surface] px-3 py-1.5 text-sm outline-none focus:border-[--color-brand]"
                />
                <span className="text-xs text-[--color-text-3]">pixel (tinggi otomatis proporsional)</span>
              </div>
            )}

            {resizeMode === 'custom' && (
              <div className="mt-3 flex items-center gap-2 animate-fade-in">
                <div>
                  <label className="block text-[10px] text-[--color-text-3] mb-0.5">Lebar (px)</label>
                  <input
                    type="number"
                    min="10"
                    max="8000"
                    value={targetWidth}
                    onChange={(e) => setTargetWidth(Number(e.target.value))}
                    className="w-28 rounded border border-[--color-border] bg-[--color-surface] px-3 py-1.5 text-sm outline-none focus:border-[--color-brand]"
                  />
                </div>
                <span className="text-xs text-[--color-text-3] mt-3">x</span>
                <div>
                  <label className="block text-[10px] text-[--color-text-3] mb-0.5">Tinggi (px)</label>
                  <input
                    type="number"
                    min="10"
                    max="8000"
                    value={targetHeight}
                    onChange={(e) => setTargetHeight(Number(e.target.value))}
                    className="w-28 rounded border border-[--color-border] bg-[--color-surface] px-3 py-1.5 text-sm outline-none focus:border-[--color-brand]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {processing && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2 animate-fade-in">
          <ProgressBar value={progress} label={`Memproses gambar… ${progress}%`} />
        </div>
      )}

      {error && (
        <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger] animate-fade-in">
          {error}
        </p>
      )}

      {files.length > 0 && !result && (
        <button
          onClick={convert}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-all active:scale-[0.99]"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Memproses…' : `Konversi & Kompresi ${files.length} Gambar`}
        </button>
      )}

      {result && (
        <ResultCard
          fileName={resultName}
          blob={result}
          extraInfo={fmtBytes(result.size)}
          outputMimeType={TARGET_FORMATS.find(f => f.ext === targetFormat)?.mime || 'image/png'}
          sourceRoute="image-convert"
          onReset={() => {
            setResult(null)
            setFiles([])
            setProgress(0)
          }}
        />
      )}
    </ToolShell>
  )
}
