import { useState, useRef, useEffect } from 'react'
import {
  Loader2, Check, Download, RefreshCw, Trash2, Cpu,
  Paintbrush, Info, Maximize2, X, Trash
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import { stripExt } from '../../utils/helpers'

const MAX_DIM = 512

export default function ObjectRemover() {
  const [imageSrc, setImageSrc] = useState(null)
  const [fileName, setFileName] = useState('')
  const [brushSize, setBrushSize] = useState(30)
  const [processing, setProcessing] = useState(false)
  const [loadStage, setLoadStage] = useState('')
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 })
  const [resultUrl, setResultUrl] = useState(null)
  const [resultBlob, setResultBlob] = useState(null)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [hasMask, setHasMask] = useState(false)

  const imgRef = useRef(null)
  const modalImgRef = useRef(null)
  const modalCanvasRef = useRef(null)
  const maskCanvasRef = useRef(null)      // saved mask (full resolution)
  const displayOverlayRef = useRef(null)  // overlay on main preview showing mask
  const isPainting = useRef(false)
  const imgDims = useRef({ w: 0, h: 0 })
  const pipelineRef = useRef(null)
  const engineModuleRef = useRef(null)

  const handleFile = ([f]) => {
    if (!f) return
    setFileName(f.name)
    setResultUrl(null)
    setResultBlob(null)
    setError('')
    setHasMask(false)
    maskCanvasRef.current = null

    const url = URL.createObjectURL(f)
    setImageSrc(url)
  }

  const onImgLoad = () => {
    if (!imgRef.current) return
    const w = imgRef.current.naturalWidth
    const h = imgRef.current.naturalHeight
    imgDims.current = { w, h }
    renderOverlay()
  }

  const renderOverlay = () => {
    if (!displayOverlayRef.current || !imgRef.current) return
    const canvas = displayOverlayRef.current
    canvas.width = imgRef.current.clientWidth || 400
    canvas.height = imgRef.current.clientHeight || 300
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (maskCanvasRef.current) {
      ctx.globalAlpha = 0.45
      ctx.drawImage(maskCanvasRef.current, 0, 0, canvas.width, canvas.height)
      ctx.globalAlpha = 1
    }
  }

  useEffect(() => {
    renderOverlay()
  }, [hasMask, imageSrc])

  useEffect(() => {
    if (isModalOpen && modalCanvasRef.current && modalImgRef.current) {
      const canvas = modalCanvasRef.current
      canvas.width = modalImgRef.current.naturalWidth
      canvas.height = modalImgRef.current.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (maskCanvasRef.current) {
        ctx.drawImage(maskCanvasRef.current, 0, 0)
      }
    }
  }, [isModalOpen])

  const startModalPaint = (e) => {
    isPainting.current = true
    paintModal(e)
  }

  const paintModal = (e) => {
    if (!isPainting.current || !modalCanvasRef.current) return
    const canvas = modalCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)'
    ctx.beginPath()
    ctx.arc(x, y, (brushSize * scaleX) / 2, 0, Math.PI * 2)
    ctx.fill()
    setHasMask(true)
  }

  const stopModalPaint = () => {
    isPainting.current = false
  }

  const clearModalMask = () => {
    if (!modalCanvasRef.current) return
    modalCanvasRef.current.getContext('2d').clearRect(0, 0, modalCanvasRef.current.width, modalCanvasRef.current.height)
    setHasMask(false)
    maskCanvasRef.current = null
  }

  const saveModalMask = () => {
    if (modalCanvasRef.current) {
      const clone = document.createElement('canvas')
      clone.width = modalCanvasRef.current.width
      clone.height = modalCanvasRef.current.height
      clone.getContext('2d').drawImage(modalCanvasRef.current, 0, 0)
      maskCanvasRef.current = clone
      setHasMask(true)
    }
    setIsModalOpen(false)
  }

  // ── engine ──────────────────────────────────────────────────────
  const ensureEngine = async () => {
    if (pipelineRef.current) return pipelineRef.current
    setLoadStage('Memuat modul AI…')
    setLoadProgress({ loaded: 0, total: 0 })
    const mod = await import('../../utils/objectRemoverEngine.js')
    engineModuleRef.current = mod
    setLoadStage('Menyiapkan dependensi…')
    const pipeline = await mod.createMoebiusPipeline((stage, loaded, total) => {
      setLoadStage(stage)
      setLoadProgress({ loaded, total })
    })
    pipelineRef.current = pipeline
    return pipeline
  }

  const processImage = async () => {
    if (!imageSrc || processing) return
    if (!hasMask || !maskCanvasRef.current) {
      setError('Beri mask pada objek yang ingin dihapus terlebih dahulu.')
      return
    }
    setProcessing(true)
    setError('')
    setResultUrl(null)
    setResultBlob(null)
    try {
      setLoadStage('Memuat model AI…')
      setLoadProgress({ loaded: 0, total: 0 })
      const pipeline = await ensureEngine()

      setLoadStage('Sedang memproses gambar…')
      setLoadProgress({ loaded: 0, total: 0 })

      // create 512x512 image canvas for the engine
      const img = new Image()
      img.src = imageSrc
      await new Promise((r, j) => { img.onload = r; img.onerror = j })

      const fitted = document.createElement('canvas')
      fitted.width = MAX_DIM
      fitted.height = MAX_DIM
      const fctx = fitted.getContext('2d')
      fctx.imageSmoothingQuality = 'high'
      fctx.fillStyle = '#000'
      fctx.fillRect(0, 0, MAX_DIM, MAX_DIM)
      const scale = Math.min(MAX_DIM / img.naturalWidth, MAX_DIM / img.naturalHeight)
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      const x = Math.floor((MAX_DIM - w) / 2)
      const y = Math.floor((MAX_DIM - h) / 2)
      fctx.drawImage(img, x, y, w, h)

      // scale mask to 512x512
      const maskFitted = document.createElement('canvas')
      maskFitted.width = MAX_DIM
      maskFitted.height = MAX_DIM
      const mctx = maskFitted.getContext('2d')
      if (maskCanvasRef.current) {
        mctx.drawImage(maskCanvasRef.current, 0, 0, MAX_DIM, MAX_DIM)
      }

      const resultCanvas = await pipeline.inpaint(fitted, maskFitted, {
        steps: 20,
        guidance: 2,
        seed: 42,
        onProgress: (stage, step, total) => {
          setLoadStage(stage)
          setLoadProgress({ loaded: step, total })
        }
      })

      // crop back to original aspect ratio
      const outCanvas = document.createElement('canvas')
      outCanvas.width = img.naturalWidth
      outCanvas.height = img.naturalHeight
      const octx = outCanvas.getContext('2d')
      // letterbox result back to original size
      const outScale = Math.min(img.naturalWidth / MAX_DIM, img.naturalHeight / MAX_DIM)
      const ow = Math.round(MAX_DIM * outScale)
      const oh = Math.round(MAX_DIM * outScale)
      const ox = Math.floor((img.naturalWidth - ow) / 2)
      const oy = Math.floor((img.naturalHeight - oh) / 2)
      octx.drawImage(resultCanvas, x * outScale, y * outScale, w * outScale, h * outScale)

      const blob = await new Promise(r => outCanvas.toBlob(r, 'image/png'))
      setResultBlob(blob)
      setResultUrl(URL.createObjectURL(blob))
      setLoadStage('')
      alert('Objek berhasil dihapus secara lokal!')
    } catch (e) {
      console.error(e)
      setError(`Gagal: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const clearCache = async () => {
    try {
      const mod = engineModuleRef.current || await import('../../utils/objectRemoverEngine.js')
      await mod.clearModelCache()
      pipelineRef.current = null
      alert('Cache model AI berhasil dihapus.')
    } catch (e) {
      alert('Gagal menghapus cache: ' + e.message)
    }
  }

  const downloadResult = () => {
    if (!resultBlob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(resultBlob)
    a.download = `no-object_${stripExt(fileName)}.png`
    a.click()
  }

  return (
    <ToolShell
      title="AI Hapus Objek (In-Browser Inpainting)"
      description="Hapus objek dari gambar menggunakan AI yang berjalan 100% di browser Anda. Tidak ada server — semua proses lokal."
    >
      {!imageSrc && (
        <DropZone
          accept="image/*"
          onFiles={handleFile}
          label="Pilih gambar untuk diedit"
          hint="Drag & drop, paste (Ctrl+V), atau klik — JPG, PNG, WebP"
        />
      )}

      {imageSrc && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* ── LEFT: Preview ────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                  Gambar & Area Masking
                </span>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="text-xs text-[--color-brand] hover:underline flex items-center gap-1 font-medium"
                >
                  <Paintbrush size={12} /> {hasMask ? 'Ubah Masking' : 'Beri Masking Objek'}
                </button>
              </div>
              <div className="relative inline-block overflow-hidden rounded border border-[--color-border] bg-[--color-surface-2]">
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Original"
                  onLoad={onImgLoad}
                  className="block max-h-[360px] w-auto select-none"
                />
                <canvas
                  ref={displayOverlayRef}
                  className="absolute inset-0 block h-full w-full pointer-events-none opacity-80"
                />
              </div>
              {hasMask && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="rounded bg-red-500/10 px-2 py-1 font-semibold text-red-600 dark:text-red-400">
                    ✓ Mask Objek Aktif
                  </span>
                  <button
                    onClick={() => { clearModalMask(); renderOverlay() }}
                    className="text-[--color-text-3] hover:text-red-500 text-xs font-semibold"
                  >
                    (Hapus)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Controls ─────────────────────────────────── */}
          <div className="space-y-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[--color-brand] bg-[--color-brand-light] px-4 py-3 text-sm font-bold text-[--color-brand] hover:bg-[--color-brand] hover:text-white transition-all"
            >
              <Maximize2 size={16} />
              {hasMask ? 'Ubah Masking (Pop-up)' : 'Buka Kanvas Masking (Pop-up)'}
            </button>

            <button
              onClick={processImage}
              disabled={processing || !imageSrc}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[--color-brand] px-4 py-3 text-sm font-bold text-white shadow-md hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? (
                <><Loader2 size={18} className="animate-spin" /> Memproses…</>
              ) : (
                <><Check size={18} /> Proses</>
              )}
            </button>

            {processing && loadStage && (
              <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-3 space-y-2 animate-fade-in">
                <div className="flex items-center gap-2 text-xs font-semibold text-[--color-text]">
                  <Cpu size={14} className="animate-pulse text-[--color-brand]" />
                  {loadStage}
                </div>
                {loadProgress.total > 0 && (
                  <div className="space-y-1">
                    <div className="h-2 w-full rounded-full bg-[--color-surface-3] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[--color-brand] transition-all duration-300"
                        style={{ width: `${Math.min(100, (loadProgress.loaded / loadProgress.total) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-[--color-text-3] font-mono">
                      <span>{(loadProgress.loaded / 1024 / 1024).toFixed(1)} MB</span>
                      <span>{(loadProgress.total / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {resultUrl && (
              <div className="space-y-2 animate-fade-in">
                <div className="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1.5">
                  <Check size={14} /> Selesai! Objek berhasil dihapus.
                </div>
                <img src={resultUrl} alt="Result" className="w-full rounded-lg border border-[--color-border]" />
                <div className="flex gap-2">
                  <button
                    onClick={downloadResult}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700 transition-all"
                  >
                    <Download size={14} /> Download
                  </button>
                  <button
                    onClick={() => { setResultUrl(null); setResultBlob(null) }}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-[--color-surface-3] px-3 py-2 text-xs font-bold text-[--color-text-2] hover:bg-[--color-surface-2] transition-all"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={clearCache}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[--color-border] bg-[--color-surface] px-3 py-2 text-[11px] font-semibold text-[--color-text-3] hover:bg-[--color-surface-2] hover:text-[--color-text-2] transition-all"
            >
              <Trash2 size={12} /> Bersihkan Dependensi AI
            </button>

            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-3">
              <div className="flex items-start gap-2">
                <Info size={14} className="shrink-0 mt-0.5 text-[--color-text-3]" />
                <div className="text-[10px] leading-relaxed text-[--color-text-3] space-y-1">
                  <p className="font-semibold text-[--color-text-2]">Info Spesifikasi Minimum</p>
                  <p>Browser Chrome/Edge v113+ / Safari 17.4+ (WebGPU)</p>
                  <p>RAM minimal 4GB</p>
                  <p>Kuota ~1.3GB unduhan pertama (setelah itu Offline)</p>
                  <p className="text-[--color-brand] font-semibold">Model: Moebius 0.2B Inpainting (ONNX)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Masking Modal ─────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="relative w-[92%] max-w-[700px] rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 shadow-2xl overflow-hidden border border-gray-200 dark:border-slate-700">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white">
                  <Paintbrush size={16} />
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight">Masking Objek</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {imgDims.current.w} × {imgDims.current.h} px — Warnai objek yang ingin dihapus
                  </p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-gray-200">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Warnai area objek yang ingin dihapus. Area merah akan direkonstruksi oleh AI.
              </p>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Kuas:</span>
                <input
                  type="range"
                  min="6"
                  max="80"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="flex-1 h-1.5 accent-red-600"
                />
                <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 w-8">{brushSize}px</span>
              </div>

              <div className="relative flex justify-center rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 p-2 overflow-hidden min-h-[300px] max-h-[65vh]">
                <div className="relative inline-flex items-center justify-center">
                  <img
                    ref={(el) => {
                      modalImgRef.current = el
                      if (el && isModalOpen) {
                        el.onload = () => {
                          if (modalCanvasRef.current) {
                            const canvas = modalCanvasRef.current
                            canvas.width = el.naturalWidth
                            canvas.height = el.naturalHeight
                            const ctx = canvas.getContext('2d')
                            ctx.clearRect(0, 0, canvas.width, canvas.height)
                            if (maskCanvasRef.current) ctx.drawImage(maskCanvasRef.current, 0, 0)
                          }
                        }
                        if (el.complete && el.naturalWidth > 0) el.onload()
                      }
                    }}
                    src={imageSrc}
                    alt="Mask Target"
                    className="block max-h-[60vh] max-w-full rounded pointer-events-none"
                  />
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
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
              <button onClick={clearModalMask} className="text-xs text-red-500 hover:underline font-semibold">
                <Trash size={12} className="inline mr-1" />Hapus Tanda
              </button>
              <button
                onClick={saveModalMask}
                className="rounded-lg bg-red-600 px-5 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors shadow-sm"
              >
                <Check size={14} className="inline mr-1" />Selesai & Terapkan
              </button>
            </div>
          </div>
        </div>
      )}
    </ToolShell>
  )
}
