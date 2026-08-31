import { useState, useRef, useEffect } from 'react'
import {
  Sparkles, Wand2, Paintbrush, Trash2, Download,
  Loader2, Check, Eye, Sliders, RefreshCw, ZoomIn, ZoomOut,
  Maximize2, X, Play, Pause, Video, Image as ImageIcon,
  StopCircle, CheckCircle2
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import ProgressBar from '../../components/ProgressBar'
import {
  reverseAlphaBlend,
  inpaintWatermark,
  detectGeminiWatermark
} from '../../utils/watermarkRemover'
import { fmtBytes, stripExt } from '../../utils/helpers'

export default function WatermarkRemover() {
  const [activeMedia, setActiveMedia] = useState('image') // 'image' | 'video'
  const [file, setFile] = useState(null)
  const [mediaSrc, setMediaSrc] = useState(null)
  const [origDims, setOrigDims] = useState({ w: 0, h: 0 })

  // Removal Mode: 'alpha' (Reverse Alpha Lossless) | 'inpaint' (Fast-Marching Telea)
  const [removalMode, setRemovalMode] = useState('inpaint')
  const [brushSize, setBrushSize] = useState(24)
  const [inpaintRadius, setInpaintRadius] = useState(6)
  const [alphaStrength, setAlphaStrength] = useState(1.0)
  const [hasMask, setHasMask] = useState(false)

  // Gemini detection
  const [detectedBox, setDetectedBox] = useState(null)

  // Pop-up Zoomable Modal (Image)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)

  // Video processing state
  const [isPlaying, setIsPlaying] = useState(false)
  const [videoDuration, setVideoDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoBox, setVideoBox] = useState({ xPct: 85, yPct: 85, wPct: 12, hPct: 12 })

  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [resultBlob, setResultBlob] = useState(null)
  const [error, setError] = useState('')

  const imgRef = useRef(null)
  const videoRef = useRef(null)
  const previewCanvasRef = useRef(null)
  const maskCanvasRef = useRef(null)
  const modalCanvasRef = useRef(null)
  const isPaintingRef = useRef(false)
  const isCancelledRef = useRef(false)

  const handleFile = ([f]) => {
    setFile(f)
    setResultBlob(null)
    setError('')
    setHasMask(false)
    setIsPlaying(false)

    const isVid = f.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(f.name)
    setActiveMedia(isVid ? 'video' : 'image')

    const url = URL.createObjectURL(f)
    setMediaSrc(url)

    if (!isVid) {
      const img = new Image()
      img.onload = () => {
        setOrigDims({ w: img.naturalWidth, h: img.naturalHeight })
        const det = detectGeminiWatermark(img.naturalWidth, img.naturalHeight)
        setDetectedBox(det)
        initMaskCanvas(img.naturalWidth, img.naturalHeight)
      }
      img.src = url
    }
  }

  const initMaskCanvas = (w, h) => {
    if (!maskCanvasRef.current) return
    const canvas = maskCanvasRef.current
    canvas.width = w || origDims.w
    canvas.height = h || origDims.h
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const autoSelectGeminiWatermark = () => {
    if (!detectedBox || !maskCanvasRef.current) return
    const canvas = maskCanvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)'
    ctx.fillRect(detectedBox.x, detectedBox.y, detectedBox.width, detectedBox.height)
    setHasMask(true)
    setRemovalMode('alpha')
  }

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
    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)'
    ctx.beginPath()
    ctx.arc(x, y, (brushSize * scaleX) / 2, 0, Math.PI * 2)
    ctx.fill()
    setHasMask(true)
  }

  const stopModalPaint = () => {
    isPaintingRef.current = false
  }

  const clearMask = () => {
    initMaskCanvas(origDims.w, origDims.h)
    if (modalCanvasRef.current) {
      const ctx = modalCanvasRef.current.getContext('2d')
      ctx.clearRect(0, 0, modalCanvasRef.current.width, modalCanvasRef.current.height)
    }
    setHasMask(false)
  }

  const saveModalMask = () => {
    if (modalCanvasRef.current && maskCanvasRef.current) {
      const ctx = maskCanvasRef.current.getContext('2d')
      ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height)
      ctx.drawImage(modalCanvasRef.current, 0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height)
    }
    setIsModalOpen(false)
  }

  // Sync canvas when modal opens
  useEffect(() => {
    if (isModalOpen && modalCanvasRef.current && maskCanvasRef.current) {
      const modalCanvas = modalCanvasRef.current
      modalCanvas.width = origDims.w
      modalCanvas.height = origDims.h
      const ctx = modalCanvas.getContext('2d')
      ctx.drawImage(maskCanvasRef.current, 0, 0)
    }
  }, [isModalOpen])

  // Process image watermark removal
  const processImageWatermark = async () => {
    if (!mediaSrc || !hasMask) return
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
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const maskCtx = maskCanvasRef.current.getContext('2d')
      const maskImgData = maskCtx.getImageData(0, 0, canvas.width, canvas.height)

      setProgress(50)

      if (removalMode === 'alpha' && detectedBox) {
        reverseAlphaBlend(imgData, maskImgData.data, {
          x: detectedBox.x,
          y: detectedBox.y,
          width: detectedBox.width,
          height: detectedBox.height,
          strength: alphaStrength,
        })
      } else {
        inpaintWatermark(imgData, maskImgData.data, inpaintRadius)
      }

      setProgress(85)
      ctx.putImageData(imgData, 0, 0)

      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
      setProgress(100)
      setResultBlob(blob)
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  // Process Video Watermark Removal frame-by-frame
  const processVideoWatermark = async () => {
    if (!videoRef.current || processing) return
    setProcessing(true)
    setError('')
    setProgress(0)
    isCancelledRef.current = false

    const video = videoRef.current
    const w = video.videoWidth || 1280
    const h = video.videoHeight || 720
    const duration = video.duration || 5

    // Prepare offscreen canvas
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    // Create mask for the video watermark area
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = w
    maskCanvas.height = h
    const mCtx = maskCanvas.getContext('2d')
    mCtx.fillStyle = '#ff0000'

    const targetX = Math.round((videoBox.xPct / 100) * w)
    const targetY = Math.round((videoBox.yPct / 100) * h)
    const targetW = Math.round((videoBox.wPct / 100) * w)
    const targetH = Math.round((videoBox.hPct / 100) * h)
    mCtx.fillRect(targetX, targetY, targetW, targetH)
    const maskData = mCtx.getImageData(0, 0, w, h).data

    // Setup MediaRecorder
    const stream = canvas.captureStream(30)
    let mimeType = 'video/webm;codecs=vp9'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm'
    }

    const mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6000000 })
    const recordedChunks = []

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data)
    }

    mediaRecorder.start()

    const fps = 25
    const totalFrames = Math.floor(duration * fps)
    const frameInterval = 1 / fps

    video.pause()

    try {
      for (let f = 0; f < totalFrames; f++) {
        if (isCancelledRef.current) break

        video.currentTime = f * frameInterval
        await new Promise((r) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked)
            r()
          }
          video.addEventListener('seeked', onSeeked)
        })

        // Draw current video frame to canvas
        ctx.drawImage(video, 0, 0, w, h)
        const frameData = ctx.getImageData(0, 0, w, h)

        // Inpaint watermark area on this frame
        inpaintWatermark(frameData, maskData, 4)
        ctx.putImageData(frameData, 0, 0)

        // Update live preview canvas if visible
        if (previewCanvasRef.current) {
          previewCanvasRef.current.width = w
          previewCanvasRef.current.height = h
          previewCanvasRef.current.getContext('2d').drawImage(canvas, 0, 0)
        }

        setProgress(Math.round(((f + 1) / totalFrames) * 100))
        await new Promise((r) => setTimeout(r, 10))
      }

      mediaRecorder.stop()
      await new Promise((r) => {
        mediaRecorder.onstop = r
      })

      const videoBlob = new Blob(recordedChunks, { type: mimeType })
      setResultBlob(videoBlob)
    } catch (e) {
      setError(`Gagal memproses video: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const base = file ? stripExt(file.name) : 'media'
  const isLandscape = origDims.w >= origDims.h

  return (
    <ToolShell
      title="Hapus Watermark (Foto & Video)"
      description="Hapus logo, cap air, tanggal kamera, dan watermark AI (Gemini/Imagen/Midjourney) dari foto maupun video langsung di browser dengan algoritma Reverse Alpha Blending & Inpainting."
    >
      <DropZone
        accept="image/*,video/*,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov,.mkv"
        onFiles={handleFile}
        label="Pilih foto atau video untuk dihapus watermark-nya"
        hint="Foto (JPG, PNG, WebP) & Video (MP4, WebM, MOV) — 100% Client-Side"
      />

      {mediaSrc && (
        <div className="space-y-4 animate-fade-in">
          {/* Quick Gemini Auto-Detect Banner for Images */}
          {activeMedia === 'image' && detectedBox && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[--color-brand] bg-[--color-brand-light] p-3 text-xs animate-fade-in">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="shrink-0 text-[--color-brand]" />
                <span className="text-[--color-brand-text]">
                  <strong>Watermark AI Terdeteksi:</strong> Ditemukan posisi cap air AI ({detectedBox.width}×{detectedBox.height} px) di sudut kanan bawah.
                </span>
              </div>
              <button
                onClick={autoSelectGeminiWatermark}
                className="shrink-0 rounded bg-[--color-brand] px-3 py-1 font-bold text-white hover:bg-[--color-brand-hover] transition-colors"
              >
                Pilih Otomatis (Gemini AI)
              </button>
            </div>
          )}

          {/* Controls Bar for Image */}
          {activeMedia === 'image' && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4">
              <div>
                <label className="block mb-2 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                  Metode Penghapusan Watermark
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setRemovalMode('inpaint')}
                    className={[
                      'flex flex-col items-start rounded border p-3 text-left transition-all',
                      removalMode === 'inpaint'
                        ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand-text] font-bold shadow-xs'
                        : 'border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3]',
                    ].join(' ')}
                  >
                    <span className="text-xs font-bold">Fast-Marching Inpainting (Rekomendasi)</span>
                    <span className="text-[11px] font-normal opacity-80 mt-0.5">
                      Cocok untuk logo padat, cap teks, tanggal kamera, dan watermark bebas.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRemovalMode('alpha')}
                    className={[
                      'flex flex-col items-start rounded border p-3 text-left transition-all',
                      removalMode === 'alpha'
                        ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand-text] font-bold shadow-xs'
                        : 'border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3]',
                    ].join(' ')}
                  >
                    <span className="text-xs font-bold">Reverse Alpha Blending (Lossless)</span>
                    <span className="text-[11px] font-normal opacity-80 mt-0.5">
                      Pemulihan warna matematis murni untuk watermark semi-transparan / Gemini AI.
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[--color-border] pt-3 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-1.5 rounded border border-[--color-brand] bg-[--color-brand-light] px-3 py-1.5 font-bold text-[--color-brand] hover:bg-[--color-brand] hover:text-white transition-colors"
                  >
                    <Maximize2 size={13} />
                    Buka Kanvas Seleksi (Pop-up & Zoom)
                  </button>
                  {hasMask && (
                    <span className="rounded bg-red-500/10 px-2 py-1 text-xs font-bold text-red-600 dark:text-red-400">
                      ✓ Area Ditandai
                    </span>
                  )}
                </div>

                {hasMask && (
                  <button
                    onClick={clearMask}
                    className="flex items-center gap-1 text-xs text-[--color-danger] hover:underline"
                  >
                    <Trash2 size={13} /> Hapus Tanda Merah
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Controls Bar for Video */}
          {activeMedia === 'video' && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-[--color-border] pb-3 text-xs">
                <div className="flex items-center gap-2 font-bold text-[--color-text]">
                  <Video size={16} className="text-[--color-brand]" />
                  <span>Pengaturan Area Watermark Video</span>
                </div>
                <span className="text-[11px] text-[--color-text-3]">
                  Durasi: {videoDuration ? `${videoDuration.toFixed(1)} detik` : 'Memuat…'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block mb-1 font-semibold text-[--color-text-2]">Posisi X: {videoBox.xPct}%</label>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={videoBox.xPct}
                    onChange={(e) => setVideoBox((b) => ({ ...b, xPct: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-semibold text-[--color-text-2]">Posisi Y: {videoBox.yPct}%</label>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={videoBox.yPct}
                    onChange={(e) => setVideoBox((b) => ({ ...b, yPct: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-semibold text-[--color-text-2]">Lebar: {videoBox.wPct}%</label>
                  <input
                    type="range"
                    min="4"
                    max="30"
                    value={videoBox.wPct}
                    onChange={(e) => setVideoBox((b) => ({ ...b, wPct: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-semibold text-[--color-text-2]">Tinggi: {videoBox.hPct}%</label>
                  <input
                    type="range"
                    min="4"
                    max="30"
                    value={videoBox.hPct}
                    onChange={(e) => setVideoBox((b) => ({ ...b, hPct: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVideoBox({ xPct: 84, yPct: 84, wPct: 14, hPct: 14 })}
                  className="rounded border border-[--color-border] bg-[--color-surface-2] px-2.5 py-1 text-xs text-[--color-text-2] hover:bg-[--color-surface-3]"
                >
                  Preset Kanan Bawah (Gemini / AI Video)
                </button>
                <button
                  type="button"
                  onClick={() => setVideoBox({ xPct: 2, yPct: 2, wPct: 14, hPct: 14 })}
                  className="rounded border border-[--color-border] bg-[--color-surface-2] px-2.5 py-1 text-xs text-[--color-text-2] hover:bg-[--color-surface-3]"
                >
                  Preset Kiri Atas
                </button>
              </div>
            </div>
          )}

          {/* Interactive Preview Container */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-[--color-text-3]">
                {activeMedia === 'video' ? 'Pratinjau Video & Kotak Masking' : 'Pratinjau Gambar & Masking'}
              </span>
              {activeMedia === 'image' && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-1 text-[--color-brand] hover:underline font-semibold"
                >
                  <Paintbrush size={12} /> {hasMask ? 'Ubah Seleksi' : 'Tandai Watermark'}
                </button>
              )}
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
                  <canvas
                    ref={maskCanvasRef}
                    className="absolute inset-0 block h-full w-full pointer-events-none opacity-80 rounded"
                  />
                </div>
              ) : (
                <div className="relative inline-block">
                  <video
                    ref={videoRef}
                    src={mediaSrc}
                    controls
                    onLoadedMetadata={(e) => setVideoDuration(e.target.duration)}
                    className="block max-h-[420px] w-auto rounded"
                  />
                  {/* Video Watermark Mask Target Overlay */}
                  <div
                    className="absolute border-2 border-red-500 bg-red-500/40 pointer-events-none rounded transition-all duration-100"
                    style={{
                      left: `${videoBox.xPct}%`,
                      top: `${videoBox.yPct}%`,
                      width: `${videoBox.wPct}%`,
                      height: `${videoBox.hPct}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 rounded bg-red-600 px-1 py-0.2 text-[9px] font-bold text-white uppercase">
                      Hapus Area Ini
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {processing && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-semibold text-[--color-brand]">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Sedang memproses rekontruksi frame… ({progress}%)</span>
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
              disabled={processing || (activeMedia === 'image' && !hasMask)}
              className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-all active:scale-[0.99]"
            >
              {processing && <Loader2 size={16} className="animate-spin" />}
              {processing
                ? 'Menghapus Watermark…'
                : activeMedia === 'video'
                ? 'Hapus Watermark dari Seluruh Video'
                : hasMask
                ? 'Hapus Watermark dari Gambar'
                : 'Tandai Area Watermark untuk Memulai'}
            </button>
          )}

          {/* Result Card */}
          {resultBlob && (
            <div className="rounded-lg border border-[--color-success-light] bg-[--color-success-light] p-4 animate-fade-in space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-[--color-success] flex items-center gap-1.5">
                    <CheckCircle2 size={16} /> Watermark Berhasil Dihapus!
                  </p>
                  <p className="mt-0.5 text-xs text-[--color-text-2]">
                    File bersih: {base}_clean.{activeMedia === 'video' ? 'webm' : 'png'} ({fmtBytes(resultBlob.size)})
                  </p>
                </div>
                <button
                  onClick={() => { setResultBlob(null); setHasMask(false) }}
                  className="rounded p-1 text-[--color-text-3] hover:bg-[--color-surface-3]"
                >
                  ✕
                </button>
              </div>

              {activeMedia === 'video' && (
                <div className="flex justify-center bg-black/80 p-2 rounded">
                  <video src={URL.createObjectURL(resultBlob)} controls className="max-h-60 rounded" />
                </div>
              )}

              <a
                href={URL.createObjectURL(resultBlob)}
                download={`${base}_clean.${activeMedia === 'video' ? 'webm' : 'png'}`}
                className="flex items-center justify-center gap-2 rounded bg-[--color-success] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity no-underline"
              >
                <Download size={16} /> Download {activeMedia === 'video' ? 'Video' : 'Gambar'} Hasil
              </a>
            </div>
          )}

          {/* Pop-up Masking Modal for Image */}
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-3 sm:p-6 animate-fade-in">
              <div
                className="flex flex-col rounded-xl border border-[--color-border] bg-[--color-surface] shadow-2xl overflow-hidden transition-all"
                style={{
                  width: isLandscape ? 'min(94vw, 1100px)' : 'min(90vw, 750px)',
                  height: 'min(90vh, 850px)',
                }}
              >
                <div className="flex items-center justify-between border-b border-[--color-border] px-4 sm:px-5 py-3 bg-[--color-surface]">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded bg-[--color-brand-light] text-[--color-brand]">
                      <Paintbrush size={16} />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-[--color-text]">
                        Kanvas Seleksi Watermark ({origDims.w ? `${origDims.w} × ${origDims.h} px` : ''})
                      </h3>
                      <p className="text-[11px] text-[--color-text-3]">
                        Warnai area merah persis di atas logo/teks watermark yang ingin dihapus
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
                      onClick={() => setIsModalOpen(false)}
                      className="rounded p-1.5 text-[--color-text-3] hover:bg-[--color-surface-3] hover:text-[--color-text]"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[--color-border] bg-[--color-surface-2] px-4 sm:px-5 py-2 text-xs">
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

                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-[--color-text-3]">Ukuran Kuas:</span>
                    <input
                      type="range"
                      min="6"
                      max="80"
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-24 sm:w-28"
                    />
                    <span className="w-8 font-mono text-xs text-[--color-text]">{brushSize}px</span>
                  </div>

                  <div>
                    <button
                      onClick={clearMask}
                      className="flex items-center gap-1 text-xs text-[--color-danger] hover:underline"
                    >
                      <Trash2 size={13} /> Bersihkan Tanda
                    </button>
                  </div>
                </div>

                <div className="relative flex-1 overflow-auto bg-neutral-900 p-4 sm:p-6 flex items-center justify-center cursor-crosshair select-none">
                  <div
                    className="relative inline-block shadow-2xl transition-transform duration-100 origin-center"
                    style={{
                      transform: `scale(${zoomLevel})`,
                      aspectRatio: origDims.w ? `${origDims.w} / ${origDims.h}` : 'auto',
                    }}
                  >
                    <img
                      src={mediaSrc}
                      alt="Mask Target"
                      className="block max-h-[62vh] w-auto max-w-[85vw] object-contain pointer-events-none select-none rounded"
                    />
                    <canvas
                      ref={modalCanvasRef}
                      onMouseDown={startModalPaint}
                      onMouseMove={paintModal}
                      onMouseUp={stopModalPaint}
                      onMouseLeave={stopModalPaint}
                      className="absolute inset-0 block h-full w-full pointer-events-auto opacity-80 rounded"
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
