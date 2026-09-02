import { useState, useRef } from 'react'
import {
  Sparkles, Download, Loader2, X, Video, Image as ImageIcon,
  StopCircle, CheckCircle2, SlidersHorizontal, AlertTriangle
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ProgressBar from '../../components/ProgressBar'
import FilePreview from '../../components/FilePreview'
import {
  removeOfficialGeminiWatermark,
  processFullVideo,
  detectGeminiWatermark
} from '../../utils/watermarkRemover'
import { fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

export default function WatermarkRemover() {
  const [activeMedia, setActiveMedia] = useState('image')
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [mediaSrc, setMediaSrc] = useState(null)
  const [origDims, setOrigDims] = useState({ w: 0, h: 0 })

  // Gemini detection
  const [detectedBox, setDetectedBox] = useState(null)

  // Alpha gain control (separate defaults for image vs video)
  const [alphaGainImage, setAlphaGainImage] = useState(1.0)
  const [alphaGainVideo, setAlphaGainVideo] = useState(0.60)
  const alphaGain = activeMedia === 'video' ? alphaGainVideo : alphaGainImage
  const setAlphaGain = activeMedia === 'video' ? setAlphaGainVideo : setAlphaGainImage

  // Video processing state
  const [videoDuration, setVideoDuration] = useState(0)

  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [resultBlob, setResultBlob] = useState(null)
  const [resultUrl, setResultUrl] = useState(null)
  const [error, setError] = useState('')

  const imgRef = useRef(null)
  const videoRef = useRef(null)

  const isCancelledRef = useRef(false)

  const handleFile = ([f]) => {
    setFile(f)
    setResultBlob(null)
    setResultUrl(null)
    setError('')

    const isVid = f.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(f.name)
    setActiveMedia(isVid ? 'video' : 'image')

    const url = URL.createObjectURL(f)
    setMediaSrc(url)

    if (isVid) {
      import('../../utils/watermarkRemover').then(({ getGeminiEngine }) => {
        getGeminiEngine().catch(() => {})
      }).catch(() => {})
    }

    if (!isVid) {
      const img = new Image()
      img.onload = () => {
        setOrigDims({ w: img.naturalWidth, h: img.naturalHeight })
        const det = detectGeminiWatermark(img.naturalWidth, img.naturalHeight)
        setDetectedBox(det)
      }
      img.src = url
    }
  }

  // Precision Watermark Removal Process for Image
  const processImageWatermark = async () => {
    if (!mediaSrc) return
    setProcessing(true)
    setError('')
    setProgress(20)

    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((res, rej) => {
        img.onload = res
        img.onerror = rej
        img.src = mediaSrc
      })

      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)

      setProgress(50)

      const { canvas: resultCanvas } = await removeOfficialGeminiWatermark(img, { adaptiveMode: 'auto', alphaGain })
      if (resultCanvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(resultCanvas, 0, 0)
      }

      setProgress(85)
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
      setProgress(100)
      setResultBlob(blob)
      setResultUrl(URL.createObjectURL(blob))
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  // Video Watermark Removal — full frame-by-frame pipeline
  const processVideoWatermark = async () => {
    if (!videoRef.current || processing) return
    setProcessing(true)
    setError('')
    setProgress(0)
    isCancelledRef.current = false

    const video = videoRef.current

    const handleBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = 'Proses pemrosesan video sedang berjalan. Harap jangan pindah tab atau menutup browser.'
      return e.returnValue
    }

    try {
      window.addEventListener('beforeunload', handleBeforeUnload)
      setProgress(1)

      if (video.readyState < 2) {
        await new Promise((res, rej) => {
          video.oncanplay = res
          video.onerror = () => rej(new Error('Video tidak bisa dimuat'))
          video.load()
        })
      }

      const result = await processFullVideo(video, {
        alphaGain,
        onProgress: (pct, msg) => {
          setProgress(pct)
          if (msg) console.log('[WM]', msg)
        },
        onCancel: () => isCancelledRef.current,
      })

      if (isCancelledRef.current) {
        setError('Dibatalkan')
        return
      }

      if (result.videoBlob) {
        setResultBlob(result.videoBlob)
        setResultUrl(URL.createObjectURL(result.videoBlob))
        setProgress(100)
      } else {
        setError('Gagal menghasilkan video output')
      }
    } catch (e) {
      setError(`Gagal memproses video: ${e.message}`)
      console.error('[WM] Video error:', e)
    } finally {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      video.pause()
      setProcessing(false)
    }
  }

  const base = file ? stripExt(file.name) : 'media'

  return (
    <ToolShell
      title="Hapus Watermark AI (Foto & Video)"
      description="Penghapus watermark AI (Google Gemini / Imagen) 100% otomatis dan lossless berbasis engine matematis Reverse Alpha Blending."
    >
      <DropZone
        accept="image/*,video/*,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov,.mkv"
        onFiles={handleFile}
        label="Pilih foto atau video untuk dihapus watermark-nya"
        hint="Foto (JPG, PNG, WebP) & Video (MP4, WebM, MOV) — 100% Otomatis & Client-Side"
      />
      {file && <FilePreview file={file} />}

      {mediaSrc && (
        <div className="space-y-4 animate-fade-in">
          {/* Controls Bar for Video / Image */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between border-b border-[--color-border] pb-3 text-xs">
              <div className="flex items-center gap-2 font-bold text-[--color-text]">
                {activeMedia === 'video' ? <Video size={16} className="text-[--color-brand]" /> : <ImageIcon size={16} className="text-[--color-brand]" />}
                <span>{activeMedia === 'video' ? 'Penghapusan Watermark Video Otomatis' : 'Penghapusan Watermark Foto Otomatis'}</span>
              </div>
              <span className="text-[11px] text-[--color-text-3]">
                {activeMedia === 'video'
                  ? `Durasi: ${videoDuration ? `${videoDuration.toFixed(1)} detik` : 'Memuat…'}`
                  : origDims.w ? `${origDims.w} × ${origDims.h} px` : ''}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-[--color-text-2]">
              <Sparkles size={14} className="text-[--color-brand] shrink-0" />
              <span>
                Engine Gemini AI Lossless Resmi akan mendeteksi & menghapus watermark secara otomatis menggunakan algoritma Reverse Alpha Blending.
              </span>
            </div>
          </div>

          {/* Alpha Gain Slider */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2 animate-fade-in">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[--color-text-2] flex items-center gap-1.5">
                <SlidersHorizontal size={13} />
                Alpha Gain (Kekuatan Penghapusan)
              </label>
              <span className="text-xs font-mono text-[--color-brand] bg-[--color-brand-light] px-2 py-0.5 rounded">
                {alphaGain.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.05"
              value={alphaGain}
              onChange={(e) => setAlphaGain(parseFloat(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[--color-surface-3] accent-[--color-brand]"
            />
            <div className="flex justify-between text-[10px] text-[--color-text-3]">
              <span>0.10 (Lemah)</span>
              <span>{activeMedia === 'video' ? '0.60 (Default Video)' : '1.00 (Default Gambar)'}</span>
              <span>2.00 (Kuat)</span>
            </div>
          </div>

          {/* Preview Container (Before Processing) */}
          {!resultUrl && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-[--color-text-3]">
                  {activeMedia === 'video' ? 'Pratinjau Video' : 'Pratinjau Foto'}
                </span>
              </div>

              <div className="relative flex justify-center rounded border border-[--color-border] bg-neutral-900 p-2 overflow-hidden min-h-[300px]">
                {activeMedia === 'image' ? (
                  <div className="relative inline-block select-none">
                    <img
                      ref={imgRef}
                      src={mediaSrc}
                      alt="Original"
                      className="block max-h-[420px] w-auto pointer-events-none rounded"
                    />
                  </div>
                ) : (
                  <div className="relative inline-block select-none">
                    <video
                      ref={videoRef}
                      src={mediaSrc}
                      controls
                      onLoadedMetadata={(e) => {
                        setVideoDuration(e.target.duration)
                        setOrigDims({ w: e.target.videoWidth, h: e.target.videoHeight })
                      }}
                      className="block max-h-[420px] w-auto rounded"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {processing && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-semibold text-[--color-brand]">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Sedang memproses rekontruksi watermark… ({progress}%)</span>
                </div>
                {activeMedia === 'video' && (
                  <button
                    onClick={() => { isCancelledRef.current = true; setProcessing(false) }}
                    className="flex items-center gap-1 text-xs text-red-500 hover:underline"
                  >
                    <StopCircle size={14} /> Batalkan
                  </button>
                )}
              </div>
              <ProgressBar value={progress} />

              {activeMedia === 'video' && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200">
                  <AlertTriangle size={16} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-bold">Perhatian Penting:</p>
                    <p className="mt-0.5 text-[11px] opacity-90 leading-relaxed">
                      Harap <strong>tetap berada di halaman ini (jangan berpindah tab atau meminimize browser)</strong> selama pemrosesan video berlangsung agar perekaman stream berjalan lancar dan tidak terhenti.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger] animate-fade-in">
              {error}
            </p>
          )}

          {/* Action button */}
          {!resultBlob && (
            <button
              onClick={activeMedia === 'video' ? processVideoWatermark : processImageWatermark}
              disabled={processing}
              className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-all active:scale-[0.99]"
            >
              {processing && <Loader2 size={16} className="animate-spin" />}
              {processing
                ? 'Menghapus Watermark…'
                : activeMedia === 'video'
                ? 'Hapus Watermark Gemini dari Video'
                : 'Hapus Watermark Gemini AI (Lossless)'}
            </button>
          )}

          {/* Result Card */}
          {resultUrl && (
            <div className="rounded-lg border border-[--color-success-light] bg-[--color-surface] p-4 animate-fade-in space-y-4 shadow-sm">
              <div className="flex items-start justify-between border-b border-[--color-border] pb-3">
                <div>
                  <p className="text-sm font-bold text-[--color-success] flex items-center gap-1.5">
                    <CheckCircle2 size={17} /> Watermark Berhasil Dihapus!
                  </p>
                  <p className="mt-0.5 text-xs text-[--color-text-2]">
                    Pratinjau perbandingan langsung Sebelum vs Sesudah ({fmtBytes(resultBlob.size)})
                  </p>
                </div>
                <button
                  onClick={() => { setResultBlob(null); setResultUrl(null) }}
                  className="rounded p-1 text-[--color-text-3] hover:bg-[--color-surface-3] hover:text-[--color-text]"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Side-by-Side Comparison Stage */}
              {activeMedia === 'image' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                      Sebelum (Ada Watermark)
                    </span>
                    <div className="flex justify-center bg-neutral-900 p-2 rounded-lg overflow-hidden border border-[--color-border]">
                      <img src={mediaSrc} alt="Before" className="max-h-72 w-auto object-contain rounded" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-[--color-brand] uppercase tracking-wider block">
                      Sesudah (Watermark Bersih)
                    </span>
                    <div className="flex justify-center bg-neutral-900 p-2 rounded-lg overflow-hidden border-2 border-[--color-brand]/40">
                      <img src={resultUrl} alt="After Cleaned" className="max-h-72 w-auto object-contain rounded" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs font-bold text-[--color-brand] uppercase tracking-wider">
                    Video Bersih Hasil Penghapusan
                  </span>
                  <div className="flex justify-center bg-black/90 p-3 rounded-lg w-full">
                    <video src={resultUrl} controls autoPlay loop className="max-h-80 w-auto rounded shadow-lg" />
                  </div>
                </div>
              )}

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={() => { setResultBlob(null); setResultUrl(null) }}
                  className="rounded border border-[--color-border] px-3 py-1.5 text-xs font-semibold text-[--color-text-2] hover:bg-[--color-surface-3]"
                >
                  Edit / Proses Ulang
                </button>

                <a
                  href={resultUrl}
                  download={`${base}_clean.${activeMedia === 'video' ? 'webm' : 'png'}`}
                  className="flex items-center justify-center gap-2 rounded bg-[--color-success] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity no-underline shadow-sm"
                >
                  <Download size={16} /> Download {activeMedia === 'video' ? 'Video' : 'Gambar'} Bersih
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  )
}
