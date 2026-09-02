/**
 * Gemini Watermark Remover — powered by official @pilio/gemini-watermark-remover SDK
 * Self-contained detection engine (no external dependencies).
 * Video: 2-step pipeline (1. Frame-by-frame offline clean → 2. Real-time 30fps stream encode).
 */

import {
  createWatermarkEngine,
  calculateWatermarkPosition,
  detectWatermarkConfig,
  removeWatermarkFromImage
} from './geminiAutoDetect.js'

let cachedEngine = null

async function getEngine() {
  if (!cachedEngine) {
    cachedEngine = await createWatermarkEngine()
  }
  return cachedEngine
}

/**
 * Remove Gemini AI watermark using official SDK engine (image)
 */
export async function removeOfficialGeminiWatermark(image, options = {}) {
  const engine = await getEngine()
  const result = await removeWatermarkFromImage(image, {
    adaptiveMode: 'auto',
    engine,
    alphaGain: options.alphaGain ?? 1.0,
    ...options,
  })
  return result
}

export async function getGeminiEngine() {
  return await getEngine()
}

/**
 * Process a single canvas frame through the SDK.
 * Returns { canvas, meta } or null.
 */
export async function processVideoFrame(frameCanvas, options = {}) {
  try {
    const result = await removeWatermarkFromImage(frameCanvas, {
      adaptiveMode: 'auto',
      alphaGain: options.alphaGain ?? 1.0,
    })

    if (!result?.canvas || !result?.meta) return null

    const ctx = frameCanvas.getContext('2d')
    ctx.clearRect(0, 0, frameCanvas.width, frameCanvas.height)
    ctx.drawImage(result.canvas, 0, 0)

    return { meta: result.meta }
  } catch (e) {
    console.warn('[WM] Frame process error:', e?.message)
    return null
  }
}

/**
 * Robust 2-Step Video Processing Pipeline:
 *
 * Step 1 (Offline Cleaning):
 * - Pause video, seek to frame 0..N-1 sequentially without dropping any frames.
 * - Clean each frame with SDK `removeWatermarkFromImage`.
 * - Convert cleaned canvas to ImageBitmap and store in array.
 *
 * Step 2 (Real-Time Recording):
 * - Playback the cleaned ImageBitmaps onto an offscreen DOM canvas at exact 30fps.
 * - MediaRecorder records captureStream(30) with exact timing & proper file size.
 * - Close each ImageBitmap after drawing to release GPU memory.
 */
