import { useState } from 'react'
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, Table, TableRow, TableCell, WidthType, TabStopType, convertInchesToTwip, PageOrientation } from 'docx'
import { Loader2, FileText } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import ProgressBar from '../../components/ProgressBar'
import { pdfjsLib } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'
import { BTN_CARD_ACTIVE, BTN_CARD_INACTIVE } from '../../utils/activeButtonStyles'

// ---------- Konstanta koordinat (sesuai spesifikasi) ----------
const Y_TOLERANCE = 5 // px — teks selisih Y < 5 → satu baris
const X_GAP_THRESHOLD = 28 // px — lompat X > 28 → kolom baru
const PT_TO_TWIP = 20

function mergeClosePositions(positions, threshold = 8) {
  if (!positions.length) return []
  const sorted = [...new Set(positions)].sort((a, b) => a - b)
  const merged = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - merged[merged.length - 1] < threshold) {
      merged[merged.length - 1] = (merged[merged.length - 1] + sorted[i]) / 2
    } else merged.push(sorted[i])
  }
  return merged
}
function detectTable(textItems, pageWidth) {
  if (textItems.length < 6) return null
  const colPositions = mergeClosePositions(textItems.map((t) => t.x0), pageWidth * 0.02)
  const rowPositions = mergeClosePositions(textItems.map((t) => Math.round(t.y)), Y_TOLERANCE)
  if (colPositions.length < 2 || rowPositions.length < 2) return null
  const grid = []
  for (let r = 0; r < rowPositions.length; r++) {
    const row = []
    for (let c = 0; c < colPositions.length; c++) {
      const cellItems = textItems.filter((t) => Math.abs(t.x0 - colPositions[c]) < pageWidth * 0.04 && Math.abs(Math.round(t.y) - rowPositions[r]) < Y_TOLERANCE + 2)
      row.push(cellItems.map((t) => t.text).join(' ').trim())
    }
    grid.push(row)
  }
  const filled = grid.flat().filter((c) => c.length > 0).length
  const total = grid.length * grid[0].length
  if (filled / total < 0.3) return null
  return grid
}
function detectHeading(textItems, medianSize) {
  if (!textItems.length) return null
  const maxSize = Math.max(...textItems.map((t) => t.fontSize))
  const allBold = textItems.every((t) => t.bold)
  if (maxSize >= medianSize * 1.4 && allBold) return HeadingLevel.HEADING_1
  if (maxSize >= medianSize * 1.25 && allBold) return HeadingLevel.HEADING_2
  if (maxSize >= medianSize * 1.15 && allBold) return HeadingLevel.HEADING_3
  if (maxSize >= medianSize * 1.1) return HeadingLevel.HEADING_4
  return null
}
function detectList(text) {
  const trimmed = text.trim()
  if (/^[•●○◦▪▸►→\-–—]\s/.test(trimmed)) return { type: 'bullet', text: trimmed.replace(/^[•●○◦▪▸►→\-–—]\s/, '') }
  if (/^\d+[.)]\s/.test(trimmed)) { const m = trimmed.match(/^(\d+[.)]\s)(.*)/); return { type: 'numbered', text: m[2], number: m[1] } }
  return null
}
function groupByY2Lines(sortedItems) {
  const lines = []
  let currentLine = []
  let lineY = null
  for (const item of sortedItems) {
    if (lineY === null || Math.abs(item.y - lineY) < Y_TOLERANCE) {
      currentLine.push(item)
      lineY = lineY === null ? item.y : (lineY * (currentLine.length - 1) + item.y) / currentLine.length
    } else {
      lines.push([...currentLine].sort((a, b) => a.x0 - b.x0))
      currentLine = [item]
      lineY = item.y
    }
  }
  if (currentLine.length) lines.push([...currentLine].sort((a, b) => a.x0 - b.x0))
  return lines
}
function buildRunsWithXGaps(lineItems) {
  const runs = []
  const tabStops = []
  let prevX1 = null
  let curTabPosTwip = 0
  for (const item of lineItems) {
    if (prevX1 !== null) {
      const gap = item.x0 - prevX1
      if (gap > X_GAP_THRESHOLD) {
        const avgCharW = Math.max(4, (item.rawFontSize || 10) * 0.5)
        const extraSpaces = Math.max(2, Math.min(16, Math.round(gap / avgCharW)))
        const tabPosTwip = Math.round((item.x0 - lineItems[0].x0) * PT_TO_TWIP)
        if (gap > 60) {
          tabStops.push({ type: TabStopType.LEFT, position: Math.max(tabPosTwip, curTabPosTwip + 240) })
          runs.push({ isGap: true, text: '\t' + ' '.repeat(extraSpaces) })
          curTabPosTwip = tabPosTwip
        } else runs.push({ isGap: true, text: ' '.repeat(extraSpaces) })
      } else if (gap > 1) runs.push({ isGap: true, text: ' ' })
    }
    runs.push(item)
    prevX1 = item.x1
  }
  return { runs, tabStops }
}
function resolvePdfFont(t, styles) {
  const styleObj = styles?.[t.fontName] || {}
  const fam = (styleObj.fontFamily || '').toLowerCase()
  const nm = (t.fontName || '').toLowerCase()
  const key = `${fam} ${nm}`
  const bold = key.includes('bold') || key.includes('black') || key.includes('heavy') || key.includes('700') || key.includes('w7') || key.includes('w8') || key.includes('w9') || nm.includes('bold')
  const italic = key.includes('italic') || key.includes('oblique') || nm.includes('italic') || nm.includes('oblique')
  let font = 'Calibri'
  if (key.includes('times') || key.includes('serif') || key.includes('roman') || key.includes('georgia') || key.includes('garamond') || key.includes('cambria')) font = 'Times New Roman'
  else if (key.includes('courier') || key.includes('mono') || key.includes('consolas') || key.includes('menlo')) font = 'Courier New'
  else {
    const cleaned = (styleObj.fontFamily || t.fontName || '').replace(/^[A-Z]{2,6}\+/, '').trim()
    if (cleaned) font = cleaned
  }
  let fh = 12
  if (t.transform) fh = Math.hypot(t.transform[2] ?? 0, t.transform[3] ?? 12) || Math.abs(t.transform[3]) || 12
  // color dari pdf.js styles? tidak tersedia, default hitam
  return { font, bold, italic, fh, halfPt: Math.round(fh * 2), color: '#000000' }
}
async function renderPageToPngBytes(page, scale = 2) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  const buf = await blob.arrayBuffer()
  return { bytes: new Uint8Array(buf), widthPt: viewport.width / scale, heightPt: viewport.height / scale, canvasW: canvas.width, canvasH: canvas.height }
}
async function pageHasRasterImage(page) {
  try {
    const opList = await page.getOperatorList()
    for (let i = 0; i < opList.fnArray.length; i++) if (opList.fnArray[i] === pdfjsLib.OPS.paintImageXObject) return true
  } catch {}
  return false
}

