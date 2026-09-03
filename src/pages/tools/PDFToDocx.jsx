import { useState } from 'react'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx'
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

// ---------- Konstanta koordinat ----------
const Y_TOLERANCE = 5 // px — teks dengan selisih Y < 5 dianggap satu baris
const X_GAP_THRESHOLD = 28 // px — lompatan X di atas ini = kolom baru → sisipkan spasi/tab
const PARA_Y_BREAK = 18 // px — jarak antar baris untuk paragraf baru (legacy fallback)

function mergeClosePositions(positions, threshold = 8) {
  if (!positions.length) return []
  const sorted = [...new Set(positions)].sort((a, b) => a - b)
  const merged = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - merged[merged.length - 1] < threshold) {
      merged[merged.length - 1] = (merged[merged.length - 1] + sorted[i]) / 2
    } else {
      merged.push(sorted[i])
    }
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
      const cellItems = textItems.filter((t) => {
        const colDist = Math.abs(t.x0 - colPositions[c])
        const rowDist = Math.abs(Math.round(t.y) - rowPositions[r])
        return colDist < pageWidth * 0.04 && rowDist < Y_TOLERANCE + 2
      })
      row.push(cellItems.map((t) => t.text).join(' ').trim())
    }
    grid.push(row)
  }
  const filledCells = grid.flat().filter((c) => c.length > 0).length
  const totalCells = grid.length * grid[0].length
  if (filledCells / totalCells < 0.3) return null
  return grid
}

function detectHeading(textItems, medianSize) {
  if (textItems.length === 0) return null
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
  if (/^\d+[.)]\s/.test(trimmed)) {
    const match = trimmed.match(/^(\d+[.)]\s)(.*)/)
    return { type: 'numbered', text: match[2], number: match[1] }
  }
  return null
}

// ---------- FIX: Y-Tolerance grouping ----------
// Mengelompokkan item transform-based ke baris dengan Y_TOLERANCE = 5
function groupByY2Lines(sortedItems) {
  const lines = []
  let currentLine = []
  let lineY = null
  for (const item of sortedItems) {
    if (lineY === null || Math.abs(item.y - lineY) < Y_TOLERANCE) {
      currentLine.push(item)
      // keep weighted Y as average to stay stable
      lineY = lineY === null ? item.y : (lineY * (currentLine.length - 1) + item.y) / currentLine.length
    } else {
      // flush line sorted X asc
      lines.push([...currentLine].sort((a, b) => a.x0 - b.x0))
      currentLine = [item]
      lineY = item.y
    }
  }
  if (currentLine.length) lines.push([...currentLine].sort((a, b) => a.x0 - b.x0))
  return lines
}

// ---------- FIX: X-Distance spacing ----------
// Pada baris yang sama, gap X besar → sisipkan spasi/tab simulasi kolom
function buildRunsWithXGaps(lineItems) {
  // lineItems sudah sort X asc
  const runs = []
  let prevX1 = null
  for (const item of lineItems) {
    if (prevX1 !== null) {
      const gap = item.x0 - prevX1
      if (gap > X_GAP_THRESHOLD) {
        // estimasi spasi berdasarkan lebar karakter rata-rata
        const avgCharW = Math.max(4, (item.rawFontSize || 10) * 0.5)
        const extraSpaces = Math.max(2, Math.min(16, Math.round(gap / avgCharW)))
        // gunakan tab untuk lompatan besar (>60px) agar Word me-render kolom rapi
        if (gap > 60) {
          runs.push({ isGap: true, text: '\t'.repeat(Math.max(1, Math.round(gap / 80))) + ' '.repeat(extraSpaces) })
        } else {
          runs.push({ isGap: true, text: ' '.repeat(extraSpaces) })
        }
      } else if (gap > 1) {
        runs.push({ isGap: true, text: ' ' })
      }
    }
    runs.push(item)
    prevX1 = item.x1
  }
  return runs
}

