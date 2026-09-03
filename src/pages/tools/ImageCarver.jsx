import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Shrink, RotateCcw, Paintbrush, ShieldCheck, ShieldAlert,
  Play, Square, Sparkles, Download, Activity, Lock, Unlock, Trash2, Image as ImageIcon,
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ProgressBar from '../../components/ProgressBar'
import ResultCard from '../../components/ResultCard'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

const ALPHA_DELETE_THRESHOLD = 244
const MAX_WIDTH_LIMIT = 1500
const MAX_HEIGHT_LIMIT = 1500

function cropImageData(src, w, h) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const srcRow = y * src.width * 4
    const dstRow = y * w * 4
    for (let x = 0; x < w; x++) {
      const srcIdx = srcRow + x * 4
      const dstIdx = dstRow + x * 4
      data[dstIdx] = src.data[srcIdx]
      data[dstIdx + 1] = src.data[srcIdx + 1]
      data[dstIdx + 2] = src.data[srcIdx + 2]
      data[dstIdx + 3] = src.data[srcIdx + 3]
    }
  }
  return new ImageData(data, w, h)
}

function cropMask(mask, srcW, srcH, dstW, dstH) {
  const newMask = new Uint8Array(dstW * dstH)
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const srcIdx = y * srcW + x
      const dstIdx = y * dstW + x
      if (srcIdx < mask.length && dstIdx < newMask.length) {
        newMask[dstIdx] = mask[srcIdx]
      }
    }
  }
  return newMask
}

function getPixelDeleteEnergy() {
  const numColors = 3
  const maxColorDistance = 255
  const numNeighbors = 2
  const multiplier = 2
  const maxSeamSize = Math.max(MAX_WIDTH_LIMIT, MAX_HEIGHT_LIMIT)
  return -1 * multiplier * numNeighbors * maxSeamSize * numColors * (maxColorDistance ** 2)
}

function getPixel(img, x, y, w, h) {
  const idx = (y * w + x) * 4
  if (idx + 3 >= img.data.length) return [0, 0, 0, 0]
  return [img.data[idx], img.data[idx + 1], img.data[idx + 2], img.data[idx + 3]]
}

function setPixel(img, x, y, w, h, color) {
  const idx = (y * w + x) * 4
  if (idx + 3 >= img.data.length) return
  img.data[idx] = color[0]
  img.data[idx + 1] = color[1]
  img.data[idx + 2] = color[2]
  img.data[idx + 3] = color[3]
}

function getPixelEnergy(left, middle, right) {
  const [mR, mG, mB, mA] = middle
  let lEnergy = 0
  if (left) {
    const [lR, lG, lB] = left
    lEnergy = (lR - mR) ** 2 + (lG - mG) ** 2 + (lB - mB) ** 2
  }
  let rEnergy = 0
  if (right) {
    const [rR, rG, rB] = right
    rEnergy = (rR - mR) ** 2 + (rG - mG) ** 2 + (rB - mB) ** 2
  }
  return mA > ALPHA_DELETE_THRESHOLD ? (lEnergy + rEnergy) : getPixelDeleteEnergy()
}

function getPixelEnergyH(img, w, h, x, y) {
  const left = (x - 1) >= 0 ? getPixel(img, x - 1, y, w, h) : null
  const middle = getPixel(img, x, y, w, h)
  const right = (x + 1) < w ? getPixel(img, x + 1, y, w, h) : null
  return getPixelEnergy(left, middle, right)
}

function getPixelEnergyV(img, w, h, x, y) {
  const top = (y - 1) >= 0 ? getPixel(img, x, y - 1, w, h) : null
  const middle = getPixel(img, x, y, w, h)
  const bottom = (y + 1) < h ? getPixel(img, x, y + 1, w, h) : null
  return getPixelEnergy(top, middle, bottom)
}

function calculateEnergyMapH(img, w, h) {
  const map = Array.from({ length: h }, () => new Array(w).fill(Infinity))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      map[y][x] = getPixelEnergyH(img, w, h, x, y)
    }
  }
  return map
}

function calculateEnergyMapV(img, w, h) {
  const map = Array.from({ length: h }, () => new Array(w).fill(Infinity))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      map[y][x] = getPixelEnergyV(img, w, h, x, y)
    }
  }
  return map
}

