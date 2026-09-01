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
import FilePreview from '../../components/FilePreview'
import {
  removeOfficialGeminiWatermark,
  processVideoFrame,
  inpaintWatermark,
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

  // Removal Mode: 'gemini' (Official Gemini Lossless) | 'inpaint' (Fast-Marching Custom)
  const [removalMode, setRemovalMode] = useState('gemini')
  const [brushSize, setBrushSize] = useState(24)
  const [inpaintRadius, setInpaintRadius] = useState(5)
  const [hasMask, setHasMask] = useState(false)

  // Gemini detection
  const [detectedBox, setDetectedBox] = useState(null)

  // Alpha gain control (separate defaults for image vs video)
  const [alphaGainImage, setAlphaGainImage] = useState(1.0)
  const [alphaGainVideo, setAlphaGainVideo] = useState(0.60)
  const alphaGain = activeMedia === 'video' ? alphaGainVideo : alphaGainImage
  const setAlphaGain = activeMedia === 'video' ? setAlphaGainVideo : setAlphaGainImage

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

  // Video masking
  const [videoMaskSrc, setVideoMaskSrc] = useState(null)
  const videoMaskCanvasRef = useRef(null)
  const videoModalCanvasRef = useRef(null)
  const videoModalImgRef = useRef(null)

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

    if (isVid) {
      // Pre-fetch SDK on video upload for browser CDN caching
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

  // Video mask functions
  const startVideoModalPaint = (e) => {
    isPaintingRef.current = true
    paintVideoModal(e)
  }

  const paintVideoModal = (e) => {
    if (!isPaintingRef.current || !videoModalCanvasRef.current) return
    const canvas = videoModalCanvasRef.current
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

  const stopVideoModalPaint = () => {
    isPaintingRef.current = false
  }

  const clearVideoMask = () => {
    if (videoModalCanvasRef.current) {
      const ctx = videoModalCanvasRef.current.getContext('2d')
      ctx.clearRect(0, 0, videoModalCanvasRef.current.width, videoModalCanvasRef.current.height)
    }
    setHasMask(false)
  }

  const saveVideoModalMask = () => {
    if (videoModalCanvasRef.current) {
      const clone = document.createElement('canvas')
      clone.width = videoModalCanvasRef.current.width
      clone.height = videoModalCanvasRef.current.height
      clone.getContext('2d').drawImage(videoModalCanvasRef.current, 0, 0)
      setVideoMaskSrc(clone)
    }
    setIsModalOpen(false)
  }

  useEffect(() => {
    if (!isModalOpen) return
    if (activeMedia === 'image' && modalCanvasRef.current && modalImgRef.current) {
      const canvas = modalCanvasRef.current
      const img = modalImgRef.current
      const initCanvas = () => {
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (maskCanvasRef.current) ctx.drawImage(maskCanvasRef.current, 0, 0)
      }
      if (img.complete && img.naturalWidth > 0) initCanvas()
      else img.onload = initCanvas
    }
    if (activeMedia === 'video' && videoModalCanvasRef.current && videoRef.current) {
      const vc = videoModalCanvasRef.current
      const vw = videoRef.current.videoWidth || 1280
      const vh = videoRef.current.videoHeight || 720
      vc.width = vw
      vc.height = vh
      const ctx = vc.getContext('2d')
      ctx.clearRect(0, 0, vw, vh)
      if (videoMaskSrc) ctx.drawImage(videoMaskSrc, 0, 0)
    }
  }, [isModalOpen, activeMedia])

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
        const { canvas: resultCanvas, meta } = await removeOfficialGeminiWatermark(img, { adaptiveMode: 'auto', alphaGain })
        if (resultCanvas) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(resultCanvas, 0, 0)
        }
      } else {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
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

  // Video Watermark Removal — same SDK method as image, per-frame
  const processVideoWatermark = async () => {
    if (!videoRef.current || processing) return
    setProcessing(true)
    setError('')
    setProgress(0)
    isCancelledRef.current = false

    const video = videoRef.current

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    // captureStream(30) = auto-capture at 30fps
    const stream = canvas.captureStream(30)

    let mimeType = 'video/webm;codecs=vp9'
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm'
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4'

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

      if (video.readyState < 2) {
        await new Promise((res) => { video.oncanplay = res; video.load() })
      }

      // Seek to first frame
      video.currentTime = 0
      await new Promise((res) => { video.onseeked = res })

      const actualW = video.videoWidth || 1280
      const actualH = video.videoHeight || 720
      canvas.width = actualW
      canvas.height = actualH

      // Test first frame with SDK
      ctx.drawImage(video, 0, 0, actualW, actualH)
      const testResult = await processVideoFrame(canvas, { alphaGain })
      if (!testResult) {
        console.warn('[WM] First frame no watermark detected, continuing anyway...')
        // Redraw original for this frame
        ctx.drawImage(video, 0, 0, actualW, actualH)
      }
      console.log('[WM] First frame result:', testResult?.meta)

      // Start recording
      mediaRecorder.start(50)
      setProgress(10)

      // Seek back and play
      video.muted = true
      video.currentTime = 0
      await new Promise((res) => { video.onseeked = res })
      await video.play()

      const totalFrames = Math.ceil(video.duration * 30)
      let frameCount = 0

      // Frame loop: draw → process (same as image) → captureStream records
      const processNextFrame = async () => {
        if (isCancelledRef.current || video.ended || video.currentTime >= video.duration - 0.05) {
          mediaRecorder.stop()
          return
        }

        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, actualW, actualH)

        // Process watermark — exact same method as image
        if (removalMode === 'gemini') {
          await processVideoFrame(canvas, { alphaGain })
        } else if (removalMode === 'inpaint' && videoMaskSrc) {
          const imgData = ctx.getImageData(0, 0, actualW, actualH)
          const maskCtx = videoMaskSrc.getContext('2d')
          const maskData = maskCtx.getImageData(0, 0, videoMaskSrc.width, videoMaskSrc.height)
          inpaintWatermark(imgData, maskData.data, inpaintRadius)
          ctx.putImageData(imgData, 0, 0)
        }

        frameCount++
        if (frameCount % 5 === 0) {
          setProgress(Math.min(99, 10 + Math.round((frameCount / totalFrames) * 90)))
        }

        if (!isCancelledRef.current && !video.ended) {
          requestAnimationFrame(processNextFrame)
        } else {
          mediaRecorder.stop()
        }
      }

      requestAnimationFrame(processNextFrame)

      // Wait for recording to finish
      await new Promise((resolve, reject) => {
        mediaRecorder.onstop = () => {
          const videoBlob = new Blob(recordedChunks, { type: mimeType })
          setResultBlob(videoBlob)
          setResultUrl(URL.createObjectURL(videoBlob))
          setProgress(100)
          resolve()
        }
        mediaRecorder.onerror = reject
      })
    } catch (e) {
      setError(`Gagal memproses video: ${e.message}`)
    } finally {
      video.pause()
      setProcessing(false)
    }
  }

  const base = file ? stripExt(file.name) : 'media'

  return (
    <ToolShell
      title="Hapus Watermark (Foto & Video)"
      description="Penghapus watermark AI (Google Gemini / Imagen) lossless berbasis engine mandiri GargantuaX, plus Inpainting untuk logo & teks foto/video."
    >
      <DropZone
        accept="image/*,video/*,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov,.mkv"
        onFiles={handleFile}
        label="Pilih foto atau video untuk dihapus watermark-nya"
        hint="Foto (JPG, PNG, WebP) & Video (MP4, WebM, MOV) — 100% Client-Side"
      />
      {file && <FilePreview file={file} />}

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
                  <span>Penghapusan Watermark Video</span>
                </div>
                <span className="text-[11px] text-[--color-text-3]">
                  Durasi: {videoDuration ? `${videoDuration.toFixed(1)} detik` : 'Memuat…'}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => { setRemovalMode('gemini'); setHasMask(false); setVideoMaskSrc(null) }}
                  className={[
                    'flex flex-col items-start rounded-lg border p-3.5 text-left transition-all',
                    removalMode === 'gemini'
                      ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand-text] font-bold shadow-xs'
                      : 'border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3]',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Sparkles size={15} className="text-[--color-brand]" />
                    <span>Gemini AI Otomatis ⭐</span>
                  </div>
                  <span className="text-[11px] font-normal opacity-80 mt-1 leading-relaxed">
                    Deteksi & hapus watermark Gemini AI di pojok kanan bawah secara otomatis dari seluruh frame.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => { setRemovalMode('inpaint'); setIsModalOpen(true) }}
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
                    Tandai area watermark di manapun dengan kuas seleksi pop-up. Cocok untuk watermark non-Gemini.
                  </span>
                </button>
              </div>

            </div>
          )}

          {/* Alpha Gain Slider — shows for both image and video in gemini mode */}
          {removalMode === 'gemini' && (
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
                      ref={(el) => {
                        imgRef.current = el
                        if (el && el.complete && el.naturalWidth > 0) {
                          initMaskCanvas(el.naturalWidth, el.naturalHeight)
                        }
                      }}
                      src={mediaSrc}
                      alt="Original"
                      className="block max-h-[420px] w-auto pointer-events-none rounded"
                    />
                    {removalMode === 'inpaint' && (
                      <canvas
                        ref={maskCanvasRef}
                        className="absolute top-0 left-0 block pointer-events-none opacity-80 rounded"
                        style={{ width: '100%', height: '100%' }}
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
                    {removalMode === 'inpaint' && hasMask && videoMaskSrc && (
                      <canvas
                        ref={(el) => {
                          videoMaskCanvasRef.current = el
                          if (el && videoMaskSrc && videoRef.current) {
                            el.width = videoRef.current.videoWidth || 1280
                            el.height = videoRef.current.videoHeight || 720
                            const ctx = el.getContext('2d')
                            ctx.clearRect(0, 0, el.width, el.height)
                            ctx.drawImage(videoMaskSrc, 0, 0)
                          }
                        }}
                        className="absolute top-0 left-0 block pointer-events-none opacity-80 rounded"
                        style={{ width: '100%', height: '100%' }}
                      />
                    )}
                    {removalMode === 'inpaint' && (
                      <div className="absolute bottom-2 right-2 z-10">
                        <button
                          onClick={() => setIsModalOpen(true)}
                          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-lg hover:bg-blue-700 transition-colors"
                        >
                          <Paintbrush size={13} />
                          {hasMask ? 'Ubah Masking' : 'Beri Masking Watermark'}
                        </button>
                      </div>
                    )}
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
              disabled={processing || (activeMedia === 'image' && removalMode === 'inpaint' && !hasMask) || (activeMedia === 'video' && removalMode === 'inpaint' && !videoMaskSrc)}
              className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-all active:scale-[0.99]"
            >
              {processing && <Loader2 size={16} className="animate-spin" />}
              {processing
                ? 'Menghapus Watermark…'
                : activeMedia === 'video'
                ? removalMode === 'gemini'
                  ? 'Hapus Watermark Gemini dari Video'
                  : hasMask
                  ? 'Hapus Watermark Video (Inpainting)'
                  : 'Tandai Area Watermark di Video'
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

          {/* Simple Modal: Masking Selector */}
          {isModalOpen && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}>
              <div className="relative w-[92%] max-w-[700px] rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 shadow-2xl overflow-hidden border border-gray-200 dark:border-slate-700">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                      <Paintbrush size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold leading-tight">Masking Watermark</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{origDims.w} × {origDims.h} px</p>
                    </div>
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-gray-200">
                    <X size={18} />
                  </button>
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-3">
                  <p className="text-xs text-gray-600 dark:text-gray-400">Warnai area watermark dengan kuas. Area merah akan dihapus.</p>

                  {/* Brush Size */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Kuas:</span>
                    <input type="range" min="6" max="80" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="flex-1 h-1.5 accent-blue-600" />
                    <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 w-8">{brushSize}px</span>
                  </div>

                  {/* Preview Canvas */}
                  <div className="relative flex justify-center rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 p-2 overflow-hidden min-h-[300px] max-h-[65vh]">
                    {activeMedia === 'video' ? (
                      <div className="relative inline-flex items-center justify-center">
                        <canvas
                          ref={(el) => {
                            videoModalImgRef.current = el
                            if (el && videoRef.current) {
                              const vw = videoRef.current.videoWidth || 1280
                              const vh = videoRef.current.videoHeight || 720
                              el.width = vw
                              el.height = vh
                              const c = el.getContext('2d')
                              const tempVid = document.createElement('video')
                              tempVid.src = mediaSrc
                              tempVid.muted = true
                              tempVid.onloadeddata = () => {
                                tempVid.currentTime = 0.5
                                tempVid.onseeked = () => c.drawImage(tempVid, 0, 0, vw, vh)
                              }
                            }
                          }}
                          className="block max-h-[60vh] max-w-full rounded pointer-events-none"
                        />
                        <canvas
                          ref={videoModalCanvasRef}
                          onMouseDown={startVideoModalPaint}
                          onMouseMove={paintVideoModal}
                          onMouseUp={stopVideoModalPaint}
                          onMouseLeave={stopVideoModalPaint}
                          className="absolute top-0 left-0 pointer-events-auto opacity-80 rounded"
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>
                    ) : (
                      <div className="relative inline-flex items-center justify-center">
                        <img ref={modalImgRef} src={mediaSrc} alt="Mask" className="block max-h-[60vh] max-w-full rounded pointer-events-none" />
                        <canvas
                          ref={modalCanvasRef}
                          onMouseDown={startModalPaint}
                          onMouseMove={paintModal}
                          onMouseUp={stopModalPaint}
                          onMouseLeave={stopModalPaint}
                          className="absolute top-0 left-0 pointer-events-auto opacity-80 rounded"
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>
                    )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                  <button onClick={activeMedia === 'video' ? clearVideoMask : clearMask} className="text-xs text-red-500 hover:underline font-semibold">
                    <Trash2 size={12} className="inline mr-1" />Hapus Tanda
                  </button>
                  <button
                    onClick={activeMedia === 'video' ? saveVideoModalMask : saveModalMask}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <Check size={14} className="inline mr-1" />Selesai & Terapkan
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
