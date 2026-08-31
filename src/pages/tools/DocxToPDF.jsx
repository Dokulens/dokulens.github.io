import { useState } from 'react'
import mammoth from 'mammoth'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { Loader2, FileType, CheckCircle2 } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import ProgressBar from '../../components/ProgressBar'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'

export default function DocxToPDF() {
  const [file, setFile] = useState(null)
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
      setProgressText('Mengekstrak dokumen Word (.docx)…')
      setProgress(20)

      const arrayBuf = await readAsArrayBuffer(file)
      // Extract raw text and paragraphs using mammoth
      const extraction = await mammoth.extractRawText({ arrayBuffer: arrayBuf })
      const rawText = extraction.value || ''

      setProgressText('Menyusun halaman PDF…')
      setProgress(50)

      const doc = await PDFDocument.create()
      const font = await doc.embedFont(StandardFonts.Helvetica)
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

      const PAGE_WIDTH = 595.28 // A4
      const PAGE_HEIGHT = 841.89
      const MARGIN = 50
      const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
      const FONT_SIZE = 11
      const LINE_HEIGHT = 16

      let currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      let currentY = PAGE_HEIGHT - MARGIN

      const paragraphs = rawText.split(/\r?\n/)

      for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
        const p = paragraphs[pIdx].trim()
        if (!p) {
          currentY -= LINE_HEIGHT * 0.8
          if (currentY < MARGIN + LINE_HEIGHT) {
            currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
            currentY = PAGE_HEIGHT - MARGIN
          }
          continue
        }

        // Word wrap lines
        const words = p.split(/\s+/)
        let currentLine = ''

        for (const w of words) {
          const testLine = currentLine ? `${currentLine} ${w}` : w
          const testWidth = font.widthOfTextAtSize(testLine, FONT_SIZE)

          if (testWidth > CONTENT_WIDTH && currentLine) {
            if (currentY < MARGIN + LINE_HEIGHT) {
              currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
              currentY = PAGE_HEIGHT - MARGIN
            }
            currentPage.drawText(currentLine, {
              x: MARGIN,
              y: currentY,
              size: FONT_SIZE,
              font,
              color: rgb(0.1, 0.1, 0.1),
            })
            currentY -= LINE_HEIGHT
            currentLine = w
          } else {
            currentLine = testLine
          }
        }

        if (currentLine) {
          if (currentY < MARGIN + LINE_HEIGHT) {
            currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
            currentY = PAGE_HEIGHT - MARGIN
          }
          currentPage.drawText(currentLine, {
            x: MARGIN,
            y: currentY,
            size: FONT_SIZE,
            font,
            color: rgb(0.1, 0.1, 0.1),
          })
          currentY -= LINE_HEIGHT * 1.3
        }

        setProgress(Math.round(50 + (pIdx / paragraphs.length) * 45))
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
      description="Ubah file dokumen Microsoft Word (.docx) menjadi file PDF berkualitas standar langsung di browser."
    >
      <DropZone
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onFiles={handleFile}
        label="Pilih file Word (.docx)"
        hint="Mendukung file dokumen .docx"
      />

      {file && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[--color-text] truncate">{file.name}</span>
            <span className="shrink-0 text-[--color-text-3] ml-2">{fmtBytes(file.size)}</span>
          </div>

          <div className="flex items-center gap-2 rounded border border-[--color-border] bg-[--color-surface-2] p-2.5 text-xs text-[--color-text-2]">
            <FileType size={16} className="shrink-0 text-[--color-brand]" />
            <span>
              Dokumen akan diproses dan di-render ke format PDF A4 standar secara 100% offline di browser Anda.
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
