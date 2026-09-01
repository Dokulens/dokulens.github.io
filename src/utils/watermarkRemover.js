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
      try {
        if (!frameCanvas || !frameCanvas.width || !frameCanvas.height) {
          console.warn('[WM] Invalid canvas for calibration')
          return null
        }
        console.log('[WM] Calibrating on frame...', frameCanvas.width, frameCanvas.height)
        const result = await removeWatermarkFromImage(frameCanvas, { engine })
        const meta = result?.meta ?? null

        let position = null
        let alphaGain = 1.0
        let logoSize = 48

        if (meta) {
          const candidate =
            meta.selectedCandidate ??
            meta.position ??
            null
          if (candidate) {
            position = candidate.position ?? null
            alphaGain = candidate.config?.alphaGain ?? 1.0
            logoSize = candidate.config?.logoSize ?? candidate.position?.width ?? 48
          }
        }

        console.log('[WM] Calibration result:', {
          position,
          alphaGain,
          logoSize,
          metaKeys: meta ? Object.keys(meta) : null,
        })

        if (!position) return null

        const alphaMap = await engine.getAlphaMap(logoSize)
        return { position, alphaMap, alphaGain, logoSize }
      } catch (e) {
        console.error('[WM] Calibration error:', e?.message || e)
        return null
      }
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
 * Scan all likely watermark positions and return the brightest candidate.
 * Uses brightness threshold to find visible watermarks.
 */
export async function findBestWatermarkPosition(frameCanvas, engine) {
  const ctx = frameCanvas.getContext('2d')
  const w = frameCanvas.width
  const h = frameCanvas.height

  const seen = new Map()

  // 1. SDK position prediction
  const sdkPos = calculateWatermarkPosition(w, h)
  if (sdkPos) {
    seen.set(`${sdkPos.x},${sdkPos.y},${sdkPos.width}`, { ...sdkPos, source: 'sdk' })
  }

  // 2. All reasonable bottom-right positions
  const sizes = [96, 72, 64, 48]
  const margins = [32, 48, 64, 96, 128]

  for (const size of sizes) {
    for (const margin of margins) {
      const x = w - size - margin
      const y = h - size - margin
      if (x >= 0 && y >= 0) {
        const key = `${x},${y},${size}`
        if (!seen.has(key)) {
          seen.set(key, { x, y, width: size, height: size })
        }
      }
    }
  }

  const positions = []
  for (const pos of seen.values()) {
    const pixelData = ctx.getImageData(pos.x, pos.y, pos.width, pos.height)
    let brightness = 0
    for (let i = 0; i < pixelData.data.length; i += 4) {
      brightness += (pixelData.data[i] + pixelData.data[i + 1] + pixelData.data[i + 2]) / 3
    }
    const avg = brightness / (pixelData.data.length / 4)
    positions.push({ ...pos, avgBrightness: avg })
  }

  // Sort by brightness descending
  positions.sort((a, b) => b.avgBrightness - a.avgBrightness)
  console.log('[WM] Top 3 positions:', positions.slice(0, 3).map(p => ({ x: p.x, y: p.y, size: p.width, avg: p.avgBrightness.toFixed(1) })))

  const best = positions.find(p => p.avgBrightness > 50)
  if (!best) {
    // No bright enough area found — use the brightest available
    const fallback = positions[0]
    if (!fallback) return null
    console.log('[WM] No bright watermark found, using fallback:', fallback)
    try {
      const alphaMap = engine ? await engine.getAlphaMap(fallback.width) : null
      return {
        position: { x: fallback.x, y: fallback.y, width: fallback.width, height: fallback.height },
        alphaMap: alphaMap ?? generateFallbackAlphaMap(fallback.width),
        alphaGain: 1.0,
        logoSize: fallback.width,
      }
    } catch {
      return {
        position: { x: fallback.x, y: fallback.y, width: fallback.width, height: fallback.height },
        alphaMap: generateFallbackAlphaMap(fallback.width),
        alphaGain: 1.0,
        logoSize: fallback.width,
      }
    }
  }

  console.log('[WM] Best position:', best)
  let alphaMap = null
  try {
    alphaMap = engine ? await engine.getAlphaMap(best.width) : null
  } catch (e) {
    console.warn('[WM] engine.getAlphaMap failed:', e)
  }

  return {
    position: { x: best.x, y: best.y, width: best.width, height: best.height },
    alphaMap: alphaMap ?? generateFallbackAlphaMap(best.width),
    alphaGain: 1.0,
    logoSize: best.width,
  }
}

/** Generate a simple circular alpha map as fallback when SDK fails */
function generateFallbackAlphaMap(size) {
  const map = new Float32Array(size * size)
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.4
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const dist = Math.sqrt((r - cy) ** 2 + (c - cx) ** 2)
      if (dist < radius) {
        map[r * size + c] = Math.max(0, 1 - dist / radius)
      }
    }
  }
  return map
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
