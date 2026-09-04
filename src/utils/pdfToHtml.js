// PDF → HTML (via positioned text layers) — 1:1 fidelity.
// Port of the standalone pdf-to-html-converter.html into an ESM module.
// Extracts exact position (X,Y), size and font family of every text object and
// rasterizes each page as a pixel-perfect background.

import { pdfjsLib } from './pdfRender'
import { readAsArrayBuffer } from './helpers'

export const RENDER_SCALE = 1.6 // internal raster scale for pixel-perfect background

// ---------- font family heuristics ----------
export function mapFontFamily(rawName, fallback) {
  const n = (rawName || '').toLowerCase()
  const table = [
    [/times|serif|georgia|garamond|minion|cambria/, '"Times New Roman", Georgia, serif'],
    [/courier|consolas|mono/, '"Courier New", monospace'],
    [/arial|helvetica|calibri|segoe|verdana|tahoma|roboto|sans/, 'Arial, Helvetica, sans-serif'],
    [/comic/, '"Comic Sans MS", cursive'],
    [/impact/, 'Impact, sans-serif'],
  ]
  for (const [re, css] of table) if (re.test(n)) return css
  if (fallback === 'serif') return 'Georgia, "Times New Roman", serif'
  if (fallback === 'monospace') return '"Courier New", monospace'
  return 'Arial, Helvetica, sans-serif'
}

// Resolve a clean, single font name for DOCX/Word from the raw pdfjs font data.
export function resolveFontName(rawName, fallback) {
  const css = mapFontFamily(rawName, fallback)
  const first = css.split(',')[0].replace(/["']/g, '').trim()
  return first || 'Arial'
}

function detectBold(fontKey) {
  return /bold|black|heavy|700|w7|w8|w9/.test(fontKey)
}
function detectItalic(fontKey) {
  return /italic|oblique/.test(fontKey)
}

async function processPage(pdf, pageNum, { includeImage }) {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale: RENDER_SCALE })

  // 1. rasterize for pixel-perfect background
  let bgDataUrl = null
  if (includeImage) {
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
    bgDataUrl = canvas.toDataURL('image/jpeg', 0.92)
  }

  // 2. extract positioned text
  const textContent = await page.getTextContent()
  const styles = textContent.styles || {}
  const spans = []
  const fontsUsed = new Set()

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const item of textContent.items) {
    if (!item.str || !item.str.trim()) continue
    const style = styles[item.fontName] || {}
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
    const angle = Math.atan2(tx[1], tx[0])
    const fontHeight = Math.hypot(tx[2], tx[3])
    const ascent = style.ascent && style.ascent > 0 ? style.ascent : 0.8

    let left, top
    if (Math.abs(angle) < 0.001) {
      left = tx[4]
      top = tx[5] - fontHeight * ascent
    } else {
      left = tx[4] + fontHeight * ascent * Math.sin(angle)
      top = tx[5] - fontHeight * ascent * Math.cos(angle)
    }

    const rawFontName = style.fontFamily || item.fontName || ''
    const fallback =
      style.fontFamily === 'monospace' ? 'monospace'
      : style.fontFamily === 'serif' ? 'serif'
      : 'sans-serif'
    const cssFont = mapFontFamily(rawFontName, fallback)
    const cleanFont = resolveFontName(rawFontName, fallback)
    fontsUsed.add(cleanFont)

    const fontKey = `${style.fontFamily || ''} ${item.fontName || ''}`.toLowerCase()

    spans.push({
      text: item.str,
      left: +left.toFixed(2),
      top: +top.toFixed(2),
      fontSize: +fontHeight.toFixed(2), // px at RENDER_SCALE
      fontFamily: cssFont,
      fontName: cleanFont,
      bold: detectBold(fontKey),
      italic: detectItalic(fontKey),
      angle: +angle.toFixed(4),
      widthPx: item.width * RENDER_SCALE,
    })

    minX = Math.min(minX, left)
    maxX = Math.max(maxX, left + item.width * RENDER_SCALE)
    minY = Math.min(minY, top)
    maxY = Math.max(maxY, top + fontHeight)
  }

  const marginsPx = spans.length
    ? {
        left: Math.max(0, minX),
        right: Math.max(0, viewport.width - maxX),
        top: Math.max(0, minY),
        bottom: Math.max(0, viewport.height - maxY),
      }
    : { left: 0, right: 0, top: 0, bottom: 0 }

  return {
    widthPx: viewport.width,
    heightPx: viewport.height,
    widthPt: page.view[2] - page.view[0],
    heightPt: page.view[3] - page.view[1],
    scale: RENDER_SCALE,
    bgDataUrl,
    spans,
    fontsUsed: [...fontsUsed],
    marginsPx,
  }
}

/**
 * Convert a PDF File into 1:1 positioned HTML data.
 * @param {File} file
 * @param {(pct:number, text:string)=>void} onProgress
 * @param {{includeImage:boolean}} opts
 * @returns {Promise<{pages:Array, sourceName:string, html:string}>}
 */
export async function pdfToHtml(file, onProgress, opts = {}) {
  const { includeImage = true } = opts
  const arrayBuf = await readAsArrayBuffer(file)
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise
  const n = pdf.numPages
  const pages = []

  for (let i = 1; i <= n; i++) {
    if (onProgress) onProgress(5 + ((i - 1) / n) * 80, `Mengubah halaman ${i} dari ${n} ke HTML…`)
    pages.push(await processPage(pdf, i, { includeImage }))
  }

  const sourceName = file.name.replace(/\.pdf$/i, '')
  const html = buildExportHtml(pages, sourceName, includeImage)
  if (onProgress) onProgress(100, 'HTML 1:1 selesai.')
  return { pages, sourceName, html }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Rebuild the standalone interactive HTML (for preview / download of the HTML step).
export function buildExportHtml(pages, sourceName, includeImage = true) {
  const pagesHtml = pages
    .map((pd, idx) => {
      const spansHtml = pd.spans
        .map((s) => {
          const rot = s.angle ? `transform:rotate(${s.angle}rad);` : ''
          const style = `left:${s.left}px;top:${s.top}px;font-size:${s.fontSize}px;font-family:${s.fontFamily};${rot}`
          return `<span class="t" style="${style}">${escapeHtml(s.text)}</span>`
        })
        .join('')
      const bg = includeImage
        ? `<img class="bg" src="${pd.bgDataUrl}" alt="page ${idx + 1} background">`
        : ''
      return `<section class="page" style="width:${pd.widthPx}px;height:${pd.heightPx}px;">${bg}${spansHtml}</section>`
    })
    .join('\n')

  const textColor = includeImage ? 'transparent' : '#191a17'
  const selectionBg = includeImage ? 'rgba(178,53,31,.35)' : 'rgba(178,53,31,.2)'

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(sourceName || 'Document')} — converted</title>
<style>
  body{ margin:0; padding:32px; background:#78766d; display:flex; flex-direction:column; align-items:center; gap:24px; font-family:sans-serif; }
  .page{ position:relative; background:#fff; overflow:hidden; box-shadow:0 6px 24px rgba(0,0,0,.25); }
  .bg{ position:absolute; top:0; left:0; width:100%; height:100%; display:block; }
  .t{ position:absolute; white-space:pre; line-height:1; transform-origin:0% 0%; color:${textColor}; }
  .t::selection{ background:${selectionBg}; color:${textColor}; }
  @media print{
    body{ background:#fff; padding:0; gap:0; }
    .page{ box-shadow:none; page-break-after:always; }
  }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`
}