function reCalculateEnergyMapH(img, w, h, energyMap, seam) {
  for (const { x: seamX, y: seamY } of seam) {
    for (let x = seamX; x < (w - 1); x++) {
      if (seamY < energyMap.length && x < energyMap[seamY].length) {
        energyMap[seamY][x] = energyMap[seamY][x + 1]
      }
    }
    if (seamY < energyMap.length && seamX < energyMap[seamY].length) {
      energyMap[seamY][seamX] = getPixelEnergyH(img, w, h, seamX, seamY)
    }
  }
  return energyMap
}

function reCalculateEnergyMapV(img, w, h, energyMap, seam) {
  for (const { x: seamX, y: seamY } of seam) {
    for (let y = seamY; y < (h - 1); y++) {
      if (y < energyMap.length && seamX < energyMap[y].length) {
        energyMap[y][seamX] = energyMap[y + 1][seamX]
      }
    }
    if (seamY < energyMap.length && seamX < energyMap[seamY].length) {
      energyMap[seamY][seamX] = getPixelEnergyV(img, w, h, seamX, seamY)
    }
  }
  return energyMap
}

function findLowEnergySeamH(energyMap, w, h) {
  const seamsMap = Array.from({ length: h }, () => new Array(w).fill(null))
  for (let x = 0; x < w; x++) {
    if (0 < energyMap.length && x < energyMap[0].length) {
      seamsMap[0][x] = { energy: energyMap[0][x], coord: { x, y: 0 }, prev: null }
    }
  }
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let minPrevEnergy = Infinity
      let minPrevX = x
      for (let i = x - 1; i <= x + 1; i++) {
        if (i >= 0 && i < w && seamsMap[y - 1][i] && seamsMap[y - 1][i].energy < minPrevEnergy) {
          minPrevEnergy = seamsMap[y - 1][i].energy
          minPrevX = i
        }
      }
      if (y < seamsMap.length && x < seamsMap[y].length && y < energyMap.length && x < energyMap[y].length) {
        seamsMap[y][x] = {
          energy: minPrevEnergy + energyMap[y][x],
          coord: { x, y },
          prev: { x: minPrevX, y: y - 1 },
        }
      }
    }
  }
  let lastMin = null
  let minSeamEnergy = Infinity
  for (let x = 0; x < w; x++) {
    const y = h - 1
    if (y < seamsMap.length && x < seamsMap[y].length && seamsMap[y][x] && seamsMap[y][x].energy < minSeamEnergy) {
      minSeamEnergy = seamsMap[y][x].energy
      lastMin = { x, y }
    }
  }
  if (!lastMin) return []
  const seam = []
  let cur = seamsMap[lastMin.y][lastMin.x]
  while (cur) {
    seam.push(cur.coord)
    if (!cur.prev) break
    cur = seamsMap[cur.prev.y][cur.prev.x]
  }
  return seam
}

function findLowEnergySeamV(energyMap, w, h) {
  const seamsMap = Array.from({ length: h }, () => new Array(w).fill(null))
  for (let y = 0; y < h; y++) {
    if (y < energyMap.length && 0 < energyMap[y].length) {
      seamsMap[y][0] = { energy: energyMap[y][0], coord: { x: 0, y }, prev: null }
    }
  }
  for (let x = 1; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let minPrevEnergy = Infinity
      let minPrevY = y
      for (let i = y - 1; i <= y + 1; i++) {
        if (i >= 0 && i < h && seamsMap[i][x - 1] && seamsMap[i][x - 1].energy < minPrevEnergy) {
          minPrevEnergy = seamsMap[i][x - 1].energy
          minPrevY = i
        }
      }
      if (y < seamsMap.length && x < seamsMap[y].length && y < energyMap.length && x < energyMap[y].length) {
        seamsMap[y][x] = {
          energy: minPrevEnergy + energyMap[y][x],
          coord: { x, y },
          prev: { x: x - 1, y: minPrevY },
        }
      }
    }
  }
  let lastMin = null
  let minSeamEnergy = Infinity
  for (let y = 0; y < h; y++) {
    const x = w - 1
    if (y < seamsMap.length && x < seamsMap[y].length && seamsMap[y][x] && seamsMap[y][x].energy < minSeamEnergy) {
      minSeamEnergy = seamsMap[y][x].energy
      lastMin = { x, y }
    }
  }
  if (!lastMin) return []
  const seam = []
  let cur = seamsMap[lastMin.y][lastMin.x]
  while (cur) {
    seam.push(cur.coord)
    if (!cur.prev) break
    cur = seamsMap[cur.prev.y][cur.prev.x]
  }
  return seam
}

