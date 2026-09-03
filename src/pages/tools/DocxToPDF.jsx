import { useState } from 'react'
import JSZip from 'jszip'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { Loader2, FileType } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import ProgressBar from '../../components/ProgressBar'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

// ========= Konstanta layout PDF =========
const PAGE_WIDTH = 595.28 // A4 pt
const PAGE_HEIGHT = 841.89
const MARGIN = 50
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const FONT_SIZE_DEFAULT = 11
const LINE_HEIGHT = 16
const CELL_PAD = 4

// ========= Helper XML =========
function isTag(node, local) {
  if (!node || !node.nodeName) return false
  const n = node.nodeName
  return n === `w:${local}` || n === local || node.localName === local
}
function findChild(parent, local) {
  if (!parent || !parent.childNodes) return null
  for (const c of Array.from(parent.childNodes)) if (isTag(c, local)) return c
  return null
}
function findChildren(parent, local) {
  if (!parent || !parent.childNodes) return []
  return Array.from(parent.childNodes).filter((c) => isTag(c, local))
}
function getAttr(node, local) {
  if (!node || !node.getAttribute) return null
  return node.getAttribute(`w:${local}`) ?? node.getAttribute(local)
}

// ========= Parse .docx via JSZip + document.xml =========
// FIX: Ekstrak struktur XML asli, jangan konversi langsung ke teks mentah
async function parseDocxXml(arrayBuf) {
  const zip = await JSZip.loadAsync(arrayBuf)
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('word/document.xml tidak ditemukan')
  const xmlStr = await docFile.async('string')
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml')
  const parseError = xmlDoc.getElementsByTagName('parsererror')[0]
  if (parseError) throw new Error('Gagal parse document.xml')

  const body = xmlDoc.getElementsByTagName('w:body')[0] || xmlDoc.getElementsByTagName('body')[0] || xmlDoc.documentElement
  if (!body) throw new Error('body tidak ditemukan di document.xml')

  const blocks = []
  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType !== 1) continue // ELEMENT_NODE only
    if (isTag(node, 'p')) {
      blocks.push(parseParagraph(node))
    } else if (isTag(node, 'tbl')) {
      blocks.push(parseTable(node))
    } else if (isTag(node, 'sdt')) {
      // structured document tag — unwrap inner content
      const sdtContent = findChild(node, 'sdtContent')
      if (sdtContent) {
        for (const inner of Array.from(sdtContent.childNodes)) {
          if (inner.nodeType !== 1) continue
          if (isTag(inner, 'p')) blocks.push(parseParagraph(inner))
          else if (isTag(inner, 'tbl')) blocks.push(parseTable(inner))
        }
      }
    }
  }
  return blocks
}

function parseParagraph(pNode) {
  const pPr = findChild(pNode, 'pPr')
  let pStyle = null
  let jc = null
  let indLeftPt = 0
  let isList = false
  if (pPr) {
    const s = findChild(pPr, 'pStyle')
    if (s) pStyle = getAttr(s, 'val')
    const j = findChild(pPr, 'jc')
    if (j) jc = getAttr(j, 'val')
    const ind = findChild(pPr, 'ind')
    if (ind) {
      const left = getAttr(ind, 'left')
      if (left) indLeftPt = parseInt(left, 10) / 20 // dxa -> pt
    }
    if (findChild(pPr, 'numPr')) isList = true
  }

  const runs = []
  for (const child of Array.from(pNode.childNodes)) {
    if (isTag(child, 'r')) {
      collectRunsFromR(child, runs)
    } else if (isTag(child, 'hyperlink')) {
      for (const r of Array.from(child.childNodes)) if (isTag(r, 'r')) collectRunsFromR(r, runs, true)
    } else if (isTag(child, 'proofErr') || isTag(child, 'bookmarkStart') || isTag(child, 'bookmarkEnd')) {
      continue
    }
  }
  // jika paragraf kosong tetapi ada pPr (mis. spasi), pertahankan sebagai spacer
  return { type: 'paragraph', runs, pStyle, jc, indLeftPt, isList }
}