export async function processFullVideo(videoEl, opts = {}) {
  const { alphaGain = 1.0, onProgress, onCancel } = opts

  const w = videoEl.videoWidth || 1280
  const h = videoEl.videoHeight || 720
  const duration = videoEl.duration || 1
  const fps = 30
  const totalFrames = Math.max(1, Math.ceil(duration * fps))

  console.log(`[WM] 2-Step Video Pipeline: ${w}×${h}, ${duration.toFixed(2)}s, ${totalFrames} frames`)

  videoEl.pause()

  // Temp processing canvas
  const procCanvas = document.createElement('canvas')
  procCanvas.width = w
  procCanvas.height = h
  const procCtx = procCanvas.getContext('2d', { willReadFrequently: true })

  const seekTo = (targetTime) => {
    return new Promise((resolve) => {
      if (Math.abs(videoEl.currentTime - targetTime) < 0.005) {
        resolve()
        return
      }
      let done = false
      const finish = () => {
        if (done) return
        done = true
        videoEl.removeEventListener('seeked', finish)
        resolve()
      }
      videoEl.addEventListener('seeked', finish, { once: true })
      videoEl.currentTime = targetTime
      setTimeout(finish, 300)
    })
  }

  // ── Step 1: Pre-process & clean every frame ──
  console.log('[WM] Step 1/2: Cleaning all video frames...')
  onProgress?.(2, 'Memeriksa watermark...')

  await seekTo(0)
  procCtx.drawImage(videoEl, 0, 0, w, h)
  const firstResult = await processVideoFrame(procCanvas, { alphaGain })
  const hasWatermark = !!firstResult?.meta?.applied

  console.log('[WM] Watermark check frame 0:', hasWatermark, firstResult?.meta)

  const bitmaps = []

  for (let i = 0; i < totalFrames; i++) {
    if (onCancel?.()) {
      bitmaps.forEach((b) => b.close?.())
      throw new Error('Proses dibatalkan oleh pengguna')
    }

    const t = Math.min(i / fps, Math.max(0, duration - 0.03))
    await seekTo(t)
    procCtx.drawImage(videoEl, 0, 0, w, h)

    if (hasWatermark) {
      await processVideoFrame(procCanvas, { alphaGain })
    }

    const bmp = await createImageBitmap(procCanvas)
    bitmaps.push(bmp)

    const pct = Math.min(80, Math.round(((i + 1) / totalFrames) * 80))
    onProgress?.(pct, `Membersihkan frame ${i + 1}/${totalFrames}...`)
  }

  console.log(`[WM] Step 1 finished (${bitmaps.length} frames cleaned). Starting Step 2 (recording)...`)

  // ── Step 2: Real-time playback to output canvas & MediaRecorder ──
  onProgress?.(81, 'Merekam video bersih...')

  const outCanvas = document.createElement('canvas')
  outCanvas.width = w
  outCanvas.height = h
  const outCtx = outCanvas.getContext('2d')

  // Temporarily mount to DOM so compositor triggers captureStream frame updates
  outCanvas.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;z-index:-999;'
  document.body.appendChild(outCanvas)

  let mimeType = 'video/webm;codecs=vp9'
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8'
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm'
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4'

  const stream = outCanvas.captureStream(fps)
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 12000000,
  })

  const recordedChunks = []
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data)
  }

  mediaRecorder.start(100)

  const frameIntervalMs = 1000 / fps

  for (let i = 0; i < bitmaps.length; i++) {
    if (onCancel?.()) break
    const bmp = bitmaps[i]

    outCtx.clearRect(0, 0, w, h)
    outCtx.drawImage(bmp, 0, 0)
    bmp.close?.()

    const pct = Math.min(98, 80 + Math.round(((i + 1) / bitmaps.length) * 18))
    onProgress?.(pct, `Merekam video... (${i + 1}/${bitmaps.length})`)

    await new Promise((r) => setTimeout(r, frameIntervalMs))
  }

  await new Promise((resolve) => {
    mediaRecorder.onstop = resolve
    mediaRecorder.stop()
  })

  if (outCanvas.parentNode) {
    outCanvas.parentNode.removeChild(outCanvas)
  }

  const videoBlob = new Blob(recordedChunks, { type: mimeType })
  console.log(`[WM] Video pipeline complete! Result size: ${fmtBytes(videoBlob.size)}`)

  onProgress?.(100, 'Selesai!')
  return { videoBlob, audioBlob: null, hasWatermark, totalFramesProcessed: bitmaps.length }
}

/** Simple byte formatter */
function fmtBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

