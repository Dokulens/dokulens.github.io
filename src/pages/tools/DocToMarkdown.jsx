import { useState } from 'react'
import mammoth from 'mammoth'
import { createWorker } from 'tesseract.js'
import { FileDown, Loader2, Copy, Check, FileCode2, ScanText } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import FilePreview from '../../components/FilePreview'
import ProgressBar from '../../components/ProgressBar'
import DownloadButton from '../../components/DownloadButton'
import { pdfjsLib } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

// HTML → Markdown sederhana (subset hasil mammoth)
function htmlToMarkdown(html) {
  let md = html
    // hapus komentar & tag tak terpakai
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<meta[^>]*>/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // heading
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, c) => `${'#'.repeat(Number(n))} ${cleanInline(c)}\n\n`)
    // tabel (baris utuh → pipe)
    .replace(/<table[\s\S]*?<\/table>/gi, (tbl) => {
      const rows = []
      const trs = tbl.match(/<tr[\s\S]*?<\/tr>/gi) || []
      for (const tr of trs) {
        const tds = tr.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []
        const cells = tds.map((td) => td.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/i, '$1').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim())
        rows.push(cells)
      }
      if (!rows.length) return ''
      const w = Math.max(...rows.map((r) => r.length))
      const out = []
      if (rows[0] && (rows[0].every((c) => c) || rows.length === 1)) {
        out.push(`| ${rows[0].join(' | ')} |`)
        out.push(`| ${Array(w).fill('---').join(' | ')} |`)
        rows.shift()
      } else {
        out.push(`| ${Array(w).fill('---').join(' | ')} |`)
      }
      for (const r of rows) out.push(`| ${Array.from({ length: w }, (_, i) => r[i] || '').join(' | ')} |`)
      return `${out.join('\n')}\n\n`
    })
    // list
    .replace(/<ul[\s\S]*?<\/ul>/gi, (list) => {
      const items = list.match(/<li[\s\S]*?<\/li>/gi) || []
      return items.map((it) => `- ${cleanInline(it.replace(/<\/?li[^>]*>/gi, ''))}`).join('\n') + '\n\n'
    })
    .replace(/<ol[\s\S]*?<\/ol>/gi, (list) => {
      const items = list.match(/<li[\s\S]*?<\/li>/gi) || []
      return items.map((it, i) => `${i + 1}. ${cleanInline(it.replace(/<\/?li[^>]*>/gi, ''))}`).join('\n') + '\n\n'
    })
    // blockquote
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) => c.split('\n').map((l) => `> ${l}`.trim()).join('\n') + '\n\n')
    // code block
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) => `\`\`\`\n${c.replace(/<[^>]+>/g, '')}\n\`\`\`\n\n`)
    // hr
    .replace(/<hr[^>]*>/gi, '\n---\n\n')
    // paragraphs → blank line
    .replace(/<\/p>/gi, '\n\n')
    // br
    .replace(/<br[^>]*>/gi, '\n')
    // div
    .replace(/<\/div>/gi, '\n\n')

  // link & gambar & format pada sisa teks
  md = md.replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
  md = md.replace(/<img [^>]*src="([^"]*)"[^>]*>/gi, '![gambar]($1)')
  md = md.replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
  md = md.replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
  md = md.replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*')
  md = md.replace(/<i>([\s\S]*?)<\/i>/gi, '*$1*')
  md = md.replace(/<u>([\s\S]*?)<\/u>/gi, '$1')
  md = md.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
  md = md.replace(/<[^>]+>/g, '')
  md = cleanInline(md)
  // rapi spasi kosong berlebih
  md = md.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return md + '\n'
}

function cleanInline(s) {
  return s
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<img [^>]*src="([^"]*)"[^>]*>/gi, '![gambar]($1)')
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i>([\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<u>([\s\S]*?)<\/u>/gi, '$1')
    .replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function docxToMd(file) {
  const buf = await readAsArrayBuffer(file)
  const res = await mammoth.convertToHtml({ arrayBuffer: buf })
  return { md: htmlToMarkdown(res.value), ext: 'md', name: 'md' }
}

const Y_TOL = 5
async function pdfPageToPng(page, scale = 2) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/png')
}

// OCR satu halaman/gambar via tesseract.js; cb(logger {status,progress,page})
async function ocrImage(dataUrl, cb) {
  const worker = await createWorker('eng+ind', 1, {
    logger: (m) => cb && cb(m),
  })
  try {
    const { data } = await worker.recognize(dataUrl, {}, { text: true })
    return (data.text || '').trim()
  } finally {
    await worker.terminate()
  }
}