function deleteSeamH(img, seam, w, h) {
  for (const { x: seamX, y: seamY } of seam) {
    for (let x = seamX; x < (w - 1); x++) {
      const next = getPixel(img, x + 1, seamY, w, h)
      setPixel(img, x, seamY, w, h, next)
    }
  }
}

function deleteSeamV(img, seam, w, h) {
  for (const { x: seamX, y: seamY } of seam) {
    for (let y = seamY; y < (h - 1); y++) {
      const next = getPixel(img, seamX, y + 1, w, h)
      setPixel(img, seamX, y, w, h, next)
    }
  }
}

function deleteSeamHMask(mask, seam, w, h) {
  for (const item of seam) {
    const seamX = item.x
    const seamY = item.y
    const rowOffset = seamY * w
    for (let x = seamX; x < (w - 1); x++) {
      const dstIdx = rowOffset + x
      const srcIdx = rowOffset + x + 1
      if (dstIdx < mask.length && srcIdx < mask.length) {
        mask[dstIdx] = mask[srcIdx]
      }
    }
  }
}

function deleteSeamVMask(mask, seam, w, h) {
  for (const item of seam) {
    const seamX = item.x
    const seamY = item.y
    for (let y = seamY; y < (h - 1); y++) {
      const dstIdx = y * w + seamX
      const srcIdx = (y + 1) * w + seamX
      if (dstIdx < mask.length && srcIdx < mask.length) {
        mask[dstIdx] = mask[srcIdx]
      }
    }
  }
}

function applyMaskToEnergyMap(energyMap, w, h, mask) {
  if (!mask) return energyMap
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (idx < mask.length && y < energyMap.length && x < energyMap[y].length) {
        const val = mask[idx] || 0
        if (val === 255) energyMap[y][x] = getPixelDeleteEnergy()
        else if (val === 128) energyMap[y][x] = 1e9
      }
    }
  }
  return energyMap
}

