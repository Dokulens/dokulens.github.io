// HTML (positioned text layers) → DOCX 1:1.
// Consumes the page data produced by pdfToHtml.js (spans with X/Y/fontSize/fontFamily
// and an optional page background image) and emits a Word document where every text
// line is placed at its exact page coordinate using paragraph text-frames, and the
// page is rasterized as a floating background image behind the text.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  FrameAnchorType,
  TextWrappingType,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  convertMillimetersToTwip,
  convertInchesToTwip,
  PageOrientation,
} from 'docx'

const PT_TO_TWIP = 20
const EMU_PER_PT = 12700

// Y-tolerance (in px @ scale) for merging spans onto the same visual line.
const Y_TOLERANCE = 2.5

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

// Split the PDF-derived CSS font stack into a runnable docx font name + fallbacks.
function firstFont(cssFamily, fallback = 'Arial') {
  if (!cssFamily) return fallback
  const first = cssFamily.split(',')[0].replace(/["']/g, '').trim()
  return first || fallback
}

// Group spans that share the same visual line (same Y within tolerance) and are
// contiguous (small X gap). This cuts frame count while preserving 1:1 layout.
function groupSpansIntoLines(spans) {
  const sorted = [...spans].sort((a, b) => a.top - b.top || a.left - b.left)
  const lines = []
  let cur = []
  let lineTop = null
  for (const s of sorted) {
    if (lineTop === null || Math.abs(s.top - lineTop) <= Y_TOLERANCE) {
      cur.push(s)
      if (lineTop === null) lineTop = s.top
      else lineTop = (lineTop * (cur.length - 1) + s.top) / cur.length
    } else {
      cur.sort((a, b) => a.left - b.left)
      lines.push({ top: lineTop, spans: cur })
      cur = [s]
      lineTop = s.top
    }
  }
  if (cur.length) {
    cur.sort((a, b) => a.left - b.left)
    lines.push({ top: lineTop, spans: cur })
  }
  return lines
}

// A single positioned line → one Paragraph with framePr absolute position + runs.
function lineToParagraphs(line, scale, pageWidthTw) {
  const first = line.spans[0]
  const last = line.spans[line.spans.length - 1]
  const widthPx = Math.max(1, last.left + last.widthPx - first.left)
  const heightPx = Math.max(...line.spans.map((s) => s.fontSize))

  const xTwip = Math.max(0, Math.round((first.left / scale) * PT_TO_TWIP))
  const yTwip = Math.max(0, Math.round((line.top / scale) * PT_TO_TWIP))
  const wTwip = Math.max(40, Math.round((widthPx / scale) * PT_TO_TWIP))
  const hTwip = Math.max(20, Math.round((heightPx / scale) * PT_TO_TWIP))

  // Build runs, inserting fixed-width runs for intra-line gaps to preserve column spacing.
  const runs = []
  let prevRight = null
  for (const s of line.spans) {
    if (prevRight !== null) {
      const gapPx = s.left - prevRight
      if (gapPx > 3) {
        const gapTwip = Math.round((gapPx / scale) * PT_TO_TWIP)
        // Use a tab to roughly preserve the gap; wider gaps get literal spaces too.
        runs.push(new TextRun({ text: '\t', size: Math.max(4, Math.round(s.fontSize / scale)), font: 'Arial' }))
        prevRight = null // tab handles it; skip extra space calc
        void gapTwip
      } else if (gapPx > 0.5) {
        runs.push(new TextRun({ text: ' ', size: Math.max(4, Math.round(s.fontSize / scale)), font: 'Arial' }))
      }
    }
    const sizePt = Math.max(4, Math.round((s.fontSize / scale) * 2) / 2)
    runs.push(
      new TextRun({
        text: s.text,
        size: sizePt,
        font: firstFont(s.fontFamily || s.fontName, 'Arial'),
        bold: !!s.bold,
        italics: !!s.italic,
      })
    )
    prevRight = s.left + s.widthPx
  }

  return new Paragraph({
    children: runs,
    frame: {
      type: 'absolute',
      position: { x: xTwip, y: yTwip },
      width: wTwip,
      height: hTwip,
      anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
    },
    spacing: { before: 0, after: 0, line: 240 },
  })
}

// Convert a rasterized page background (dataURL) into a floating ImageRun behind text.
async function backgroundImageRun(bgDataUrl, widthPx, heightPx, scale) {
  if (!bgDataUrl) return null
  const blob = await (await fetch(bgDataUrl)).blob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const emuW = Math.round((widthPx / scale) * EMU_PER_PT)
  const emuH = Math.round((heightPx / scale) * EMU_PER_PT)
  return new ImageRun({
    data: bytes,
    transformation: { width: emuW, height: emuH },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: 'left', offset: 0 },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: 'top', offset: 0 },
      allowOverlap: true,
      behindDocument: true,
      layoutInCell: true,
      wrap: { type: TextWrappingType.NONE },
    },
  })
}

/**
 * Build a 1:1 Word document from positioned HTML page data.
 * @param {Array} pages — page objects from pdfToHtml.js
 * @param {{includeImage:boolean, onProgress:Function}} opts
 * @returns {Promise<{blob:Blob}>}
 */
export async function htmlToDocx(pages, opts = {}) {
  const { includeImage = true, onProgress } = opts
  const children = []
  const total = pages.length

  for (let pi = 0; pi < total; pi++) {
    const pd = pages[pi]
    if (onProgress) onProgress((pi / total) * 90, `Menyusun halaman ${pi + 1} dari ${total} ke Word…`)

    const orientation = pd.widthPt > pd.heightPt ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
    const pageChildren = []

    // Background image (floating, behind text) for pixel-perfect backdrop.
    if (includeImage && pd.bgDataUrl) {
      const bgRun = await backgroundImageRun(pd.bgDataUrl, pd.widthPx, pd.heightPx, pd.scale)
      if (bgRun) {
        pageChildren.push(new Paragraph({ children: [bgRun], spacing: { before: 0, after: 0 } }))
      }
    }

    // Text on top — absolute frames.
    const lines = groupSpansIntoLines(pd.spans)
    for (const line of lines) {
      pageChildren.push(lineToParagraphs(line, pd.scale, pd.widthPt))
    }

    children.push({
      properties: {
        page: {
          size: {
            width: Math.round(pd.widthPt * PT_TO_TWIP),
            height: Math.round(pd.heightPt * PT_TO_TWIP),
            orientation,
          },
          margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0, gutter: 0 },
        },
      },
      children: pageChildren.length ? pageChildren : [new Paragraph({ text: '' })],
    })
  }

  if (onProgress) onProgress(93, 'Mengemas dokumen Word (.docx)…')
  const doc = new Document({ sections: children })
  const blob = await Packer.toBlob(doc)
  if (onProgress) onProgress(100, 'Selesai.')
  return blob
}

// Re-export helpers used by callers.
export { convertMillimetersToTwip, convertInchesToTwip }
void clamp