function collectRunsFromR(rNode, out, forceUnderline = false) {
  const rPr = findChild(rNode, 'rPr')
  let bold = false
  let italic = false
  let underline = forceUnderline
  let strike = false
  let szHalfPt = null
  if (rPr) {
    if (findChild(rPr, 'b') || findChild(rPr, 'bCs')) bold = true
    if (findChild(rPr, 'i') || findChild(rPr, 'iCs')) italic = true
    if (findChild(rPr, 'u')) underline = true
    if (findChild(rPr, 'strike')) strike = true
    const sz = findChild(rPr, 'sz')
    if (sz) {
      const v = getAttr(sz, 'val')
      if (v) szHalfPt = parseInt(v, 10)
    }
    const szCs = findChild(rPr, 'szCs')
    if (szCs && szHalfPt == null) {
      const v = getAttr(szCs, 'val')
      if (v) szHalfPt = parseInt(v, 10)
    }
  }
  for (const rc of Array.from(rNode.childNodes)) {
    if (isTag(rc, 't')) {
      const txt = rc.textContent ?? ''
      // xml:space preserve — jangan trim di sini
      if (txt) out.push({ text: txt, bold, italic, underline, strike, szHalfPt })
    } else if (isTag(rc, 'tab')) {
      out.push({ text: '\t', bold, italic, underline, strike, szHalfPt, isTab: true })
    } else if (isTag(rc, 'br')) {
      out.push({ text: '\n', isBreak: true })
    } else if (isTag(rc, 'cr')) {
      out.push({ text: '\n', isBreak: true })
    }
  }
}

function parseTable(tblNode) {
  const grid = findChild(tblNode, 'tblGrid')
  let gridCols = []
  if (grid) {
    for (const gc of findChildren(grid, 'gridCol')) {
      const w = getAttr(gc, 'w')
      gridCols.push(w ? parseInt(w, 10) : 1200)
    }
  }
  const rows = []
  for (const tr of findChildren(tblNode, 'tr')) {
    const cells = []
    for (const tc of findChildren(tr, 'tc')) {
      const tcPr = findChild(tc, 'tcPr')
      let tcW = null
      if (tcPr) {
        const wNode = findChild(tcPr, 'tcW')
        if (wNode) {
          const w = getAttr(wNode, 'w')
          if (w) tcW = parseInt(w, 10)
        }
      }
      // cell dapat berisi beberapa paragraf
      const cellParas = []
      for (const c of Array.from(tc.childNodes)) if (isTag(c, 'p')) cellParas.push(parseParagraph(c))
      // gabungkan teks cell untuk rendering sederhana
      const flatRuns = cellParas.flatMap((p) => p.runs)
      const text = flatRuns.map((r) => r.text).join('')
      cells.push({ tcW, paras: cellParas, flatRuns, text: text.trim() })
    }
    rows.push(cells)
  }
  return { type: 'table', gridCols, rows }
}

// ========= FIX: Layout-Aware Rendering =========
// Teks dalam satu baris/sel di XML wajib pada Y identik, X bertambah horizontal

function getRunSize(run, pStyle) {
  if (run.szHalfPt) return run.szHalfPt / 2
  if (pStyle) {
    const s = pStyle.toLowerCase()
    if (s.includes('heading1') || s === 'heading 1' || s === '1') return 16
    if (s.includes('heading2') || s === 'heading 2' || s === '2') return 14
    if (s.includes('heading3') || s === 'heading 3' || s === '3') return 12
  }
  return FONT_SIZE_DEFAULT
}
function getRunFont(run, fonts) {
  if (run.bold && run.italic) return fonts.bi
  if (run.bold) return fonts.bold
  if (run.italic) return fonts.italic
  return fonts.regular
}

function ensurePage(doc, currentPage, currentY, neededH) {
  if (currentY - neededH < MARGIN) {
    const np = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    return { page: np, y: PAGE_HEIGHT - MARGIN }
  }
  return { page: currentPage, y: currentY }
}