export default function ImageCarver() {
  const [file, setFile] = useState(null)
  const [sourceImage, setSourceImage] = useState(null)
  const [origW, setOrigW] = useState(0)
  const [origH, setOrigH] = useState(0)
  const [widthPct, setWidthPct] = useState(80)
  const [heightPct, setHeightPct] = useState(80)
  const [keepRatio, setKeepRatio] = useState(true)
  const [livePreview, setLivePreview] = useState(true)
  const [maskMode, setMaskMode] = useState('remove') // 'remove' | 'protect'
  const [brushSize, setBrushSize] = useState(16)

  const [isCarving, setIsCarving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('Silakan muat gambar untuk memulai.')
  const [seamsRemovedText, setSeamsRemovedText] = useState('0')
  const [resultSizeText, setResultSizeText] = useState('—')
  const [resultBlob, setResultBlob] = useState(null)

  const origCanvasRef = useRef(null)
  const resCanvasRef = useRef(null)
  const origImageDataRef = useRef(null)
  const maskDataRef = useRef(null)
  const resultImageDataRef = useRef(null)
  const isDrawingRef = useRef(false)
  const lastMaskPosRef = useRef(null)
  const stopRequestedRef = useRef(false)
  const isUpdatingRatioRef = useRef(false)

  // ─── Incoming File ───
  useIncomingFile((f) => handleFileSelect([f]))

  // ─── Draw Original Canvas + Mask Overlay ───
  const drawOriginal = useCallback(() => {
    const canvas = origCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!sourceImage || !origW || !origH) {
      canvas.width = 0
      canvas.height = 0
      return
    }

    let dispW = origW
    let dispH = origH
    const maxD = 600
    if (dispW > maxD || dispH > maxD) {
      const scale = Math.min(maxD / dispW, maxD / dispH)
      dispW = Math.round(dispW * scale)
      dispH = Math.round(dispH * scale)
    }

    canvas.width = dispW
    canvas.height = dispH
    ctx.drawImage(sourceImage, 0, 0, dispW, dispH)

    const maskData = maskDataRef.current
    if (maskData && origW > 0 && origH > 0 && maskData.length === origW * origH) {
      const scaleX = dispW / origW
      const scaleY = dispH / origH
      const imgData = ctx.getImageData(0, 0, dispW, dispH)
      const d = imgData.data

      for (let py = 0; py < dispH; py++) {
        for (let px = 0; px < dispW; px++) {
          const mx = Math.floor(px / scaleX)
          const my = Math.floor(py / scaleY)
          const idx = my * origW + mx
          if (idx < maskData.length) {
            const mVal = maskData[idx]
            if (mVal > 128) {
              // Red tint for remove (255)
              const i = (py * dispW + px) * 4
              d[i] = Math.min(255, d[i] + 120)
              d[i + 1] = Math.max(0, d[i + 1] - 40)
              d[i + 2] = Math.max(0, d[i + 2] - 40)
              d[i + 3] = Math.min(255, d[i + 3] + 60)
            } else if (mVal === 128) {
              // Green tint for protect (128)
              const i = (py * dispW + px) * 4
              d[i] = Math.max(0, d[i] - 40)
              d[i + 1] = Math.min(255, d[i + 1] + 120)
              d[i + 2] = Math.max(0, d[i + 2] - 40)
              d[i + 3] = Math.min(255, d[i + 3] + 60)
            }
          }
        }
      }
      ctx.putImageData(imgData, 0, 0)
    }
  }, [sourceImage, origW, origH])

  // ─── Draw Result Canvas ───
  const drawResult = useCallback(() => {
    const canvas = resCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const resultImageData = resultImageDataRef.current

    if (!resultImageData) {
      canvas.width = 0
      canvas.height = 0
      setResultSizeText('—')
      return
    }

    const w = resultImageData.width
    const h = resultImageData.height
    let dispW = w
    let dispH = h
    const maxD = 600
    if (dispW > maxD || dispH > maxD) {
      const scale = Math.min(maxD / dispW, maxD / dispH)
      dispW = Math.round(dispW * scale)
      dispH = Math.round(dispH * scale)
    }

    canvas.width = dispW
    canvas.height = dispH
    const tmp = document.createElement('canvas')
    tmp.width = w
    tmp.height = h
    const tctx = tmp.getContext('2d')
    tctx.putImageData(resultImageData, 0, 0)
    ctx.drawImage(tmp, 0, 0, dispW, dispH)
    setResultSizeText(`${w} × ${h} px`)
  }, [])

  useEffect(() => {
    drawOriginal()
  }, [drawOriginal])

  useEffect(() => {
    drawResult()
  }, [drawResult])

  // ─── Load image from file ───
  const handleFileSelect = (filesList) => {
    if (!filesList || !filesList[0]) return
    const f = filesList[0]
    setFile(f)
    setResultBlob(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        setSourceImage(img)
        setOrigW(img.width)
        setOrigH(img.height)

        const tmp = document.createElement('canvas')
        tmp.width = img.width
        tmp.height = img.height
        const tctx = tmp.getContext('2d')
        tctx.drawImage(img, 0, 0)

        origImageDataRef.current = tctx.getImageData(0, 0, img.width, img.height)
        maskDataRef.current = new Uint8Array(img.width * img.height)
        resultImageDataRef.current = null
        setSeamsRemovedText('0')
        setWidthPct(80)
        setHeightPct(80)
        setStatusText(`Gambar berhasil dimuat: ${img.width} × ${img.height} px. Lukis mask & tekan Carve.`)
        stopRequestedRef.current = false
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(f)
  }

  // ─── Keep Ratio logic ───
  const updateKeepRatio = (changed, newW, newH) => {
    if (!origW || !origH || !keepRatio || isUpdatingRatioRef.current) return
    isUpdatingRatioRef.current = true

    const ratio = origW / origH

    if (changed === 'width') {
      const wVal = clamp(newW, 10, 100)
      const hVal = clamp(Math.round(wVal / ratio), 10, 100)
      setHeightPct(hVal)
    } else if (changed === 'height') {
      const hVal = clamp(newH, 10, 100)
      const wVal = clamp(Math.round(hVal * ratio), 10, 100)
      setWidthPct(wVal)
    }

    isUpdatingRatioRef.current = false
  }

  const handleWidthChange = (val) => {
    const v = clamp(val, 10, 100)
    setWidthPct(v)
    updateKeepRatio('width', v, heightPct)
  }

  const handleHeightChange = (val) => {
    const v = clamp(val, 10, 100)
    setHeightPct(v)
    updateKeepRatio('height', widthPct, v)
  }

  // ─── Mask drawing ───
  const getMaskCoords = (e) => {
    const canvas = origCanvasRef.current
    if (!canvas || !origW || !origH) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX
    const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY
    const x = (clientX - rect.left) * scaleX
    const y = (clientY - rect.top) * scaleY
    const mx = Math.floor(x / (canvas.width / origW))
    const my = Math.floor(y / (canvas.height / origH))
    return { mx: clamp(mx, 0, origW - 1), my: clamp(my, 0, origH - 1) }
  }

  const applyMaskAt = (mx, my, radius) => {
    const maskData = maskDataRef.current
    if (!maskData || !origW || !origH) return
    const r = Math.max(1, radius)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > r) continue
        const px = clamp(mx + dx, 0, origW - 1)
        const py = clamp(my + dy, 0, origH - 1)
        const idx = py * origW + px
        if (idx < maskData.length) {
          if (maskMode === 'remove') maskData[idx] = 255
          else if (maskMode === 'protect') maskData[idx] = 128
        }
      }
    }
    drawOriginal()
  }

  const startDraw = (e) => {
    if (!sourceImage || isCarving) return
    isDrawingRef.current = true
    const coords = getMaskCoords(e)
    if (coords) {
      lastMaskPosRef.current = coords
      applyMaskAt(coords.mx, coords.my, brushSize)
    }
  }

  const moveDraw = (e) => {
    if (!isDrawingRef.current || !sourceImage || isCarving) return
    const coords = getMaskCoords(e)
    if (coords) {
      if (lastMaskPosRef.current && Math.abs(coords.mx - lastMaskPosRef.current.mx) < 2 && Math.abs(coords.my - lastMaskPosRef.current.my) < 2) return
      lastMaskPosRef.current = coords
      applyMaskAt(coords.mx, coords.my, brushSize)
    }
  }

  const endDraw = () => {
    isDrawingRef.current = false
    lastMaskPosRef.current = null
  }

  const clearMask = () => {
    if (!maskDataRef.current) return
    maskDataRef.current.fill(0)
    drawOriginal()
    setStatusText('Mask dibersihkan.')
  }

  const handleReset = () => {
    if (isCarving) return
    if (sourceImage && origW && origH) {
      const tmp = document.createElement('canvas')
      tmp.width = origW
      tmp.height = origH
      const tctx = tmp.getContext('2d')
      tctx.drawImage(sourceImage, 0, 0)
      origImageDataRef.current = tctx.getImageData(0, 0, origW, origH)
      maskDataRef.current = new Uint8Array(origW * origH)
      resultImageDataRef.current = null
      setResultBlob(null)
      setSeamsRemovedText('0')
      drawOriginal()
      drawResult()
      setStatusText('Di-reset ke gambar asli.')
      setProgress(0)
    }
  }

  // ─── Main Carve Action ───
  const runCarve = async () => {
    if (isCarving) return
    if (!origImageDataRef.current) {
      setStatusText('Silakan muat gambar terlebih dahulu.')
      return
    }
    const targetW = Math.round((origW * widthPct) / 100)
    const targetH = Math.round((origH * heightPct) / 100)
    if (targetW <= 0 || targetH <= 0) {
      setStatusText('Ukuran target tidak valid.')
      return
    }
    if (targetW >= origW && targetH >= origH) {
      setStatusText('Ukuran target harus lebih kecil dari ukuran asli.')
      return
    }

    setIsCarving(true)
    stopRequestedRef.current = false
    setProgress(0)
    setStatusText(`Memotong ke ${targetW} × ${targetH} px ...`)
    const startTime = performance.now()

    try {
      const srcData = new ImageData(new Uint8ClampedArray(origImageDataRef.current.data), origW, origH)
      if (!maskDataRef.current || maskDataRef.current.length !== origW * origH) {
        maskDataRef.current = new Uint8Array(origW * origH)
      }
      const maskCopy = new Uint8Array(maskDataRef.current)

      let img = new ImageData(new Uint8ClampedArray(srcData.data), srcData.width, srcData.height)
      let w = img.width
      let h = img.height
      let currentMask = maskCopy ? new Uint8Array(maskCopy) : null

      const pxToRemoveH = w - targetW
      const pxToRemoveV = h - targetH
      if (pxToRemoveH < 0 || pxToRemoveV < 0) throw new Error('Upsizing tidak didukung')
      const totalSteps = pxToRemoveH + pxToRemoveV
      let step = 0

      let energyMap = null
      let seam = null

      // Horizontal seams
      for (let i = 0; i < pxToRemoveH; i++) {
        if (stopRequestedRef.current) {
          stopRequestedRef.current = false
          setStatusText('Proses dihentikan oleh pengguna.')
          setIsCarving(false)
          return
        }
        energyMap = energyMap && seam ? reCalculateEnergyMapH(img, w, h, energyMap, seam) : calculateEnergyMapH(img, w, h)
        energyMap = applyMaskToEnergyMap(energyMap, w, h, currentMask)
        seam = findLowEnergySeamH(energyMap, w, h)
        if (!seam || seam.length === 0) break
        deleteSeamH(img, seam, w, h)
        if (currentMask) deleteSeamHMask(currentMask, seam, w, h)
        w -= 1
        energyMap = energyMap.map((row) => row.slice(0, w))
        img = cropImageData(img, w, h)
        if (currentMask) currentMask = cropMask(currentMask, w + 1, h, w, h)
        step++

        const pct = Math.min(100, Math.round((step / totalSteps) * 100))
        setProgress(pct)
        setStatusText(`Carving ... ${step}/${totalSteps} seams`)

        if (livePreview) {
          resultImageDataRef.current = cropImageData(img, w, h)
          drawResult()
        }
        await wait(1)
      }

      // Vertical seams
      energyMap = null
      seam = null
      for (let i = 0; i < pxToRemoveV; i++) {
        if (stopRequestedRef.current) {
          stopRequestedRef.current = false
          setStatusText('Proses dihentikan oleh pengguna.')
          setIsCarving(false)
          return
        }
        energyMap = energyMap && seam ? reCalculateEnergyMapV(img, w, h, energyMap, seam) : calculateEnergyMapV(img, w, h)
        energyMap = applyMaskToEnergyMap(energyMap, w, h, currentMask)
        seam = findLowEnergySeamV(energyMap, w, h)
        if (!seam || seam.length === 0) break
        deleteSeamV(img, seam, w, h)
        if (currentMask) deleteSeamVMask(currentMask, seam, w, h)
        h -= 1
        energyMap = energyMap.slice(0, h)
        img = cropImageData(img, w, h)
        if (currentMask) currentMask = cropMask(currentMask, w, h + 1, w, h)
        step++

        const pct = Math.min(100, Math.round((step / totalSteps) * 100))
        setProgress(pct)
        setStatusText(`Carving ... ${step}/${totalSteps} seams`)

        if (livePreview) {
          resultImageDataRef.current = cropImageData(img, w, h)
          drawResult()
        }
        await wait(1)
      }

      const finalResult = cropImageData(img, w, h)
      resultImageDataRef.current = finalResult
      if (currentMask) maskDataRef.current = currentMask

      const removedCount = origW - finalResult.width + (origH - finalResult.height)
      setSeamsRemovedText(`${removedCount}`)
      drawResult()

      // Convert final result canvas to Blob for ResultCard download
      const tmpCanvas = document.createElement('canvas')
      tmpCanvas.width = finalResult.width
      tmpCanvas.height = finalResult.height
      const tmpCtx = tmpCanvas.getContext('2d')
      tmpCtx.putImageData(finalResult, 0, 0)

      tmpCanvas.toBlob((blob) => {
        if (blob) setResultBlob(blob)
      }, 'image/png')

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
      setStatusText(`✅ Selesai dalam ${elapsed}s — ${finalResult.width} × ${finalResult.height} px`)
      setProgress(100)
    } catch (err) {
      setStatusText(`❌ Error: ${err.message}`)
    } finally {
      setIsCarving(false)
    }
  }

  const handleStop = () => {
    stopRequestedRef.current = true
    setStatusText('Menghentikan proses...')
  }

  const baseName = file ? stripExt(file.name) : 'image'

  return (
    <ToolShell
      title="Image Carver (Content-Aware Seam Carving)"
      description="Hapus objek bertarget dengan masking warna merah (Low Energy) atau lindungi objek penting (Protect High Energy), serta kecilkan resolusi gambar tanpa merusak proporsi objek."
    >
      {/* Top File Input & Action Controls */}
      <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <DropZone
              accept="image/*,.jpg,.jpeg,.png,.webp"
              multiple={false}
              onFiles={handleFileSelect}
              disabled={isCarving}
              label="Pilih foto"
              hint="JPG, PNG, WebP"
            />
            <button
              onClick={handleReset}
              disabled={isCarving || !sourceImage}
              className="flex items-center gap-1.5 rounded border border-(--color-border) bg-(--color-surface-2) px-3 py-2 text-xs font-semibold text-(--color-text-2) hover:bg-(--color-surface-3) disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RotateCcw size={14} /> Reset
            </button>
            <button
              onClick={clearMask}
              disabled={isCarving || !sourceImage}
              className="flex items-center gap-1.5 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Trash2 size={14} /> Hapus Mask
            </button>
          </div>

          <div className="text-xs text-(--color-text-3)">
            {origW && origH ? (
              <span className="font-semibold text-(--color-text)">{origW} × {origH} px</span>
            ) : (
              'Belum ada gambar'
            )}
          </div>
        </div>

        {/* Dimension Sliders & Keep Ratio Options */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2 border-t border-(--color-border) text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-(--color-text-2)">Lebar:</span>
            <input
              type="range"
              min="10"
              max="100"
              value={widthPct}
              disabled={isCarving}
              onChange={(e) => handleWidthChange(Number(e.target.value))}
              className="w-24 accent-(--color-brand) cursor-pointer"
            />
            <input
              type="number"
              min="10"
              max="100"
              value={widthPct}
              disabled={isCarving}
              onChange={(e) => handleWidthChange(Number(e.target.value))}
              className="w-14 text-center rounded border border-(--color-border) bg-(--color-surface-2) px-1 py-0.5 text-xs text-(--color-text)"
            />
            <span className="text-(--color-text-3)">%</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-medium text-(--color-text-2)">Tinggi:</span>
            <input
              type="range"
              min="10"
              max="100"
              value={heightPct}
              disabled={isCarving}
              onChange={(e) => handleHeightChange(Number(e.target.value))}
              className="w-24 accent-(--color-brand) cursor-pointer"
            />
            <input
              type="number"
              min="10"
              max="100"
              value={heightPct}
              disabled={isCarving}
              onChange={(e) => handleHeightChange(Number(e.target.value))}
              className="w-14 text-center rounded border border-(--color-border) bg-(--color-surface-2) px-1 py-0.5 text-xs text-(--color-text)"
            />
            <span className="text-(--color-text-3)">%</span>
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-(--color-text)">
            <input
              type="checkbox"
              checked={keepRatio}
              disabled={isCarving}
              onChange={(e) => {
                setKeepRatio(e.target.checked)
                if (e.target.checked) updateKeepRatio('width', widthPct, heightPct)
              }}
              className="accent-(--color-brand) cursor-pointer"
            />
            {keepRatio ? <Lock size={13} className="text-(--color-brand)" /> : <Unlock size={13} className="text-(--color-text-3)" />}
            <span>Jaga Rasio (Keep Ratio)</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer font-medium text-(--color-text-2)">
            <input
              type="checkbox"
              checked={livePreview}
              disabled={isCarving}
              onChange={(e) => setLivePreview(e.target.checked)}
              className="accent-(--color-brand) cursor-pointer"
            />
            <span>Pratinjau Langsung (Live Preview)</span>
          </label>

          <div className="flex items-center gap-2 ml-auto">
            {!isCarving ? (
              <button
                onClick={runCarve}
                disabled={!sourceImage}
                className="flex items-center gap-1.5 rounded-lg bg-(--color-brand) px-4 py-2 text-xs font-bold text-white hover:bg-(--color-brand-hover) disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
              >
                <Shrink size={14} /> Mulai Carving (Carve)
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors cursor-pointer shadow-sm"
              >
                <Square size={14} /> Hentikan (Stop)
              </button>
            )}
          </div>
        </div>

        {/* Progress & Status */}
        {isCarving && (
          <div className="space-y-2 pt-2 border-t border-(--color-border)">
            <div className="flex items-center justify-between text-xs font-semibold text-(--color-brand)">
              <span className="flex items-center gap-1.5">
                <Activity size={14} className="animate-pulse" /> {statusText}
              </span>
              <span>{progress}%</span>
            </div>
            <ProgressBar value={progress} />
          </div>
        )}
        {!isCarving && statusText && (
          <p className="text-xs text-(--color-text-2) pt-1">{statusText}</p>
        )}
      </div>

      {/* Grid Display (Original Canvas + Masking vs Result Canvas) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Card: Original + Masking Canvas */}
        <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-(--color-text-3) flex items-center gap-1.5">
              <Paintbrush size={14} className="text-(--color-brand)" /> Foto Asli + Kuas Masking
            </span>
            <span className="rounded bg-(--color-surface-3) px-2 py-0.5 text-[10px] font-semibold text-(--color-text-2)">
              Draw Mask
            </span>
          </div>

          {/* Mask Tools Sub-Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-(--color-surface-2) p-2.5 text-xs border border-(--color-border)">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-(--color-text-2)">Ukuran Kuas:</span>
              <input
                type="range"
                min="4"
                max="40"
                value={brushSize}
                disabled={isCarving}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-20 accent-(--color-brand) cursor-pointer"
              />
              <span className="font-mono text-[11px] text-(--color-text-3) w-6">{brushSize}px</span>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="maskMode"
                  checked={maskMode === 'remove'}
                  disabled={isCarving}
                  onChange={() => setMaskMode('remove')}
                  className="accent-red-500 cursor-pointer"
                />
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" /> Hapus (Low Energy)
                </span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="maskMode"
                  checked={maskMode === 'protect'}
                  disabled={isCarving}
                  onChange={() => setMaskMode('protect')}
                  className="accent-emerald-500 cursor-pointer"
                />
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" /> Lindungi (High Energy)
                </span>
              </label>
            </div>
          </div>

          <div className="relative flex justify-center items-center overflow-auto rounded border border-(--color-border) bg-black/90 p-2 min-h-[260px] max-h-[500px]">
            {sourceImage ? (
              <canvas
                ref={origCanvasRef}
                onMouseDown={startDraw}
                onMouseMove={moveDraw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={moveDraw}
                onTouchEnd={endDraw}
                className="block max-w-full max-h-[460px] w-auto h-auto cursor-crosshair rounded select-none touch-none"
              />
            ) : (
              <p className="text-xs text-gray-400 text-center p-8">
                Unggah foto terlebih dahulu untuk mulai melukis mask.
              </p>
            )}
          </div>
        </div>

        {/* Right Card: Result Canvas */}
        <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-(--color-text-3) flex items-center gap-1.5">
              <Sparkles size={14} className="text-(--color-brand)" /> Hasil Carving
            </span>
            <div className="flex items-center gap-3 text-[11px] text-(--color-text-3)">
              <span>Dimensi: <strong className="text-(--color-text)">{resultSizeText}</strong></span>
              <span>Terpotong: <strong className="text-(--color-brand)">{seamsRemovedText} seams</strong></span>
            </div>
          </div>

          <div className="relative flex justify-center items-center overflow-auto rounded border border-(--color-border) bg-black/90 p-2 min-h-[260px] max-h-[500px]">
            <canvas
              ref={resCanvasRef}
              className="block max-w-full max-h-[460px] w-auto h-auto rounded select-none"
            />
          </div>
        </div>
      </div>

      {/* Result Card for final PNG Download */}
      {resultBlob && (
        <ResultCard
          fileName={`${baseName}_carved.png`}
          blob={resultBlob}
          extraInfo={`Carving selesai → Ukuran hasil: ${resultSizeText}`}
          outputMimeType="image/png"
          sourceRoute="image-carver"
          onReset={handleReset}
        />
      )}
    </ToolShell>
  )
}
