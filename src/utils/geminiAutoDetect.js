/**
 * Self-contained Gemini watermark detection & removal engine
 * Based on @pilio/gemini-watermark-remover approach
 */

const ALPHA_NOISE_FLOOR = 3 / 255
const ALPHA_THRESHOLD = 0.002
const MAX_ALPHA = 0.99
const LOGO_VALUE = 255

function generateAlphaMap(size) {
  const map = new Float32Array(size * size)
  const half = size / 2
  const radius = size * 0.375
  const peak = 0.75
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const dr = r - half
      const dc = c - half
      const dist = Math.sqrt(dr * dr + dc * dc)
      if (dist < radius) {
        map[r * size + c] = Math.max(0, peak * (1 - dist / radius))
      }
    }
  }
  return map
}

function toCanvas(canvasOrImage) {
  if (canvasOrImage instanceof HTMLCanvasElement || canvasOrImage instanceof OffscreenCanvas) {
    return canvasOrImage
  }
  const canvas = new OffscreenCanvas(canvasOrImage.width || canvasOrImage.naturalWidth, canvasOrImage.height || canvasOrImage.naturalHeight)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(canvasOrImage, 0, 0)
  return canvas
}

function reverseAlphaBlend(pixels, alphaMap, wmW, wmH, alphaGain) {
  for (let row = 0; row < wmH; row++) {
    for (let col = 0; col < wmW; col++) {
      const localIdx = row * wmW + col
      const rawAlpha = alphaMap[localIdx] ?? 0
      const alphaMagnitude = Math.abs(rawAlpha)

      const signalAlpha = Math.max(0, alphaMagnitude - ALPHA_NOISE_FLOOR) * alphaGain
      if (signalAlpha < ALPHA_THRESHOLD) continue

      const alpha = Math.min(alphaMagnitude * alphaGain, MAX_ALPHA)
      const oneMinusAlpha = 1.0 - alpha
      if (oneMinusAlpha <= 0.001) continue

      const pixIdx = localIdx * 4
      for (let ch = 0; ch < 3; ch++) {
        const watermarked = pixels[pixIdx + ch]
        const original = (watermarked - alpha * LOGO_VALUE) / oneMinusAlpha
        pixels[pixIdx + ch] = Math.max(0, Math.min(255, Math.round(original)))
      }
    }
  }
}

export function calculateWatermarkPosition(imgWidth, imgHeight) {
  const isLarge = imgWidth >= 1024 || imgHeight >= 1024
  const size = isLarge ? 96 : 48
  const margin = Math.round(Math.min(imgWidth, imgHeight) * 0.05)
  return {
    x: Math.max(0, imgWidth - size - margin),
    y: Math.max(0, imgHeight - size - margin),
    width: size,
    height: size
  }
}

export function detectWatermarkConfig(imgWidth, imgHeight) {
  const isLarge = imgWidth >= 1024 || imgHeight >= 1024
  const logoSize = isLarge ? 96 : 48
  return {
    logoSize,
    alphaGain: 1.0,
    position: calculateWatermarkPosition(imgWidth, imgHeight)
  }
}

export async function removeWatermarkFromImage(canvasOrImage, options = {}) {
  const canvas = toCanvas(canvasOrImage)
  const imgWidth = canvas.width
  const imgHeight = canvas.height

  const position = calculateWatermarkPosition(imgWidth, imgHeight)
  const { logoSize, alphaGain } = detectWatermarkConfig(imgWidth, imgHeight)

  const alphaMap = generateAlphaMap(logoSize)

  const ctx = canvas.getContext('2d')
  const imgData = ctx.getImageData(position.x, position.y, position.width, position.height)
  const pixels = imgData.data

  reverseAlphaBlend(pixels, alphaMap, position.width, position.height, alphaGain)

  ctx.putImageData(imgData, position.x, position.y)

  return {
    canvas,
    meta: {
      selectedCandidate: {
        position,
        config: { alphaGain, logoSize }
      }
    }
  }
}

export async function createWatermarkEngine() {
  const alphaCache = {}

  return {
    async removeWatermarkFromImage(canvasOrImage) {
      return removeWatermarkFromImage(canvasOrImage)
    },

    async getAlphaMap(logoSize) {
      if (!alphaCache[logoSize]) {
        alphaCache[logoSize] = generateAlphaMap(logoSize)
      }
      return alphaCache[logoSize]
    }
  }
}
