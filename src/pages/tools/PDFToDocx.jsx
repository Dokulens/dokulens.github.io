import { useState, useEffect } from 'react'
import ConvertApi from 'convertapi-js'
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, Table, TableRow, TableCell, WidthType, TabStopType, convertInchesToTwip, PageOrientation } from 'docx'
import { Loader2, FileText, Cloud, Cpu, ExternalLink } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import ProgressBar from '../../components/ProgressBar'
import { pdfjsLib } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'
import { BTN_CARD_ACTIVE, BTN_CARD_INACTIVE } from '../../utils/activeButtonStyles'

const LS_TOKEN_KEY = 'convertapi_token'
const Y_TOLERANCE = 5
const X_GAP_THRESHOLD = 28
const PT_TO_TWIP = 20

function mergeClosePositions(positions, threshold = 8) {
  if (!positions.length) return []
  const sorted = [...new Set(positions)].sort((a, b) => a - b)
  const merged = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - merged[merged.length - 1] < threshold) merged[merged.length - 1] = (merged[merged.length - 1] + sorted[i]) / 2
    else merged.push(sorted[i])
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
  if (filled / (grid.length * grid[0].length) < 0.3) return null
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
  let cur = []
  let lineY = null
  for (const item of sortedItems) {
    if (lineY === null || Math.abs(item.y - lineY) < Y_TOLERANCE) {
      cur.push(item)
      lineY = lineY === null ? item.y : (lineY * (cur.length - 1) + item.y) / cur.length
    } else {
      lines.push({ items: [...cur].sort((a, b) => a.x0 - b.x0), y: lineY })
      cur = [item]
      lineY = item.y
    }
  }
  if (cur.length) lines.push({ items: [...cur].sort((a, b) => a.x0 - b.x0), y: lineY })
  return lines
}
function buildRunsWithXGaps(lineItems) {
  const runs = []
  const tabStops = []
  let prevX1 = null
  let curTabTwip = 0
  for (const item of lineItems) {
    if (prevX1 !== null) {
      const gap = item.x0 - prevX1
      if (gap > X_GAP_THRESHOLD) {
        const avgCharW = Math.max(4, (item.rawFontSize || 10) * 0.5)
        const extraSpaces = Math.max(2, Math.min(16, Math.round(gap / avgCharW)))
        const tabPosTwip = Math.round(item.x0 * PT_TO_TWIP)
        if (gap > 60) {
          tabStops.push({ type: TabStopType.LEFT, position: Math.max(tabPosTwip, curTabTwip + 240) })
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
  const fh = t.transform ? (Math.hypot(t.transform[2] ?? 0, t.transform[3] ?? 12) || Math.abs(t.transform[3]) || 12) : 12
  return { font, bold, italic, fh, halfPt: Math.round(fh * 2) }
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

// ---------- ConvertAPI (cloud) ----------
async function convertViaConvertApi(file, token) {
  const api = ConvertApi.auth(token.trim())
  const params = api.createParams()
  params.add('File', file)
  // Layout: flowing keeps editable; use 'exact' only for pixel-perfect but less editable
  // Keep default flowing for pdf24-like editable 1:1
  const result = await api.convert('pdf', 'docx', params)
  const f = result.files?.[0] || result.dto?.Files?.[0]
  if (!f) throw new Error('ConvertAPI tidak mengembalikan file')
  const url = f.Url || f.url
  if (!url) {
    // fallback FileData
    const data = f.FileData || f.fileData
    if (data) {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    }
    throw new Error('URL hasil ConvertAPI tidak tersedia')
  }
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Gagal unduh hasil ConvertAPI: ${r.status}`)
  const blob = await r.blob()
  return blob
}

// ---------- Offline fallback (koordinat) ----------
async function convertOffline(file, preserveImages, setProgressText, setProgress) {
  const arrayBuf = await readAsArrayBuffer(file)
  const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise
  const totalPages = pdfDoc.numPages
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
    const items = textContent.items.filter((t) => t.str?.trim()).map((t) => {
      const resolved = resolvePdfFont(t, styles)
      return { text: t.str, x0: t.transform[4], y: t.transform[5], x1: t.transform[4] + (t.width || 0), font: resolved.font, fontSize: resolved.halfPt, rawFontSize: resolved.fh, bold: resolved.bold, italic: resolved.italic, transform: t.transform, width: t.width || 0 }
    })
    const children = []
    if (items.length === 0) {
      if (preserveImages) {
        const hasImg = await pageHasRasterImage(page)
        if (hasImg) {
          const png = await renderPageToPngBytes(page, 1.5)
          children.push(new Paragraph({ children: [new ImageRun({ data: png.bytes, transformation: { width: Math.round(png.widthPt * 2.8), height: Math.round(png.heightPt * 2.8) }, type: 'png' })] }))
        } else children.push(new Paragraph({ text: '' }))
      } else children.push(new Paragraph({ text: '' }))
    } else {
      const sortedItems = [...items].sort((a, b) => b.y - a.y || a.x0 - b.x0)
      const tableGrid = detectTable(sortedItems, pageWpt)
      if (tableGrid && tableGrid.length >= 2 && tableGrid[0].length >= 2) {
        children.push(new Table({
          rows: tableGrid.map((row) => new TableRow({ children: row.map((cellText) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cellText || '', size: 20, font: 'Calibri' })] })], width: { size: Math.round(100 / row.length), type: WidthType.PERCENTAGE } })) })),
          width: { size: 100, type: WidthType.PERCENTAGE },
        }))
        children.push(new Paragraph({ text: '', spacing: { after: 120 } }))
      } else {
        const lines = groupByY2Lines(sortedItems)
        let prevY = null
        for (const lineObj of lines) {
          const line = lineObj.items
          const lineY = lineObj.y
          const fullText = line.map((t) => t.text).join(' ').trim()
          if (!fullText) { prevY = lineY; continue }
          let spacingBefore = 0
          if (prevY !== null) {
            const delta = prevY - lineY
            const expected = (line[0]?.rawFontSize || medianSize) * 1.2 + 2
            if (delta > expected + 4) spacingBefore = Math.max(0, Math.min(480, Math.round((delta - expected) * PT_TO_TWIP)))
          }
          prevY = lineY
          const heading = detectHeading(line, medianSize)
          if (heading) {
            const { runs, tabStops } = buildRunsWithXGaps(line)
            const firstX = runs.find((r) => !r.isGap)?.x0 ?? line[0].x0
            const indentLeft = Math.max(0, Math.min(wTwip - 720, Math.round(firstX * PT_TO_TWIP)))
            children.push(new Paragraph({ heading, spacing: { before: spacingBefore || 120, after: 200, line: 276 }, indent: indentLeft > 120 ? { left: indentLeft } : undefined, tabStops: tabStops.length ? tabStops : undefined, children: line.map((it) => new TextRun({ text: it.text + ' ', size: it.fontSize, bold: true, font: it.font })) }))
            continue
          }
          const listMatch = detectList(fullText)
          if (listMatch) {
            children.push(new Paragraph({ spacing: { before: spacingBefore || 0, after: 80, line: 260 }, indent: { left: listMatch.type === 'bullet' ? 720 : 360, hanging: listMatch.type === 'bullet' ? 720 : 360 }, children: [new TextRun({ text: listMatch.type === 'numbered' ? listMatch.number + ' ' : '• ', size: 20, font: 'Calibri' }), new TextRun({ text: listMatch.text, size: 20, font: 'Calibri' })] }))
            continue
          }
          const { runs, tabStops: ts, firstX } = buildRunsWithXGaps(line)
          const leftMarginPt = convertInchesToTwip(0.12) / PT_TO_TWIP
          const indentLeft = Math.max(0, Math.min(wTwip - 720, Math.round((firstX - leftMarginPt) * PT_TO_TWIP)))
          children.push(new Paragraph({ spacing: { before: spacingBefore, after: 0, line: 260 }, indent: indentLeft > 40 ? { left: indentLeft } : undefined, tabStops: ts.length ? ts : undefined, children: runs.map((r) => r.isGap ? new TextRun({ text: r.text, size: 20, font: 'Calibri' }) : new TextRun({ text: r.text, size: r.fontSize, bold: r.bold, italics: r.italic, font: r.font })) }))
        }
      }
      if (preserveImages) {
        const hasImg = await pageHasRasterImage(page)
        if (hasImg) {
          const png = await renderPageToPngBytes(page, 1.45)
          const maxWpx = Math.round((wTwip / PT_TO_TWIP) * 3.2)
          const ratio = Math.min(1, maxWpx / png.canvasW)
          children.push(new Paragraph({ spacing: { before: 120 }, children: [] }))
          children.push(new Paragraph({ children: [new ImageRun({ data: png.bytes, transformation: { width: Math.round(png.canvasW * ratio * 0.55), height: Math.round(png.canvasH * ratio * 0.55) }, type: 'png' })] }))
        }
      }
    }
    sections.push({ properties: { page: { size: { width: wTwip, height: hTwip, orientation }, margin: { top: convertInchesToTwip(0.35), bottom: convertInchesToTwip(0.35), left: convertInchesToTwip(0.12), right: convertInchesToTwip(0.12), header: 360, footer: 360, gutter: 0 } } }, children: children.length ? children : [new Paragraph({ text: '' })] })
  }
  const docxFile = new Document({ sections: sections.length ? sections : [{ children: [new Paragraph({ text: '' })] }] })
  return Packer.toBlob(docxFile)
}

export default function PDFToDocx() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [preserveImages, setPreserveImages] = useState(true)
  const [useCloud, setUseCloud] = useState(true)
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem(LS_TOKEN_KEY) || '' } catch { return '' }
  })
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { try { localStorage.setItem(LS_TOKEN_KEY, token) } catch {} }, [token])
  const handleFile = ([f]) => { setFile(f); setResult(null); setError(''); setProgress(0) }

  const convert = async () => {
    if (!file) return
    setProcessing(true); setError(''); setProgress(0)
    try {
      if (useCloud) {
        if (!token.trim()) throw new Error('Masukkan ConvertAPI token dulu (https://www.convertapi.com/a/authentication) — daftar gratis dapat 250 konversi')
        setProgressText('Mengirim ke ConvertAPI (pdf → docx, 1:1)…')
        setProgress(20)
        const blob = await convertViaConvertApi(file, token)
        setProgress(95)
        // ConvertAPI mengembalikan docx langsung — sudah 1:1 seperti pdf24
        setProgress(100)
        setResult(blob)
        return
      }
      setProgressText('Membaca struktur PDF…')
      const blob = await convertOffline(file, preserveImages, setProgressText, setProgress)
      setProgressText('Menyusun file Word (.docx)…')
      setProgress(92)
      setProgress(100)
      setResult(blob)
    } catch (e) {
      const msg = e?.message || String(e)
      // tampilkan detail ConvertAPI jika ada
      setError(`Gagal konversi: ${msg}`)
    } finally { setProcessing(false) }
  }
  const base = file ? stripExt(file.name) : 'document'
  return (
    <ToolShell title="PDF → Word (.docx)" description="PDF ke Word 1:1 seperti pdf24 — via ConvertAPI (cloud, editable penuh) atau offline koordinat.">
      <DropZone accept=".pdf,application/pdf" onFiles={handleFile} label="Pilih file PDF untuk diubah ke Word" />
      {file && <FilePreview file={file} />}
      {/* Token + mode */}
      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setUseCloud(true)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${useCloud ? 'bg-(--color-brand) text-white border-(--color-brand)' : 'bg-(--color-surface) text-(--color-text-2) border-(--color-border)'}`}><Cloud size={14} /> Cloud 1:1 (ConvertAPI)</button>
          <button type="button" onClick={() => setUseCloud(false)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${!useCloud ? 'bg-(--color-brand) text-white border-(--color-brand)' : 'bg-(--color-surface) text-(--color-text-2) border-(--color-border)'}`}><Cpu size={14} /> Offline (koordinat)</button>
          <a href="https://www.convertapi.com/pdf-to-docx/javascript" target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] text-(--color-brand) hover:underline">Docs ConvertAPI <ExternalLink size={11} /></a>
        </div>
        {useCloud && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-(--color-text)">ConvertAPI Secret / Token</label>
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste token dari convertapi.com/a/authentication" className="w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs font-mono text-(--color-text) outline-none focus:border-(--color-brand) focus:ring-2 focus:ring-(--color-brand)/20" />
            <p className="text-[11px] text-(--color-text-3)">Token disimpan lokal di browser. Daftar gratis 250 konversi. Tanpa token, pakai mode Offline.</p>
          </div>
        )}
        {!useCloud && (
          <label className="flex items-center gap-2 text-xs text-(--color-text-2) cursor-pointer select-none"><input type="checkbox" checked={preserveImages} onChange={(e) => setPreserveImages(e.target.checked)} className="accent-(--color-brand)" />Sertakan gambar (raster per halaman) — offline</label>
        )}
        <div className="flex items-start gap-2 rounded-lg border border-(--color-border) bg-(--color-surface-2) p-2.5 text-xs text-(--color-text-2)"><FileText size={16} className="shrink-0 text-(--color-brand) mt-0.5" /><span>{useCloud ? (<>Cloud 1:1 via <code className="font-mono">convertapi-js</code> <code>pdf→docx</code> — layout, font, gambar, tabel editable seperti <a href="https://tools.pdf24.org/en/pdf-converter" target="_blank" rel="noreferrer" className="text-(--color-brand) underline">pdf24</a>.</>) : (<>Offline koordinat — <code className="font-mono">transform[4]=X,[5]=Y</code> Y-Tolerance 5px + X-Gap 28px→TabStop, per-page Sections twip, font map.</>)}</span></div>
      </div>
      {file && (
        <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3 flex items-center justify-between text-xs"><span className="font-medium text-(--color-text) truncate">{file.name}</span><span className="shrink-0 text-(--color-text-3) ml-2">{fmtBytes(file.size)}</span></div>
      )}
      {processing && (<div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4 space-y-2 animate-fade-in"><ProgressBar value={progress} label={progressText} /></div>)}
      {error && <p className="rounded border border-(--color-danger-light) bg-(--color-danger-light) px-3 py-2 text-sm text-(--color-danger) animate-fade-in">{error}</p>}
      {file && !result && (<button onClick={convert} disabled={processing} className={`flex w-full items-center justify-center gap-2 rounded px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.99] disabled:opacity-60 ${processing ? BTN_CARD_INACTIVE : BTN_CARD_ACTIVE}`}>{processing && <Loader2 size={16} className="animate-spin" />}{processing ? 'Mengonversi…' : useCloud ? 'Konversi Cloud 1:1 (ConvertAPI)' : 'Konversi Offline'}</button>)}
      {result && (<ResultCard fileName={`${base}.docx`} blob={result} extraInfo={fmtBytes(result.size)} outputMimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" sourceRoute="pdf-to-docx" onReset={() => { setResult(null); setFile(null); setProgress(0) }} />)}
    </ToolShell>
  )
}
