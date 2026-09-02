import { useState } from 'react'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } from 'docx'
import { Loader2, FileText } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import ProgressBar from '../../components/ProgressBar'
import { pdfjsLib } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'
import { BTN_CARD_ACTIVE, BTN_CARD_INACTIVE, BTN_TOGGLE_ACTIVE, BTN_TOGGLE_INACTIVE } from '../../utils/activeButtonStyles'

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
  const rowPositions = mergeClosePositions(textItems.map((t) => Math.round(t.y)), 6)

  if (colPositions.length < 2 || rowPositions.length < 2) return null

  const grid = []
  for (let r = 0; r < rowPositions.length; r++) {
    const row = []
    for (let c = 0; c < colPositions.length; c++) {
      const cellItems = textItems.filter((t) => {
        const colDist = Math.abs(t.x0 - colPositions[c])
        const rowDist = Math.abs(Math.round(t.y) - rowPositions[r])
        return colDist < pageWidth * 0.04 && rowDist < 10
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

      // Pass 1: collect all font sizes to compute median
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

      // Pass 2: extract structured content per page
      const docChildren = []

      for (let i = 1; i <= totalPages; i++) {
        setProgressText(`Mengekstrak halaman ${i} dari ${totalPages}…`)
        setProgress(Math.round((i / totalPages) * 75))

        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale: 1 })
        const pageWidth = viewport.width
        const textContent = await page.getTextContent()

        // Build rich text items with position and style info
        const items = textContent.items
          .filter((t) => t.str?.trim())
          .map((t) => {
            const fh = Math.abs(t.transform[3]) || 12
            const fontName = (t.fontName || '').toLowerCase()
            return {
              text: t.str,
              x0: t.transform[4],
              y: t.transform[5],
              x1: t.transform[4] + (t.width || 0),
              fontSize: Math.round(fh * 2), // half-points for docx
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

        // Try table detection
        const tableGrid = detectTable(items, pageWidth)
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

        // Group items into lines by Y proximity
        const lines = []
        let currentLine = []
        let lastY = null

        const sortedItems = [...items].sort((a, b) => b.y - a.y || a.x0 - b.x0)
        for (const item of sortedItems) {
          if (lastY !== null && Math.abs(item.y - lastY) > 6) {
            if (currentLine.length) {
              lines.push([...currentLine].sort((a, b) => a.x0 - b.x0))
            }
            currentLine = []
          }
          currentLine.push(item)
          lastY = item.y
        }
        if (currentLine.length) lines.push([...currentLine].sort((a, b) => a.x0 - b.x0))

        // Group lines into paragraphs (by Y proximity between lines)
        const paragraphs = []
        let currentPara = []
        let prevLineY = null

        for (const line of lines) {
          const lineY = line[0]?.y
          if (prevLineY !== null && Math.abs(lineY - prevLineY) > 18) {
            if (currentPara.length) paragraphs.push(currentPara)
            currentPara = []
          }
          currentPara.push(line)
          prevLineY = lineY
        }
        if (currentPara.length) paragraphs.push(currentPara)

        // Convert paragraphs to DOCX elements
        for (const paraLines of paragraphs) {
          const allItems = paraLines.flat()
          const fullText = allItems.map((t) => t.text).join(' ').trim()
          if (!fullText) continue

          // Check for heading
          const heading = detectHeading(allItems, medianSize)
          if (heading) {
            docChildren.push(
              new Paragraph({
                heading,
                spacing: { after: 200, line: 276 },
                children: allItems.map(
                  (item) =>
                    new TextRun({
                      text: item.text + ' ',
                      size: item.fontSize,
                      bold: true,
                      font: 'Calibri',
                    })
                ),
              })
            )
            continue
          }

          // Check for list
          const listMatch = detectList(fullText)
          if (listMatch) {
            const indent = listMatch.type === 'bullet' ? 720 : 360
            const prefix = listMatch.type === 'numbered' ? listMatch.number + ' ' : '• '
            docChildren.push(
              new Paragraph({
                spacing: { after: 80, line: 260 },
                indent: { left: indent, hanging: indent },
                children: [
                  new TextRun({ text: prefix, size: 20, font: 'Calibri' }),
                  new TextRun({
                    text: listMatch.text,
                    size: 20,
                    font: 'Calibri',
                  }),
                ],
              })
            )
            continue
          }

          // Regular paragraph
          docChildren.push(
            new Paragraph({
              spacing: { after: 120, line: 260 },
              children: allItems.map(
                (item) =>
                  new TextRun({
                    text: item.text + ' ',
                    size: item.fontSize,
                    bold: item.bold,
                    italics: item.italic,
                    underline: item.underline ? {} : undefined,
                    strike: item.strikethrough ? {} : undefined,
                    font: 'Calibri',
                  })
              ),
            })
          )
        }

        // Page break between pages (except last)
        if (i < totalPages) {
          docChildren.push(
            new Paragraph({
              spacing: { after: 200 },
              pageBreakBefore: true,
              children: [],
            })
          )
        }
      }

      setProgressText('Menyusun file Word (.docx)…')
      setProgress(85)

      const docxFile = new Document({
        sections: [
          {
            children: docChildren.length ? docChildren : [new Paragraph({ text: '' })],
          },
        ],
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
              Teks, paragraf, tabel, heading, daftar, dan gaya font (bold/italic/underline) akan dipertahankan dalam format .docx.
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