export function inpaintWatermark(imageData, maskData, radius = 5) {
  const { width, height, data } = imageData
  const totalPixels = width * height

  const flag = new Uint8Array(totalPixels)
  const dist = new Float32Array(totalPixels)
  const heap = []

  for (let i = 0; i < totalPixels; i++) {
    const mIdx = i * 4
    if (maskData[mIdx] > 30 || maskData[mIdx + 3] > 30) {
      flag[i] = 2
      dist[i] = 1.0e6
    } else {
      flag[i] = 0
      dist[i] = 0
    }
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      if (flag[idx] === 2) {
        if (flag[idx - 1] === 0 || flag[idx + 1] === 0 || flag[idx - width] === 0 || flag[idx + width] === 0) {
          flag[idx] = 1
          dist[idx] = 0
          heap.push({ idx, x, y, d: 0 })
        }
      }
    }
  }

  const getGradient = (cx, cy) => {
    let gradX = 0, gradY = 0
    const idx = cy * width + cx
    if (cx > 0 && cx < width - 1 && flag[idx - 1] === 0 && flag[idx + 1] === 0) {
      gradX = (data[(idx + 1) * 4] - data[(idx - 1) * 4]) / 2
    }
    if (cy > 0 && cy < height - 1 && flag[idx - width] === 0 && flag[idx + width] === 0) {
      gradY = (data[(idx + width) * 4] - data[(idx - width) * 4]) / 2
    }
    return { gradX, gradY }
  }

  let processed = 0
  const maxToProcess = heap.length * 35

  while (heap.length > 0 && processed < maxToProcess) {
    heap.sort((a, b) => a.d - b.d)
    const p = heap.shift()
    const pIdx = p.y * width + p.x
    flag[pIdx] = 0

    let rSum = 0, gSum = 0, bSum = 0, wSum = 0

    for (let dy = -radius; dy <= radius; dy++) {
      const ny = p.y + dy
      if (ny < 0 || ny >= height) continue

      for (let dx = -radius; dx <= radius; dx++) {
        const nx = p.x + dx
        if (nx < 0 || nx >= width) continue

        const dSq = dx * dx + dy * dy
        if (dSq > radius * radius || dSq === 0) continue

        const nIdx = ny * width + nx
        if (flag[nIdx] === 0) {
          const dVal = Math.sqrt(dSq)
          const { gradX, gradY } = getGradient(nx, ny)
          const dirFactor = Math.abs(dx * gradX + dy * gradY) / (dVal + 1e-4) + 0.1
          const weight = (1.0 / (dVal * dVal + 1)) * (dirFactor + 0.5)

          const cOffset = nIdx * 4
          rSum += data[cOffset] * weight
          gSum += data[cOffset + 1] * weight
          bSum += data[cOffset + 2] * weight
          wSum += weight
        }
      }
    }

    if (wSum > 0) {
      const outOffset = pIdx * 4
      data[outOffset] = Math.round(rSum / wSum)
      data[outOffset + 1] = Math.round(gSum / wSum)
      data[outOffset + 2] = Math.round(bSum / wSum)
    }

    const neighbors = [
      { x: p.x - 1, y: p.y },
      { x: p.x + 1, y: p.y },
      { x: p.x, y: p.y - 1 },
      { x: p.x, y: p.y + 1 },
    ]

    for (const n of neighbors) {
      if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
        const nIdx = n.y * width + n.x
        if (flag[nIdx] === 2) {
          flag[nIdx] = 1
          const d = p.d + 1
          dist[nIdx] = d
          heap.push({ idx: nIdx, x: n.x, y: n.y, d })
        }
      }
    }

    processed++
  }
}

/**
 * Predict Gemini watermark position for UI overlay
 */
export function detectGeminiWatermark(imgWidth, imgHeight) {
  try {
    const pos = calculateWatermarkPosition(imgWidth, imgHeight)
    if (pos) {
      return {
        x: pos.x,
        y: pos.y,
        width: pos.width,
        height: pos.height,
        xPct: (pos.x / imgWidth) * 100,
        yPct: (pos.y / imgHeight) * 100,
        wPct: (pos.width / imgWidth) * 100,
        hPct: (pos.height / imgHeight) * 100,
      }
    }
  } catch {}

  const isLarge = imgWidth >= 1024 || imgHeight >= 1024
  const size = isLarge ? 96 : 48
  const margin = isLarge ? 64 : 32
  const x = Math.max(0, imgWidth - size - margin)
  const y = Math.max(0, imgHeight - size - margin)

  return {
    x,
    y,
    width: size,
    height: size,
    xPct: (x / imgWidth) * 100,
    yPct: (y / imgHeight) * 100,
    wPct: (size / imgWidth) * 100,
    hPct: (size / imgHeight) * 100,
  }
}