async function pdfToMd(file, ocrEnabled, ocrCb) {
  const buf = await readAsArrayBuffer(file)
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
  const total = doc.numPages
  const parts = []
  for (let i = 1; i <= total; i++) {
    if (ocrCb) ocrCb({ stage: 'page', page: i, total })
    let page
    try {
      page = await doc.getPage(i)
    } catch {
      parts.push(`<!-- halaman ${i}: gagal dibaca -->`)
      continue
    }
    let tc
    try {
      tc = await page.getTextContent()
    } catch {
      tc = null
    }
    const items = (tc?.items || [])
      .filter((t) => t.str?.trim())
      .map((t) => ({ text: t.str, x: t.transform[4], y: t.transform[5], w: t.width || 0 }))
    if (!items.length) {
      if (ocrEnabled) {
        if (ocrCb) ocrCb({ stage: 'ocr', page: i, total })
        try {
          const png = await pdfPageToPng(page)
          const text = await ocrImage(png, (m) => {
            if (m.status === 'recognizing text' && ocrCb) ocrCb({ stage: 'ocr', page: i, total, progress: Math.round(m.progress * 100) })
          })
          parts.push(text || `<!-- halaman ${i}: OCR kosong -->`)
          continue
        } catch (e) {
          parts.push(`<!-- halaman ${i}: OCR gagal (${e.message}) -->`)
          continue
        }
      }
      parts.push(`<!-- halaman ${i}: tanpa teks (gambar/scan) → aktifkan OCR -->`)
      continue
    }
    const sorted = items.sort((a, b) => b.y - a.y || a.x - b.x)
    const lines = []
    let cur = []
    let curY = null
    for (const it of sorted) {
      if (curY === null || Math.abs(it.y - curY) < Y_TOL) { cur.push(it); curY = curY === null ? it.y : (curY + it.y) / 2 }
      else { lines.push([...cur].sort((a, b) => a.x - b.x)); cur = [it]; curY = it.y }
    }
    if (cur.length) lines.push(cur)
    let pageMd = ''
    for (const line of lines) {
      let s = ''
      let prevEnd = null
      for (const it of line) {
        if (prevEnd !== null) {
          const gap = it.x - prevEnd
          if (gap > 30) s += '    '
          else s += ' '
        }
        s += it.text
        prevEnd = it.x + it.w
      }
      pageMd += s.replace(/\s+/g, ' ').trim() + '\n'
    }
    parts.push(pageMd.trim())
  }
  return { md: parts.join('\n\n---\n\n'), ext: 'md', name: 'md', pages: total }
}

async function txtToMd(file) {
  const text = await file.text()
  return { md: text.replace(/\r\n/g, '\n').trim() + '\n', ext: 'md', name: 'md' }
}

async function imgToMd(file) {
  const url = URL.createObjectURL(file)
  const text = await ocrImage(url)
  URL.revokeObjectURL(url)
  return { md: (text || '').trim() + '\n', ext: 'md', name: 'md' }
}

