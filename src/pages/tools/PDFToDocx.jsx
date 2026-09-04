import { useState } from 'react'
import { Loader2, FileText, FileCode2, ArrowRight } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import ProgressBar from '../../components/ProgressBar'
import { fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'
import { pdfToHtml } from '../../utils/pdfToHtml'
import { htmlToDocx } from '../../utils/htmlToDocx'
import { BTN_CARD_ACTIVE, BTN_CARD_INACTIVE } from '../../utils/activeButtonStyles'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export default function PDFToDocx() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [includeImage, setIncludeImage] = useState(true)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null) // { blob, fileName, mime, kind }
  const [error, setError] = useState('')

  const handleFile = ([f]) => { setFile(f); setResult(null); setError(''); setProgress(0) }

  const convert = async () => {
    if (!file) return
    setProcessing(true); setError(''); setProgress(0); setResult(null)
    try {
      const base = stripExt(file.name)

      // Step 1: PDF → HTML (1:1)
      setProgressText('Langkah 1/2 — PDF → HTML (ekstraksi posisi & font 1:1)…')
      const { pages, html } = await pdfToHtml(file, (pct, txt) => {
        setProgress(Math.round(pct * 0.5))
        setProgressText(txt)
      }, { includeImage })

      // Step 2: HTML → DOCX (1:1)
      setProgressText('Langkah 2/2 — HTML → Word (.docx) 1:1…')
      const blob = await htmlToDocx(pages, {
        includeImage,
        onProgress: (pct, txt) => {
          setProgress(50 + Math.round(pct * 0.5))
          setProgressText(txt)
        },
      })

      setProgress(100)
      setProgressText('Selesai.')
      setResult({
        blob,
        fileName: `${base}.docx`,
        mime: DOCX_MIME,
        kind: 'docx',
        html,
        htmlName: `${base}.html`,
      })
    } catch (e) {
      setError(`Gagal konversi: ${e?.message || String(e)}`)
    } finally {
      setProcessing(false)
    }
  }

  const base = file ? stripExt(file.name) : 'document'

  return (
    <ToolShell title="PDF → Word (.docx)" description="PDF menjadi Word 1:1 lewat alur dua tahap PDF → HTML → DOCX — posisi, ukuran & jenis huruf terjaga presisi, diproses sepenuhnya lokal.">
      <DropZone accept=".pdf,application/pdf" onFiles={handleFile} label="Pilih file PDF untuk diubah ke Word" />
      {file && <FilePreview file={file} />}

      {/* Flow explanation + options */}
      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-(--color-text)">
          <FileText size={15} className="text-(--color-brand)" />
          <span>PDF</span>
          <ArrowRight size={14} className="text-(--color-text-3)" />
          <FileCode2 size={15} className="text-(--color-brand)" />
          <span>HTML (1:1)</span>
          <ArrowRight size={14} className="text-(--color-text-3)" />
          <FileText size={15} className="text-(--color-brand)" />
          <span>Word (.docx) 1:1</span>
        </div>

        <label className="flex items-center gap-2 text-xs text-(--color-text-2) cursor-pointer select-none">
          <input type="checkbox" checked={includeImage} onChange={(e) => setIncludeImage(e.target.checked)} className="accent-(--color-brand)" />
          Sertakan gambar latar per halaman (presisi visual penuh)
        </label>

        <div className="flex items-start gap-2 rounded-lg border border-(--color-border) bg-(--color-surface-2) p-2.5 text-xs text-(--color-text-2)">
          <FileCode2 size={16} className="shrink-0 text-(--color-brand) mt-0.5" />
          <span>
            Alur <code className="font-mono text-(--color-text)">PDF → HTML → DOCX</code>. Tahap pertama membongkar struktur PDF menjadi
            lapisan teks berposisi (x,y, ukuran, jenis huruf) + raster latar. Tahap kedua menempatkan tiap baris teks ke
            <code className="font-mono text-(--color-text)"> w:framePr</code> Word pada koordinat yang sama persis, dengan gambar latar
            mengambang di belakang teks — hasil mendekati 1:1 tanpa bergantung server.
          </span>
        </div>
      </div>

      {file && (
        <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3 flex items-center justify-between text-xs">
          <span className="font-medium text-(--color-text) truncate">{file.name}</span>
          <span className="shrink-0 text-(--color-text-3) ml-2">{fmtBytes(file.size)}</span>
        </div>
      )}

      {processing && (
        <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4 space-y-2 animate-fade-in">
          <ProgressBar value={progress} label={progressText} />
        </div>
      )}

      {error && <p className="rounded border border-(--color-danger-light) bg-(--color-danger-light) px-3 py-2 text-sm text-(--color-danger) animate-fade-in">{error}</p>}

      {file && !result && !processing && (
        <button onClick={convert} disabled={processing} className={`flex w-full items-center justify-center gap-2 rounded px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.99] disabled:opacity-60 ${processing ? BTN_CARD_INACTIVE : BTN_CARD_ACTIVE}`}>
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Mengonversi…' : 'Konversi (PDF → HTML → DOCX)'}
        </button>
      )}

      {result && result.kind === 'docx' && (
        <div className="space-y-3">
          <ResultCard
            fileName={result.fileName}
            blob={result.blob}
            extraInfo={fmtBytes(result.blob.size)}
            outputMimeType={DOCX_MIME}
            sourceRoute="pdf-to-docx"
            onReset={() => { setResult(null); setFile(null); setProgress(0) }}
          />
          {result.html && (
            <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-(--color-text)">Langkah antara: HTML 1:1</p>
                <p className="text-[11px] text-(--color-text-3) truncate">{result.htmlName}</p>
              </div>
              <button
                onClick={() => {
                  const blob = new Blob([result.html], { type: 'text/html' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = result.htmlName
                  a.click()
                  setTimeout(() => URL.revokeObjectURL(url), 10000)
                }}
                className="shrink-0 rounded-lg border border-(--color-border) px-3 py-2 text-xs font-medium text-(--color-text-2) hover:bg-(--color-surface-3) transition-colors"
              >
                Unduh HTML 1:1
              </button>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  )
}