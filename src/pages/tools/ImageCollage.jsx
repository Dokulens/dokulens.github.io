import { useState, useRef, useEffect } from 'react'
import { Grid, Loader2, Download, Trash2, X, Upload } from 'lucide-react'
import ToolShell from '../../components/ToolShell'

/* ──────────────────────────────────────────────────────────────────────────
   CollageCustomPreview – Interactive drag & resize collage editor
   ────────────────────────────────────────────────────────────────────────── */
function CollageCustomPreview({ images, canvasWidth, canvasHeight, items, setItems }) {
  const containerRef = useRef(null)
  const wrapperRef = useRef(null)
  const [previewScale, setPreviewScale] = useState(1)
  const [dragging, setDragging] = useState(null)
  const [resizing, setResizing] = useState(null)
  const [activeItem, setActiveItem] = useState(null)

  useEffect(() => {
    const calcScale = () => {
      const parent = wrapperRef.current?.parentElement
      if (!parent) return
      const availW = parent.clientWidth - 32
      const availH = Math.max(400, window.innerHeight * 0.55)
      setPreviewScale(Math.min(availW / canvasWidth, availH / canvasHeight, 1))
    }
    calcScale()
    window.addEventListener('resize', calcScale)
    return () => window.removeEventListener('resize', calcScale)
  }, [canvasWidth, canvasHeight])

  useEffect(() => {
    if (items.length === 0 && images.length > 0) {
      const cols = Math.ceil(Math.sqrt(images.length))
      const rows = Math.ceil(images.length / cols)
      const cellW = Math.floor(canvasWidth / cols)
      const cellH = Math.floor(canvasHeight / rows)
      setItems(images.map((_, i) => ({
        imageIndex: i,
        x: (i % cols) * cellW,
        y: Math.floor(i / cols) * cellH,
        width: cellW,
        height: cellH,
      })))
    }
  }, [images, canvasWidth, canvasHeight, items.length, setItems])

  const toCanvas = (clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: Math.round((clientX - rect.left) / previewScale),
      y: Math.round((clientY - rect.top) / previewScale),
    }
  }

  const handleMouseDown = (e, index, handle) => {
    e.preventDefault()
    e.stopPropagation()
    setActiveItem(index)
    const pos = toCanvas(e.clientX, e.clientY)
    const item = items[index]
    document.body.style.userSelect = 'none'
    document.body.style.cursor = handle ? `${handle}-resize` : 'move'
    if (handle) {
      setResizing({ index, startX: pos.x, startY: pos.y, origW: item.width, origH: item.height, origX: item.x, origY: item.y, handle })
    } else {
      setDragging({ index, startX: pos.x, startY: pos.y, origX: item.x, origY: item.y })
    }
  }

  useEffect(() => {
    if (!dragging && !resizing) return
    const handleMouseMove = (e) => {
      const pos = toCanvas(e.clientX, e.clientY)
      if (dragging) {
        const dx = pos.x - dragging.startX
        const dy = pos.y - dragging.startY
        setItems((prev) => prev.map((item, i) => {
          if (i !== dragging.index) return item
          return { ...item, x: Math.max(0, Math.min(canvasWidth - item.width, dragging.origX + dx)), y: Math.max(0, Math.min(canvasHeight - item.height, dragging.origY + dy)) }
        }))
      }
      if (resizing) {
        const dx = pos.x - resizing.startX
        const dy = pos.y - resizing.startY
        const h = resizing.handle
        setItems((prev) => prev.map((item, i) => {
          if (i !== resizing.index) return item
          let newX = resizing.origX, newY = resizing.origY, newW = resizing.origW, newH = resizing.origH
          if (h.includes('e')) newW = Math.max(40, resizing.origW + dx)
          if (h.includes('w')) { newW = Math.max(40, resizing.origW - dx); newX = resizing.origX + (resizing.origW - newW) }
          if (h.includes('s')) newH = Math.max(40, resizing.origH + dy)
          if (h.includes('n')) { newH = Math.max(40, resizing.origH - dy); newY = resizing.origY + (resizing.origH - newH) }
          newX = Math.max(0, Math.min(canvasWidth - newW, newX))
          newY = Math.max(0, Math.min(canvasHeight - newH, newY))
          return { ...item, x: newX, y: newY, width: newW, height: newH }
        }))
      }
    }
    const handleMouseUp = () => {
      setDragging(null)
      setResizing(null)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp) }
  }, [dragging, resizing, canvasWidth, canvasHeight, setItems])

  const pw = Math.round(canvasWidth * previewScale)
  const ph = Math.round(canvasHeight * previewScale)
  const cursors = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }

  return (
    <div ref={wrapperRef} className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[--color-text-2]">Preview Kolase</span>
        <span className="text-[10px] text-[--color-text-3]">{canvasWidth} × {canvasHeight} px &middot; {items.length} gambar</span>
      </div>
      <div className="text-[10px] text-[--color-text-3]">Geser gambar untuk posisi &middot; Tarik tepi/pojok untuk resize</div>
      <div
        ref={containerRef}
        className="relative border-2 border-dashed border-[--color-border-strong] rounded-lg bg-gray-100 mx-auto"
        style={{ width: pw, height: ph, touchAction: 'none' }}
        onMouseDown={() => setActiveItem(null)}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="collage-dots" x="0" y="0" width={20 * previewScale} height={20 * previewScale} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={0.8} fill="#999" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#collage-dots)" />
        </svg>

        {items.map((item, i) => {
          const img = images[item.imageIndex]
          const isActive = activeItem === i
          const isDraggingActive = dragging?.index === i
          return (
            <div
              key={i}
              className={`absolute group select-none ${isDraggingActive ? 'z-20' : 'z-10'}`}
              style={{
                left: item.x * previewScale,
                top: item.y * previewScale,
                width: item.width * previewScale,
                height: item.height * previewScale,
                cursor: isDraggingActive ? 'grabbing' : 'grab',
              }}
              onMouseDown={(e) => handleMouseDown(e, i, null)}
            >
              <div className={`w-full h-full border-2 overflow-hidden ${isActive ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-emerald-500'} rounded-sm transition-shadow`}>
                {img ? (
                  <img src={img.url} alt="" className="w-full h-full object-cover pointer-events-none" draggable={false} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-200 text-xs text-gray-500">#{i + 1}</div>
                )}
              </div>
              <div className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm pointer-events-none">
                #{i + 1}
              </div>
              {isActive && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-blue-600/90 px-1.5 py-0.5 text-[8px] font-mono font-bold text-white pointer-events-none whitespace-nowrap">
                  {Math.round(item.width)}×{Math.round(item.height)}
                </div>
              )}
              {['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].map((h) => (
                <div
                  key={h}
                  className={`absolute bg-white border-2 border-emerald-600 rounded-sm transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  style={{
                    width: h === 'n' || h === 's' ? 20 : 10,
                    height: h === 'e' || h === 'w' ? 20 : 10,
                    ...(h.includes('n') ? { top: -5 } : h.includes('s') ? { bottom: -5 } : { top: 'calc(50% - 5px)' }),
                    ...(h.includes('w') ? { left: -5 } : h.includes('e') ? { right: -5 } : { left: 'calc(50% - 5px)' }),
                    cursor: cursors[h],
                  }}
                  onMouseDown={(e) => handleMouseDown(e, i, h)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   ImageCollage – Main Page
   ────────────────────────────────────────────────────────────────────────── */
const PRESETS = [
  { id: 'grid-2x2', label: '2 × 2', desc: '4 gambar', cols: 2, rows: 2 },
  { id: 'grid-3x3', label: '3 × 3', desc: '9 gambar', cols: 3, rows: 3 },
  { id: 'grid-1x2', label: '1 × 2', desc: '2 vertikal', cols: 1, rows: 2 },
  { id: 'grid-2x1', label: '2 × 1', desc: '2 horizontal', cols: 2, rows: 1 },
  { id: 'custom', label: 'Custom', desc: 'Drag & resize', cols: 0, rows: 0 },
]

export default function ImageCollage() {
  const [images, setImages] = useState([])
  const [preset, setPreset] = useState('grid-2x2')
  const [canvasW, setCanvasW] = useState(1200)
  const [canvasH, setCanvasH] = useState(1600)
  const [gap, setGap] = useState(0)
  const [bgColor, setBgColor] = useState('white')
  const [exportFormat, setExportFormat] = useState('png')
  const [items, setItems] = useState([])
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const handleFiles = async (fileList) => {
    const newImgs = []
    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue
      const url = URL.createObjectURL(file)
      let w = 800, h = 600
      try {
        const bmp = await createImageBitmap(file)
        w = bmp.width; h = bmp.height
        bmp.close()
      } catch {}
      newImgs.push({ id: crypto.randomUUID(), file, url, width: w, height: h, name: file.name })
    }
    setImages((prev) => [...prev, ...newImgs])
    setItems([])
    setResult(null)
  }

  const removeImage = (id) => {
    setImages((prev) => {
      const removed = prev.find((i) => i.id === id)
      if (removed) URL.revokeObjectURL(removed.url)
      return prev.filter((i) => i.id !== id)
    })
    setItems([])
  }

  const clearAll = () => {
    images.forEach((i) => URL.revokeObjectURL(i.url))
    setImages([])
    setItems([])
    setResult(null)
  }

  const handleRender = async () => {
    if (images.length === 0) return
    setProcessing(true)
    setError('')
    try {
      const pScale = Math.min(500 / canvasW, 400 / canvasH, 1)
      const masterCanvas = document.createElement('canvas')
      masterCanvas.width = canvasW
      masterCanvas.height = canvasH
      const ctx = masterCanvas.getContext('2d')

      if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor === 'black' ? '#000' : '#fff'
        ctx.fillRect(0, 0, canvasW, canvasH)
      }

      const isCustom = preset === 'custom'
      if (isCustom && items.length > 0) {
        for (let i = 0; i < Math.min(images.length, items.length); i++) {
          const ci = items[i]
          const img = images[ci.imageIndex]
          if (!img) continue
          const imgEl = await loadImage(img.url)
          ctx.drawImage(imgEl, ci.x, ci.y, ci.width, ci.height)
        }
      } else {
        const pr = PRESETS.find((p) => p.id === preset) || PRESETS[0]
        const cellW = Math.floor((canvasW - (pr.cols - 1) * gap) / pr.cols)
        const cellH = Math.floor((canvasH - (pr.rows - 1) * gap) / pr.rows)
        for (let i = 0; i < Math.min(images.length, pr.cols * pr.rows); i++) {
          const col = i % pr.cols
          const row = Math.floor(i / pr.cols)
          const x = col * (cellW + gap)
          const y = row * (cellH + gap)
          const imgEl = await loadImage(images[i].url)
          const scale = Math.min(cellW / imgEl.naturalWidth, cellH / imgEl.naturalHeight)
          const dw = Math.floor(imgEl.naturalWidth * scale)
          const dh = Math.floor(imgEl.naturalHeight * scale)
          ctx.drawImage(imgEl, x + Math.floor((cellW - dw) / 2), y + Math.floor((cellH - dh) / 2), dw, dh)
        }
      }

      const mime = exportFormat === 'jpg' ? 'image/jpeg' : 'image/png'
      const dataUrl = masterCanvas.toDataURL(mime, exportFormat === 'jpg' ? 0.92 : undefined)
      const base64 = dataUrl.split(',')[1]
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      setResult({ blob: new Blob([bytes], { type: mime }), dataUrl, ext: exportFormat, fileName: `kolase.${exportFormat}` })
    } catch (err) {
      setError(err.message || 'Gagal membuat kolase')
    }
    setProcessing(false)
  }

  const downloadResult = () => {
    if (!result) return
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url; a.download = result.fileName; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <ToolShell
      title="Kolase Gambar"
      icon={Grid}
      description="Susun beberapa gambar menjadi kolase dengan preset grid atau posisi custom (drag & resize). Ekspor ke PNG atau JPG."
    >
      {/* Upload area */}
      <div className="rounded-xl border border-dashed border-[--color-border-strong] bg-[--color-surface] p-6 text-center cursor-pointer hover:border-[--color-brand] transition-colors"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFiles(Array.from(e.dataTransfer.files)) }}
      >
        <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFiles(Array.from(e.target.files))} />
        <Upload size={32} className="mx-auto mb-2 text-[--color-text-3]" />
        <p className="text-sm font-semibold text-[--color-text]">Klik atau seret gambar ke sini</p>
        <p className="text-[11px] text-[--color-text-3] mt-1">JPG, PNG, WebP &middot; Bebas jumlah</p>
      </div>

      {/* Loaded images strip */}
      {images.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[--color-text]">{images.length} gambar dimuat</span>
            <button onClick={clearAll} className="text-[11px] text-[--color-danger] hover:underline cursor-pointer">Hapus Semua</button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {images.map((img, i) => (
              <div key={img.id} className="relative shrink-0 w-16 h-20 rounded-lg overflow-hidden border border-[--color-border] group">
                <img src={img.url} alt="" className="w-full h-full object-cover" />
                <span className="absolute top-0.5 left-0.5 rounded bg-black/70 px-1 py-0.5 text-[8px] font-bold text-white">#{i + 1}</span>
                <button onClick={(e) => { e.stopPropagation(); removeImage(img.id) }}
                  className="absolute top-0.5 right-0.5 rounded bg-black/60 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <X size={10} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings */}
      {images.length > 0 && (
        <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-5 space-y-4">
          {/* Preset grid */}
          <div>
            <div className="text-xs font-semibold text-[--color-text-2] mb-2">Tata Letak:</div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => { setPreset(p.id); setItems([]) }}
                  className={`flex flex-col items-center justify-center rounded-lg border-2 p-2.5 text-xs text-center transition-all min-h-[56px] cursor-pointer ${
                    preset === p.id
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                      : 'border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:border-[--color-border-strong]'
                  }`}>
                  <span className="font-bold text-sm">{p.label}</span>
                  <span className="text-[10px] opacity-70">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Canvas size + gap + bg + format */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[--color-text-2]">Lebar:</span>
              <input type="number" min="200" max="4000" step="100" value={canvasW}
                onChange={(e) => setCanvasW(Math.max(200, Math.min(4000, Number(e.target.value) || 1200)))}
                className="w-20 rounded-lg border border-[--color-border] bg-[--color-surface] px-2 py-1.5 text-xs text-[--color-text] outline-none focus:ring-2 focus:ring-emerald-500" />
              <span className="text-[10px] text-[--color-text-3]">px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[--color-text-2]">Tinggi:</span>
              <input type="number" min="200" max="4000" step="100" value={canvasH}
                onChange={(e) => setCanvasH(Math.max(200, Math.min(4000, Number(e.target.value) || 1600)))}
                className="w-20 rounded-lg border border-[--color-border] bg-[--color-surface] px-2 py-1.5 text-xs text-[--color-text] outline-none focus:ring-2 focus:ring-emerald-500" />
              <span className="text-[10px] text-[--color-text-3]">px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[--color-text-2]">Jarak:</span>
              <input type="range" min="0" max="50" step="5" value={gap}
                onChange={(e) => setGap(Number(e.target.value))}
                className="w-24 accent-emerald-600 cursor-pointer" />
              <span className="font-mono text-emerald-500 font-bold text-[11px] w-8">{gap}px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[--color-text-2]">Background:</span>
              <select value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                className="rounded-lg border border-[--color-border] bg-[--color-surface] px-2 py-1.5 text-xs text-[--color-text] outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="white">Putih</option>
                <option value="black">Hitam</option>
                <option value="transparent">Transparan</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[--color-text-2]">Format:</span>
              <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}
                className="rounded-lg border border-[--color-border] bg-[--color-surface] px-2 py-1.5 text-xs text-[--color-text] outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Custom preview */}
      {images.length > 0 && preset === 'custom' && (
        <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-5">
          <CollageCustomPreview images={images} canvasWidth={canvasW} canvasHeight={canvasH} items={items} setItems={setItems} />
        </div>
      )}

      {/* Error */}
      {error && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Render button */}
      {images.length > 0 && !result && (
        <button onClick={handleRender} disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer shadow-md">
          {processing ? <Loader2 size={18} className="animate-spin" /> : <Grid size={18} />}
          {processing ? 'Membuat Kolase…' : 'Buat Kolase'}
        </button>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4 flex flex-col items-center gap-3">
            <img src={result.dataUrl} alt="Kolase" className="max-w-full max-h-[60vh] rounded-lg shadow-lg" />
          </div>
          <div className="flex gap-2">
            <button onClick={downloadResult}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition-colors cursor-pointer shadow-md">
              <Download size={18} /> Unduh {result.ext.toUpperCase()}
            </button>
            <button onClick={() => setResult(null)}
              className="rounded-lg border border-[--color-border] bg-[--color-surface] px-4 py-3 text-sm font-semibold text-[--color-text-2] hover:bg-[--color-surface-3] transition-colors cursor-pointer">
              Kembali
            </button>
          </div>
        </div>
      )}
    </ToolShell>
  )
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
