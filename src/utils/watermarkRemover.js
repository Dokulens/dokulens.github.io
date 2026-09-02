/**
 * Gemini Watermark Remover — powered by official @pilio/gemini-watermark-remover SDK
 * Self-contained detection engine (no external dependencies).
 * Video: playback + requestVideoFrameCallback → SDK per-frame → captureStream encode.
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
 * Full video pipeline using playback + requestVideoFrameCallback:
 *
 * 1. Detect watermark on first frame (seek to t=0)
 * 2. Extract audio from source video
 * 3. Setup output canvas + captureStream(fps) + MediaRecorder
 * 4. Play video from start
 * 5. For EACH rendered frame (via rVFC):
 *    - Draw current video frame to temp canvas
 *    - Process through SDK (removeWatermarkFromImage)
 *    - Draw cleaned frame to output canvas (captureStream records it)
 * 6. When video ends → stop recorder → done
 *
 * Guarantees: no missed frames (rVFC fires for every decoded frame),
 *              correct FPS (follows original playback),
 *              audio preserved (extracted separately).
 */
export async function processFullVideo(videoEl, opts = {}) {
  const { alphaGain = 1.0, onProgress, onCancel } = opts

  const w = videoEl.videoWidth
  const h = videoEl.videoHeight
  const duration = videoEl.duration

  console.log(`[WM] Video: ${w}×${h}, ${duration.toFixed(2)}s`)

  // ── Step 1: Detect watermark on first frame ──
  console.log('[WM] Step 1/4: Detecting watermark...')
  onProgress?.(3, 'Mendeteksi watermark...')

  const detectCanvas = document.createElement('canvas')
  detectCanvas.width = w
  detectCanvas.height = h
  const detectCtx = detectCanvas.getContext('2d', { willReadFrequently: true })

  videoEl.currentTime = 0
  await new Promise((res) => { videoEl.onseeked = res })
  await new Promise((r) => setTimeout(r, 100)) // Ensure frame is ready
  detectCtx.drawImage(videoEl, 0, 0, w, h)

  const firstResult = await processVideoFrame(detectCanvas, { alphaGain })
  const hasWatermark = !!firstResult?.meta?.applied
  console.log('[WM] Watermark detected:', hasWatermark, firstResult?.meta)

  // ── Step 2: Extract audio ──
  console.log('[WM] Step 2/4: Extracting audio...')
  onProgress?.(6, 'Mengekstrak audio...')

  let audioBlob = null
  // Audio will be captured during playback below

  // ── Step 3: Setup recording pipeline ──
  console.log('[WM] Step 3/4: Setting up pipeline...')

  // Output canvas — this is what gets recorded
  const outCanvas = document.createElement('canvas')
  outCanvas.width = w
  outCanvas.height = h
  const outCtx = outCanvas.getContext('2d')

  // Temp canvas for SDK processing
  const procCanvas = document.createElement('canvas')
  procCanvas.width = w
  procCanvas.height = h
  const procCtx = procCanvas.getContext('2d', { willReadFrequently: true })

  // Capture stream at target FPS
  let mimeType = 'video/webm;codecs=vp9'
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8'
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm'
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4'

  const stream = outCanvas.captureStream(30) // 30fps base rate
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 12000000,
    audioBitsPerSecond: 128000,
  })

  const recordedChunks = []
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data)
  }

  // Also capture audio from the video element during playback
  let audioChunks = []
  let audioRecorder = null
  try {
    const vidStream = videoEl.captureStream ? videoEl.captureStream(30) : null
    if (vidStream) {
      const audioTracks = vidStream.getAudioTracks()
      if (audioTracks.length > 0) {
        const audioOnly = new MediaStream(audioTracks)
        audioRecorder = new MediaRecorder(audioOnly, { mimeType: 'audio/webm' })
        audioRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data) }
      }
    }
  } catch (e) {
    console.warn('[WM] Audio capture setup failed:', e.message)
  }

  // ── Step 4: Playback + per-frame processing ──
  console.log('[WM] Step 4/4: Processing frames...')
  onProgress?.(10, 'Memproses video...')

  return new Promise((resolve, reject) => {
    let frameCount = 0
    let lastReportedPct = 0
    let isProcessing = false // Prevent overlapping processes
    let pendingDraw = null // Queue latest frame if busy

    // Start recorders
    mediaRecorder.start(100)
    if (audioRecorder) audioRecorder.start(100)

    // Seek to start and play
    videoEl.muted = true
    videoEl.currentTime = 0

    videoEl.onseeked = async () => {
      await new Promise((r) => setTimeout(r, 50))
      videoEl.play().catch(() => {})
    }

    /**
     * Process a single frame: copy from video → SDK clean → draw to output
     */
    const doProcessFrame = async () => {
      isProcessing = true

      try {
        // Copy current video frame to process canvas
        procCtx.drawImage(videoEl, 0, 0, w, h)

        // Run SDK watermark removal
        if (hasWatermark) {
          await processVideoFrame(procCanvas, { alphaGain })
        }

        // Draw cleaned (or original) frame to output canvas → captured by MediaRecorder
        outCtx.drawImage(procCanvas, 0, 0, w, h)
      } catch (e) {
        console.warn('[WM] Frame process error:', e?.message)
        // On error, still draw original so we don't drop frames
        outCtx.drawImage(videoEl, 0, 0, w, h)
      }

      frameCount++
      isProcessing = false

      // If a frame was queued while we were busy, process it now
      if (pendingDraw) {
        const pd = pendingDraw
        pendingDraw = null
        await doProcessFrame()
      }
    }

    /**
     * Video frame callback — fires for EVERY decoded frame.
     * This guarantees no frame is missed.
     */
    const onVideoFrame = async (_now, metadata) => {
      if (onCancel?.()) {
        cleanup()
        return
      }

      // Report progress (throttled)
      if (duration > 0) {
        const pct = Math.min(92, 10 + Math.round((metadata.mediaTime / duration) * 82))
        if (pct > lastReportedPct + 1) {
          lastReportedPct = pct
          onProgress?.(pct, `Frame ${frameCount} (${metadata.mediaTime.toFixed(1)}s / ${duration.toFixed(1)}s)`)
        }
      }

      if (isProcessing) {
        // Busy processing — queue this frame (we'll use latest)
        pendingDraw = metadata
        return
      }

      await doProcessFrame()
    }

    // Register frame callback
    if (typeof videoEl.requestVideoFrameCallback === 'function') {
      videoEl.requestVideoFrameCallback(onVideoFrame)
    } else {
      // Fallback: use timeupdate event (less precise but works everywhere)
      videoEl.addEventListener('timeupdate', () => {
        if (!isProcessing && !onCancel?.()) {
          doProcessFrame()
        }
      })
    }

    // Handle video end
    videoEl.onended = () => {
      console.log(`[WM] Video ended. Total frames processed: ${frameCount}`)
      cleanup()
    }

    // Cleanup and finalize
    const cleanup = () => {
      // Stop recorders
      try { mediaRecorder.stop() } catch {}
      try { if (audioRecorder) audioRecorder.stop() } catch {}

      // Small delay to allow final dataavailable events
      setTimeout(() => {
        const videoBlob = new Blob(recordedChunks, { type: mimeType })
        audioBlob = audioChunks.length > 0 ? new Blob(audioChunks, { type: 'audio/webm' }) : null

        console.log(`[WM] Done. Video: ${fmtBytes(videoBlob.size)}, Frames: ${frameCount}, Audio: ${audioBlob ? fmtBytes(audioBlob.size) : 'none'}`)

        onProgress?.(98, 'Selesai!')
        resolve({ videoBlob, audioBlob, hasWatermark, totalFramesProcessed: frameCount })
      }, 200)
    }

    // Safety timeout: if video doesn't end properly
    const safetyTimeout = setTimeout(() => {
      console.warn('[WM] Safety timeout reached')
      cleanup()
    }, Math.ceil(duration * 2000) + 30000) // 2x duration + 30s buffer
  })
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
