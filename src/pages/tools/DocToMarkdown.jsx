import { useState } from 'react'
import mammoth from 'mammoth'
import { FileDown, Loader2, FileText, Copy, Check, FileCode2 } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import FilePreview from '../../components/FilePreview'
import ProgressBar from '../../components/ProgressBar'
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
      let headerSet = false
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
        headerSet = true
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
async function pdfToMd(file) {
  const buf = await readAsArrayBuffer(file)
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
  const total = doc.numPages
  const parts = []
  for (let i = 1; i <= total; i++) {
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
      parts.push(`<!-- halaman ${i}: tidak dapat diekstrak (kemungkinan hasil scan/gambar) -->`)
      continue
    }
    const items = tc.items
      .filter((t) => t.str?.trim())
      .map((t) => ({ text: t.str, x: t.transform[4], y: t.transform[5], w: t.width || 0 }))
    if (!items.length) {
      parts.push(`<!-- halaman ${i}: tanpa teks (gambar/scan) -->`)
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

export default function DocToMarkdown() {
  const [file, setFile] = useState(null)
  useIncomingFile((f) => setFile(f))
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [md, setMd] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const handleFile = ([f]) => { setFile(f); setMd(''); setError(''); setCopied(false) }

  const detectKind = (name) => {
    const n = name.toLowerCase()
    if (n.endsWith('.docx')) return 'docx'
    if (n.endsWith('.pdf')) return 'pdf'
    if (n.endsWith('.txt') || n.endsWith('.md')) return 'txt'
    if (n.endsWith('.doc')) return 'doc'
    return ''
  }

  const convert = async () => {
    if (!file) return
    const kind = detectKind(file.name)
    if (!kind) { setError('Format tidak didukung. Terima .docx, .pdf, .txt'); return }
    setProcessing(true); setError(''); setProgress(0)
    try {
      setProgressText('Mengonversi ke Markdown…')
      setProgress(20)
      let out
      if (kind === 'docx') out = await docxToMd(file)
      else if (kind === 'pdf') out = await pdfToMd(file)
      else if (kind === 'txt') out = await txtToMd(file)
      else throw new Error('.doc lama belum didukung — simpan sebagai .docx dulu')
      setProgress(90)
      setMd(out.md)
      setProgress(100)
      setProgressText('Selesai')
    } catch (e) {
      setError(`Gagal konversi: ${e.message}`)
    } finally { setProcessing(false) }
  }

  const downloadMd = () => {
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${stripExt(file?.name || 'dokumen')}.md`
    a.click()
    URL.revokeObjectURL(url)
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
        accept=".docx,.pdf,.txt,.md,application/pdf,text/plain"
        multiple={false}
        onFiles={handleFile}
        label="Pilih dokumen untuk diubah ke Markdown"
        hint=".docx · .pdf · .txt/.md — kirim hasil langsung ke AI"
      />
      {file && <FilePreview file={file} />}

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
          <div className="rounded-xl border border-(--color-border) bg-(--color-surface) overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-(--color-border) bg-(--color-surface-2) px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-(--color-text-2)">
                <FileCode2 size={14} className="text-(--color-brand)" /> {baseName}.md · {fmtBytes(new Blob([md]).size)}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={copyMd} className="flex items-center gap-1.5 rounded border border-(--color-border) bg-(--color-surface) px-2.5 py-1.5 text-xs font-semibold text-(--color-text-2) hover:bg-(--color-surface-3) transition-colors cursor-pointer">
                  {copied ? <Check size={13} className="text-(--color-success)" /> : <Copy size={13} />} {copied ? 'Tersalin' : 'Salin'}
                </button>
                <button onClick={downloadMd} className="flex items-center gap-1.5 rounded border border-(--color-border) bg-(--color-surface) px-2.5 py-1.5 text-xs font-semibold text-(--color-text-2) hover:bg-(--color-surface-3) transition-colors cursor-pointer">
                  <FileDown size={13} /> Unduh .md
                </button>
              </div>
            </div>
            <pre className="max-h-[420px] overflow-auto p-4 text-xs leading-relaxed text-(--color-text) whitespace-pre-wrap bg-(--color-surface)">{md}</pre>
          </div>
          <button onClick={() => { setMd(''); setFile(null) }} className="w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-sm font-semibold text-(--color-text-2) hover:bg-(--color-surface-3) transition-colors cursor-pointer">
            Konversi file lain
          </button>
        </div>
      )}
    </ToolShell>
  )
}