// FIX: Petakan w:p menjadi koordinat absolut (X,Y) di PDF
// Semua run dalam satu baris berbagi Y identik, X += width secara horizontal
function drawParagraphBlock(block, doc, currentPage, currentY, fonts) {
  const runs = block.runs
  if (!runs.length) {
    // empty paragraph = vertical spacer
    return { page: currentPage, y: currentY - LINE_HEIGHT * 0.6 }
  }

  // Build lines preserving per-run style, wrapping di CONTENT_WIDTH - indent
  const maxW = CONTENT_WIDTH - (block.indLeftPt || 0)
  const indent = block.indLeftPt || 0
  const lines = [] // tiap line = array segmen { text, width, run }
  let curLine = []
  let curW = 0

  // helper flush
  const flush = () => {
    if (curLine.length) lines.push(curLine)
    curLine = []
    curW = 0
  }

  for (const run of runs) {
    if (run.isBreak) {
      flush()
      continue
    }
    const size = getRunSize(run, block.pStyle)
    const font = getRunFont(run, fonts)
    // pisahkan tab/spasi/newline dengan mempertahankan delimiter
    // \t ditangani sebagai tab stop (36pt)
    const raw = run.text
    // split mempertahankan whitespace: spasi dan tab
    // Untuk akurasi koordinat, proses per kata
    const parts = raw.split(/(\t|\s+)/)
    for (const part of parts) {
      if (!part) continue
      if (part === '\t' || run.isTab) {
        const tabW = 36 // 0.5 inch tab
        if (curW + tabW > maxW && curLine.length) flush()
        curLine.push({ text: '    ', width: tabW, run, size, font, isTab: true })
        curW += tabW
        continue
      }
      if (/^\s+$/.test(part)) {
        // spasi — jangan append di awal baris
        if (!curLine.length) continue
        const spW = font.widthOfTextAtSize(' ', size)
        if (curW + spW > maxW) {
          flush()
          continue
        }
        curLine.push({ text: ' ', width: spW, run, size, font })
        curW += spW
        continue
      }
      // kata biasa
      const w = font.widthOfTextAtSize(part, size)
      if (curW + w > maxW && curLine.length) {
        flush()
      }
      // jika kata tunggal lebih panjang dari maxW, pecah per karakter
      if (w > maxW) {
        let acc = ''
        let accW = 0
        for (const ch of part) {
          const cw = font.widthOfTextAtSize(ch, size)
          if (accW + cw > maxW && acc) {
            curLine.push({ text: acc, width: accW, run, size, font })
            lines.push(curLine)
            curLine = []
            curW = 0
            acc = ch
            accW = cw
          } else {
            acc += ch
            accW += cw
          }
        }
        if (acc) {
          curLine.push({ text: acc, width: accW, run, size, font })
          curW += accW
        }
      } else {
        curLine.push({ text: part, width: w, run, size, font })
        curW += w
      }
    }
  }
  flush()

  // list prefix
  const isHeading = block.pStyle && /heading/i.test(block.pStyle)
  const listPrefix = block.isList ? '• ' : null
  const headingSizeBoost = isHeading ? 0 : 0

  let page = currentPage
  let y = currentY

  const jc = block.jc // left | center | right | both | distribute
  for (let li = 0; li < lines.length; li++) {
    const segs = lines[li]
    const lineW = segs.reduce((a, s) => a + s.width, 0) + (listPrefix && li === 0 ? fonts.regular.widthOfTextAtSize(listPrefix, FONT_SIZE_DEFAULT) : 0)
    let x
    if (jc === 'center') x = MARGIN + indent + (maxW - lineW) / 2
    else if (jc === 'right' || jc === 'end') x = PAGE_WIDTH - MARGIN - lineW
    else x = MARGIN + indent

    const need = ensurePage(doc, page, y, LINE_HEIGHT)
    page = need.page
    y = need.y

    // FIX: semua run pada baris ini berada pada Y identik, X bertambah horizontal
    let curX = x
    if (listPrefix && li === 0) {
      page.drawText(listPrefix, { x: curX, y, size: FONT_SIZE_DEFAULT, font: fonts.regular, color: rgb(0.1, 0.1, 0.1) })
      curX += fonts.regular.widthOfTextAtSize(listPrefix, FONT_SIZE_DEFAULT)
    }
    for (const seg of segs) {
      // draw per segmen agar bold/italic/size terjaga, tetapi tetap pada Y yang sama
      page.drawText(seg.text, {
        x: curX,
        y,
        size: seg.size,
        font: seg.font,
        color: isHeading ? rgb(0.12, 0.18, 0.45) : rgb(0.1, 0.1, 0.1),
      })
      curX += seg.width
    }
    y -= LINE_HEIGHT
  }

  // paragraph spacing
  const paraGap = isHeading ? LINE_HEIGHT * 0.4 : LINE_HEIGHT * 0.3
  y -= paraGap
  return { page, y }
}

