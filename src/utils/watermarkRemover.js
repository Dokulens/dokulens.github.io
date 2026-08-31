/**
 * Precision Watermark Remover Engine
 * Reference & Algorithm: GargantuaX/gemini-watermark-remover & Reverse Alpha Blending
 * Includes Calibrated Alpha Maps, Anchor Auto-Search, and Telea Inpainting.
 */

const ALPHA_NOISE_FLOOR = 3 / 255
const ALPHA_THRESHOLD = 0.003
const MAX_ALPHA = 0.96

/** Generate calibrated Gemini 4-point star alpha map matrix */
export function generateGeminiAlphaMap(size = 48) {
  const alpha = new Float32Array(size * size)
  const cx = (size - 1) / 2
  const cy = (size - 1) / 2
  const r = size * 0.44

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x
      const nx = Math.abs(x - cx) / r
      const ny = Math.abs(y - cy) / r

      // 4-point star (Astroid curve: x^0.5 + y^0.5 <= 1)
      const starDist = Math.pow(nx, 0.5) + Math.pow(ny, 0.5)
      let starVal = 0
      if (starDist <= 1.0) {
        starVal = Math.pow(1.0 - starDist, 0.7) * 0.75
      }

      // Center core brightness
      const distCenterSq = nx * nx + ny * ny
      const coreVal = Math.exp(-distCenterSq * 18) * 0.85

      // Circular ambient glow
      const glowVal = Math.max(0, 1.0 - Math.sqrt(distCenterSq)) * 0.18

      const combined = Math.min(0.92, starVal + coreVal + glowVal)
      alpha[idx] = combined > 0.02 ? combined : 0
    }
  }

  return alpha
}

/**
 * Scan bottom-right region of image to locate the exact anchor position of Gemini watermark (within ±16px)
 */
export function findBestGeminiAnchor(imageData, candidateConfigs) {
  const { width, height, data } = imageData
  let bestScore = -Infinity
  let bestConfig = null
  let bestPos = null

  for (const cfg of candidateConfigs) {
    const { logoSize, marginRight, marginBottom } = cfg
    const baseTargetX = width - marginRight - logoSize
    const baseTargetY = height - marginBottom - logoSize

    if (baseTargetX < 0 || baseTargetY < 0) continue

    // Search window ±12px around predicted margin
    const searchRange = 12
    const alphaMap = generateGeminiAlphaMap(logoSize)

    for (let dy = -searchRange; dy <= searchRange; dy += 2) {
      for (let dx = -searchRange; dx <= searchRange; dx += 2) {
        const testX = baseTargetX + dx
        const testY = baseTargetY + dy

        if (testX < 0 || testY < 0 || testX + logoSize > width || testY + logoSize > height) continue

        // Measure correlation between image luminance variance and alpha map
        let score = 0
        let count = 0

        for (let r = 0; r < logoSize; r += 2) {
          for (let c = 0; c < logoSize; c += 2) {
            const a = alphaMap[r * logoSize + c]
            if (a > 0.15) {
              const idx = ((testY + r) * width + (testX + c)) * 4
              const lum = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114
              score += lum * a
              count++
            }
          }
        }

        const avgScore = count > 0 ? score / count : 0
        if (avgScore > bestScore) {
          bestScore = avgScore
          bestConfig = cfg
          bestPos = { x: testX, y: testY, width: logoSize, height: logoSize }
        }
      }
    }
  }

  return bestPos || {
    x: Math.max(0, width - 48 - 32),
    y: Math.max(0, height - 48 - 32),
    width: 48,
    height: 48,
  }
}

/**
 * High-Precision Reverse Alpha Blending
 * Restores original pixel colors under semi-transparent logo
 */
export function removeGeminiWatermarkPrecision(imageData, position, options = {}) {
  const { x, y, width, height } = position
  const { logoValue = 255, alphaGain = 1.0 } = options
  const { data, width: imgW } = imageData

  const alphaMap = generateGeminiAlphaMap(width)

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const targetX = x + c
      const targetY = y + r
      if (targetX < 0 || targetX >= imageData.width || targetY < 0 || targetY >= imageData.height) continue

      const imgIdx = (targetY * imgW + targetX) * 4
      const alphaIdx = r * width + c

      const rawAlpha = alphaMap[alphaIdx]
      const signalAlpha = Math.max(0, rawAlpha - ALPHA_NOISE_FLOOR) * alphaGain

      if (signalAlpha < ALPHA_THRESHOLD) continue

      const alpha = Math.min(rawAlpha * alphaGain, MAX_ALPHA)
      const oneMinusAlpha = 1.0 - alpha

      for (let ch = 0; ch < 3; ch++) {
        const watermarked = data[imgIdx + ch]
        // Reverse solve: original = (watermarked - alpha * logo) / (1 - alpha)
        const original = (watermarked - alpha * logoValue) / oneMinusAlpha
        data[imgIdx + ch] = Math.max(0, Math.min(255, Math.round(original)))
      }
    }
  }
}

/**
 * Fast-Marching Telea Inpainting Algorithm for Solid / Non-transparent Watermarks
 */
export function inpaintWatermark(imageData, maskData, radius = 5) {
  const { width, height, data } = imageData
  const totalPixels = width * height

  const flag = new Uint8Array(totalPixels)
  const dist = new Float32Array(totalPixels)
  const heap = []

  for (let i = 0; i < totalPixels; i++) {
    const mIdx = i * 4
    if (maskData[mIdx] > 30 || maskData[mIdx + 3] > 30) {
      flag[i] = 2 // to inpaint
      dist[i] = 1.0e6
    } else {
      flag[i] = 0 // known pixel
      dist[i] = 0
    }
  }

  // Find narrow boundary band
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

/** Known official candidate configurations from Gemini Size Catalog */
export function getGeminiCandidateConfigs(width, height) {
  const is2kOr4k = width >= 2000 || height >= 2000
  const is1k = width >= 1000 || height >= 1000

  if (is2kOr4k) {
    return [
      { logoSize: 96, marginRight: 64, marginBottom: 64 },
      { logoSize: 96, marginRight: 192, marginBottom: 192 },
      { logoSize: 48, marginRight: 96, marginBottom: 96 },
    ]
  }

  if (is1k) {
    return [
      { logoSize: 48, marginRight: 32, marginBottom: 32 },
      { logoSize: 48, marginRight: 96, marginBottom: 96 },
      { logoSize: 96, marginRight: 64, marginBottom: 64 },
      { logoSize: 36, marginRight: 96, marginBottom: 96 },
    ]
  }

  return [
    { logoSize: 48, marginRight: 32, marginBottom: 32 },
    { logoSize: 36, marginRight: 32, marginBottom: 32 },
  ]
}

/**
 * Auto-detect standard Gemini / AI watermark position using candidate catalog & local scan
 */
export function detectGeminiWatermark(imgWidth, imgHeight, imgData = null) {
  const candidates = getGeminiCandidateConfigs(imgWidth, imgHeight)

  if (imgData) {
    return findBestGeminiAnchor(imgData, candidates)
  }

  const primary = candidates[0]
  const x = Math.max(0, imgWidth - primary.logoSize - primary.marginRight)
  const y = Math.max(0, imgHeight - primary.logoSize - primary.marginBottom)

  return {
    x,
    y,
    width: primary.logoSize,
    height: primary.logoSize,
    xPct: (x / imgWidth) * 100,
    yPct: (y / imgHeight) * 100,
    wPct: (primary.logoSize / imgWidth) * 100,
    hPct: (primary.logoSize / imgHeight) * 100,
  }
}
