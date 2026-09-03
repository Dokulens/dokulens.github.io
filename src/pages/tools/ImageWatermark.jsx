import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Type, Image as ImageIcon, Download, RefreshCw,
  Eye, Trash2, Move
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import { stripExt } from '../../utils/helpers'
import { BTN_CARD_ACTIVE, BTN_CARD_INACTIVE, BTN_TOGGLE_ACTIVE, BTN_TOGGLE_INACTIVE } from '../../utils/activeButtonStyles'
import { useIncomingFile } from '../../hooks/useIncomingFile'

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

const FONT_COLORS = [
  '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00',
  '#ff00ff', '#00ffff', '#ffa500', '#808080', '#800000', '#008000',
  '#000080', '#800080', '#008080'
]

export default function ImageWatermark() {
  const [imageSrc, setImageSrc] = useState(null)
  useIncomingFile((f) => {
    setFileName(f.name)
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setImageSrc(url)
      requestAnimationFrame(redraw)
    }
    img.src = url
  })
  const [fileName, setFileName] = useState('')
  const [watermarkType, setWatermarkType] = useState('text')

  const [watermarkText, setWatermarkText] = useState('© 2024 Watermark')
  const [fontFamily, setFontFamily] = useState('Arial')
  const [fontSize, setFontSize] = useState(36)
  const [fontColor, setFontColor] = useState(1)
  const [opacity, setOpacity] = useState(50)

  const [iconSrc, setIconSrc] = useState(null)
  const [iconSize, setIconSize] = useState(20)
  const [iconOpacity, setIconOpacity] = useState(80)
  const [iconRotation, setIconRotation] = useState(0)

  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const textPosRef = useRef({ x: 50, y: 50 })
  const iconPosRef = useRef({ x: 50, y: 50 })

  const [dragging, setDragging] = useState(null)
  const dragStart = useRef(null)
  const rafRef = useRef(null)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return

    const ctx = canvas.getContext('2d')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    ctx.drawImage(img, 0, 0)

    const REF = 800
    const scale = Math.max(canvas.width, canvas.height) / REF

    if (watermarkType === 'text') {
      const scaledFont = Math.round(fontSize * scale)
      ctx.save()
      ctx.globalAlpha = opacity / 100
      ctx.fillStyle = FONT_COLORS[fontColor] || '#000000'
      ctx.font = `${scaledFont}px ${fontFamily}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const pos = textPosRef.current
      ctx.fillText(watermarkText, (pos.x / 100) * canvas.width, (pos.y / 100) * canvas.height)
      ctx.restore()
    }

    if (watermarkType === 'icon' && iconSrc) {
      const icon = new Image()
      icon.onload = () => {
        const size = (iconSize / 100) * canvas.width
        const pos = iconPosRef.current
        const ix = (pos.x / 100) * canvas.width - size / 2
        const iy = (pos.y / 100) * canvas.height - size / 2
        ctx.save()
        ctx.globalAlpha = iconOpacity / 100
        ctx.translate(ix + size / 2, iy + size / 2)
        ctx.rotate((iconRotation * Math.PI) / 180)
        ctx.drawImage(icon, -size / 2, -size / 2, size, size)
        ctx.restore()
      }
      icon.src = iconSrc
    }
  }, [watermarkType, watermarkText, fontFamily, fontSize, fontColor, opacity, iconSrc, iconSize, iconOpacity, iconRotation])

  useEffect(() => {
    if (imageSrc) redraw()
  }, [imageSrc, redraw])

  const handleFile = ([f]) => {
    if (!f) return
    setFileName(f.name)
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setImageSrc(url)
      requestAnimationFrame(redraw)
    }
    img.src = url
  }

  const handleIconFile = ([f]) => {
    if (!f) return
    const url = URL.createObjectURL(f)
    setIconSrc(url)
  }

  const handleCanvasMouseDown = (e) => {
    if (!canvasRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    const mouseCanvasX = (e.clientX - rect.left) * sx
    const mouseCanvasY = (e.clientY - rect.top) * sy

    if (watermarkType === 'text') {
      const pos = textPosRef.current
      const markX = (pos.x / 100) * canvas.width
      const markY = (pos.y / 100) * canvas.height
      dragStart.current = {
        offsetX: mouseCanvasX - markX,
        offsetY: mouseCanvasY - markY,
        scaleX: sx,
        scaleY: sy
      }
      setDragging('text')
    } else if (watermarkType === 'icon' && iconSrc) {
      const pos = iconPosRef.current
      const markX = (pos.x / 100) * canvas.width
      const markY = (pos.y / 100) * canvas.height
      dragStart.current = {
        offsetX: mouseCanvasX - markX,
        offsetY: mouseCanvasY - markY,
        scaleX: sx,
        scaleY: sy
      }
      setDragging('icon')
    }
  }

  useEffect(() => {
    if (!dragging) return

    const onMove = (e) => {
      if (!dragStart.current || !canvasRef.current) return
      const canvas = canvasRef.current
      const rect = canvas.getBoundingClientRect()
      const { offsetX, offsetY } = dragStart.current
      const mouseCanvasX = (e.clientX - rect.left) * (canvas.width / rect.width)
      const mouseCanvasY = (e.clientY - rect.top) * (canvas.height / rect.height)
      const newPos = {
        x: Math.max(0, Math.min(100, ((mouseCanvasX - offsetX) / canvas.width) * 100)),
        y: Math.max(0, Math.min(100, ((mouseCanvasY - offsetY) / canvas.height) * 100))
      }

      if (dragging === 'text') {
        textPosRef.current = newPos
      } else {
        iconPosRef.current = newPos
      }

      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(redraw)
    }

    const onUp = () => {
      setDragging(null)
      dragStart.current = null
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, redraw])

  const downloadResult = () => {
    if (!canvasRef.current) return
    canvasRef.current.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `watermarked_${stripExt(fileName)}.png`
      a.click()
    }, 'image/png')
  }

  const resetAll = () => {
    setImageSrc(null)
    setFileName('')
    setIconSrc(null)
    textPosRef.current = { x: 50, y: 50 }
    iconPosRef.current = { x: 50, y: 50 }
    imgRef.current = null
    setWatermarkType('text')
    setWatermarkText('© 2024 Watermark')
  }

  return (
    <ToolShell
      title="Tambah Watermark pada Gambar"
      description="Tambahkan watermark teks atau ikon/gambar ke gambar. Drag untuk posisi. 100% Client-Side."
    >
      <DropZone
        accept="image/*"
        onFiles={handleFile}
        label="Pilih gambar untuk diberi watermark"
        hint="Drag & drop, paste (Ctrl+V), atau klik — JPG, PNG, WebP"
      />

      {imageSrc && (
        <div className="flex flex-col gap-3">
          {/* Canvas - full width */}
          <div className="relative rounded-lg border border-dashed border-(--color-border) overflow-hidden bg-(--color-surface-2)">
            <canvas
              ref={canvasRef}
              className="block w-full h-auto cursor-crosshair"
              onMouseDown={handleCanvasMouseDown}
            />
            {dragging && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-white text-[10px] font-mono animate-pulse pointer-events-none">
                🔵 Menyeret {dragging === 'text' ? 'teks' : 'ikon'}…
              </div>
            )}
          </div>

          {/* Controls - horizontal strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {/* Type */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-6 flex gap-1.5">
              <button
                onClick={() => { setWatermarkType('text'); requestAnimationFrame(redraw) }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${watermarkType === 'text' ? BTN_CARD_ACTIVE : BTN_CARD_INACTIVE}`}
              >
                <Type size={13} /> Teks
              </button>
              <button
                onClick={() => { setWatermarkType('icon'); requestAnimationFrame(redraw) }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${watermarkType === 'icon' ? BTN_CARD_ACTIVE : BTN_CARD_INACTIVE}`}
              >
                <ImageIcon size={13} /> Ikon
              </button>
            </div>

            {/* Text options inline */}
            {watermarkType === 'text' && (
              <>
                <div className="col-span-2 sm:col-span-3 lg:col-span-2">
                  <label className="text-[10px] font-bold text-(--color-text-3) mb-1 block">Teks</label>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono rounded-lg border border-(--color-border) bg-(--color-surface-3) text-(--color-text-2)"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-(--color-text-3) mb-1 block">Font</label>
                  <select
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-(--color-border) bg-(--color-surface-3) text-(--color-text-2)"
                  >
                    {FONT_FAMILIES.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-(--color-text-3) mb-1 block">Ukuran</label>
                  <div className="flex flex-wrap gap-0.5">
                    {[12, 16, 20, 24, 32, 48, 60, 72, 96].map(s => (
                      <button
                        key={s}
                        onClick={() => setFontSize(s)}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all ${fontSize === s ? BTN_TOGGLE_ACTIVE : BTN_TOGGLE_INACTIVE}`}
                      >{s}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-(--color-text-3) mb-1 block">Warna</label>
                  <div className="flex flex-wrap gap-1">
                    {FONT_COLORS.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => setFontColor(i)}
                        className={[
                          'w-5 h-5 rounded-sm border transition-all',
                          fontColor === i ? 'ring-2 ring-(--color-brand) ring-offset-1 ring-offset-(--color-surface)' : ''
                        ].join(' ')}
                        style={{ backgroundColor: c, borderColor: c === '#ffffff' ? '#666' : c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-3 lg:col-span-1">
                  <label className="text-[10px] font-bold text-(--color-text-3) mb-1 flex items-center gap-1">
                    <Eye size={10} /> Opasitas ({opacity}%)
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full h-1"
                  />
                </div>
              </>
            )}

            {/* Icon options inline */}
            {watermarkType === 'icon' && (
              <>
                <div className="col-span-2 sm:col-span-3 lg:col-span-2">
                  <label className="text-[10px] font-bold text-(--color-text-3) mb-1 block">Upload Ikon</label>
                  <DropZone
                    accept="image/*"
                    onFiles={handleIconFile}
                    label=""
                    hint="JPG, PNG, WebP, GIF, SVG"
                  />
                  {iconSrc && (
                    <button
                      onClick={() => setIconSrc(null)}
                      className="mt-1 flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 font-semibold"
                    >
                      <Trash2 size={10} /> Hapus
                    </button>
                  )}
                </div>
                {iconSrc && (
                  <>
                    <div>
                      <label className="text-[10px] font-bold text-(--color-text-3) mb-1 block">Ukuran ({iconSize}%)</label>
                      <input type="range" min="5" max="50" value={iconSize}
                        onChange={(e) => setIconSize(Number(e.target.value))} className="w-full h-1" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-(--color-text-3) mb-1 block">Rotasi ({iconRotation}°)</label>
                      <input type="range" min="0" max="360" value={iconRotation}
                        onChange={(e) => setIconRotation(Number(e.target.value))} className="w-full h-1" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-(--color-text-3) mb-1 flex items-center gap-1">
                        <Eye size={10} /> Opasitas ({iconOpacity}%)
                      </label>
                      <input type="range" min="10" max="100" value={iconOpacity}
                        onChange={(e) => setIconOpacity(Number(e.target.value))} className="w-full h-1" />
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={downloadResult}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg border-2 border-(--color-brand) bg-(--color-brand) px-4 py-2.5 text-sm font-bold text-white shadow-md hover:brightness-110 transition-all"
            >
              <Download size={16} /> Download Hasil
            </button>
            <button
              onClick={resetAll}
              className="flex items-center justify-center gap-2 rounded-lg border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-sm font-bold text-(--color-text-3) hover:bg-(--color-surface-2) transition-all"
            >
              <RefreshCw size={16} /> Reset
            </button>
          </div>
        </div>
      )}
    </ToolShell>
  )
}