// FIX: Tabel — tiap baris (tr) dipetakan ke Y yang sama, tiap sel (tc) ke X yang berbeda
function drawTableBlock(block, doc, currentPage, currentY, fonts) {
  const numCols = Math.max(...block.rows.map((r) => r.length), block.gridCols.length || 0) || 1
  // Hitung lebar kolom: dari gridCols (dxa) atau bagi rata CONTENT_WIDTH
  let colWidthsPt = []
  if (block.gridCols.length >= numCols && block.gridCols.length > 0) {
    const total = block.gridCols.reduce((a, b) => a + b, 0) || numCols * 1000
    colWidthsPt = block.gridCols.slice(0, numCols).map((w) => (w / total) * CONTENT_WIDTH)
  } else {
    colWidthsPt = Array(numCols).fill(CONTENT_WIDTH / numCols)
  }

  // helper: wrap teks sel di dalam colW - 2*CELL_PAD
  function wrapCellText(text, colW, size, font) {
    const innerW = Math.max(10, colW - CELL_PAD * 2)
    if (!text) return ['']
    const words = text.split(/\s+/)
    const lines = []
    let cur = ''
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w
      if (font.widthOfTextAtSize(test, size) > innerW && cur) {
        lines.push(cur)
        cur = w
      } else {
        cur = test
      }
    }
    if (cur) lines.push(cur)
    return lines
  }

  let page = currentPage
  let y = currentY

  // Border tabel tipis agar struktur terlihat
  for (let r = 0; r < block.rows.length; r++) {
    const row = block.rows[r]
    // hitung tinggi baris dari konten terpanjang (multi-line)
    let maxLines = 1
    const cellLinesArr = []
    for (let c = 0; c < numCols; c++) {
      const cell = row[c]
      const txt = cell ? cell.text : ''
      const size = FONT_SIZE_DEFAULT - 0.5
      const font = fonts.regular
      const colW = colWidthsPt[c]
      const cellLines = wrapCellText(txt, colW, size, font)
      cellLinesArr.push(cellLines)
      maxLines = Math.max(maxLines, cellLines.length)
    }
    const rowH = Math.max(LINE_HEIGHT + CELL_PAD * 2, maxLines * LINE_HEIGHT + CELL_PAD * 2 + 2)

    const need = ensurePage(doc, page, y, rowH)
    page = need.page
    y = need.y

    // FIX: semua sel pada baris yang sama berbagi Y (y) yang identik, X = akumulasi lebar kolom sebelumnya
    let curX = MARGIN
    for (let c = 0; c < numCols; c++) {
      const colW = colWidthsPt[c]
      const cellLines = cellLinesArr[c]
      const cell = row[c]
      const isHeaderRow = r === 0

      // cell rect
      page.drawRectangle({
        x: curX,
        y: y - rowH,
        width: colW,
        height: rowH,
        borderColor: rgb(0.78, 0.82, 0.88),
        borderWidth: 0.7,
        color: isHeaderRow ? rgb(0.96, 0.97, 0.99) : undefined,
      })

      // tulis tiap baris sel pada Y yang sama (row), X = curX + pad + (opsional center)
      const size = FONT_SIZE_DEFAULT - 0.5
      const font = cell && cell.flatRuns.some((x) => x.bold) ? fonts.bold : fonts.regular
      for (let li = 0; li < cellLines.length; li++) {
        const line = cellLines[li]
        // vertical: top-aligned di dalam sel
        const ty = y - CELL_PAD - 9 - li * LINE_HEIGHT
        // horizontal: left-aligned dengan pad; jika header, sedikit bold
        page.drawText(line, {
          x: curX + CELL_PAD,
          y: ty,
          size,
          font,
          color: rgb(0.1, 0.1, 0.1),
          maxWidth: colW - CELL_PAD * 2,
        })
      }

      curX += colW // FIX: X bertambah horizontal per kolom, Y tetap
    }

    y -= rowH
  }

  // jarak setelah tabel
  y -= LINE_HEIGHT * 0.5
  return { page, y }
}

