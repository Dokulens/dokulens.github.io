import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Eraser, Loader2, Check, Download, RefreshCw, Trash2, Cpu,
  Paintbrush, ZoomIn, ZoomOut, Info
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import { fmtBytes, stripExt } from '../../utils/helpers'

const MAX_DIM = 512

export default function ObjectRemover() {
  // ── state ──────────────────────────────────────────────────────────
  const [imageSrc, setImageSrc] = useState(null)
  const [fileName, setFileName] = useState('')
  const [brushSize, setBrushSize] = useState(30)
  const [processing, setProcessing] = useState(false)
  const [masking, setMasking] = useState(false)
  const [loadStage, setLoadStage] = useState('')
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 })
  const [resultUrl, setResultUrl] = useState(null)
  const [resultBlob, setResultBlob] = useState(null)
  const [error, setError] = useState('')

  // ── refs ───────────────────────────────────────────────────────────
  const displayRef = useRef(null)    // canvas showing image + red mask overlay
  const maskRef = useRef(null)       // hidden mask-only canvas (RGBA, same px as image)
  const imgDims = useRef({ w: 0, h: 0 })
  const isDrawing = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const pipelineRef = useRef(null)
  const engineModuleRef = useRef(null)

  // ── file handling ──────────────────────────────────────────────────
  const handleFile = ([f]) => {
    if (!f) return
    setFileName(f.name)
    setResultUrl(null)
    setResultBlob(null)
    setError('')
    setMasking(false)

    const url = URL.createObjectURL(f)
    setImageSrc(url)

    const img = new Image()
    img.onload = () => {
      const w = Math.min(img.naturalWidth, MAX_DIM)
      const h = Math.round((img.naturalHeight / img.naturalWidth) * w)
      imgDims.current = { w, h }
      initCanvases(img, w, h)
    }
    img.src = url
  }

  const initCanvases = (img, w, h) => {
    // display canvas (image + red mask composite)
    const dc = displayRef.current
    dc.width = w
    dc.height = h
    const dctx = dc.getContext('2d')
    dctx.imageSmoothingQuality = 'high'
    dctx.drawImage(img, 0, 0, w, h)

    // mask canvas (hidden, stores raw mask strokes)
    const mc = maskRef.current
    mc.width = w
    mc.height = h
    const mctx = mc.getContext('2d')
    mctx.clearRect(0, 0, w, h)
  }

  // redraw display = image + semi-transparent red mask
  const redrawDisplay = useCallback(() => {
    if (!imageSrc || !displayRef.current || !maskRef.current) return
    const img = new Image()
    img.onload = () => {
      const { w, h } = imgDims.current
      const dc = displayRef.current
      const dctx = dc.getContext('2d')
      dctx.imageSmoothingQuality = 'high'
      dctx.drawImage(img, 0, 0, w, h)

      // composite mask as red overlay
      const mc = maskRef.current
      dctx.globalAlpha = 0.45
      dctx.fillStyle = '#ef4444'
      // paint over masked pixels
      const mctx = mc.getContext('2d')
      const mData = mctx.getImageData(0, 0, w, h).data
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4
          if (mData[idx + 3] > 128) {
            dctx.fillRect(x, y, 1, 1)
          }
        }
      }
      dctx.globalAlpha = 1
    }
    img.src = imageSrc
  }, [imageSrc])

  useEffect(() => {
    redrawDisplay()
  }, [imageSrc, redrawDisplay])

  // ── coordinate helpers ─────────────────────────────────────────────
  const getCanvasCoords = (e) => {
    const canvas = displayRef.current
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    }
  }

  // ── drawing (mask canvas only, then composite) ─────────────────────
  const drawStroke = (x, y) => {
    const mc = maskRef.current
    const ctx = mc.getContext('2d')
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = brushSize * (mc.width / displayRef.current.getBoundingClientRect().width)
    ctx.strokeStyle = 'rgba(255,255,255,1)'
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(x, y)
    ctx.stroke()
    lastPos.current = { x, y }
  }

  const startDraw = (e) => {
    if (!masking || processing) return
    e.preventDefault()
    isDrawing.current = true
    const coords = getCanvasCoords(e)
    lastPos.current = coords
    // draw a dot at start
    const mc = maskRef.current
    const ctx = mc.getContext('2d')
    const r = (brushSize * (mc.width / displayRef.current.getBoundingClientRect().width)) / 2
    ctx.fillStyle = 'rgba(255,255,255,1)'
    ctx.beginPath()
    ctx.arc(coords.x, coords.y, r, 0, Math.PI * 2)
    ctx.fill()
    redrawDisplay()
  }

  const moveDraw = (e) => {
    if (!isDrawing.current || !masking || processing) return
    e.preventDefault()
    const coords = getCanvasCoords(e)
    drawStroke(coords.x, coords.y)
    redrawDisplay()
  }

  const endDraw = () => {
    isDrawing.current = false
  }

  const clearMask = () => {
    if (!maskRef.current) return
    const mc = maskRef.current
    mc.getContext('2d').clearRect(0, 0, mc.width, mc.height)
    redrawDisplay()
  }

  const hasMask = () => {
    if (!maskRef.current) return false
    const mc = maskRef.current
    const data = mc.getContext('2d').getImageData(0, 0, mc.width, mc.height).data
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 128) return true
    }
    return false
  }

  // ── engine loading ─────────────────────────────────────────────────
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

  // ── process ────────────────────────────────────────────────────────
  const processImage = async () => {
    if (!imageSrc || processing) return
    if (!hasMask()) {
      setError('Coret area yang ingin dihapus terlebih dahulu.')
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

      const resultCanvas = await pipeline.inpaint(
        displayRef.current,
        maskRef.current,
        {
          steps: 20,
          guidance: 2,
          seed: 42,
          onProgress: (stage, step, total) => {
            setLoadStage(stage)
            setLoadProgress({ loaded: step, total })
          }
        }
      )

      const blob = await new Promise(r => resultCanvas.toBlob(r, 'image/png'))
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

  // ── clear AI cache ─────────────────────────────────────────────────
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

  // ── download ───────────────────────────────────────────────────────
  const downloadResult = () => {
    if (!resultBlob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(resultBlob)
    a.download = `no-object_${stripExt(fileName)}.png`
    a.click()
  }

  // ── render ─────────────────────────────────────────────────────────
  return (
    <ToolShell
      title="AI Hapus Objek (In-Browser Inpainting)"
      description="Hapus objek dari gambar menggunakan AI yang berjalan 100% di browser Anda. Tidak ada server — semua proses lokal."
    >
      {/* DropZone */}
      {!imageSrc && (
        <DropZone
          accept="image/*"
          onFiles={handleFile}
          label="Pilih gambar untuk diedit"
          hint="Drag & drop, paste (Ctrl+V), atau klik — JPG, PNG, WebP"
        />
      )}

      {/* Main layout */}
      {imageSrc && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* ── LEFT: Interactive Canvas ───────────────────────── */}
          <div className="space-y-3">
            {/* Toolbar strip */}
            <div className="flex items-center justify-between rounded-lg border border-[--color-border] bg-[--color-surface] px-3 py-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMasking(!masking)}
                  className={[
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all',
                    masking
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-[--color-surface-3] text-[--color-text-2] hover:bg-[--color-surface-2]'
                  ].join(' ')}
                >
                  <Paintbrush size={14} />
                  {masking ? 'Mode Menggambar AKTIF' : 'Aktifkan Mode Menggambar'}
                </button>
                <button
                  onClick={clearMask}
                  disabled={processing}
                  className="flex items-center gap-1 rounded-md bg-[--color-surface-3] px-3 py-1.5 text-xs font-semibold text-[--color-text-2] hover:bg-[--color-surface-2] transition-all disabled:opacity-50"
                >
                  <RefreshCw size={12} />
                  Reset Coretan
                </button>
              </div>
              <span className="text-[10px] text-[--color-text-3] font-mono">
                {imgDims.current.w}×{imgDims.current.h}px
              </span>
            </div>

            {/* Canvas area */}
            <div
              className="relative rounded-lg border-2 border-dashed overflow-hidden"
              style={{
                borderColor: masking ? '#ef4444' : 'var(--color-border)',
                cursor: masking ? 'crosshair' : 'default'
              }}
            >
              {/* Display canvas (image + red mask composite) */}
              <canvas
                ref={displayRef}
                className="block w-full h-auto"
                onMouseDown={startDraw}
                onMouseMove={moveDraw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={moveDraw}
                onTouchEnd={endDraw}
              />
              {/* Hidden mask canvas (raw strokes) */}
              <canvas ref={maskRef} className="hidden" />

              {/* Masking mode indicator */}
              {masking && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg animate-pulse">
                  <Paintbrush size={11} />
                  CORET OBJEK YANG INGIN DIHAPUS
                </div>
              )}
            </div>

            {/* Brush size slider */}
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[--color-text-2] flex items-center gap-1.5">
                  <Paintbrush size={13} />
                  Ketebalan Kuas (Brush Size)
                </label>
                <span className="text-xs font-mono text-[--color-brand] bg-[--color-brand-light] px-2 py-0.5 rounded">
                  {brushSize}px
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                step="1"
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[--color-surface-3] accent-[--color-brand]"
              />
              <div className="flex justify-between text-[10px] text-[--color-text-3]">
                <span>5px (Halus)</span>
                <span>50px (Sedang)</span>
                <span>100px (Besar)</span>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Controls Panel ─────────────────────────── */}
          <div className="space-y-3">
            {/* Process button */}
            <button
              onClick={processImage}
              disabled={processing || !imageSrc}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[--color-brand] px-4 py-3 text-sm font-bold text-white shadow-md hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Memproses…
                </>
              ) : (
                <>
                  <Check size={18} />
                  Proses
                </>
              )}
            </button>

            {/* Loading bar */}
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

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Result */}
            {resultUrl && (
              <div className="space-y-2 animate-fade-in">
                <div className="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1.5">
                  <Check size={14} />
                  Selesai! Objek berhasil dihapus.
                </div>
                <img
                  src={resultUrl}
                  alt="Result"
                  className="w-full rounded-lg border border-[--color-border]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={downloadResult}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700 transition-all"
                  >
                    <Download size={14} />
                    Download
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

            {/* Clear AI dependencies */}
            <button
              onClick={clearCache}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[--color-border] bg-[--color-surface] px-3 py-2 text-[11px] font-semibold text-[--color-text-3] hover:bg-[--color-surface-2] hover:text-[--color-text-2] transition-all"
            >
              <Trash2 size={12} />
              Bersihkan Dependensi AI
            </button>

            {/* Spec card */}
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-3">
              <div className="flex items-start gap-2">
                <Info size={14} className="shrink-0 mt-0.5 text-[--color-text-3]" />
                <div className="text-[10px] leading-relaxed text-[--color-text-3] space-y-1">
                  <p className="font-semibold text-[--color-text-2]">Info Spesifikasi Minimum</p>
                  <p>Browser Chrome/Edge v113+ / Safari 17.4+ (Dukungan WebGPU)</p>
                  <p>RAM minimal 4GB</p>
                  <p>Kuota ~1.3GB untuk unduhan pertama (setelah itu bisa 100% Offline)</p>
                  <p className="text-[--color-brand] font-semibold">Model: Moebius 0.2B Inpainting (ONNX)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </ToolShell>
  )
}
