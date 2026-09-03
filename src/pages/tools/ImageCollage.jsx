import { useState, useRef, useEffect, useCallback } from 'react'
import { Grid, Loader2, Download, X, Upload, Plus, Minus } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import SendToDropdown from '../../components/SendToDropdown'

/* ──────────────────────────────────────────────────────────────────────────
   CollageGridEditor – Grid editor with draggable borders + image drag-drop
   ────────────────────────────────────────────────────────────────────────── */
function CollageGridEditor({ images, canvasW, canvasH, gridCols, gridRows, colWidths, setColWidths, rowHeights, setRowHeights, cellMap, setCellMap, onDropImage, gap }) {
  const containerRef = useRef(null)
  const wrapperRef = useRef(null)
  const [previewScale, setPreviewScale] = useState(1)
  const [dragLine, setDragLine] = useState(null) // { type:'col'|'row', index, startX, startY, origSizes[] }
  const [swapDrag, setSwapDrag] = useState(null) // { fromRow, fromCol, imgIndex }
  const [swapOver, setSwapOver] = useState(null) // { row, col }
  const [activeCell, setActiveCell] = useState(null) // { row, col }

  useEffect(() => {
    const calc = () => {
      const p = wrapperRef.current?.parentElement
      if (!p) return
      const aw = p.clientWidth - 32
      const ah = Math.max(500, window.innerHeight * 0.7)
      setPreviewScale(Math.min(aw / canvasW, ah / canvasH, 1))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [canvasW, canvasH])

  const toCanvas = useCallback((cx, cy) => {
    const r = containerRef.current.getBoundingClientRect()
    return { x: (cx - r.left) / previewScale, y: (cy - r.top) / previewScale }
  }, [previewScale])

  // Compute cell rect from colWidths / rowHeights (with gap)
  const getCellRect = useCallback((row, col) => {
    let x = 0
    for (let c = 0; c < col; c++) x += colWidths[c] + gap
    let y = 0
    for (let r = 0; r < row; r++) y += rowHeights[r] + gap
    return { x, y, w: colWidths[col], h: rowHeights[row] }
  }, [colWidths, rowHeights, gap])

  // ── Column / Row border drag ──
  const handleBorderMouseDown = (e, type, index) => {
    e.preventDefault()
    e.stopPropagation()
    const pos = toCanvas(e.clientX, e.clientY)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = type === 'col' ? 'ew-resize' : 'ns-resize'
    setDragLine({ type, index, startX: pos.x, startY: pos.y, origSizes: type === 'col' ? [...colWidths] : [...rowHeights] })
  }

  useEffect(() => {
    if (!dragLine) return
    const onMove = (e) => {
      const pos = toCanvas(e.clientX, e.clientY)
      const minSize = 40
      if (dragLine.type === 'col') {
        let dx = pos.x - dragLine.startX
        // Clamp so total colWidths stays within canvasW - gaps
        const totalGaps = (dragLine.origSizes.length - 1) * gap
        const maxTotal = canvasW - totalGaps
        const w0 = dragLine.origSizes[dragLine.index]
        const w1 = dragLine.origSizes[dragLine.index + 1]
        const newW0 = Math.max(minSize, Math.min(maxTotal - (dragLine.origSizes.length - 2) * minSize, w0 + dx))
        dx = newW0 - w0
        const newSizes = [...dragLine.origSizes]
        newSizes[dragLine.index] = newW0
        newSizes[dragLine.index + 1] = Math.max(minSize, w1 - dx)
        setColWidths(newSizes)
      } else {
        let dy = pos.y - dragLine.startY
        const totalGaps = (dragLine.origSizes.length - 1) * gap
        const maxTotal = canvasH - totalGaps
        const h0 = dragLine.origSizes[dragLine.index]
        const h1 = dragLine.origSizes[dragLine.index + 1]
        const newH0 = Math.max(minSize, Math.min(maxTotal - (dragLine.origSizes.length - 2) * minSize, h0 + dy))
        dy = newH0 - h0
        const newSizes = [...dragLine.origSizes]
        newSizes[dragLine.index] = newH0
        newSizes[dragLine.index + 1] = Math.max(minSize, h1 - dy)
        setRowHeights(newSizes)
      }
    }
    const onUp = () => {
      setDragLine(null)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragLine, toCanvas, setColWidths, setRowHeights])

  // ── Image swap drag ──
  const handleImageMouseDown = (e, row, col, imgIndex) => {
    e.preventDefault()
    e.stopPropagation()
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
    setSwapDrag({ fromRow: row, fromCol: col, imgIndex })
  }

  useEffect(() => {
    if (!swapDrag) return
    const onMove = (e) => {
      const pos = toCanvas(e.clientX, e.clientY)
      // Find which cell the cursor is over
      let cumX = 0
      let hitCol = -1
      for (let c = 0; c < colWidths.length; c++) {
        if (pos.x >= cumX && pos.x < cumX + colWidths[c]) { hitCol = c; break }
        cumX += colWidths[c]
      }
      let cumY = 0
      let hitRow = -1
      for (let r = 0; r < rowHeights.length; r++) {
        if (pos.y >= cumY && pos.y < cumY + rowHeights[r]) { hitRow = r; break }
        cumY += rowHeights[r]
      }
      if (hitRow >= 0 && hitCol >= 0) setSwapOver({ row: hitRow, col: hitCol })
      else setSwapOver(null)
    }
    const onUp = () => {
      if (swapOver && (swapOver.row !== swapDrag.fromRow || swapOver.col !== swapDrag.fromCol)) {
        setCellMap((prev) => {
          const next = prev.map((r) => [...r])
          const temp = next[swapOver.row][swapOver.col]
          next[swapOver.row][swapOver.col] = next[swapDrag.fromRow][swapDrag.fromCol]
          next[swapDrag.fromRow][swapDrag.fromCol] = temp
          return next
        })
      }
      setSwapDrag(null)
      setSwapOver(null)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [swapDrag, swapOver, toCanvas, colWidths, rowHeights, setCellMap])

  const pw = Math.round(canvasW * previewScale)
  const ph = Math.round(canvasH * previewScale)

  return (
    <div ref={wrapperRef} className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-(--color-text-2)">Preview Grid Custom</span>
        <span className="text-[10px] text-(--color-text-3)">{canvasW}×{canvasH} px &middot; {gridCols}×{gridRows} grid</span>
      </div>
      <div className="text-[10px] text-(--color-text-3)">Tarik garis grid untuk resize kolom/baris &middot; Seret gambar untuk tukar posisi</div>

      <div
        ref={containerRef}
        className="relative border-2 border-(--color-border-strong) rounded-lg bg-gray-50 mx-auto overflow-hidden"
        style={{ width: pw, height: ph, touchAction: 'none' }}
      >
        {/* Cell backgrounds + images */}
        {Array.from({ length: gridRows }).map((_, r) =>
          Array.from({ length: gridCols }).map((_, c) => {
            const rect = getCellRect(r, c)
            const imgIdx = cellMap[r]?.[c]
            const img = imgIdx != null ? images[imgIdx] : null
            const isSwapTarget = swapOver?.row === r && swapOver?.col === c
            const isSwapSource = swapDrag?.fromRow === r && swapDrag?.fromCol === c
            return (
              <div
                key={`${r}-${c}`}
                className={`absolute border transition-colors ${isSwapTarget ? 'border-blue-500 bg-blue-100/60 z-30' : 'border-gray-300 bg-white z-10'}`}
                style={{
                  left: rect.x * previewScale,
                  top: rect.y * previewScale,
                  width: rect.w * previewScale,
                  height: rect.h * previewScale,
                }}
                onMouseDown={(e) => {
                  if (img != null && !swapDrag) handleImageMouseDown(e, r, c, imgIdx)
                }}
                onMouseEnter={() => { if (swapDrag) setSwapOver({ row: r, col: c }) }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setSwapOver({ row: r, col: c }) }}
                onDrop={(e) => {
                  e.preventDefault()
                  const imgIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
                  if (!isNaN(imgIndex) && onDropImage) onDropImage(r, c, imgIndex)
                  setSwapOver(null)
                }}
                onDragLeave={() => setSwapOver((prev) => prev?.row === r && prev?.col === c ? null : prev)}
              >
                {img && (
                  <img
                    src={img.url}
                    alt=""
                    className="w-full h-full object-cover pointer-events-none"
                    draggable={false}
                    style={{ opacity: isSwapSource ? 0.4 : 1 }}
                  />
                )}
                {img && (
                  <span className="absolute top-0.5 left-0.5 rounded bg-black/60 px-1 py-0.5 text-[8px] font-bold text-white pointer-events-none">
                    #{imgIdx + 1}
                  </span>
                )}
                {!img && !swapDrag && (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-300 pointer-events-none">
                    {r * gridCols + c + 1}
                  </div>
                )}
              </div>
            )
          })
        )}

        {/* Draggable column borders */}
        {Array.from({ length: gridCols - 1 }).map((_, i) => {
          // Border is at the boundary between col i and col i+1
          let xPos = 0
          for (let c = 0; c <= i; c++) xPos += colWidths[c]
          xPos += (i + 1) * gap // gaps before and between columns up to this boundary
          const isDragging = dragLine?.type === 'col' && dragLine.index === i
          return (
            <div
              key={`col-${i}`}
              className={`absolute z-40 ${isDragging ? 'bg-blue-500' : 'bg-emerald-500 hover:bg-emerald-400'}`}
              style={{
                left: (xPos - 3) * previewScale,
                top: 0,
                width: 6 * previewScale,
                height: ph,
                cursor: 'ew-resize',
                opacity: 0.7,
              }}
              onMouseDown={(e) => handleBorderMouseDown(e, 'col', i)}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[8px] text-white font-bold bg-emerald-600 rounded px-1 py-0.5 pointer-events-none whitespace-nowrap" style={{ fontSize: 7 * previewScale }}>
                {Math.round(colWidths[i])}px
              </div>
            </div>
          )
        })}

        {/* Draggable row borders */}
        {Array.from({ length: gridRows - 1 }).map((_, i) => {
          let yPos = 0
          for (let r = 0; r <= i; r++) yPos += rowHeights[r]
          yPos += (i + 1) * gap
          const isDragging = dragLine?.type === 'row' && dragLine.index === i
          return (
            <div
              key={`row-${i}`}
              className={`absolute z-40 ${isDragging ? 'bg-blue-500' : 'bg-emerald-500 hover:bg-emerald-400'}`}
              style={{
                top: (yPos - 3) * previewScale,
                left: 0,
                height: 6 * previewScale,
                width: pw,
                cursor: 'ns-resize',
                opacity: 0.7,
              }}
              onMouseDown={(e) => handleBorderMouseDown(e, 'row', i)}
            >
              <div className="absolute left-0 top-1/2 -translate-y-1/2 text-[8px] text-white font-bold bg-emerald-600 rounded px-1 py-0.5 pointer-events-none whitespace-nowrap" style={{ fontSize: 7 * previewScale }}>
                {Math.round(rowHeights[i])}px
              </div>
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
  { id: 'custom', label: 'Custom', desc: 'Grid editor', cols: 0, rows: 0 },
]

function initGrid(cols, rows, cw, ch, imgCount, existingMap) {
  const colW = Array(cols).fill(Math.floor(cw / cols))
  const rowH = Array(rows).fill(Math.floor(ch / rows))
  const remW = cw - colW.reduce((a, b) => a + b, 0)
  for (let i = 0; i < remW; i++) colW[i % cols]++
  const remH = ch - rowH.reduce((a, b) => a + b, 0)
  for (let i = 0; i < remH; i++) rowH[i % rows]++

  // Build map: keep existing assignments if possible, fill remaining with sequential indices
  const map = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => existingMap?.[r]?.[c] ?? null))
  let nextIdx = 0
  const usedIndices = new Set()
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = map[r][c]
    if (v != null) usedIndices.add(v)
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (map[r][c] == null) {
      while (usedIndices.has(nextIdx) && nextIdx < imgCount) nextIdx++
      if (nextIdx < imgCount) { map[r][c] = nextIdx; usedIndices.add(nextIdx) }
    }
  }
  return { colW, rowH, map }
}

export default function ImageCollage() {
  const [images, setImages] = useState([])
  const [preset, setPreset] = useState('grid-2x2')
  const [canvasW, setCanvasW] = useState(1200)
  const [canvasH, setCanvasH] = useState(1600)
  const [gap, setGap] = useState(0)
  const [bgColor, setBgColor] = useState('white')
  const [exportFormat, setExportFormat] = useState('png')

  const pr = PRESETS.find((p) => p.id === preset) || PRESETS[0]
  const isCustom = preset === 'custom'

  // Grid always has at least 2 cols / 2 rows in custom mode
  const [colWidths, setColWidths] = useState(() => Array(2).fill(600))
  const [rowHeights, setRowHeights] = useState(() => Array(2).fill(800))
  const [cellMap, setCellMap] = useState(() => [[null, null], [null, null]])

  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  // Re-init grid when switching to custom
  useEffect(() => {
    if (!isCustom) return
    const { colW, rowH, map } = initGrid(colWidths.length, rowHeights.length, canvasW, canvasH, images.length, cellMap)
    setColWidths(colW)
    setRowHeights(rowH)
    setCellMap(map)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustom])

  // Redistribute grid sizes when canvas dimensions change
  useEffect(() => {
    if (!isCustom) return
    setColWidths(redistribute(colWidths.length, canvasW, colWidths.length - 1))
    setRowHeights(redistribute(rowHeights.length, canvasH, rowHeights.length - 1))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasW, canvasH, isCustom])

  const handleFiles = async (fileList) => {
    const newImgs = []
    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue
      const url = URL.createObjectURL(file)
      let w = 800, h = 600
      try {
        const bmp = await createImageBitmap(file); w = bmp.width; h = bmp.height; bmp.close()
      } catch {}
      newImgs.push({ id: crypto.randomUUID(), file, url, width: w, height: h, name: file.name })
    }
    setImages((prev) => [...prev, ...newImgs])
    setResult(null)
  }

  // Auto-fill empty grid cells when new images are added
  useEffect(() => {
    if (!isCustom || images.length === 0) return
    setCellMap((prev) => {
      const next = prev.map((r) => [...r])
      const used = new Set()
      for (let r = 0; r < next.length; r++) for (let c = 0; c < next[r].length; c++) {
        if (next[r][c] != null) used.add(next[r][c])
      }
      let idx = 0
      for (let r = 0; r < next.length; r++) for (let c = 0; c < next[r].length; c++) {
        if (next[r][c] == null) {
          while (used.has(idx) && idx < images.length) idx++
          if (idx < images.length) { next[r][c] = idx; used.add(idx); idx++ }
        }
      }
      return next
    })
  }, [images.length, isCustom])

  const removeImage = (id) => {
    setImages((prev) => {
      const removed = prev.find((i) => i.id === id)
      if (removed) URL.revokeObjectURL(removed.url)
      return prev.filter((i) => i.id !== id)
    })
    // Clear removed image from grid cells
    setCellMap((prev) => {
      const imgIdx = images.findIndex((i) => i.id === id)
      if (imgIdx < 0) return prev
      return prev.map((r) => r.map((v) => v === imgIdx ? null : v))
    })
    setResult(null)
  }

  const clearAll = () => {
    images.forEach((i) => URL.revokeObjectURL(i.url))
    setImages([])
    setResult(null)
  }

  const redistribute = (count, total, gapCount) => {
    const usable = total - gapCount * gap
    const each = Math.floor(usable / count)
    const rem = usable - each * count
    const arr = Array(count).fill(each)
    for (let i = 0; i < rem; i++) arr[i]++
    return arr
  }

  const addCol = () => {
    if (colWidths.length >= 6) return
    const n = colWidths.length + 1
    setColWidths(redistribute(n, canvasW, n - 1))
    setCellMap((p) => p.map((r) => [...r, null]))
  }
  const removeCol = () => {
    if (colWidths.length <= 1) return
    const n = colWidths.length - 1
    setColWidths(redistribute(n, canvasW, n - 1))
    setCellMap((p) => p.map((r) => r.slice(0, -1)))
  }
  const addRow = () => {
    if (rowHeights.length >= 6) return
    const n = rowHeights.length + 1
    setRowHeights(redistribute(n, canvasH, n - 1))
    setCellMap((p) => [...p, Array(colWidths.length).fill(null)])
  }
  const removeRow = () => {
    if (rowHeights.length <= 1) return
    const n = rowHeights.length - 1
    setRowHeights(redistribute(n, canvasH, n - 1))
    setCellMap((p) => p.slice(0, -1))
  }

  // Drop image from strip into empty cell
  const handleCellDrop = (row, col, imgIndex) => {
    setCellMap((prev) => {
      const next = prev.map((r) => [...r])
      // If this image is already in another cell, clear it
      for (let r = 0; r < next.length; r++) for (let c = 0; c < next[r].length; c++) {
        if (next[r][c] === imgIndex) next[r][c] = null
      }
      next[row][col] = imgIndex
      return next
    })
  }

  const handleRender = async () => {
    if (images.length === 0) return
    setProcessing(true)
    setError('')
    try {
      const masterCanvas = document.createElement('canvas')
      masterCanvas.width = canvasW
      masterCanvas.height = canvasH
      const ctx = masterCanvas.getContext('2d')
      if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor === 'black' ? '#000' : '#fff'
        ctx.fillRect(0, 0, canvasW, canvasH)
      }

      if (isCustom) {
        // Match preview getCellRect exactly — use object-cover (fill + crop)
        ctx.save()
        for (let r = 0; r < rowHeights.length; r++) {
          let cumX = 0
          const cumY = rowHeights.slice(0, r).reduce((a, b) => a + b, 0) + r * gap
          for (let c = 0; c < colWidths.length; c++) {
            const imgIdx = cellMap[r]?.[c]
            if (imgIdx != null && images[imgIdx]) {
              const imgEl = await loadImage(images[imgIdx].url)
              // object-cover: fill cell, crop overflow
              const scale = Math.max(colWidths[c] / imgEl.naturalWidth, rowHeights[r] / imgEl.naturalHeight)
              const dw = Math.floor(imgEl.naturalWidth * scale)
              const dh = Math.floor(imgEl.naturalHeight * scale)
              // Clip to cell
              ctx.beginPath()
              ctx.rect(cumX, cumY, colWidths[c], rowHeights[r])
              ctx.clip()
              ctx.drawImage(imgEl, cumX + Math.floor((colWidths[c] - dw) / 2), cumY + Math.floor((rowHeights[r] - dh) / 2), dw, dh)
              ctx.restore()
              ctx.save()
            }
            cumX += colWidths[c] + gap
          }
        }
        ctx.restore()

        // Draw grid lines
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'
        ctx.lineWidth = 1
        // Vertical lines
        let cumX = 0
        for (let c = 0; c <= colWidths.length; c++) {
          ctx.beginPath()
          ctx.moveTo(cumX, 0)
          ctx.lineTo(cumX, canvasH)
          ctx.stroke()
          if (c < colWidths.length) cumX += colWidths[c] + gap
        }
        // Horizontal lines
        let cumY = 0
        for (let r = 0; r <= rowHeights.length; r++) {
          ctx.beginPath()
          ctx.moveTo(0, cumY)
          ctx.lineTo(canvasW, cumY)
          ctx.stroke()
          if (r < rowHeights.length) cumY += rowHeights[r] + gap
        }
      } else {
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
    const a = document.createElement('a'); a.href = url; a.download = result.fileName; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <ToolShell
      title="Kolase Gambar"
      icon={Grid}
      description="Susun gambar jadi kolase dengan preset grid atau custom grid editor. Tarik garis grid untuk resize, seret gambar untuk tukar posisi."
    >
      {/* Upload */}
      <div
        className="rounded-xl border-2 border-dashed border-(--color-border-strong) bg-(--color-surface) p-6 text-center cursor-pointer hover:border-(--color-brand) transition-colors"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFiles(Array.from(e.dataTransfer.files)) }}
      >
        <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFiles(Array.from(e.target.files))} />
        <Upload size={32} className="mx-auto mb-2 text-(--color-text-3)" />
        <p className="text-sm font-semibold text-(--color-text)">Klik atau seret gambar ke sini</p>
        <p className="text-[11px] text-(--color-text-3) mt-1">JPG, PNG, WebP &middot; Bebas jumlah</p>
      </div>

      {/* Images strip */}
      {images.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-(--color-text)">{images.length} gambar</span>
            <button onClick={clearAll} className="text-[11px] text-(--color-danger) hover:underline cursor-pointer">Hapus Semua</button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {images.map((img, i) => (
              <div key={img.id} className="relative shrink-0 w-16 h-20 rounded-lg overflow-hidden border border-(--color-border) group cursor-grab active:cursor-grabbing"
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move' }}>
                <img src={img.url} alt="" className="w-full h-full object-cover pointer-events-none" />
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

      {/* Settings — always show so custom grid can be set up without images */}
      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 space-y-4">
          {/* Presets */}
          <div>
            <div className="text-xs font-semibold text-(--color-text-2) mb-2">Tata Letak:</div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => setPreset(p.id)}
                  className={`flex flex-col items-center justify-center rounded-lg border-2 p-2.5 text-xs text-center transition-all min-h-[56px] cursor-pointer ${
                    preset === p.id
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                      : 'border-(--color-border) bg-(--color-surface) text-(--color-text-2) hover:border-(--color-border-strong)'
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
              <span className="text-xs font-medium text-(--color-text-2)">Lebar:</span>
              <input type="number" min="200" max="4000" step="100" value={canvasW}
                onChange={(e) => setCanvasW(Math.max(200, Math.min(4000, Number(e.target.value) || 1200)))}
                className="w-20 rounded-lg border border-(--color-border) bg-(--color-surface) px-2 py-1.5 text-xs text-(--color-text) outline-none focus:ring-2 focus:ring-emerald-500" />
              <span className="text-[10px] text-(--color-text-3)">px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-(--color-text-2)">Tinggi:</span>
              <input type="number" min="200" max="4000" step="100" value={canvasH}
                onChange={(e) => setCanvasH(Math.max(200, Math.min(4000, Number(e.target.value) || 1600)))}
                className="w-20 rounded-lg border border-(--color-border) bg-(--color-surface) px-2 py-1.5 text-xs text-(--color-text) outline-none focus:ring-2 focus:ring-emerald-500" />
              <span className="text-[10px] text-(--color-text-3)">px</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium text-(--color-text-3) mr-0.5">Rasio:</span>
              {[
                { label: '1:1', w: 1000, h: 1000 },
                { label: '4:3', w: 1200, h: 900 },
                { label: '3:4', w: 900, h: 1200 },
                { label: '16:9', w: 1600, h: 900 },
                { label: '9:16', w: 900, h: 1600 },
                { label: '3:2', w: 1200, h: 800 },
                { label: '2:3', w: 800, h: 1200 },
              ].map((r) => (
                <button key={r.label} type="button" onClick={() => { setCanvasW(r.w); setCanvasH(r.h) }}
                  className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold transition-colors cursor-pointer ${
                    canvasW === r.w && canvasH === r.h
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-(--color-border) text-(--color-text-3) hover:border-(--color-border-strong) hover:text-(--color-text-2)'
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-(--color-text-2)">Jarak:</span>
              <input type="range" min="0" max="50" step="5" value={gap}
                onChange={(e) => setGap(Number(e.target.value))}
                className="w-24 accent-emerald-600 cursor-pointer" />
              <span className="font-mono text-emerald-500 font-bold text-[11px] w-8">{gap}px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-(--color-text-2)">Background:</span>
              <select value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                className="rounded-lg border border-(--color-border) bg-(--color-surface) px-2 py-1.5 text-xs text-(--color-text) outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="white">Putih</option>
                <option value="black">Hitam</option>
                <option value="transparent">Transparan</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-(--color-text-2)">Format:</span>
              <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}
                className="rounded-lg border border-(--color-border) bg-(--color-surface) px-2 py-1.5 text-xs text-(--color-text) outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
              </select>
            </div>
          </div>

          {/* Grid controls for custom */}
          {isCustom && (
            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-(--color-border)/60">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-(--color-text-2)">Kolom:</span>
                <button onClick={removeCol} className="rounded-lg border border-(--color-border) bg-(--color-surface) p-1 hover:bg-(--color-surface-3) cursor-pointer"><Minus size={14} /></button>
                <span className="text-xs font-bold text-(--color-text) w-4 text-center">{colWidths.length}</span>
                <button onClick={addCol} className="rounded-lg border border-(--color-border) bg-(--color-surface) p-1 hover:bg-(--color-surface-3) cursor-pointer"><Plus size={14} /></button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-(--color-text-2)">Baris:</span>
                <button onClick={removeRow} className="rounded-lg border border-(--color-border) bg-(--color-surface) p-1 hover:bg-(--color-surface-3) cursor-pointer"><Minus size={14} /></button>
                <span className="text-xs font-bold text-(--color-text) w-4 text-center">{rowHeights.length}</span>
                <button onClick={addRow} className="rounded-lg border border-(--color-border) bg-(--color-surface) p-1 hover:bg-(--color-surface-3) cursor-pointer"><Plus size={14} /></button>
              </div>
            </div>
          )}
        </div>

      {/* Custom grid editor — always show when custom, even without images */}
      {isCustom && (
        <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5">
          <CollageGridEditor
            images={images}
            canvasW={canvasW}
            canvasH={canvasH}
            gridCols={colWidths.length}
            gridRows={rowHeights.length}
            colWidths={colWidths}
            setColWidths={setColWidths}
            rowHeights={rowHeights}
            setRowHeights={setRowHeights}
            cellMap={cellMap}
            setCellMap={setCellMap}
            onDropImage={handleCellDrop}
            gap={gap}
          />
        </div>
      )}

      {error && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {images.length > 0 && !result && (
        <button onClick={handleRender} disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer shadow-md">
          {processing ? <Loader2 size={18} className="animate-spin" /> : <Grid size={18} />}
          {processing ? 'Membuat Kolase…' : 'Buat Kolase'}
        </button>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-2">
            <span className="text-xs font-bold uppercase tracking-wider text-(--color-text-3)">Hasil Kolase</span>
            <div className="flex items-center gap-1">
              <SendToDropdown
                blob={result.blob}
                fileName={result.fileName}
                outputMimeType={result.ext === 'jpg' ? 'image/jpeg' : 'image/png'}
                excludeRoute="image-collage"
              />
            </div>
          </div>
          <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 flex flex-col items-center gap-3">
            <img src={result.dataUrl} alt="Kolase" className="max-w-full max-h-[60vh] rounded-lg shadow-lg" />
          </div>
          <div className="flex gap-2">
            <button onClick={downloadResult}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition-colors cursor-pointer shadow-md">
              <Download size={18} /> Unduh {result.ext.toUpperCase()}
            </button>
            <button onClick={() => setResult(null)}
              className="rounded-lg border border-(--color-border) bg-(--color-surface) px-4 py-3 text-sm font-semibold text-(--color-text-2) hover:bg-(--color-surface-3) transition-colors cursor-pointer">
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
