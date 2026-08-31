import { useState, useRef, useEffect } from 'react'
import {
  Sparkles, Wand2, Paintbrush, Trash2, Download,
  Loader2, Check, Eye, Sliders, RefreshCw, ZoomIn, ZoomOut,
  Maximize2, X, Play, Pause, Video, Image as ImageIcon,
  StopCircle, CheckCircle2, SlidersHorizontal, ArrowLeftRight
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ProgressBar from '../../components/ProgressBar'
import {
  removeOfficialGeminiWatermark,
  createVideoFrameProcessor,
  inpaintWatermark,
  detectGeminiWatermark
} from '../../utils/watermarkRemover'
import { fmtBytes, stripExt } from '../../utils/helpers'

export default function WatermarkRemover() {
  const [activeMedia, setActiveMedia] = useState('image')
  const [file, setFile] = useState(null)
  const [mediaSrc, setMediaSrc] = useState(null)
  const [origDims, setOrigDims] = useState({ w: 0, h: 0 })

  // Removal Mode: 'gemini' (Official Gemini Lossless) | 'inpaint' (Fast-Marching Custom)
  const [removalMode, setRemovalMode] = useState('gemini')
  const [brushSize, setBrushSize] = useState(24)
  const [inpaintRadius, setInpaintRadius] = useState(5)
  const [hasMask, setHasMask] = useState(false)

  // Gemini detection
  const [detectedBox, setDetectedBox] = useState(null)

  // Fullscreen Modal & Zoom
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)

  // Video processing state
  const [videoDuration, setVideoDuration] = useState(0)
  const [videoBox, setVideoBox] = useState({ xPct: 82, yPct: 82, wPct: 15, hPct: 15 })

  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [resultBlob, setResultBlob] = useState(null)
  const [resultUrl, setResultUrl] = useState(null)
  const [error, setError] = useState('')

  const imgRef = useRef(null)
  const videoRef = useRef(null)
  const maskCanvasRef = useRef(null)
  const modalCanvasRef = useRef(null)
  const modalImgRef = useRef(null)
  const videoContainerRef = useRef(null)

  const isPaintingRef = useRef(false)
  const isCancelledRef = useRef(false)
  const isDraggingVideoRef = useRef(null)
  const videoDragStartRef = useRef({ startX: 0, startY: 0, box: { ...videoBox } })

  const handleFile = ([f]) => {
    setFile(f)
    setResultBlob(null)
    setResultUrl(null)
    setError('')
    setHasMask(false)
    setZoomLevel(1)

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
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)'
    ctx.fillRect(detectedBox.x, detectedBox.y, detectedBox.width, detectedBox.height)
    setHasMask(true)
    setRemovalMode('gemini')
  }

  const startVideoBoxDrag = (e, handleType) => {
    e.stopPropagation()
    e.preventDefault()
    isDraggingVideoRef.current = handleType
    videoDragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      box: { ...videoBox },
    }

    const onMouseMove = (moveEvent) => {
      if (!isDraggingVideoRef.current || !videoContainerRef.current) return
      const rect = videoContainerRef.current.getBoundingClientRect()
      const dxPct = ((moveEvent.clientX - videoDragStartRef.current.startX) / rect.width) * 100
      const dyPct = ((moveEvent.clientY - videoDragStartRef.current.startY) / rect.height) * 100
      const startB = videoDragStartRef.current.box

      let { xPct, yPct, wPct, hPct } = startB
      const h = isDraggingVideoRef.current

      if (h === 'move') {
        xPct = Math.max(0, Math.min(100 - wPct, startB.xPct + dxPct))
        yPct = Math.max(0, Math.min(100 - hPct, startB.yPct + dyPct))
      } else {
        if (h.includes('e')) wPct = Math.max(4, Math.min(100 - startB.xPct, startB.wPct + dxPct))
        if (h.includes('s')) hPct = Math.max(4, Math.min(100 - startB.yPct, startB.hPct + dyPct))
        if (h.includes('w')) {
          const maxW = startB.xPct + startB.wPct
          wPct = Math.max(4, Math.min(maxW, startB.wPct - dxPct))
          xPct = maxW - wPct
        }
        if (h.includes('n')) {
          const maxH = startB.yPct + startB.hPct
          hPct = Math.max(4, Math.min(maxH, startB.hPct - dyPct))
          yPct = maxH - hPct
        }
      }

      setVideoBox({ xPct, yPct, wPct, hPct })
    }

    const onMouseUp = () => {
      isDraggingVideoRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

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

  useEffect(() => {
    if (isModalOpen && modalCanvasRef.current && maskCanvasRef.current) {
      const modalCanvas = modalCanvasRef.current
      modalCanvas.width = origDims.w
      modalCanvas.height = origDims.h
      const ctx = modalCanvas.getContext('2d')
      ctx.drawImage(maskCanvasRef.current, 0, 0)
    }
  }, [isModalOpen])

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

      if (removalMode === 'gemini') {
        const result = await removeOfficialGeminiWatermark(img, { adaptiveMode: 'auto' })
        if (result && result.canvas) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(result.canvas, 0, 0)
        }
      } else {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        // Custom Inpainting for arbitrary logos
        const maskCtx = maskCanvasRef.current.getContext('2d')
        const maskImgData = maskCtx.getImageData(0, 0, canvas.width, canvas.height)
        inpaintWatermark(imgData, maskImgData.data, inpaintRadius)
        ctx.putImageData(imgData, 0, 0)
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

  // Synchronized Video Watermark Removal — detect once, blend fast per-frame
  const processVideoWatermark = async () => {
    if (!videoRef.current || processing) return
    setProcessing(true)
    setError('')
    setProgress(0)
    isCancelledRef.current = false

    const video = videoRef.current
    const w = video.videoWidth || 1280
    const h = video.videoHeight || 720

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')

    const stream = canvas.captureStream(30)
    try {
      const vidStream = video.captureStream ? video.captureStream() : (video.mozCaptureStream ? video.mozCaptureStream() : null)
      if (vidStream) {
        const audioTracks = vidStream.getAudioTracks()
        if (audioTracks.length > 0) stream.addTrack(audioTracks[0])
      }
    } catch {}

    let mimeType = 'video/webm;codecs=vp9'
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm'

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 12000000,
    })
    const recordedChunks = []

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data)
    }

    try {
      setProgress(5)
      const processor = await createVideoFrameProcessor(w, h)
      if (!processor) {
        setError('Tidak bisa mendeteksi watermark pada video ini')
        setProcessing(false)
        return
      }

      video.currentTime = 0
      video.playbackRate = 1.0
      await video.play()

      mediaRecorder.start(250)
      setProgress(10)

      await new Promise((resolve, reject) => {
        let isDone = false

        const finishRecording = async () => {
          if (isDone) return
          isDone = true
          video.pause()
          mediaRecorder.stop()
          mediaRecorder.onstop = () => {
            const videoBlob = new Blob(recordedChunks, { type: mimeType })
            setResultBlob(videoBlob)
            setResultUrl(URL.createObjectURL(videoBlob))
            setProgress(100)
            resolve()
          }
        }

        const renderFrame = () => {
          if (isCancelledRef.current) {
            video.pause()
            try { mediaRecorder.stop() } catch {}
            resolve()
            return
          }

          if (video.paused || video.ended) {
            finishRecording()
            return
          }

          ctx.drawImage(video, 0, 0, w, h)
          processor.processFrame(canvas)

          if (video.duration > 0) {
            setProgress(10 + Math.round((video.currentTime / video.duration) * 90))
          }

          if ('requestVideoFrameCallback' in video) {
            video.requestVideoFrameCallback(renderFrame)
          } else {
            requestAnimationFrame(renderFrame)
          }
        }

        video.onended = finishRecording
        video.onerror = (e) => reject(new Error('Gagal memutar frame video'))

        renderFrame()
      })
    } catch (e) {
      setError(`Gagal memproses video: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const base = file ? stripExt(file.name) : 'media'

  return (
    <ToolShell
      title="Hapus Watermark (Foto & Video)"
      description="Penghapus watermark AI (Google Gemini / Imagen) lossless berbasis @pilio/gemini-watermark-remover, plus Inpainting untuk logo & teks foto/video."
    >
      <DropZone
        accept="image/*,video/*,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov,.mkv"
        onFiles={handleFile}
        label="Pilih foto atau video untuk dihapus watermark-nya"
        hint="Foto (JPG, PNG, WebP) & Video (MP4, WebM, MOV) — 100% Client-Side"
      />

      {mediaSrc && (
        <div className="space-y-4 animate-fade-in">
          {/* Mode Selection */}
          {activeMedia === 'image' && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4">
              <div>
                <label className="block mb-2 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                  Pilih Mesin Penghapus Watermark
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setRemovalMode('gemini')}
                    className={[
                      'flex flex-col items-start rounded-lg border p-3.5 text-left transition-all',
                      removalMode === 'gemini'
                        ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand-text] font-bold shadow-xs'
                        : 'border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3]',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Sparkles size={15} className="text-[--color-brand]" />
                      <span>Gemini AI Lossless Remover (Resmi) ⭐</span>
                    </div>
                    <span className="text-[11px] font-normal opacity-80 mt-1 leading-relaxed">
                      Mesin resmi dari <code>geminiwatermarkremover.io</code>. Menghapus watermark AI di pojok kanan bawah secara matematis tanpa merusak kualitas foto.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRemovalMode('inpaint')}
                    className={[
                      'flex flex-col items-start rounded-lg border p-3.5 text-left transition-all',
                      removalMode === 'inpaint'
                        ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand-text] font-bold shadow-xs'
                        : 'border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3]',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Paintbrush size={15} className="text-amber-500" />
                      <span>Kuas Inpainting (Logo / Teks Bebas)</span>
                    </div>
                    <span className="text-[11px] font-normal opacity-80 mt-1 leading-relaxed">
                      Tandai area watermark di manapun dengan kuas seleksi pop-up. Algoritma akan merekonstruksi tekstur di sekitarnya.
                    </span>
                  </button>
                </div>
              </div>

              {removalMode === 'gemini' && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[--color-border] pt-3 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={autoSelectGeminiWatermark}
                      className="flex items-center gap-1.5 rounded border border-[--color-brand] bg-[--color-brand-light] px-3 py-1.5 font-bold text-[--color-brand] hover:bg-[--color-brand] hover:text-white transition-colors"
                    >
                      <Sparkles size={13} />
                      Auto Select Gemini Watermark
                    </button>
                    {hasMask && (
                      <span className="rounded bg-green-500/10 px-2 py-1 text-xs font-bold text-green-600 dark:text-green-400">
                        ✓ Area Terdeteksi
                      </span>
                    )}
                  </div>
                  {hasMask && (
                    <button
                      onClick={clearMask}
                      className="flex items-center gap-1 text-xs text-[--color-danger] hover:underline"
                    >
                      <Trash2 size={13} /> Hapus Tanda
                    </button>
                  )}
                </div>
              )}

              {removalMode === 'inpaint' && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[--color-border] pt-3 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(true)}
                      className="flex items-center gap-1.5 rounded border border-[--color-brand] bg-[--color-brand-light] px-3 py-1.5 font-bold text-[--color-brand] hover:bg-[--color-brand] hover:text-white transition-colors"
                    >
                      <Maximize2 size={13} />
                      Buka Kanvas Seleksi (Pop-up Fullscreen)
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
              )}
            </div>
          )}

          {/* Controls Bar for Video */}
          {activeMedia === 'video' && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-[--color-border] pb-3 text-xs">
                <div className="flex items-center gap-2 font-bold text-[--color-text]">
                  <Video size={16} className="text-[--color-brand]" />
                  <span>Penghapusan Watermark Video — Otomatis Gemini AI</span>
                </div>
                <span className="text-[11px] text-[--color-text-3]">
                  Durasi: {videoDuration ? `${videoDuration.toFixed(1)} detik` : 'Memuat…'}
                </span>
              </div>

              <div className="flex items-start gap-3 rounded border border-[--color-brand]/30 bg-[--color-brand-light] p-3 text-xs">
                <Sparkles size={16} className="mt-0.5 shrink-0 text-[--color-brand]" />
                <div>
                  <p className="font-bold text-[--color-brand]">Mode Otomatis — Engine Gemini Resmi</p>
                  <p className="mt-0.5 text-[--color-text-2] leading-relaxed">
                    Watermark AI di pojok kanan bawah akan dideteksi & dihapus secara otomatis dari seluruh frame video menggunakan engine resmi
                    <code className="mx-0.5 rounded bg-[--color-surface-3] px-1 py-0.5 text-[10px]">@pilio/gemini-watermark-remover</code>.
                    Tidak perlu seleksi manual — cukup klik "Hapus Watermark Video".
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Preview Container (Before Processing) */}
          {!resultUrl && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-[--color-text-3]">
                  {activeMedia === 'video' ? 'Pratinjau Video & Selector Draggable/Resizable' : 'Pratinjau Gambar'}
                </span>
                {activeMedia === 'image' && removalMode === 'inpaint' && (
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
                    {removalMode === 'inpaint' && (
                      <canvas
                        ref={maskCanvasRef}
                        className="absolute inset-0 block h-full w-full pointer-events-none opacity-80 rounded"
                      />
                    )}
                  </div>
                ) : (
                  <div className="relative inline-block select-none">
                    <video
                      ref={videoRef}
                      src={mediaSrc}
                      controls
                      onLoadedMetadata={(e) => setVideoDuration(e.target.duration)}
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
              disabled={processing || (activeMedia === 'image' && removalMode === 'inpaint' && !hasMask)}
              className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-all active:scale-[0.99]"
            >
              {processing && <Loader2 size={16} className="animate-spin" />}
              {processing
                ? 'Menghapus Watermark…'
                : activeMedia === 'video'
                ? 'Hapus Watermark dari Seluruh Video'
                : removalMode === 'gemini'
                ? 'Hapus Watermark Gemini AI (Lossless)'
                : hasMask
                ? 'Hapus Watermark Terpilih'
                : 'Tandai Area Watermark untuk Memulai'}
            </button>
          )}

          {/* Real-time Before & After Compare Preview & Result Card */}
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

          {/* Fullscreen Modal: True Fullscreen Fit (No Scroll unless zoomed) */}
          {isModalOpen && (
            <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-950 text-white w-screen h-screen overflow-hidden animate-fade-in">
              {/* Modal Header */}
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 px-4 sm:px-6 bg-slate-900/90">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-blue-600 text-white">
                    <Paintbrush size={16} />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Kanvas Seleksi Watermark ({origDims.w} × {origDims.h} px)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Warnai area merah persis di atas logo/teks watermark yang ingin dihapus
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={saveModalMask}
                    className="flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <Check size={14} /> Selesai & Terapkan
                  </button>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Modal Toolbar: Zoom & Brush Controls */}
              <div className="flex h-12 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-slate-900/60 px-4 sm:px-6 text-xs">
                {/* Zoom Controls */}
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-400">Zoom:</span>
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                    className="flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    title="Zoom Out"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span className="w-12 text-center font-mono font-bold text-white">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button
                    onClick={() => setZoomLevel((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                    className="flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    title="Zoom In"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    onClick={() => setZoomLevel(1)}
                    className="text-xs text-blue-400 hover:underline ml-1"
                  >
                    Reset 100%
                  </button>
                </div>

                {/* Brush Size Controls */}
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-400">Ukuran Kuas:</span>
                  <input
                    type="range"
                    min="6"
                    max="80"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-24 sm:w-32"
                  />
                  <span className="w-8 font-mono text-xs text-white">{brushSize}px</span>
                </div>

                {/* Clear button */}
                <div>
                  <button
                    onClick={clearMask}
                    className="flex items-center gap-1 text-xs text-red-400 hover:underline"
                  >
                    <Trash2 size={13} /> Bersihkan Tanda
                  </button>
                </div>
              </div>

              {/* Modal Stage: Fits screen 100% without scroll unless zoomed */}
              <div className={[
                'relative flex-1 flex items-center justify-center p-3 sm:p-5 select-none',
                zoomLevel > 1 ? 'overflow-auto cursor-grab active:cursor-grabbing' : 'overflow-hidden cursor-crosshair'
              ].join(' ')}>
                <div
                  className="relative flex items-center justify-center shadow-2xl transition-transform duration-100 origin-center"
                  style={{
                    transform: `scale(${zoomLevel})`,
                  }}
                >
                  <img
                    ref={modalImgRef}
                    src={mediaSrc}
                    alt="Mask Target"
                    className="block max-h-[76vh] max-w-[92vw] object-contain rounded select-none pointer-events-none"
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
          )}
        </div>
      )}
    </ToolShell>
  )
}
