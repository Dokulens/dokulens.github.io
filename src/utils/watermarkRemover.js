/**
 * Gemini Watermark Remover — powered by official @pilio/gemini-watermark-remover SDK
 * Self-contained detection engine (no external dependencies).
 * Video frame processor uses manual reverse-alpha-blend (SDK doesn't expose per-frame API).
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
 * Remove Gemini AI watermark using official SDK engine
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
 * Create a video frame processor: detect watermark on frame 0,
 * then fast reverse-alpha-blend on every subsequent frame.
 */
export async function createVideoFrameProcessor(videoWidth, videoHeight) {
  const engine = await getEngine()

  return {
    async getAlphaMap(size) {
      return await engine.getAlphaMap(size)
    },

    async calibrate(frameCanvas) {
      console.log('[WM] Calibrating on frame...', frameCanvas.width, frameCanvas.height)
      const result = await removeWatermarkFromImage(frameCanvas, { engine })
      const meta = result?.meta ?? null

      const candidate =
        meta?.selectedCandidate ??
        meta?.position ??
        null
      const position = candidate?.position ?? null
      const alphaGain = candidate?.config?.alphaGain ?? 1.0
      const logoSize =
        candidate?.config?.logoSize ??
        candidate?.position?.width ??
        48

      console.log('[WM] Calibration result:', {
        position,
        alphaGain,
        logoSize,
        metaKeys: meta ? Object.keys(meta) : null,
      })

      if (!position) return null

      const alphaMap = await engine.getAlphaMap(logoSize)
      return { position, alphaMap, alphaGain, logoSize }
    },

    processFrame(frameCanvas, detected) {
      if (!detected) return
      const { position, alphaMap, alphaGain } = detected
      const { x, y, width: wmW, height: wmH } = position

      const ctx = frameCanvas.getContext('2d')
      const imgData = ctx.getImageData(x, y, wmW, wmH)
      const pixels = imgData.data

      const ALPHA_NOISE_FLOOR = 3 / 255
      const ALPHA_THRESHOLD = 0.002
      const MAX_ALPHA = 0.99
      const LOGO_VALUE = 255

      for (let row = 0; row < wmH; row++) {
        for (let col = 0; col < wmW; col++) {
          const localIdx = row * wmW + col
          const rawAlpha = alphaMap[localIdx] ?? 0
          const alphaMagnitude = Math.abs(rawAlpha)
          const logoValue = rawAlpha < 0 ? 0 : LOGO_VALUE

          const signalAlpha = Math.max(0, alphaMagnitude - ALPHA_NOISE_FLOOR) * alphaGain
          if (signalAlpha < ALPHA_THRESHOLD) continue

          const alpha = Math.min(alphaMagnitude * alphaGain, MAX_ALPHA)
          const oneMinusAlpha = 1.0 - alpha
          if (oneMinusAlpha <= 0.001) continue

          const pixIdx = localIdx * 4
          for (let ch = 0; ch < 3; ch++) {
            const watermarked = pixels[pixIdx + ch]
            const original = (watermarked - alpha * logoValue) / oneMinusAlpha
            pixels[pixIdx + ch] = Math.max(0, Math.min(255, Math.round(original)))
          }
        }
      }

      ctx.putImageData(imgData, x, y)
    }
  }
}

/**
 * Get all possible watermark positions for a given image size.
 * Tries multiple positions (catalog + SDK prediction) and returns the one
 * with the highest average brightness (likely a visible watermark).
 */
export async function findBestWatermarkPosition(frameCanvas, engine) {
  const ctx = frameCanvas.getContext('2d')
  const w = frameCanvas.width
  const h = frameCanvas.height

  const positions = []

  // 1. SDK position prediction
  const sdkPos = calculateWatermarkPosition(w, h)
  if (sdkPos) {
    positions.push({ ...sdkPos, source: 'sdk' })
  }

  // 2. Try all reasonable positions near bottom-right for common sizes
  const candidates = []
  const sizes = [96, 48, 72]
  const margins = [32, 48, 64, 96]

  for (const size of sizes) {
    for (const margin of margins) {
      const x = w - size - margin
      const y = h - size - margin
      if (x >= 0 && y >= 0) {
        candidates.push({ x, y, width: size, height: size })
      }
    }
  }

  // Deduplicate
  const seen = new Set()
  for (const pos of [...positions, ...candidates]) {
    const key = `${pos.x},${pos.y},${pos.width}`
    if (!seen.has(key)) {
      seen.add(key)
      const pixelData = ctx.getImageData(pos.x, pos.y, pos.width, pos.height)
      let brightness = 0
      for (let i = 0; i < pixelData.data.length; i += 4) {
        brightness += (pixelData.data[i] + pixelData.data[i + 1] + pixelData.data[i + 2]) / 3
      }
      const avg = brightness / (pixelData.data.length / 4)
      if (avg > 60) {
        positions.push({ ...pos, avgBrightness: avg })
      }
    }
  }

  // Return the brightest position
  positions.sort((a, b) => (b.avgBrightness ?? 0) - (a.avgBrightness ?? 0))

  const best = positions[0]
  if (best) {
    const alphaMap = await engine.getAlphaMap(best.width)
    console.log('[WM] Best position:', best)
    return {
      position: { x: best.x, y: best.y, width: best.width, height: best.height },
      alphaMap,
      alphaGain: 1.0,
      logoSize: best.width,
    }
  }

  return null
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