export default function PDFToDocx() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [preserveImages, setPreserveImages] = useState(true)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const handleFile = ([f]) => { setFile(f); setResult(null); setError(''); setProgress(0) }
  const convert = async () => {
    if (!file) return
    setProcessing(true); setError(''); setProgress(0)
    try {
      const arrayBuf = await readAsArrayBuffer(file)
      setProgressText('Membaca struktur PDF…')
      const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise
      const totalPages = pdfDoc.numPages
      // median
      const allFontSizes = []
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i)
        const tc = await page.getTextContent()
        for (const item of tc.items) if (item.str?.trim()) {
          const fh = Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 12) || Math.abs(item.transform[3]) || 12
          allFontSizes.push(fh)
        }
      }
      allFontSizes.sort((a, b) => a - b)
      const medianSize = allFontSizes[Math.floor(allFontSizes.length / 2)] || 12
      const sections = []
      for (let i = 1; i <= totalPages; i++) {
        setProgressText(`Mengekstrak halaman ${i} dari ${totalPages}…`)
        setProgress(Math.round((i / totalPages) * 80))
        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale: 1 })
        const pageWpt = viewport.width
        const pageHpt = viewport.height
        const wTwip = Math.round(pageWpt * PT_TO_TWIP)
        const hTwip = Math.round(pageHpt * PT_TO_TWIP)
        const orientation = pageWpt > pageHpt ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
        const textContent = await page.getTextContent()
        const styles = textContent.styles || {}
        // 1:1 transform X/Y + Math.hypot + view-aware (viewport sudah rotasi-aware) + margin twip
        const items = textContent.items.filter((t) => t.str?.trim()).map((t) => {
          const resolved = resolvePdfFont(t, styles)
          // item.transform[4]=X, [5]=Y — absolut pdf user space
          return {
            text: t.str, x0: t.transform[4], y: t.transform[5], x1: t.transform[4] + (t.width || 0),
            font: resolved.font, fontSize: resolved.halfPt, rawFontSize: resolved.fh,
            bold: resolved.bold, italic: resolved.italic, color: resolved.color,
            transform: t.transform, width: t.width || 0,
          }
        })
        const children = []
        if (items.length === 0) {
          if (preserveImages) {
            const hasImg = await pageHasRasterImage(page)
            if (hasImg) {
              const png = await renderPageToPngBytes(page, 1.5)
              children.push(new Paragraph({
                children: [new ImageRun({ data: png.bytes, transformation: { width: Math.round(png.widthPt * 2.8), height: Math.round(png.heightPt * 2.8) }, type: 'png' })],
              }))
            } else children.push(new Paragraph({ text: '' }))
          } else children.push(new Paragraph({ text: '' }))
        } else {
          // sort Y menurun, X menaik — 1:1 koordinat
          const sortedItems = [...items].sort((a, b) => b.y - a.y || a.x0 - b.x0)
          const tableGrid = detectTable(sortedItems, pageWpt)
          if (tableGrid && tableGrid.length >= 2 && tableGrid[0].length >= 2) {
            children.push(new Table({
              rows: tableGrid.map((row) => new TableRow({
                children: row.map((cellText) => new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: cellText || '', size: 20, font: 'Calibri' })] })],
                  width: { size: Math.round(100 / row.length), type: WidthType.PERCENTAGE },
                })),
              })),
              width: { size: 100, type: WidthType.PERCENTAGE },
            }))
            children.push(new Paragraph({ text: '', spacing: { after: 120 } }))
          } else {
            const lines = groupByY2Lines(sortedItems) // Y-Tolerance 5
            for (const line of lines) {
              const fullText = line.map((t) => t.text).join(' ').trim()
              if (!fullText) continue
              const heading = detectHeading(line, medianSize)
              if (heading) {
                children.push(new Paragraph({
                  heading, spacing: { after: 200, line: 276 },
                  children: line.map((it) => new TextRun({ text: it.text + ' ', size: it.fontSize, bold: true, font: it.font, color: it.color })),
                }))
                continue
              }
              const listMatch = detectList(fullText)
              if (listMatch) {
                children.push(new Paragraph({
                  spacing: { after: 80, line: 260 },
                  indent: { left: listMatch.type === 'bullet' ? 720 : 360, hanging: listMatch.type === 'bullet' ? 720 : 360 },
                  children: [
                    new TextRun({ text: listMatch.type === 'numbered' ? listMatch.number + ' ' : '• ', size: 20, font: 'Calibri' }),
                    new TextRun({ text: listMatch.text, size: 20, font: 'Calibri' }),
                  ],
                }))
                continue
              }
              // X-Distance → TabStop + spasi
              const { runs, tabStops } = buildRunsWithXGaps(line)
              children.push(new Paragraph({
                spacing: { after: 90, line: 260 },
                tabStops: tabStops.length ? tabStops : undefined,
                children: runs.map((r) => {
                  if (r.isGap) return new TextRun({ text: r.text, size: 20, font: 'Calibri' })
                  return new TextRun({ text: r.text, size: r.fontSize, bold: r.bold, italics: r.italic, font: r.font, color: r.color })
                }),
              }))
            }
          }
          if (preserveImages) {
            const hasImg = await pageHasRasterImage(page)
            if (hasImg) {
              // hanya fallback jika halaman memang bergambar tapi teks juga ada — raster opsional (hindari duplikasi berlebihan)
              // gunakan thumbnail kecil di akhir sebagai fidelity gambar
              const png = await renderPageToPngBytes(page, 1.45)
              const maxWpx = Math.round((wTwip / PT_TO_TWIP) * 3.2)
              const ratio = Math.min(1, maxWpx / png.canvasW)
              children.push(new Paragraph({ spacing: { before: 120 }, children: [] }))
              children.push(new Paragraph({
                children: [new ImageRun({ data: png.bytes, transformation: { width: Math.round(png.canvasW * ratio * 0.55), height: Math.round(png.canvasH * ratio * 0.55) }, type: 'png' })],
              }))
            }
          }
        }
        sections.push({
          properties: {
            page: {
              size: { width: wTwip, height: hTwip, orientation },
              margin: { top: convertInchesToTwip(0.55), bottom: convertInchesToTwip(0.55), left: convertInchesToTwip(0.55), right: convertInchesToTwip(0.55), header: 708, footer: 708, gutter: 0 },
            },
          },
          children: children.length ? children : [new Paragraph({ text: '' })],
        })
      }
      setProgressText('Menyusun file Word (.docx)…')
      setProgress(88)
      const docxFile = new Document({ sections: sections.length ? sections : [{ children: [new Paragraph({ text: '' })] }] })
      const blob = await Packer.toBlob(docxFile)
      setProgress(100)
      setResult(blob)
    } catch (e) { setError(`Gagal konversi: ${e.message}`) } finally { setProcessing(false) }
  }
  const base = file ? stripExt(file.name) : 'document'
  return (
    <ToolShell title="PDF → Word (.docx)" description="Konversi PDF ke Word 1:1 — ukuran kertas per halaman, posisi X/Y, font, dan gambar dipertahankan.">
      <DropZone accept=".pdf,application/pdf" onFiles={handleFile} label="Pilih file PDF untuk diubah ke Word" />
      {file && <FilePreview file={file} />}
      {file && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between text-sm"><span className="font-medium text-[--color-text] truncate">{file.name}</span><span className="shrink-0 text-[--color-text-3] ml-2">{fmtBytes(file.size)}</span></div>
          <label className="flex items-center gap-2 text-xs text-[--color-text-2] cursor-pointer select-none"><input type="checkbox" checked={preserveImages} onChange={(e) => setPreserveImages(e.target.checked)} className="accent-[--color-brand]" />Sertakan gambar (raster per halaman) untuk fidelity 1:1</label>
          <div className="flex items-start gap-2 rounded border border-[--color-border] bg-[--color-surface-2] p-2.5 text-xs text-[--color-text-2]"><FileText size={16} className="shrink-0 text-[--color-brand] mt-0.5" /><span>1:1 — <code className="font-mono">item.transform[4]=X, [5]=Y</code> + <code>Math.hypot(transform[2],transform[3])</code> + <code>page.view</code>/viewport, Sections per halaman (twip), Y-Tolerance 5px, X-Gap 28px→TabStop.</span></div>
        </div>
      )}
      {processing && (<div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2 animate-fade-in"><ProgressBar value={progress} label={progressText} /></div>)}
      {error && <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger] animate-fade-in">{error}</p>}
      {file && !result && (<button onClick={convert} disabled={processing} className={`flex w-full items-center justify-center gap-2 rounded px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.99] disabled:opacity-60 ${processing ? BTN_CARD_INACTIVE : BTN_CARD_ACTIVE}`}>{processing && <Loader2 size={16} className="animate-spin" />}{processing ? 'Mengonversi…' : 'Konversi ke Word (.docx)'}</button>)}
      {result && (<ResultCard fileName={`${base}.docx`} blob={result} extraInfo={fmtBytes(result.size)} outputMimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" sourceRoute="pdf-to-docx" onReset={() => { setResult(null); setFile(null); setProgress(0) }} />)}
    </ToolShell>
  )
}
