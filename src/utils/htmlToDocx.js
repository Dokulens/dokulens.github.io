// HTML (positioned text layers) → DOCX 1:1.
// Consumes the page data produced by pdfToHtml.js (spans with X/Y/fontSize/fontFamily
// and an optional page background image) and emits a Word document where every text
// line is placed at its exact page coordinate using VML text boxes
// (<w:pict><v:shape><v:textbox>) — the same mechanism professional PDF→Word converters
// use, honoured reliably by Word. The page is rasterized as a floating background image
// behind the text.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Textbox,
  ImageRun,
  TextWrappingType,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  PageOrientation,
} from 'docx'

const PT_TO_TWIP = 20
const EMU_PER_PT = 12700

// Y-tolerance (in px @ scale) for merging spans onto the same visual line.
const Y_TOLERANCE = 2.5

// First resolvable font name from the PDF-derived CSS font stack.
function firstFont(cssFamily, fallback = 'Arial') {
  if (!cssFamily) return fallback
  const first = cssFamily.split(',')[0].replace(/["']/g, '').trim()
  return first || fallback
}

// Group spans that share the same visual line (same Y within tolerance).
function groupSpansIntoLines(spans) {
  const sorted = [...spans].sort((a, b) => a.top - b.top || a.left - b.left)
  const lines = []
  let cur = []
  let lineTop = null
  for (const s of sorted) {
    if (lineTop === null || Math.abs(s.top - lineTop) <= Y_TOLERANCE) {
      cur.push(s)
      lineTop = lineTop === null ? s.top : s.top
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

// Build runs for one text line, preserving intra-line gaps with fixed-width spacing.
function buildLineRuns(spans, scale) {
  const runs = []
  let prevRight = null
  for (const s of spans) {
    if (prevRight !== null) {
      const gapPx = s.left - prevRight
      if (gapPx > 3) {
        const gapSpaces = Math.round((gapPx / scale) / (s.fontSize / scale / 2.2))
        // insert spaces to approximate the gap (best-effort; word wraps rarely in 1:1 lines)
        runs.push(new TextRun({ text: ' '.repeat(Math.min(64, Math.max(1, gapSpaces))), size: Math.max(4, Math.round(s.fontSize / scale)), font: 'Arial' }))
      } else if (gapPx > 0.8) {
        runs.push(new TextRun({ text: ' ', size: Math.max(4, Math.round(s.fontSize / scale)), font: 'Arial' }))
      }
    }
    runs.push(
      new TextRun({
        text: s.text,
        size: Math.max(4, Math.round((s.fontSize / scale) * 2) / 2),
        font: firstFont(s.fontFamily || s.fontName, 'Arial'),
        bold: !!s.bold,
        italics: !!s.italic,
      })
    )
    prevRight = s.left + s.widthPx
  }
  return runs
}

// One positioned line → a VML text box anchored at the exact page coordinate.
function lineToTextbox(line, scale, pageWpt, pageHpt) {
  const first = line.spans[0]
  const last = line.spans[line.spans.length - 1]
  const widthPx = Math.max(1, last.left + last.widthPx - first.left)
  const heightPx = Math.max(...line.spans.map((s) => s.fontSize))

  const leftPt = Math.max(0, first.left / scale)
  const topPt = Math.max(0, line.top / scale)
  const widthPt = Math.max(6, widthPx / scale)
  const heightPt = Math.max(8, heightPx / scale)

  const runs = buildLineRuns(line.spans, scale)

  return new Textbox({
    children: [
      new Paragraph({
        children: runs,
        spacing: { before: 0, after: 0, line: 240 },
      }),
    ],
    style: {
      left: `${leftPt.toFixed(2)}pt`,
      top: `${topPt.toFixed(2)}pt`,
      width: `${widthPt.toFixed(2)}pt`,
      height: `${heightPt.toFixed(2)}pt`,
      positionHorizontal: 'absolute',
      positionHorizontalRelative: 'page',
      positionVertical: 'absolute',
      positionVerticalRelative: 'page',
    },
  })
}

// Float the rasterized page background behind the text.
async function backgroundImageRun(bgDataUrl, widthPx, heightPx, scale) {
  if (!bgDataUrl) return null
  const blob = await (await fetch(bgDataUrl)).blob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return new ImageRun({
    data: bytes,
    transformation: {
      width: Math.round((widthPx / scale) * EMU_PER_PT),
      height: Math.round((heightPx / scale) * EMU_PER_PT),
    },
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
 * @returns {Promise<Blob>}
 */
export async function htmlToDocx(pages, opts = {}) {
  const { includeImage = true, onProgress } = opts
  const sections = []
  const total = pages.length

  for (let pi = 0; pi < total; pi++) {
    const pd = pages[pi]
    if (onProgress) onProgress((pi / total) * 90, `Menyusun halaman ${pi + 1} dari ${total} ke Word…`)

    const orientation = pd.widthPt > pd.heightPt ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
    const pageChildren = []

    // Background image first so text boxes layer above it in Z-order.
    if (includeImage && pd.bgDataUrl) {
      const bgRun = await backgroundImageRun(pd.bgDataUrl, pd.widthPx, pd.heightPx, pd.scale)
      if (bgRun) pageChildren.push(new Paragraph({ children: [bgRun], spacing: { before: 0, after: 0 } }))
    }

    const lines = groupSpansIntoLines(pd.spans)
    for (const line of lines) {
      if (!line.spans.length) continue
      pageChildren.push(new Paragraph({ children: [lineToTextbox(line, pd.scale, pd.widthPt, pd.heightPt)], spacing: { before: 0, after: 0 } }))
    }

    sections.push({
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
  const doc = new Document({ sections })
  const blob = await Packer.toBlob(doc)
  if (onProgress) onProgress(100, 'Selesai.')
  return blob
}