import { useState, useRef, useEffect } from 'react'
import { PenLine, FileUp, Download, Loader2, Check, Eraser, Move } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ProgressBar from '../../components/ProgressBar'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import { readAsArrayBuffer, stripExt, downloadBlob } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'
import { PDFDocument } from 'pdf-lib'
import { pdfjsLib, renderPageToDataUrl } from '../../utils/pdfRender'

const PREVIEW_MAX_H = 500

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',')
  const mime = head.match(/:(.*?);/)?.[1] || 'image/png'
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: mime })
}
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
}

/* ============ Signature Drawing Canvas ============ */
function SignaturePad({ onSave }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastRef = useRef(null)
  const [hasInk, setHasInk] = useState(false)
  const [penColor, setPenColor] = useState('#1d4ed8')
  const [penWidth, setPenWidth] = useState(3)

  // map event -> canvas-internal coords (canvas 560x200 may render smaller)
  const toCanvas = (cx, cy) => {
    const c = canvasRef.current
    const rect = c.getBoundingClientRect()
    return {
      x: (cx - rect.left) * (c.width / rect.width),
      y: (cy - rect.top) * (c.height / rect.height),
    }
  }
  const getPos = (e) => {
    const cx = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX
    const cy = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY
    return toCanvas(cx, cy)
  }

  const drawSmooth = (from, to) => {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    ctx.strokeStyle = penColor
    ctx.lineWidth = penWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // midpoint smoothing for crisp stroke
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.quadraticCurveTo(from.x, from.y, mid.x, mid.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  const start = (e) => {
    e.preventDefault()
    drawingRef.current = true
    const pos = getPos(e)
    lastRef.current = pos
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    // dot for click-only
    ctx.strokeStyle = penColor
    ctx.lineWidth = penWidth
    ctx.lineCap = 'round'
    ctx.lineTo(pos.x + 0.01, pos.y + 0.01)
    ctx.stroke()
    setHasInk(true)
  }
  const move = (e) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const pos = getPos(e)
    const last = lastRef.current
    if (last) drawSmooth(last, pos)
    lastRef.current = pos
    setHasInk(true)
  }
  const end = () => { drawingRef.current = false; lastRef.current = null }
  const clear = () => {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    setHasInk(false)
  }
  // output = transparent PNG (no white fill)
  const toDataUrl = () => {
    const c = canvasRef.current
    if (!hasInk) return null
    const out = document.createElement('canvas')
    out.width = c.width
    out.height = c.height
    const ctx = out.getContext('2d')
    ctx.clearRect(0, 0, out.width, out.height)
    ctx.drawImage(c, 0, 0)
    return out.toDataURL('image/png')
  }
  const save = () => {
    const d = toDataUrl()
    if (d) onSave(d)
  }
  const download = () => {
    const d = toDataUrl()
    if (d) downloadBlob(dataUrlToBlob(d), 'ttd.png')
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border-2 border-dashed border-(--color-border-strong)"
        style={{ background: 'repeating-conic-gradient(#e5e7eb 0 25%, #fff 0 50%) 0 0 / 16px 16px' }}>
        <canvas
          ref={canvasRef}
          width={560}
          height={200}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
          className="block w-full cursor-crosshair touch-none"
        />
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-(--color-border) bg-(--color-surface-2) p-2.5 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
          <label className="flex items-center gap-2 text-xs font-medium text-(--color-text-2)">
            Warna
            <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-(--color-border) bg-transparent" />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-(--color-text-2)">
            Tebal
            <input type="range" min="1" max="10" step="1" value={penWidth} onChange={(e) => setPenWidth(Number(e.target.value))} className="w-24 accent-(--color-brand) cursor-pointer" />
            <span className="font-mono text-[11px] text-(--color-text-3) w-6">{penWidth}px</span>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-(--color-border) sm:ml-auto sm:border-l sm:pl-2.5">
          <button onClick={clear} disabled={!hasInk} className="flex h-9 items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white disabled:opacity-50 disabled:hover:bg-red-500/10 disabled:hover:text-red-600 dark:disabled:hover:text-red-400 transition-colors cursor-pointer">
            <Eraser size={14} /> Bersihkan
          </button>
          {hasInk && (
            <button onClick={download} className="flex h-9 items-center gap-1.5 rounded-md border border-(--color-border) bg-(--color-surface) px-3 text-xs font-semibold text-(--color-text-2) hover:bg-(--color-surface-3) transition-colors cursor-pointer">
              <Download size={14} /> Download PNG
            </button>
          )}
          <button onClick={save} disabled={!hasInk} className="flex h-9 items-center gap-2 rounded-md bg-(--color-brand) px-4 text-sm font-bold text-white hover:bg-(--color-brand-hover) disabled:opacity-50 transition-colors cursor-pointer shadow-sm">
            <Check size={15} /> Pakai Tanda Tangan
          </button>
        </div>
      </div>
    </div>
  )
}

/* ============ Signature Document Placement ============ */
function SignaturePlacer({ signatureDataUrl }) {
  const [file, setFile] = useState(null)
  useIncomingFile((f) => setFile(f))
  const [docType, setDocType] = useState('')
  const [imgW, setImgW] = useState(0)
  const [imgH, setImgH] = useState(0)
  const [pagePreviews, setPagePreviews] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState(null)
  const [sigW, setSigW] = useState(150)
  const [sigH, setSigH] = useState(60)
  const [sigPos, setSigPos] = useState({ x: 50, y: 86 })
  const [sigNatural, setSigNatural] = useState(null)
  const [sigReady, setSigReady] = useState(false)

  const pdfDocRef = useRef(null)
  const previewBoxRef = useRef(null)
  const dragRef = useRef({ dragging: false })
  const resizeRef = useRef({ resizing: false })

  // measure signature natural ratio once
  useEffect(() => {
    if (!signatureDataUrl || sigReady) return
    loadImg(signatureDataUrl).then((img) => {
      setSigNatural({ nw: img.naturalWidth, nh: img.naturalHeight })
      const ratio = img.naturalHeight / img.naturalWidth
      setSigW(150)
      setSigH(Math.max(30, Math.round(150 * ratio)))
      setSigReady(true)
    })
  }, [signatureDataUrl, sigReady])

  const handleFileSelect = (files) => {
    if (!files || !files[0]) return
    const f = files[0]
    setFile(f)
    setResult(null)
    setPagePreviews([])
    setCurrentPage(1)
    loadDocument(f)
  }

  const loadDocument = async (f) => {
    setStatus('Memuat dokumen…')
    try {
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      if (isPdf) {
        const buf = await readAsArrayBuffer(f)
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
        pdfDocRef.current = doc
        const pages = []
        for (let i = 1; i <= doc.numPages; i++) {
          const d = await renderPageToDataUrl(doc, i, 0.9)
          pages.push({ pageNum: i, dataUrl: d.dataUrl, width: d.pageWidth, height: d.pageHeight })
        }
        setPagePreviews(pages)
        setDocType('pdf')
      } else {
        const img = await loadImg(URL.createObjectURL(f))
        setImgW(img.naturalWidth)
        setImgH(img.naturalHeight)
        const url = URL.createObjectURL(f)
        setPagePreviews([{ pageNum: 1, dataUrl: url, width: img.naturalWidth, height: img.naturalHeight }])
        setDocType('image')
      }
      setSigPos({ x: 50, y: 86 })
      setStatus('')
    } catch (e) {
      setStatus(`Gagal memuat: ${e.message}`)
    }
  }

  const curPreview = pagePreviews.find((p) => p.pageNum === currentPage) || pagePreviews[0]
  const containerW = curPreview ? Math.round(PREVIEW_MAX_H * (curPreview.width / curPreview.height)) : 0

  const startDrag = (e) => {
    if (!sigReady) return
    e.preventDefault()
    const r = previewBoxRef.current.getBoundingClientRect()
    const base = { ...sigPos }
    dragRef.current = { dragging: true }
    const onMove = (ev) => {
      if (!dragRef.current.dragging) return
      const dxPct = ((ev.clientX - e.clientX) / r.width) * 100
      const dyPct = ((ev.clientY - e.clientY) / r.height) * 100
      setSigPos({ x: Math.max(1, Math.min(99, base.x + dxPct)), y: Math.max(1, Math.min(99, base.y + dyPct)) })
    }
    const onUp = () => { dragRef.current.dragging = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResize = (e) => {
    if (!sigNatural) return
    e.preventDefault()
    e.stopPropagation()
    const r = previewBoxRef.current.getBoundingClientRect()
    const baseW = sigW
    const scale = sigNatural.nh / sigNatural.nw
    resizeRef.current = { resizing: true }
    const onMove = (ev) => {
      if (!resizeRef.current.resizing) return
      const dxPx = ((ev.clientX - e.clientX) / r.width) * PREVIEW_MAX_H
      const nw = Math.max(40, Math.min(420, baseW + dxPx))
      setSigW(nw)
      setSigH(Math.max(20, Math.round(nw * scale)))
    }
    const onUp = () => { resizeRef.current.resizing = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const applySignature = async () => {
    if (!file || !signatureDataUrl || !sigReady) return
    setProcessing(true)
    setStatus('')
    setProgress(0)
    try {
      const sigBuf = await (await fetch(signatureDataUrl)).arrayBuffer()
      if (docType === 'pdf') {
        const pdf = await PDFDocument.load(await readAsArrayBuffer(file), { ignoreEncryption: true })
        const sigImgPdf = await pdf.embedPng(sigBuf)
        const pdfPages = pdf.getPages()
        for (let i = 0; i < pdfPages.length; i++) {
          const p = pdfPages[i]
          const { width: pW, height: pH } = p.getSize()
          const pxToPt = pH / PREVIEW_MAX_H
          const w = sigW * pxToPt
          const h = sigH * pxToPt
          const x = (sigPos.x / 100) * pW - w / 2
          const y = pH - (sigPos.y / 100) * pH - h / 2
          p.drawImage(sigImgPdf, { x, y, width: w, height: h })
        }
        const bytes = await pdf.save()
        setResult(new Blob([bytes], { type: 'application/pdf' }))
        setStatus(`Tanda tangan diterapkan di ${pdfPages.length} halaman.`)
      } else {
        const base = await loadImg(curPreview.dataUrl)
        const canvas = document.createElement('canvas')
        canvas.width = imgW
        canvas.height = imgH
        const ctx = canvas.getContext('2d')
        ctx.drawImage(base, 0, 0, imgW, imgH)
        const sig = await loadImg(signatureDataUrl)
        // preview px -> image px: preview container height = 500px maps to imgH pixels
        const scale = imgH / PREVIEW_MAX_H
        const w = sigW * scale
        const h = sigH * scale
        const x = (sigPos.x / 100) * imgW - w / 2
        const y = (sigPos.y / 100) * imgH - h / 2
        ctx.drawImage(sig, x, y, w, h)
        const out = canvas.toDataURL('image/png')
        setResult(dataUrlToBlob(out))
        setStatus('Tanda tangan diterapkan pada gambar.')
      }
      setProgress(100)
    } catch (e) {
      setStatus(`Gagal: ${e.message}`)
    } finally { setProcessing(false) }
  }

  const resultName = file ? `${stripExt(file.name)}_ttd.${docType === 'pdf' ? 'pdf' : 'png'}` : `dokumen_ttd.${docType === 'pdf' ? 'pdf' : 'png'}`
  const hasImage = !!curPreview

  return (
    <div className="space-y-4">
      <div>
        <DropZone accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf" multiple={false} onFiles={handleFileSelect} disabled={processing} label="Pilih dokumen yang mau ditandatangani" hint="PDF · Gambar (PNG/JPG/WebP)" />
        {file && <FilePreview file={file} />}
      </div>

      {hasImage && (
        <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-bold text-(--color-text)">
              <PenLine size={15} className="text-(--color-brand)" /> Letakkan Tanda Tangan
            </span>
            {docType === 'pdf' && pagePreviews.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {pagePreviews.map((p) => (
                  <button key={p.pageNum} onClick={() => setCurrentPage(p.pageNum)}
                    className={`h-7 min-w-7 rounded border px-1.5 text-[11px] font-medium ${p.pageNum === currentPage ? 'border-(--color-brand) bg-(--color-brand) text-white font-bold' : 'border-(--color-border) bg-(--color-surface) text-(--color-text-2) hover:bg-(--color-surface-3)'} cursor-pointer`}>
                    {p.pageNum}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-center overflow-auto rounded-lg border border-(--color-border) bg-(--color-surface-3) p-2">
            <div
              ref={previewBoxRef}
              className="relative inline-block select-none overflow-hidden rounded bg-white shadow-sm"
              style={{ height: PREVIEW_MAX_H, width: containerW || 400 }}
            >
              {curPreview && <img src={curPreview.dataUrl} alt="" className="pointer-events-none block h-full w-full" />}
              {sigReady && (
                <div
                  onMouseDown={startDrag}
                  className="absolute cursor-move active:cursor-grabbing"
                  style={{ left: `${sigPos.x}%`, top: `${sigPos.y}%`, transform: 'translate(-50%,-50%)', width: sigW, height: sigH }}
                >
                  <img src={signatureDataUrl} alt="ttd" draggable={false} className="pointer-events-none h-full w-full object-contain" />
                  <div onMouseDown={startResize} className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-white bg-(--color-brand) shadow-sm" />
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-(--color-text-3)">
            <span className="flex items-center gap-1"><Move size={11} /> Geser untuk posisi · titik kanan-bawah untuk ukuran</span>
            <span className="font-mono">X {sigPos.x.toFixed(0)}% · Y {sigPos.y.toFixed(0)}% · {sigW}×{sigH}px</span>
          </div>

          <button onClick={applySignature} disabled={processing} className="flex w-full items-center justify-center gap-2 rounded-lg bg-(--color-brand) px-4 py-3 text-sm font-bold text-white hover:bg-(--color-brand-hover) disabled:opacity-60 transition-all active:scale-[0.99] cursor-pointer shadow-md">
            {processing ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
            {processing ? 'Menerapkan…' : docType === 'pdf' ? `Tandatangani PDF (${pagePreviews.length} halaman)` : 'Tandatangani Gambar'}
          </button>
          {status && <p className="text-center text-xs text-(--color-text-2)">{status}</p>}
          {processing && <ProgressBar value={progress} label="Menandatangani dokumen…" />}
        </div>
      )}

      {result && (
        <ResultCard
          fileName={resultName}
          blob={result}
          extraInfo={status}
          outputMimeType={docType === 'pdf' ? 'application/pdf' : 'image/png'}
          sourceRoute="signature"
          onReset={() => { setResult(null); setStatus('') }}
        />
      )}
    </div>
  )
}

export default function Signature() {
  const [sigDataUrl, setSigDataUrl] = useState(null)
  const [mode, setMode] = useState('create')

  const tabCls = (active) =>
    `flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
      active ? 'bg-(--color-brand) text-white shadow-sm' : 'border border-(--color-border) bg-(--color-surface) text-(--color-text-2) hover:bg-(--color-surface-3)'
    }`

  const downloadCurrent = () => {
    if (sigDataUrl) downloadBlob(dataUrlToBlob(sigDataUrl), 'ttd.png')
  }

  return (
    <ToolShell
      title="Tanda Tangan Dokumen"
      description="Buat tanda tangan transparan lalu simpan PNG, atau terapkan ke dokumen PDF/gambar dengan menyeret posisi presisi."
    >
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setMode('create')} className={tabCls(mode === 'create')}><PenLine size={15} /> Buat TTD</button>
        <button onClick={() => setMode('sign')} disabled={!sigDataUrl} className={`${tabCls(mode === 'sign')} disabled:opacity-40 disabled:cursor-not-allowed`}><FileUp size={15} /> TTD Dokumen</button>
      </div>

      {mode === 'create' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
            <SignaturePad
              onSave={(d) => { setSigDataUrl(d); setMode('create') }}
            />
          </div>
          {sigDataUrl && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-(--color-border) bg-(--color-surface-2) p-3">
              <img src={sigDataUrl} alt="ttd" className="h-16 w-auto rounded border border-(--color-border) object-contain" style={{ background: 'repeating-conic-gradient(#e5e7eb 0 25%, #fff 0 50%) 0 0 / 12px 12px' }} />
              <span className="text-xs text-(--color-text-2)">TTD siap (latar transparan).</span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={downloadCurrent} className="flex h-9 items-center gap-1.5 rounded-md border border-(--color-border) bg-(--color-surface) px-3 text-xs font-semibold text-(--color-text-2) hover:bg-(--color-surface-3) transition-colors cursor-pointer">
                  <Download size={13} /> Download PNG
                </button>
                <button onClick={() => setMode('sign')} className="flex h-9 items-center gap-1.5 rounded-md bg-(--color-brand) px-4 text-xs font-bold text-white hover:bg-(--color-brand-hover) transition-colors cursor-pointer">
                  <FileUp size={13} /> Terapkan ke Dokumen
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'sign' && sigDataUrl && <SignaturePlacer signatureDataUrl={sigDataUrl} />}
    </ToolShell>
  )
}
