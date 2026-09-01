/**
 * Moebius 0.2B Inpainting Engine — browser-side via ONNX Runtime Web + WebGPU
 * Ported from https://github.com/simonw/moebius-web (Apache-2.0)
 */
import * as ort from 'onnxruntime-web/webgpu'

const IMG = 512
const LAT = 64
const SCALING_FACTOR = 0.13025
const NOISE_OFFSET = 0.0357
const HALF_IDS = 10
const CACHE_NAME = 'moebius-onnx-v1'
const MODEL_BASE = 'https://huggingface.co/simonw/Moebius-ONNX/resolve/main'

// ── Mulberry32 PRNG + Box-Muller ───────────────────────────────────────
function mulberry32(seed) {
  let s = seed >>> 0
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randn(n, seed) {
  const rng = mulberry32(seed)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let u = 0, v = 0
    while (u === 0) u = rng()
    while (v === 0) v = rng()
    out[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  return out
}

// ── Image helpers ──────────────────────────────────────────────────────
function canvasToCHW(canvas) {
  const ctx = canvas.getContext('2d')
  const { data } = ctx.getImageData(0, 0, IMG, IMG)
  const out = new Float32Array(3 * IMG * IMG)
  const plane = IMG * IMG
  for (let p = 0; p < plane; p++) {
    out[p] = (data[p * 4] / 255) * 2 - 1
    out[plane + p] = (data[p * 4 + 1] / 255) * 2 - 1
    out[2 * plane + p] = (data[p * 4 + 2] / 255) * 2 - 1
  }
  return out
}

function maskCanvasToBinary(canvas) {
  const ctx = canvas.getContext('2d')
  const { data } = ctx.getImageData(0, 0, IMG, IMG)
  const out = new Float32Array(IMG * IMG)
  for (let p = 0; p < IMG * IMG; p++) {
    out[p] = data[p * 4 + 3] >= 128 ? 1 : 0
  }
  return out
}

function makeMaskedCHW(imgCHW, maskBin) {
  const out = new Float32Array(imgCHW.length)
  const plane = IMG * IMG
  for (let c = 0; c < 3; c++) {
    for (let p = 0; p < plane; p++) {
      out[c * plane + p] = imgCHW[c * plane + p] * (1 - maskBin[p])
    }
  }
  return out
}

function maskToLatent(maskBin) {
  const out = new Float32Array(LAT * LAT)
  const ratio = IMG / LAT
  for (let y = 0; y < LAT; y++) {
    for (let x = 0; x < LAT; x++) {
      out[y * LAT + x] = maskBin[y * ratio * IMG + x * ratio]
    }
  }
  return out
}

function chwToImageData(chw) {
  const plane = IMG * IMG
  const out = new ImageData(IMG, IMG)
  for (let p = 0; p < plane; p++) {
    for (let c = 0; c < 3; c++) {
      let v = (chw[c * plane + p] + 1) / 2
      v = v < 0 ? 0 : v > 1 ? 1 : v
      out.data[p * 4 + c] = Math.round(v * 255)
    }
    out.data[p * 4 + 3] = 255
  }
  return out
}

function toSquareCanvas(src, srcW, srcH) {
  const c = document.createElement('canvas')
  c.width = IMG
  c.height = IMG
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, IMG, IMG)
  const scale = Math.min(IMG / srcW, IMG / srcH)
  const w = Math.round(srcW * scale)
  const h = Math.round(srcH * scale)
  const x = Math.floor((IMG - w) / 2)
  const y = Math.floor((IMG - h) / 2)
  ctx.drawImage(src, x, y, w, h)
  return { canvas: c, rect: { x, y, w, h } }
}

function pasteBack(resultData, originalCanvas, maskBin) {
  const mc = document.createElement('canvas')
  mc.width = IMG
  mc.height = IMG
  const mctx = mc.getContext('2d')
  const mdata = new ImageData(IMG, IMG)
  for (let p = 0; p < IMG * IMG; p++) {
    const v = maskBin[p] * 255
    mdata.data[p * 4] = v
    mdata.data[p * 4 + 1] = v
    mdata.data[p * 4 + 2] = v
    mdata.data[p * 4 + 3] = 255
  }
  mctx.putImageData(mdata, 0, 0)
  const blur = document.createElement('canvas')
  blur.width = IMG
  blur.height = IMG
  const bctx = blur.getContext('2d')
  bctx.filter = 'blur(3px)'
  bctx.drawImage(mc, 0, 0)
  const blurMask = bctx.getImageData(0, 0, IMG, IMG).data
  const orig = originalCanvas.getContext('2d').getImageData(0, 0, IMG, IMG).data
  const out = document.createElement('canvas')
  out.width = IMG
  out.height = IMG
  const octx = out.getContext('2d')
  const blended = new ImageData(IMG, IMG)
  for (let p = 0; p < IMG * IMG; p++) {
    const m = blurMask[p * 4] / 255
    for (let c = 0; c < 3; c++) {
      blended.data[p * 4 + c] = Math.round(
        resultData.data[p * 4 + c] * m + orig[p * 4 + c] * (1 - m)
      )
    }
    blended.data[p * 4 + 3] = 255
  }
  octx.putImageData(blended, 0, 0)
  return out
}

// ── Model cache ────────────────────────────────────────────────────────
async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true
      return await navigator.storage.persist()
    }
  } catch { /* noop */ }
  return false
}

