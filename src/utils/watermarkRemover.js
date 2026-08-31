/**
 * Watermark Remover Engine
 * Includes Reverse Alpha Blending (Lossless) and Telea/Fast-Marching Inpainting (Arbitrary logos/text).
 * Reference: GargantuaX/gemini-watermark-remover & Fast Marching Inpainting.
 */

const ALPHA_NOISE_FLOOR = 3 / 255
const ALPHA_THRESHOLD = 0.002
const MAX_ALPHA = 0.98

/**
 * Reverse Alpha Blending Removal (Lossless recovery for semi-transparent watermarks)
 * Formula: original = (watermarked - alpha * logoValue) / (1 - alpha)
 */
export function reverseAlphaBlend(imageData, maskData, { x, y, width, height, logoColor = [255, 255, 255], strength = 1.0 }) {
  const { data, width: imgW } = imageData

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const imgIdx = ((y + r) * imgW + (x + c)) * 4
      const maskIdx = (r * width + c) * 4

      const maskAlpha = (maskData[maskIdx] / 255) * strength
      const signalAlpha = Math.max(0, maskAlpha - ALPHA_NOISE_FLOOR)

      if (signalAlpha < ALPHA_THRESHOLD) continue

      const alpha = Math.min(maskAlpha, MAX_ALPHA)
      const oneMinusAlpha = 1.0 - alpha

      for (let ch = 0; ch < 3; ch++) {
        const watermarked = data[imgIdx + ch]
        const logoVal = logoColor[ch]
        const original = (watermarked - alpha * logoVal) / oneMinusAlpha
        data[imgIdx + ch] = Math.max(0, Math.min(255, Math.round(original)))
      }
    }
  }
}

/**
 * Fast-Marching Telea Inpainting Algorithm for Solid / Non-transparent Watermarks
 * Seamlessly reconstructs damaged pixel regions using surrounding pixel gradients.
 */
export function inpaintWatermark(imageData, maskData, radius = 5) {
  const { width, height, data } = imageData
  const totalPixels = width * height

  // 0: Known pixel (outside mask), 1: Boundary band, 2: Inside mask (to be inpainted)
  const flag = new Uint8Array(totalPixels)
  const dist = new Float32Array(totalPixels)
  const heap = []

  // Initialize flags from mask (mask > 30 alpha/red is to inpaint)
  for (let i = 0; i < totalPixels; i++) {
    const mIdx = i * 4
    if (maskData[mIdx] > 30 || maskData[mIdx + 3] > 30) {
      flag[i] = 2 // inside mask
      dist[i] = 1.0e6
    } else {
      flag[i] = 0 // known pixel
      dist[i] = 0
    }
  }

  // Find narrow band boundary pixels (neighbors of known pixels)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      if (flag[idx] === 2) {
        // Check 4-connectivity
        if (flag[idx - 1] === 0 || flag[idx + 1] === 0 || flag[idx - width] === 0 || flag[idx + width] === 0) {
          flag[idx] = 1
          dist[idx] = 0
          heap.push({ idx, x, y, d: 0 })
        }
      }
    }
  }

  // Helper gradient computation
  const getGradient = (cx, cy) => {
    let gradX = 0
    let gradY = 0
    const idx = cy * width + cx

    if (cx > 0 && cx < width - 1 && flag[idx - 1] === 0 && flag[idx + 1] === 0) {
      gradX = (data[(idx + 1) * 4] - data[(idx - 1) * 4]) / 2
    }
    if (cy > 0 && cy < height - 1 && flag[idx - width] === 0 && flag[idx + width] === 0) {
      gradY = (data[(idx + width) * 4] - data[(idx - width) * 4]) / 2
    }
    return { gradX, gradY }
  }

  // Process narrow band boundary pixels with fast marching
  let processed = 0
  const maxToProcess = heap.length * 30

  while (heap.length > 0 && processed < maxToProcess) {
    // Sort / pick minimum distance
    heap.sort((a, b) => a.d - b.d)
    const p = heap.shift()
    const pIdx = p.y * width + p.x
    flag[pIdx] = 0 // marked as known

    // Compute pixel color from surrounding known neighbors within radius
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
          // Directional gradient & distance weight
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

    // Add unvisited neighbors to narrow band
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
 * Auto-detect standard Gemini / AI watermark position (usually bottom-right corner)
 */
export function detectGeminiWatermark(imgWidth, imgHeight) {
  // Default sizes: 96x96 with 64px margins for large images, 48x48 with 32px margins for small
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