export default function PDFToDocx() {
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
      const arrayBuf = await readAsArrayBuffer(file)
      setProgressText('Membaca struktur PDF…')
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) })
      const pdfDoc = await loadingTask.promise
      const totalPages = pdfDoc.numPages

      // Pass 1: median font size untuk deteksi heading
      const allFontSizes = []
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i)
        const tc = await page.getTextContent()
        for (const item of tc.items) {
          if (!item.str?.trim()) continue
          const fh = Math.abs(item.transform[3]) || 12
          allFontSizes.push(fh)
        }
      }
      allFontSizes.sort((a, b) => a - b)
      const medianSize = allFontSizes[Math.floor(allFontSizes.length / 2)] || 12

      // Pass 2: extract per page dengan koordinat
      const docChildren = []

      for (let i = 1; i <= totalPages; i++) {
        setProgressText(`Mengekstrak halaman ${i} dari ${totalPages}…`)
        setProgress(Math.round((i / totalPages) * 75))

        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale: 1 })
        const pageWidth = viewport.width
        const textContent = await page.getTextContent()

        // FIX: ambil matriks posisi dari item.transform [a,b,c,d, e=X, f=Y]
        const items = textContent.items
          .filter((t) => t.str?.trim())
          .map((t) => {
            const fh = Math.abs(t.transform[3]) || 12
            const fontName = (t.fontName || '').toLowerCase()
            return {
              text: t.str,
              // FIX: koordinat absolut
              x0: t.transform[4], // X
              y: t.transform[5], // Y
              x1: t.transform[4] + (t.width || 0),
              fontSize: Math.round(fh * 2),
              rawFontSize: fh,
              bold: fontName.includes('bold'),
              italic: fontName.includes('italic'),
              underline: fontName.includes('underline'),
              strikethrough: fontName.includes('strike') || fontName.includes('line'),
            }
          })

        if (items.length === 0) {
          docChildren.push(new Paragraph({ text: '' }))
          if (i < totalPages) docChildren.push(new Paragraph({ text: '', spacing: { after: 200 } }))
          continue
        }

        // FIX: sort Y menurun (atas→bawah), X menaik (kiri→kanan)
        const sortedItems = [...items].sort((a, b) => b.y - a.y || a.x0 - b.x0)

        // try table detection with Y_TOLERANCE
        const tableGrid = detectTable(sortedItems, pageWidth)
        if (tableGrid && tableGrid.length >= 2 && tableGrid[0].length >= 2) {
          const table = new Table({
            rows: tableGrid.map(
              (row) =>
                new TableRow({
                  children: row.map(
                    (cellText) =>
                      new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: cellText || '', size: 20, font: 'Calibri' })] })],
                        width: { size: Math.round(100 / row.length), type: WidthType.PERCENTAGE },
                      })
                  ),
                })
            ),
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
          docChildren.push(table)
          docChildren.push(new Paragraph({ text: '', spacing: { after: 120 } }))
          continue
        }

        // FIX: Y-Tolerance grouping → tiap line = satu Paragraph Word
        const lines = groupByY2Lines(sortedItems)

        for (const line of lines) {
          const fullText = line.map((t) => t.text).join(' ').trim()
          if (!fullText) continue

          // heading check per line
          const heading = detectHeading(line, medianSize)
          if (heading) {
            docChildren.push(
              new Paragraph({
                heading,
                spacing: { after: 200, line: 276 },
                children: line.map(
                  (item) =>
                    new TextRun({ text: item.text + ' ', size: item.fontSize, bold: true, font: 'Calibri' })
                ),
              })
            )
            continue
          }

          const listMatch = detectList(fullText)
          if (listMatch) {
            // FIX: bangun paragraph list dengan run yang sudah memperhitungkan X gap
            const runs = buildRunsWithXGaps(line)
            // for list, prefix + text tanpa gap logic ganda
            docChildren.push(
              new Paragraph({
                spacing: { after: 80, line: 260 },
                indent: { left: listMatch.type === 'bullet' ? 720 : 360, hanging: listMatch.type === 'bullet' ? 720 : 360 },
                children: [
                  new TextRun({ text: listMatch.type === 'numbered' ? listMatch.number + ' ' : '• ', size: 20, font: 'Calibri' }),
                  new TextRun({ text: listMatch.text, size: 20, font: 'Calibri' }),
                ],
              })
            )
            continue
          }

          // FIX: X-Distance → sisipkan spasi/tab simulasi kolom
          const runsWithGaps = buildRunsWithXGaps(line)
          docChildren.push(
            new Paragraph({
              spacing: { after: 100, line: 260 },
              children: runsWithGaps.map((r) => {
                if (r.isGap) return new TextRun({ text: r.text, size: 20, font: 'Calibri' })
                return new TextRun({
                  text: r.text,
                  size: r.fontSize,
                  bold: r.bold,
                  italics: r.italic,
                  underline: r.underline ? {} : undefined,
                  strike: r.strikethrough ? {} : undefined,
                  font: 'Calibri',
                })
              }),
            })
          )
        }

        if (i < totalPages) {
          docChildren.push(
            new Paragraph({ spacing: { after: 200 }, pageBreakBefore: true, children: [] })
          )
        }
      }

      setProgressText('Menyusun file Word (.docx)…')
      setProgress(85)

      const docxFile = new Document({
        sections: [{ children: docChildren.length ? docChildren : [new Paragraph({ text: '' })] }],
      })

      const blob = await Packer.toBlob(docxFile)
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
      title="PDF → Word (.docx)"
      description="Ekstrak teks, tabel, heading, dan struktur dari file PDF menjadi dokumen Word yang bisa diedit."
    >
      <DropZone accept=".pdf,application/pdf" onFiles={handleFile} label="Pilih file PDF untuk diubah ke Word" />
      {file && <FilePreview file={file} />}

      {file && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[--color-text] truncate">{file.name}</span>
            <span className="shrink-0 text-[--color-text-3] ml-2">{fmtBytes(file.size)}</span>
          </div>
          <div className="flex items-center gap-2 rounded border border-[--color-border] bg-[--color-surface-2] p-2.5 text-xs text-[--color-text-2]">
            <FileText size={16} className="shrink-0 text-[--color-brand]" />
            <span>
              Koordinat teks (X,Y) dari PDF.js dipertahankan: Y-Tolerance 5px per baris &amp; X-Gap untuk kolom/tabel.
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
          className={`flex w-full items-center justify-center gap-2 rounded px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.99] disabled:opacity-60 ${processing ? BTN_CARD_INACTIVE : BTN_CARD_ACTIVE}`}
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Mengonversi…' : 'Konversi ke Word (.docx)'}
        </button>
      )}

      {result && (
        <ResultCard
          fileName={`${base}.docx`}
          blob={result}
          extraInfo={fmtBytes(result.size)}
          outputMimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          sourceRoute="pdf-to-docx"
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