export default function DocToMarkdown() {
  const [file, setFile] = useState(null)
  useIncomingFile((f) => setFile(f))
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [md, setMd] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [ocrEnabled, setOcrEnabled] = useState(true)

  const handleFile = ([f]) => { setFile(f); setMd(''); setError(''); setCopied(false) }

  const detectKind = (name, type = '') => {
    const n = name.toLowerCase()
    if (n.endsWith('.docx')) return 'docx'
    if (n.endsWith('.pdf')) return 'pdf'
    if (n.endsWith('.txt') || n.endsWith('.md')) return 'txt'
    if (type.startsWith('image/')) return 'img'
    if (n.endsWith('.doc')) return 'doc'
    return ''
  }

  const convert = async () => {
    if (!file) return
    const kind = detectKind(file.name, file.type)
    if (!kind) { setError('Format tidak didukung. Terima .docx, .pdf, .txt, atau gambar (OCR)'); return }
    setProcessing(true); setError(''); setProgress(0)
    try {
      setProgressText('Mengonversi ke Markdown…')
      setProgress(10)
      let out
      if (kind === 'docx') out = await docxToMd(file)
      else if (kind === 'pdf') {
        setProgressText('Membaca halaman PDF…')
        setProgress(15)
        out = await pdfToMd(file, ocrEnabled, ({ stage, page, total, progress: p }) => {
          if (stage === 'ocr') { setProgressText(`OCR halaman ${page}/${total}…`); if (p != null) setProgress(15 + Math.round((p / 100) * 70)) }
          else { setProgressText(`Membaca halaman ${page}/${total}…`); setProgress(Math.round((page / total) * 30)) }
        })
      }
      else if (kind === 'txt') out = await txtToMd(file)
      else if (kind === 'img') {
        setProgressText('OCR gambar…')
        setProgress(20)
        out = await imgToMd(file)
      }
      else throw new Error('.doc lama belum didukung — simpan sebagai .docx dulu')
      setProgress(95)
      setMd(out.md)
      setProgress(100)
      setProgressText('Selesai')
    } catch (e) {
      setError(`Gagal konversi: ${e.message}`)
    } finally { setProcessing(false) }
  }

  const copyMd = async () => {
    try { await navigator.clipboard.writeText(md); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch {}
  }

  const baseName = file ? stripExt(file.name) : 'dokumen'

  return (
    <ToolShell
      title="Dokumen → Markdown"
      description="Ubah DOCX, PDF, atau TXT menjadi Markdown (.md) yang rapi — siap untuk disalin atau dikirim ke AI."
    >
      <DropZone
        accept=".docx,.pdf,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,text/plain,image/*"
        multiple={false}
        onFiles={handleFile}
        label="Pilih dokumen untuk diubah ke Markdown"
        hint=".docx · .pdf · .txt/.md · Gambar (OCR)"
      />
      {file && file.type?.startsWith('image/') && (
        <p className="rounded-lg border border-(--color-border) bg-(--color-surface-2) p-2.5 text-xs text-(--color-text-2)">
          <ScanText size={13} className="mr-1 inline text-(--color-brand)" />
          Gambar akan diproses dengan OCR (pengenalan teks) → Markdown.
        </p>
      )}
      {file && <FilePreview file={file} />}

      {file && !md && (
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-(--color-text-2) select-none">
          <input type="checkbox" checked={ocrEnabled} onChange={(e) => setOcrEnabled(e.target.checked)} className="accent-(--color-brand) cursor-pointer" />
          <ScanText size={13} className="text-(--color-brand)" /> OCR halaman PDF hasil scan/gambar
        </label>
      )}

      {file && !md && (
        <button
          onClick={convert}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-(--color-brand) px-4 py-2.5 text-sm font-bold text-white hover:bg-(--color-brand-hover) disabled:opacity-60 transition-all active:scale-[0.99]"
        >
          {processing ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
          {processing ? 'Mengonversi…' : 'Konversi ke Markdown'}
        </button>
      )}

      {processing && (
        <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4 space-y-2">
          <ProgressBar value={progress} label={progressText} />
        </div>
      )}

      {error && <p className="rounded border border-(--color-danger-light) bg-(--color-danger-light) px-3 py-2 text-sm text-(--color-danger)">{error}</p>}

      {md && (
        <div className="space-y-3">
          <div className="overflow-visible rounded-lg border border-(--color-success-light) bg-(--color-success-light)">
            <div className="flex items-center justify-between gap-2 rounded-t-xl border-b border-(--color-border) bg-(--color-surface) px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-(--color-success)">
                <FileCode2 size={14} /> ✓ Selesai — {baseName}.md · {fmtBytes(new Blob([md]).size)}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={copyMd} className="flex items-center gap-1.5 rounded border border-(--color-border) bg-(--color-surface) px-2.5 py-1.5 text-xs font-semibold text-(--color-text-2) hover:bg-(--color-surface-3) transition-colors cursor-pointer">
                  {copied ? <Check size={13} className="text-(--color-success)" /> : <Copy size={13} />} {copied ? 'Tersalin' : 'Salin'}
                </button>
                <DownloadButton
                  blob={new Blob([md], { type: 'text/markdown;charset=utf-8' })}
                  fileName={`${baseName}.md`}
                  className="flex items-center gap-1.5 rounded bg-(--color-success) px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <FileDown size={13} /> Unduh .md
                </DownloadButton>
              </div>
            </div>
            <pre className="max-h-[420px] overflow-auto rounded-b-xl bg-(--color-surface) p-4 text-xs leading-relaxed whitespace-pre-wrap text-(--color-text)">{md}</pre>
          </div>
          <button onClick={() => { setMd(''); setFile(null) }} className="w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-sm font-semibold text-(--color-text-2) hover:bg-(--color-surface-3) transition-colors cursor-pointer">
            Konversi file lain
          </button>
        </div>
      )}
    </ToolShell>
  )
}
