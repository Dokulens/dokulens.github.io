import * as pdfjsLib from 'pdfjs-dist'

// Use CDN worker matching installed version to avoid bundling issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

export { pdfjsLib }

/** Render a single PDF page to a canvas and return dataURL + canvas + dimensions */
export async function renderPageToDataUrl(pdfDoc, pageNum, scale = 1.5) {
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  await page.render({ canvasContext: ctx, viewport }).promise
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.85),
    canvas,
    width: viewport.width,
    height: viewport.height,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    pageWidth: page.view[2] - page.view[0],
    pageHeight: page.view[3] - page.view[1],
  }
}

/** Sample dominant background color around a rectangle from canvas pixels */
function sampleBackgroundColor(ctx, x, y, w, h, canvasW, canvasH) {
  try {
    // Sample a few pixels around top, bottom, left, right edges of the bounding box
    const samplePoints = [
      { sx: Math.max(0, x - 3), sy: Math.max(0, y - 3) },
      { sx: Math.min(canvasW - 1, x + w + 3), sy: Math.max(0, y - 3) },
      { sx: Math.max(0, x - 3), sy: Math.min(canvasH - 1, y + h + 3) },
      { sx: Math.min(canvasW - 1, x + w + 3), sy: Math.min(canvasH - 1, y + h + 3) },
      { sx: Math.max(0, x + w / 2), sy: Math.max(0, y - 3) },
      { sx: Math.max(0, x + w / 2), sy: Math.min(canvasH - 1, y + h + 3) },
    ]

    let rSum = 0, gSum = 0, bSum = 0, count = 0
    for (const pt of samplePoints) {
      const p = ctx.getImageData(Math.floor(pt.sx), Math.floor(pt.sy), 1, 1).data
      // Ignore if alpha is 0
      if (p[3] > 0) {
        rSum += p[0]
        gSum += p[1]
        bSum += p[2]
        count++
      }
    }

    if (count > 0) {
      const r = Math.round(rSum / count)
      const g = Math.round(gSum / count)
      const b = Math.round(bSum / count)
      const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
      return { hex, r: r / 255, g: g / 255, b: b / 255 }
    }
  } catch {
    // Fallback to white if cross-origin or canvas read fails
  }
  return { hex: '#ffffff', r: 1, g: 1, b: 1 }
}

/** Extract all text items from a PDF page with bounding box, font detection, and background color sampling */
export async function extractPageTextItems(pdfDoc, pageNum, scale = 1.5, canvas = null) {
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const textContent = await page.getTextContent()

  const ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null

  const items = []
  for (let idx = 0; idx < textContent.items.length; idx++) {
    const item = textContent.items[idx]
    if (!item.str || !item.str.trim()) continue

    const tx = item.transform
    // tx = [scaleX, skewY, skewX, scaleY, transX, transY]
    const pdfX = tx[4]
    const pdfY = tx[5]
    const fontHeight = Math.abs(tx[3]) || Math.abs(tx[0]) || item.height || 12
    const pdfWidth = item.width || fontHeight * item.str.length * 0.6

    // Viewport coordinates (origin top-left)
    const x0 = pdfX * scale
    const y0 = viewport.height - (pdfY * scale) - (fontHeight * scale * 0.85)
    const w0 = Math.max(12, pdfWidth * scale)
    const h0 = Math.max(12, fontHeight * scale * 1.15)

    // Percentage of viewport
    const xPct = (x0 / viewport.width) * 100
    const yPct = (y0 / viewport.height) * 100
    const wPct = (w0 / viewport.width) * 100
    const hPct = (h0 / viewport.height) * 100

    // Font family and weight/italic analysis from pdf fontName
    const fontName = (item.fontName || '').toLowerCase()
    const isBold = fontName.includes('bold') || fontName.includes('black') || fontName.includes('heavy') || fontName.includes('bolder') || fontName.includes('700')
    const isItalic = fontName.includes('italic') || fontName.includes('oblique')

    let fontCategory = 'Helvetica'
    if (fontName.includes('times') || fontName.includes('serif') || fontName.includes('roman') || fontName.includes('georgia') || fontName.includes('cambria')) {
      fontCategory = 'TimesRoman'
    } else if (fontName.includes('courier') || fontName.includes('mono') || fontName.includes('consolas')) {
      fontCategory = 'Courier'
    }

    // Sample background color surrounding the text
    const bg = ctx ? sampleBackgroundColor(ctx, x0, y0, w0, h0, viewport.width, viewport.height) : { hex: '#ffffff', r: 1, g: 1, b: 1 }

    items.push({
      id: `detected-${pageNum}-${idx}-${crypto.randomUUID().slice(0, 6)}`,
      page: pageNum,
      originalText: item.str,
      text: item.str,
      fontSize: Math.round(fontHeight),
      pdfX,
      pdfY,
      pdfWidth,
      pdfHeight: fontHeight,
      xPct: Math.max(0, Math.min(100, xPct)),
      yPct: Math.max(0, Math.min(100, yPct)),
      wPct: Math.max(1, Math.min(100, wPct)),
      hPct: Math.max(1, Math.min(100, hPct)),
      fontFamily: fontCategory,
      fontNameRaw: item.fontName || 'Helvetica',
      bold: isBold,
      italic: isItalic,
      color: '#000000',
      bgColor: bg.hex,
      bgR: bg.r,
      bgG: bg.g,
      bgB: bg.b,
      isEdited: false,
    })
  }

  return items
}

/** Render a single PDF page to Blob */
export async function renderPageToBlob(pdfDoc, pageNum, scale = 2, mimeType = 'image/png', quality = 0.92) {
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality)
  })
}
