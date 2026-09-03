import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Loader2, Check, Download, RefreshCw, Trash2, Cpu,
  Paintbrush, Info, Maximize2, X, Trash
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import SendToDropdown from '../../components/SendToDropdown'
import { stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

const MAX_DIM = 512

export default function ObjectRemover() {
  const [imageSrc, setImageSrc] = useState(null)
  useIncomingFile((f) => {
    setFileName(f.name)
    const url = URL.createObjectURL(f)
    setImageSrc(url)
  })
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
  const maskCanvasRef = useRef(null)
  const displayOverlayRef = useRef(null)
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

  const renderOverlay = useCallback(() => {
    if (!displayOverlayRef.current || !imgRef.current) return
    const canvas = displayOverlayRef.current
    const img = imgRef.current
    const w = img.clientWidth || img.offsetWidth || 400
    const h = img.clientHeight || img.offsetHeight || 300
    if (w < 1 || h < 1) return
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    if (maskCanvasRef.current) {
      // draw mask scaled to display size with red tint
      ctx.globalAlpha = 0.5
      ctx.drawImage(maskCanvasRef.current, 0, 0, w, h)
      ctx.globalAlpha = 1
    }
  }, [])

  const onImgLoad = useCallback(() => {
    if (!imgRef.current) return
    imgDims.current = { w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight }
    // small delay to ensure layout is computed
    requestAnimationFrame(() => renderOverlay())
  }, [renderOverlay])

  // re-render overlay when mask changes or window resizes
  useEffect(() => {
    renderOverlay()
  }, [hasMask, imageSrc, renderOverlay])

  useEffect(() => {
    const onResize = () => renderOverlay()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [renderOverlay])

  // when modal opens, load saved mask into modal canvas
  useEffect(() => {
    if (isModalOpen && modalCanvasRef.current && modalImgRef.current) {
      const canvas = modalCanvasRef.current
      const img = modalImgRef.current
      const init = () => {
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (maskCanvasRef.current) ctx.drawImage(maskCanvasRef.current, 0, 0)
      }
      img.onload = init
      if (img.complete && img.naturalWidth > 0) init()
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

  const stopModalPaint = () => { isPainting.current = false }

  const clearModalMask = () => {
    if (modalCanvasRef.current) {
      modalCanvasRef.current.getContext('2d').clearRect(0, 0, modalCanvasRef.current.width, modalCanvasRef.current.height)
    }
    setHasMask(false)
    setHistory([])
    maskCanvasRef.current = null
    renderOverlay()
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
    // overlay re-render happens via useEffect on hasMask
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
      <DropZone
        accept="image/*"
        onFiles={handleFile}
        label="Pilih gambar untuk diedit"
        hint="Drag & drop, paste (Ctrl+V), atau klik — JPG, PNG, WebP"
      />

      {imageSrc && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* ── LEFT: Preview ────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-(--color-text-3)">
                  Gambar & Area Masking
                </span>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-md border border-(--color-brand) bg-(--color-brand-light) px-3 py-1.5 text-xs font-bold text-(--color-brand) hover:bg-(--color-brand) hover:text-white transition-all"
                >
                  <Paintbrush size={12} /> {hasMask ? 'Ubah Masking' : 'Beri Masking Objek'}
                </button>
              </div>
              <div className="relative inline-block overflow-hidden rounded border border-(--color-border) bg-(--color-surface-2)">
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
                    className="text-(--color-text-3) hover:text-red-500 text-xs font-semibold"
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
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-(--color-brand) bg-(--color-brand-light) px-4 py-3 text-sm font-bold text-(--color-brand) hover:bg-(--color-brand) hover:text-white transition-all"
            >
              <Maximize2 size={16} />
              {hasMask ? 'Ubah Masking (Pop-up)' : 'Buka Kanvas Masking (Pop-up)'}
            </button>

            <button
              onClick={processImage}
              disabled={processing || !imageSrc}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-(--color-brand) bg-(--color-brand) px-4 py-3 text-sm font-bold text-white shadow-md hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? (
                <><Loader2 size={18} className="animate-spin" /> Memproses…</>
              ) : (
                <><Check size={18} /> Proses</>
              )}
            </button>

            {processing && loadStage && (
              <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3 space-y-2 animate-fade-in">
                <div className="flex items-center gap-2 text-xs font-semibold text-(--color-text)">
                  <Cpu size={14} className="animate-pulse text-(--color-brand)" />
                  {loadStage}
                </div>
                {loadProgress.total > 0 && (
                  <div className="space-y-1">
                    <div className="h-2 w-full rounded-full bg-(--color-surface-3) overflow-hidden">
                      <div
                        className="h-full rounded-full bg-(--color-brand) transition-all duration-300"
                        style={{ width: `${Math.min(100, (loadProgress.loaded / loadProgress.total) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-(--color-text-3) font-mono">
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
                <img src={resultUrl} alt="Result" className="w-full rounded-lg border border-(--color-border)" />
                <div className="flex gap-2 items-center justify-end">
                  <button
                    onClick={downloadResult}
                    className="flex items-center justify-center gap-1.5 rounded-lg border-2 border-green-600 bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700 transition-all"
                  >
                    <Download size={14} /> Download
                  </button>
                  <SendToDropdown
                    blob={resultBlob}
                    fileName={`${stripExt(fileName || 'image')}_clean.png`}
                    outputMimeType="image/png"
                    excludeRoute="object-remover"
                  />
                  <button
                    onClick={() => { setResultUrl(null); setResultBlob(null) }}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-surface-3) px-3 py-2 text-xs font-bold text-(--color-text-2) hover:bg-(--color-surface-2) transition-all"
                    title="Proses lagi"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={clearCache}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[11px] font-semibold text-(--color-text-3) hover:bg-(--color-surface-2) hover:text-(--color-text-2) transition-all"
            >
              <Trash2 size={12} /> Bersihkan Dependensi AI
            </button>

            <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3">
              <div className="flex items-start gap-2">
                <Info size={14} className="shrink-0 mt-0.5 text-(--color-text-3)" />
                <div className="text-[10px] leading-relaxed text-(--color-text-3) space-y-1">
                  <p className="font-semibold text-(--color-text-2)">Info Spesifikasi Minimum</p>
                  <p>Browser Chrome/Edge v113+ / Safari 17.4+ (WebGPU)</p>
                  <p>RAM minimal 4GB</p>
                  <p>Kuota ~1.3GB unduhan pertama (setelah itu Offline)</p>
                  <p className="text-(--color-brand) font-semibold">Model: Moebius 0.2B Inpainting (ONNX)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Masking Modal ─────────────────────────────────────── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 pt-16"
          onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setIsModalOpen(false)}
        >
          <div
            className="relative w-full max-w-[800px] max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-red-50 to-white dark:from-red-950/20 dark:to-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg">
                  <Paintbrush size={20} className="stroke-2" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Masking Objek dengan AI</h3>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400">
                    {imgDims.current.w} × {imgDims.current.h} px — Coret area yang ingin dihapus
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 px-2 py-1 text-[10px] font-mono text-gray-500">
                  <span className="border border-gray-300 dark:border-slate-600 rounded px-1">Esc</span> tutup
                </kbd>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-gray-300 dark:border-slate-600 p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all"
                  title="Tutup (Esc)"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Instructions & Controls */}
            <div className="border-b border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50 px-6 py-4 shrink-0 space-y-3">
              <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                <Info size={13} className="text-red-500" />
                <span className="font-semibold">Instruksi:</span>
                <span>Pilih alat seleksi lalu tandai area objek yang ingin dihapus oleh AI.</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] items-center gap-3">
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600 px-3 py-2">
                  <Paintbrush size={14} className="text-red-500" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Ukuran Kuas</span>
                </div>
                <div className="flex items-center gap-3 flex-1">
                  <input
                    type="range"
                    min="6"
                    max="80"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="flex-1 h-2 accent-red-600"
                  />
                  <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded-md w-10 text-center">
                    {brushSize}
                  </span>
                </div>
                <button
                  onClick={clearModalMask}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800/50 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                >
                  <RefreshCw size={13} /> Reset
                </button>
              </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 overflow-auto bg-[#1a1a1a] p-4 min-h-0 flex items-center justify-center">
              <div className="relative inline-flex shadow-2xl rounded-lg">
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
                  className="block max-h-[60vh] max-w-full rounded-lg select-none pointer-events-none"
                />
                <canvas
                  ref={modalCanvasRef}
                  onMouseDown={startModalPaint}
                  onMouseMove={paintModal}
                  onMouseUp={stopModalPaint}
                  onMouseLeave={stopModalPaint}
                  className="absolute top-0 left-0 cursor-crosshair rounded-lg ring-2 ring-red-500/0 group-hover:ring-red-500/50 transition-all"
                  style={{ width: '100%', height: '100%' }}
                />
                {/* Brush cursor indicator */}
                <div
                  className="absolute top-[-9999px] left-[-9999px] w-full h-full pointer-events-none"
                  style={{ cursor: 'crosshair' }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 shrink-0">
              <button onClick={clearModalMask} className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800/50 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all">
                <Trash size={14} /> Hapus Coretan
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={saveModalMask}
                  className="rounded-xl border-2 border-red-600 bg-gradient-to-r from-red-500 to-red-600 px-6 py-2.5 text-sm font-bold text-white hover:from-red-600 hover:to-red-700 transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                >
                  <Check size={16} className="stroke-[2]" /> Simpan Mask
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ToolShell>
  )
}