export default function DocxToPDF() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const handleFile = ([f]) => {
    setFile(f)
    setResult(null)
    setError('')
    setProgress(0)
  }

  const convert = async () => {
    if (!file) return
    setProcessing(true)
    setError('')
    setProgress(0)

    try {
      setProgressText('Mengekstrak struktur XML Word (.docx)…')
      setProgress(15)

      const arrayBuf = await readAsArrayBuffer(file)

      // FIX: jangan mammoth.extractRawText — ekstrak word/document.xml via JSZip
      let blocks
      try {
        blocks = await parseDocxXml(arrayBuf)
      } catch (e) {
        throw new Error(`Gagal baca document.xml: ${e.message}`)
      }

      if (!blocks.length) throw new Error('Dokumen kosong atau tidak ada paragraf/tabel terbaca')

      setProgressText('Menyiapkan halaman PDF…')
      setProgress(35)

      const doc = await PDFDocument.create()
      const fonts = {
        regular: await doc.embedFont(StandardFonts.Helvetica),
        bold: await doc.embedFont(StandardFonts.HelveticaBold),
        italic: await doc.embedFont(StandardFonts.HelveticaOblique),
        bi: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
      }

      let currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      let currentY = PAGE_HEIGHT - MARGIN

      setProgressText('Merender layout koordinat (X,Y)…')
      setProgress(45)

      for (let idx = 0; idx < blocks.length; idx++) {
        const block = blocks[idx]
        if (block.type === 'paragraph') {
          const res = drawParagraphBlock(block, doc, currentPage, currentY, fonts)
          currentPage = res.page
          currentY = res.y
        } else if (block.type === 'table') {
          const res = drawTableBlock(block, doc, currentPage, currentY, fonts)
          currentPage = res.page
          currentY = res.y
        }
        setProgress(45 + Math.round((idx / blocks.length) * 40))
      }

      setProgressText('Menyimpan file PDF…')
      setProgress(95)
      const pdfBytes = await doc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      setProgress(100)
      setResult(blob)
    } catch (e) {
      setError(`Gagal konversi: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const base = file ? stripExt(file.name) : 'document'

  return (
    <ToolShell
      title="Word (.docx) → PDF"
      description="Ubah file dokumen Microsoft Word (.docx) menjadi file PDF dengan layout koordinat presisi langsung di browser."
    >
      <DropZone
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onFiles={handleFile}
        label="Pilih file Word (.docx)"
        hint="Mendukung file dokumen .docx"
      />
      {file && <FilePreview file={file} />}

      {file && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[--color-text] truncate">{file.name}</span>
            <span className="shrink-0 text-[--color-text-3] ml-2">{fmtBytes(file.size)}</span>
          </div>

          <div className="flex items-center gap-2 rounded border border-[--color-border] bg-[--color-surface-2] p-2.5 text-xs text-[--color-text-2]">
            <FileType size={16} className="shrink-0 text-[--color-brand]" />
            <span>
              Struktur <code className="font-mono text-[--color-text]">word/document.xml</code> dipetakan ke koordinat absolut X/Y di PDF: <code className="font-mono">w:p</code> → baris Y sejajar, <code className="font-mono">w:tbl/w:tr/w:tc</code> → X bertambah horizontal per kolom.
            </span>
          </div>
        </div>
      )}

      {processing && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2 animate-fade-in">
          <ProgressBar value={progress} label={progressText} />
        </div>
      )}

      {error && (
        <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger] animate-fade-in">
          {error}
        </p>
      )}

      {file && !result && (
        <button
          onClick={convert}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-all active:scale-[0.99]"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Mengonversi…' : 'Konversi ke PDF'}
        </button>
      )}

      {result && (
        <ResultCard
          fileName={`${base}.pdf`}
          blob={result}
          extraInfo={fmtBytes(result.size)}
          outputMimeType="application/pdf"
          sourceRoute="docx-to-pdf"
          onReset={() => {
            setResult(null)
            setFile(null)
            setProgress(0)
          }}
        />
      )}
    </ToolShell>
  )
}
