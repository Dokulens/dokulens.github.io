import { useState, useRef, useEffect } from 'react'
import {
  Type, Image as ImageIcon, Download, RefreshCw, Sliders,
  Eye, X, Trash2, Upload, Move
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import { stripExt } from '../../utils/helpers'

// Constants moved to module level to avoid any potential bundling/hot-reload issues
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72, 96]

const FONT_FAMILIES = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Impact', label: 'Impact' },
  { value: 'Comic Sans MS', label: 'Comic Sans MS' },
]

export default function ImageWatermark() {
  const [imageSrc, setImageSrc] = useState(null)
  const [fileName, setFileName] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewBlob, setPreviewBlob] = useState(null)
  const [watermarkType, setWatermarkType] = useState('text')

  // Text watermark options
  const [watermarkText, setWatermarkText] = useState('© 2024 Watermark')
  const [fontFamily, setFontFamily] = useState(FONT_FAMILIES[0].value)
  const [fontSize, setFontSize] = useState(36)
  const [fontColor, setFontColor] = useState(1)
  const [opacity, setOpacity] = useState(50)

  // Icon/image watermark options
  const [iconSrc, setIconSrc] = useState(null)
  const [iconSize, setIconSize] = useState(20)
  const [iconOpacity, setIconOpacity] = useState(80)
  const [iconRotation, setIconRotation] = useState(0)

  // Positioning
  const [textPosition, setTextPosition] = useState({ x: 50, y: 50 })
  const [iconPosition, setIconPosition] = useState({ x: 50, y: 50 })

  // Drag state
  const [dragState, setDragState] = useState(null)
  const dragStartPos = useRef(null)

  const canvasRef = useRef(null)
  const iconRef = useRef(null)

  const handleFile = ([f]) => {
    if (!f) return
    setFileName(f.name)
    setPreviewUrl(null)
    setPreviewBlob(null)

    const url = URL.createObjectURL(f)
    setImageSrc(url)

    const img = new Image()
    img.onload = () => {
      renderPreview()
    }
    img.src = url
  }

  const handleIconFile = ([f]) => {
    if (!f) return
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      setIconSrc(url)
      renderPreview()
    }
    img.src = url
  }

  const renderPreview = () => {
    if (!imageSrc || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.src = imageSrc

    img.onload = () => {
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      ctx.drawImage(img, 0, 0)

      // Add text watermark
      if (watermarkType === 'text') {
        ctx.save()
        ctx.globalAlpha = (opacity / 100)
        ctx.fillStyle = getFontColor(fontColor)
        ctx.font = `${fontSize}px ${fontFamily}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const x = (textPosition.x / 100) * canvas.width
        const y = (textPosition.y / 100) * canvas.height
        ctx.fillText(watermarkText, x, y)
        ctx.restore()
      }

      // Add icon watermark
      if (watermarkType === 'icon' && iconSrc) {
        const icon = new Image()
        icon.src = iconSrc
        icon.onload = () => {
          const size = (iconSize / 100) * canvas.width
          const x = (iconPosition.x / 100) * canvas.width - size / 2
          const y = (iconPosition.y / 100) * canvas.height - size / 2

          ctx.save()
          ctx.globalAlpha = (iconOpacity / 100)
          ctx.translate(x + size / 2, y + size / 2)
          ctx.rotate((iconRotation * Math.PI) / 180)
          ctx.drawImage(icon, -size / 2, -size / 2, size, size)
          ctx.restore()
          setPreviewUrl(canvas.toDataURL('image/png'))
        }
      }

      setPreviewUrl(canvas.toDataURL('image/png'))
    }
    img.src = imageSrc
  }

  // Text drag handlers
  const handleTextMouseDown = (e) => {
    if (watermarkType !== 'text') return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    dragStartPos.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      posX: textPosition.x,
      posY: textPosition.y,
      scaleX,
      scaleY
    }
    setDragState('text')
  }

  // Icon drag handlers  
  const handleIconMouseDown = (e) => {
    if (watermarkType !== 'icon') return
    dragStartPos.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      posX: iconPosition.x,
      posY: iconPosition.y
    }
    setDragState('icon')
  }

  const handleMouseMove = (e) => {
    if (!dragState || !dragStartPos.current || !canvasRef.current) return

    const canvas = canvasRef.current
    const { clientX, clientY, posX, posY, scaleX, scaleY } = dragStartPos.current

    const deltaX = (e.clientX - clientX) / scaleX
    const deltaY = (e.clientY - clientY) / scaleY

    const newPos = {
      x: Math.max(0, Math.min(100, posX + (deltaX / canvas.width) * 100)),
      y: Math.max(0, Math.min(100, posY + (deltaY / canvas.height) * 100))
    }

    if (dragState === 'text') {
      setTextPosition(newPos)
    } else if (dragState === 'icon') {
      setIconPosition(newPos)
    }
    renderPreview()
  }

  const handleMouseUp = () => {
    setDragState(null)
    dragStartPos.current = null
  }

  const getFontColor = (index) => {
    const colors = [
      '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00',
      '#ff00ff', '#00ffff', '#ffa500', '#808080', '#800000', '#008000',
      '#000080', '#800080', '#008080'
    ]
    return colors[index % colors.length] || '#000000'
  }

  const downloadResult = () => {
    if (!previewBlob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(previewBlob)
    a.download = `watermarked_${stripExt(fileName)}.png`
    a.click()
  }

  // Re-render when options change
  useEffect(() => {
    if (imageSrc) {
      requestAnimationFrame(renderPreview)
    }
  }, [watermarkType, watermarkText, fontFamily, fontSize, fontColor, opacity, iconSize, iconOpacity, iconRotation, textPosition, iconPosition, iconSrc])

  return (
    <ToolShell
      title="Tambah Watermark pada Gambar"
      description="Tambahkan watermark teks atau ikon/gambar ke gambar dengan posisi drag & drop kustom. Semua proses lokal di browser."
    >
      {!imageSrc && (
        <DropZone
          accept="image/*"
          onFiles={handleFile}
          label="Pilih gambar untuk diberi watermark"
          hint="Drag & drop, paste (Ctrl+V), atau klik — JPG, PNG, WebP"
        />
      )}

      {imageSrc && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          {/* Left: Preview */}
          <div className="space-y-3">
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                  Preview Gambar
                </span>
                <span className="text-[10px] text-[--color-text-3] font-mono">
                  Drag & drop untuk memindahkan posisi watermark
                </span>
              </div>
              <div
                className="relative rounded-lg border border-dashed border-[--color-border] overflow-hidden bg-[--color-surface-2]"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <canvas
                  ref={canvasRef}
                  className="block w-full h-auto cursor-crosshair"
                  onMouseDown={handleTextMouseDown}
                />
                {watermarkType === 'icon' && iconSrc && (
                  <div
                    ref={iconRef}
                    className="absolute top-0 left-0 w-full h-full cursor-move"
                    onMouseDown={handleIconMouseDown}
                  />
                )}
              </div>
            </div>

            {dragState && (
              <div className="text-[10px] text-[--color-text-3] animate-pulse text-center">
                🔵 Sedang menyeret {dragState === 'text' ? 'teks' : 'ikon'}...
              </div>
            )}
          </div>

          {/* Right: Controls */}
          <div className="space-y-3">
            {/* Watermark Type */}
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-[--color-text-2]">Tipe Watermark</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setWatermarkType('text'); renderPreview() }}
                  className={[
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-all',
                    watermarkType === 'text'
                      ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand]'
                      : 'border-[--color-border] bg-[--color-surface-3] text-[--color-text-3]'
                  ].join(' ')}
                >
                  <Type size={14} /> Teks
                </button>
                <button
                  onClick={() => { setWatermarkType('icon'); renderPreview() }}
                  className={[
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-all',
                    watermarkType === 'icon'
                      ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand]'
                      : 'border-[--color-border] bg-[--color-surface-3] text-[--color-text-3]'
                  ].join(' ')}
                >
                  <ImageIcon size={14} /> Ikon/Gambar
                </button>
              </div>
            </div>

            {/* Text Options */}
            {watermarkType === 'text' && (
              <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3">
                <div>
                  <label className="text-xs font-bold text-[--color-text-2] mb-2 block">Teks Watermark</label>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => { setWatermarkText(e.target.value); renderPreview() }}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[--color-border] bg-[--color-surface-3] text-[--color-text-2] focus:border-[--color-brand] focus:ring-1 focus:ring-[--color-brand-light]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[--color-text-2] mb-2 block">Font Family</label>
                  <select
                    value={fontFamily}
                    onChange={(e) => { setFontFamily(e.target.value); renderPreview() }}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[--color-border] bg-[--color-surface-3] text-[--color-text-2] focus:border-[--color-brand] focus:ring-1 focus:ring-[--color-brand-light]"
                  >
                    {FONT_FAMILIES.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[--color-text-2] mb-2 block">Ukuran Font</label>
                  <div className="grid grid-cols-9 gap-1">
                    {FONT_SIZES.map((size, idx) => (
                      <button
                        key={size}
                        onClick={() => { setFontSize(size); renderPreview() }}
                        className={[
                          'text-[10px] font-bold py-1 rounded border transition-all',
                          fontSize === size
                            ? 'bg-[--color-brand] text-white border-[--color-brand]'
                            : 'bg-[--color-surface-3] text-[--color-text-3] border-[--color-border] hover:bg-[--color-surface-2]'
                        ].join(' ')}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-[--color-text-2] mb-2 block">Warna Font</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(idx => (
                      <button
                        key={idx}
                        onClick={() => { setFontColor(idx); renderPreview() }}
                        className={[
                          'w-6 h-6 rounded border-2 transition-all',
                          fontColor === idx ? 'scale-110 ring-2 ring-offset-1' : ''
                        ].join(' ')}
                        style={{ backgroundColor: getFontColor(idx), borderColor: getFontColor(idx) }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-[--color-text-2] flex items-center gap-2 mb-2">
                    <Eye size={12} /> Opasitas Teks ({opacity}%)
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={opacity}
                    onChange={(e) => { setOpacity(Number(e.target.value)); renderPreview() }}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {/* Icon Options */}
            {watermarkType === 'icon' && (
              <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3">
                <div>
                  <label className="text-xs font-bold text-[--color-text-2] mb-2 block">Upload Ikon/Gambar</label>
                  <DropZone
                    accept="image/*"
                    onFiles={handleIconFile}
                    label=""
                    hint="Format: JPG, PNG, WebP, GIF, SVG, dll."
                  />
                  {iconSrc && (
                    <button
                      onClick={() => { setIconSrc(null); renderPreview() }}
                      className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800/50 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 font-semibold transition-all"
                    >
                      <Trash2 size={12} /> Hapus Ikon
                    </button>
                  )}
                </div>

                {iconSrc && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-[--color-text-2] mb-2 block">Ukuran Ikon ({iconSize}% dari gambar)</label>
                      <input
                        type="range"
                        min="5"
                        max="50"
                        value={iconSize}
                        onChange={(e) => { setIconSize(Number(e.target.value)); renderPreview() }}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[--color-text-2] mb-2 block">Rotasi ({iconRotation}°)</label>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={iconRotation}
                        onChange={(e) => { setIconRotation(Number(e.target.value)); renderPreview() }}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[--color-text-2] flex items-center gap-2 mb-2">
                        <Eye size={12} /> Opasitas Ikon ({iconOpacity}%)
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={iconOpacity}
                        onChange={(e) => { setIconOpacity(Number(e.target.value)); renderPreview() }}
                        className="w-full"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Download */}
            {previewUrl && (
              <button
                onClick={downloadResult}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[--color-brand] bg-[--color-brand] px-4 py-3 text-sm font-bold text-white shadow-md hover:brightness-110 transition-all"
              >
                <Download size={16} /> Download Hasil
              </button>
            )}

            {/* Reset */}
            <button
              onClick={() => { setPreviewUrl(null); setPreviewBlob(null); setWatermarkText('© 2024 Watermark'); }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[--color-border] bg-[--color-surface] px-4 py-3 text-sm font-bold text-[--color-text-3] hover:bg-[--color-surface-2] transition-all"
            >
              <RefreshCw size={16} /> Reset
            </button>
          </div>
        </div>
      )}
    </ToolShell>
  )
}
// build timestamp 
