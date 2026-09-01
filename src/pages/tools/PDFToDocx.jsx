import { useState } from 'react'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import { Loader2, FileText, CheckCircle2 } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import ProgressBar from '../../components/ProgressBar'
import { pdfjsLib } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

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

      const docSections = []

      for (let i = 1; i <= totalPages; i++) {
        setProgressText(`Mengekstrak teks halaman ${i} dari ${totalPages}…`)
        setProgress(Math.round((i / totalPages) * 75))

        const page = await pdfDoc.getPage(i)
        const textContent = await page.getTextContent()

        // Group text items by roughly their Y coordinate to reconstruct paragraphs
        const lines = []
        let currentLine = []
        let lastY = null

        for (const item of textContent.items) {
          if (!item.str || !item.str.trim()) continue

          const y = Math.round(item.transform[5])
          const fontHeight = Math.abs(item.transform[3]) || 12
          const isBold = (item.fontName || '').toLowerCase().includes('bold')
          const isItalic = (item.fontName || '').toLowerCase().includes('italic')

          if (lastY !== null && Math.abs(y - lastY) > 6) {
            if (currentLine.length) lines.push(currentLine)
            currentLine = []
          }

          currentLine.push({
            text: item.str,
            size: Math.max(16, Math.min(60, Math.round(fontHeight * 2))), // half-points in docx
            bold: isBold,
            italic: isItalic,
          })
          lastY = y
        }
        if (currentLine.length) lines.push(currentLine)

        const paragraphs = lines.map((lineItems) => {
          return new Paragraph({
            spacing: { after: 120, line: 260 },
            children: lineItems.map(
              (item) =>
                new TextRun({
                  text: item.text + ' ',
                  size: item.size,
                  bold: item.bold,
                  italics: item.italic,
                  font: 'Calibri',
                }),
            ),
          })
        })

        docSections.push({
          children: paragraphs.length ? paragraphs : [new Paragraph({ text: '' })],
        })
      }

      setProgressText('Menyusun file Word (.docx)…')
      setProgress(85)

      const docxFile = new Document({
        sections: docSections,
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
      description="Ekstrak teks dan struktur dari file PDF langsung menjadi dokumen Microsoft Word (.docx) yang bisa diedit."
    >
      <DropZone accept=".pdf,application/pdf" onFiles={handleFile} label="Pilih file PDF untuk diubah ke Word" />

      {file && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[--color-text] truncate">{file.name}</span>
            <span className="shrink-0 text-[--color-text-3] ml-2">{fmtBytes(file.size)}</span>
          </div>

          <div className="flex items-center gap-2 rounded border border-[--color-border] bg-[--color-surface-2] p-2.5 text-xs text-[--color-text-2]">
            <FileText size={16} className="shrink-0 text-[--color-brand]" />
            <span>
              Teks, paragraf, dan ukuran font akan diekspor menjadi format .docx standar yang kompatibel dengan Microsoft Word, Google Docs, dan LibreOffice.
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