async function loadModelBytes(url, onProgress) {
  let cache = null
  try { cache = await caches.open(CACHE_NAME) } catch { /* noop */ }

  if (cache) {
    const hit = await cache.match(url)
    if (hit) {
      const buf = await hit.arrayBuffer()
      onProgress?.(buf.byteLength, buf.byteLength, true)
      return new Uint8Array(buf)
    }
  }

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`fetch ${url} → HTTP ${resp.status}`)
  const total = Number(resp.headers.get('content-length')) || 0
  const reader = resp.body?.getReader()
  let bytes
  if (reader && total > 0) {
    bytes = new Uint8Array(total)
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes.set(value, loaded)
      loaded += value.length
      onProgress?.(loaded, total, false)
    }
  } else {
    const buf = await resp.arrayBuffer()
    bytes = new Uint8Array(buf)
    onProgress?.(bytes.length, bytes.length, false)
  }

  if (cache) {
    try {
      await cache.put(url, new Response(bytes.buffer, {
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) }
      }))
    } catch (e) { console.warn('cache.put failed:', e) }
  }
  return bytes
}

export async function clearModelCache() {
  try { await caches.delete(CACHE_NAME) } catch { /* noop */ }
}

// ── DDIM scheduler ─────────────────────────────────────────────────────
function makeDDIM(numSteps, strength = 0.99) {
  const NUM_TRAIN_TIMESTEPS = 1000
  const BETA_START = 0.00085
  const BETA_END = 0.012
  const betas = new Float64Array(NUM_TRAIN_TIMESTEPS)
  const a = Math.sqrt(BETA_START)
  const b = Math.sqrt(BETA_END)
  for (let i = 0; i < NUM_TRAIN_TIMESTEPS; i++) {
    const s = a + (b - a) * (i / (NUM_TRAIN_TIMESTEPS - 1))
    betas[i] = s * s
  }
  const alphasCumprod = new Float64Array(NUM_TRAIN_TIMESTEPS)
  let acc = 1
  for (let i = 0; i < NUM_TRAIN_TIMESTEPS; i++) {
    acc *= 1 - betas[i]
    alphasCumprod[i] = acc
  }
  const stepRatio = Math.floor(NUM_TRAIN_TIMESTEPS / numSteps)
  const ts = []
  for (let i = 0; i < numSteps; i++) ts.push(Math.round(i * stepRatio))
  ts.reverse()
  const initTimestep = Math.min(Math.floor(numSteps * strength), numSteps)
  const tStart = Math.max(numSteps - initTimestep, 0)
  return { alphasCumprod, timesteps: ts.slice(tStart) }
}

function ddimStep(eps, sample, t, prevT, ddim) {
  const acT = ddim.alphasCumprod[t]
  const acPrev = prevT >= 0 ? ddim.alphasCumprod[prevT] : 1
  const sqrtAcT = Math.sqrt(acT)
  const sqrtBetaT = Math.sqrt(1 - acT)
  const sqrtAcPrev = Math.sqrt(acPrev)
  const sqrtOneMinusAcPrev = Math.sqrt(1 - acPrev)
  const out = new Float32Array(sample.length)
  for (let i = 0; i < sample.length; i++) {
    const predX0 = (sample[i] - sqrtBetaT * eps[i]) / sqrtAcT
    out[i] = sqrtAcPrev * predX0 + sqrtOneMinusAcPrev * eps[i]
  }
  return out
}

