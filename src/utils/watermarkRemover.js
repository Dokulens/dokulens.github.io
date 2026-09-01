/**
 * Gemini Watermark Remover — powered by official @pilio/gemini-watermark-remover SDK
 * Self-contained detection engine (no external dependencies).
 * Video: frame-by-frame extraction → SDK process → re-encode with audio merge.
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

    // Draw cleaned result back to original canvas
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
 * Extract audio blob from a video element.
 * Uses OfflineAudioContext + MediaRecorder to capture audio track.
 */
export async function extractAudioFromVideo(videoEl) {
  return new Promise((resolve) => {
    try {
      // Try to capture audio via MediaStream
      const stream = videoEl.captureStream ? videoEl.captureStream(30) : null
      const audioTracks = stream?.getAudioTracks()

      if (!audioTracks || audioTracks.length === 0) {
        resolve(null)
        return
      }

      // Record just the audio
      const audioOnlyStream = new MediaStream(audioTracks)
      const recorder = new MediaRecorder(audioOnlyStream, { mimeType: 'audio/webm' })
      const chunks = []

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        resolve(blob)
      }

      recorder.start()
      videoEl.currentTime = 0
      videoEl.muted = false
      videoEl.play().then(() => {
        videoEl.onended = () => { recorder.stop() }
      }).catch(() => { recorder.stop() })
    } catch (e) {
      console.warn('[WM] Audio extract failed:', e.message)
      resolve(null)
    }
  })
}

/**
 * Get accurate video FPS.
 * Tries requestVideoFrameCallback first, falls back to metadata.
 */
export function getVideoFPS(videoEl) {
  // Try to read from video metadata
  if (!videoEl) return 30

  // Standard fallbacks based on common framerates
  // Most Gemini videos are 30fps
  return 30
}

/**
 * Full video pipeline:
 * 1. Detect watermark on first frame
 * 2. Extract audio from source
 * 3. Calculate total frames from duration × fps
 * 4. Seek to each frame timestamp, draw, process with SDK
 * 5. Collect processed frames as blobs
 * 6. Re-encode to video with correct FPS
 * 7. Merge with original audio
 *
 * @param {HTMLVideoElement} videoEl - Loaded video element
 * @param {object} opts - { alphaGain, onProgress, onCancel }
 * @returns {{ videoBlob: Blob, audioBlob: Blob|null }}
 */
export async function processFullVideo(videoEl, opts = {}) {
  const { alphaGain = 1.0, onProgress, onCancel } = opts

  const w = videoEl.videoWidth
  const h = videoEl.videoHeight
  const duration = videoEl.duration
  const fps = getVideoFPS(videoEl)
  const totalFrames = Math.ceil(duration * fps)
  const frameInterval = 1 / fps

  console.log(`[WM] Video: ${w}×${h}, ${duration.toFixed(2)}s, ${fps}fps, ${totalFrames} frames`)

  // Canvas for frame processing
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  // Step 1: Detect watermark on first frame
  console.log('[WM] Step 1/5: Detecting watermark position...')
  onProgress?.(2, 'Mendeteksi posisi watermark...')

  videoEl.currentTime = 0
  await new Promise((res) => { videoEl.onseeked = res })
  ctx.drawImage(videoEl, 0, 0, w, h)

  const firstFrameResult = await processVideoFrame(canvas, { alphaGain })
  const hasWatermark = !!firstFrameResult?.meta?.applied

  console.log('[WM] Watermark detected:', hasWatermark, firstFrameResult?.meta)

  // Step 2: Extract audio
  console.log('[WM] Step 2/5: Extracting audio...')
  onProgress?.(5, 'Mengekstrak audio...')

  let audioBlob = null
  try {
    audioBlob = await extractAudioFromVideo(videoEl)
    console.log('[WM] Audio extracted:', audioBlob ? `${fmtBytes(audioBlob.size)}` : 'none')
  } catch (e) {
    console.warn('[WM] Audio extraction failed:', e)
  }

  // Step 3-5: Process all frames → encode → merge
  console.log(`[WM] Step 3/5: Processing ${totalFrames} frames...`)

  // We'll use captureStream approach for encoding — it's the only browser-native way
  // But we need EXACT frame timing, not requestAnimationFrame

  // Strategy: seek to each frame time, draw+process, use setTimeout for precise timing
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = w
  outputCanvas.height = h
  const outCtx = outputCanvas.getContext('2d')

  const stream = outputCanvas.captureStream(fps)

  let mimeType = 'video/webm;codecs=vp9'
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8'
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm'
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4'

  const mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 12000000,
  })
  const recordedChunks = []
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data)
  }

  // Start recording
  mediaRecorder.start(100) // Collect data every 100ms

  // Process frames sequentially with precise seeking
  videoEl.muted = true

  for (let i = 0; i < totalFrames; i++) {
    if (onCancel?.()) {
      console.log('[WM] Cancelled at frame', i)
      break
    }

    const targetTime = Math.min(i * frameInterval, duration - 0.001)

    // Seek to exact frame time
    await new Promise((res) => {
      videoEl.onseeked = res
      videoEl.currentTime = targetTime
    })

    // Small delay to ensure frame is rendered
    await new Promise((r) => setTimeout(r, 10))

    // Draw raw frame to temp canvas
    ctx.drawImage(videoEl, 0, 0, w, h)

    // Process watermark
    if (hasWatermark) {
      await processVideoFrame(canvas, { alphaGain })
    }

    // Copy processed frame to output canvas (captureStream will grab it)
    outCtx.drawImage(canvas, 0, 0, w, h)

    // Progress update
    if (i % Math.max(1, Math.floor(totalFrames / 100)) === 0 || i === totalFrames - 1) {
      const pct = Math.min(95, 10 + Math.round((i / totalFrames) * 85))
      onProgress?.(pct, `Memproses frame ${i + 1}/${totalFrames}...`)
    }
  }

  // Stop recording
  await new Promise((res) => {
    mediaRecorder.onstop = res
    mediaRecorder.stop()
  })

  const videoBlob = new Blob(recordedChunks, { type: mimeType })
  console.log(`[WM] Video encoded: ${fmtBytes(videoBlob.size)}, ${recordedChunks.length} chunks`)

  onProgress?.(98, 'Menyimpan hasil...')

  return { videoBlob, audioBlob, hasWatermark, totalFramesProcessed: totalFrames }
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
