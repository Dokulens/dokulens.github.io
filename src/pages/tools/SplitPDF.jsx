import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { Loader2, Download } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

export default function SplitPDF() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [pageCount, setPageCount] = useState(0)
  const [mode, setMode] = useState('all') // 'all' | 'range'
  const [rangeInput, setRangeInput] = useState('')
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState([]) // [{name, blob}]
  const [error, setError] = useState('')

  const loadFile = async ([f]) => {
    setFile(f)
    setResults([])
    setError('')
    try {
      const buf = await readAsArrayBuffer(f)
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true })
      setPageCount(doc.getPageCount())
    } catch {
      setError('Gagal membaca PDF.')
    }
  }

  const parseRanges = (input, total) => {
    const groups = []
    const parts = input.split(',').map((s) => s.trim()).filter(Boolean)
    for (const part of parts) {
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(Number)
        if (!a || !b || a < 1 || b > total || a > b) return null
        groups.push({ label: `hal${a}-${b}`, pages: Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i) })
      } else {
        const n = Number(part)
        if (!n || n < 1 || n > total) return null
        groups.push({ label: `hal${n}`, pages: [n - 1] })
      }
    }
    return groups.length ? groups : null
  }

  const split = async () => {
    if (!file) return
    setProcessing(true)
    setError('')
    try {
      const buf = await readAsArrayBuffer(file)
      const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true })
      const base = stripExt(file.name)

      let groups
      if (mode === 'all') {
        groups = srcDoc.getPageIndices().map((i) => ({ label: `hal${i + 1}`, pages: [i] }))
      } else {
        groups = parseRanges(rangeInput, pageCount)
        if (!groups) { setError('Format range tidak valid. Contoh: 1-3, 5, 7-9'); setProcessing(false); return }
      }

      if (groups.length === 1) {
        // single output → direct download
        const newDoc = await PDFDocument.create()
        const copied = await newDoc.copyPages(srcDoc, groups[0].pages)
        copied.forEach((p) => newDoc.addPage(p))
        const bytes = await newDoc.save()
        setResults([{ name: `${base}_${groups[0].label}.pdf`, blob: new Blob([bytes], { type: 'application/pdf' }) }])
      } else {
        // multiple outputs → zip
        const zip = new JSZip()
        for (const g of groups) {
          const newDoc = await PDFDocument.create()
          const copied = await newDoc.copyPages(srcDoc, g.pages)
          copied.forEach((p) => newDoc.addPage(p))
          const bytes = await newDoc.save()
          zip.file(`${base}_${g.label}.pdf`, bytes)
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        setResults([{ name: `${base}_split.zip`, blob: zipBlob }])
      }
    } catch (e) {
      setError(`Gagal: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <ToolShell
      title="Split PDF"
      description="Pisahkan halaman PDF menjadi file-file terpisah."
    >
      <DropZone accept=".pdf,application/pdf" onFiles={loadFile} label="Pilih file PDF" />

      {file && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3">
          <p className="text-sm font-medium text-[--color-text]">{file.name} — {pageCount} halaman</p>

          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} />
              Pisah semua halaman
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={mode === 'range'} onChange={() => setMode('range')} />
              Pisah per range
            </label>
          </div>

          {mode === 'range' && (
            <div>
              <input
                type="text"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                placeholder="Contoh: 1-3, 5, 7-9"
                className="w-full rounded border border-[--color-border] px-3 py-2 text-sm outline-none focus:border-[--color-brand]"
              />
              <p className="mt-1 text-xs text-[--color-text-3]">Pisahkan range dengan koma</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger]">{error}</p>}

      {file && !results.length && (
        <button
          onClick={split}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-colors"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Memproses…' : 'Pisahkan'}
        </button>
      )}

      {results.map((r) => (
        <div key={r.name} className="rounded-lg border border-[--color-success-light] bg-[--color-success-light] p-4">
          <p className="text-sm font-semibold text-[--color-success]">✓ Selesai</p>
          <p className="mt-0.5 text-sm text-[--color-text-2]">{r.name} — {fmtBytes(r.blob.size)}</p>
          <a
            href={URL.createObjectURL(r.blob)}
            download={r.name}
            className="mt-3 flex items-center justify-center gap-2 rounded bg-[--color-success] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity no-underline"
          >
            <Download size={16} />Download
          </a>
        </div>
      ))}
    </ToolShell>
  )
}