// ── Pipeline ───────────────────────────────────────────────────────────
export async function createMoebiusPipeline(onProgress) {
  await requestPersistentStorage()

  const ep = 'gpu' in navigator ? ['webgpu', 'wasm'] : ['wasm']
  const opts = { executionProviders: ep, graphOptimizationLevel: 'all' }

  const get = (file, label, idx) =>
    loadModelBytes(`${MODEL_BASE}/${file}`, (loaded, total, fromCache) =>
      onProgress?.(fromCache ? `${label} (cached)` : `Mengunduh ${label}…`, loaded, total))

  onProgress?.('Memuat VAE encoder…', 0, 0)
  const encBytes = await get('vae_encoder.onnx', 'VAE encoder', 1)
  const enc = await ort.InferenceSession.create(encBytes, opts)

  onProgress?.('Memuat VAE decoder…', 0, 0)
  const decBytes = await get('vae_decoder.onnx', 'VAE decoder', 2)
  const dec = await ort.InferenceSession.create(decBytes, opts)

  onProgress?.('Memuat UNet…', 0, 0)
  const unetBytes = await get('unet.onnx', 'UNet', 3)
  const unet = await ort.InferenceSession.create(unetBytes, opts)

  const backend = ep[0]

  async function encode(chw) {
    const t = new ort.Tensor('float32', chw, [1, 3, IMG, IMG])
    const { moments } = await enc.run({ image: t })
    const m = moments.data
    const out = new Float32Array(4 * LAT * LAT)
    for (let i = 0; i < out.length; i++) out[i] = m[i] * SCALING_FACTOR
    return out
  }

  async function decode(latent) {
    const scaled = new Float32Array(latent.length)
    for (let i = 0; i < latent.length; i++) scaled[i] = latent[i] / SCALING_FACTOR
    const t = new ort.Tensor('float32', scaled, [1, 4, LAT, LAT])
    const { image } = await dec.run({ latent: t })
    return chwToImageData(image.data)
  }

  async function unetCFG(latents, mask64, maskedLat, t, guidance) {
    const plane = LAT * LAT
    const nine = new Float32Array(9 * plane)
    nine.set(latents.subarray(0, 4 * plane), 0)
    nine.set(mask64, 4 * plane)
    nine.set(maskedLat.subarray(0, 4 * plane), 5 * plane)

    const nine2 = new Float32Array(2 * 9 * plane)
    nine2.set(nine, 0)
    nine2.set(nine, 9 * plane)

    const ids = new BigInt64Array(2 * HALF_IDS)
    for (let i = 0; i < HALF_IDS; i++) {
      ids[i] = BigInt(HALF_IDS + i)
      ids[HALF_IDS + i] = BigInt(i)
    }
    const ts = new BigInt64Array([BigInt(t), BigInt(t)])

    const out = await unet.run({
      latent: new ort.Tensor('float32', nine2, [2, 9, LAT, LAT]),
      timesteps: new ort.Tensor('int64', ts, [2]),
      input_ids: new ort.Tensor('int64', ids, [2, HALF_IDS])
    })
    const noise = out.noise.data
    const n = 4 * plane
    const cfg = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      cfg[i] = noise[i] + guidance * (noise[n + i] - noise[i])
    }
    return cfg
  }

  return {
    backend,

    async inpaint(imageCanvas, maskCanvas, { steps = 20, guidance = 2, seed = 42, onProgress } = {}) {
      const fitted = toSquareCanvas(imageCanvas, imageCanvas.width, imageCanvas.height)
      const maskFitted = toSquareCanvas(maskCanvas, maskCanvas.width, maskCanvas.height)

      onProgress?.('Encoding…', 0, 1)
      const imgCHW = canvasToCHW(fitted.canvas)
      const maskBin = maskCanvasToBinary(maskFitted.canvas)
      const maskedCHW = makeMaskedCHW(imgCHW, maskBin)
      const mask64 = maskToLatent(maskBin)

      const maskedLat = await encode(maskedCHW)

      const ddim = makeDDIM(steps)
      const plane = LAT * LAT
      let latents = randn(4 * plane, seed)
      const off = randn(4, seed ^ 0x9e3779b9)
      for (let c = 0; c < 4; c++) {
        for (let p = 0; p < plane; p++) latents[c * plane + p] += NOISE_OFFSET * off[c]
      }

      const tl = ddim.timesteps
      for (let i = 0; i < tl.length; i++) {
        const t = tl[i]
        const prevT = i + 1 < tl.length ? tl[i + 1] : -1
        onProgress?.('Denoising…', i + 1, tl.length)
        const eps = await unetCFG(latents, mask64, maskedLat, t, guidance)
        latents = ddimStep(eps, latents, t, prevT, ddim)
        await new Promise(r => setTimeout(r, 0))
      }

      onProgress?.('Decoding…', 1, 1)
      const resultData = await decode(latents)

      // paste-back with blurred mask for smooth blending
      return pasteBack(resultData, fitted.canvas, maskBin)
    }
  }
}
