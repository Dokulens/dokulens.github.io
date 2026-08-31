import { useState, useRef, useEffect } from 'react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import {
  FileText, ChevronLeft, ChevronRight, Hash,
  Sparkles, Sliders, Loader2, Check, RefreshCw,
  Move, ShieldCheck
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import ProgressBar from '../../components/ProgressBar'
import { pdfjsLib, renderPageToDataUrl, extractPageTextItems } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'

const FONT_OPTIONS = [
  { id: 'Helvetica', label: 'Helvetica / Arial (Standard Modern)', ref: StandardFonts.Helvetica, boldRef: StandardFonts.HelveticaBold },
  { id: 'TimesRoman', label: 'Times Roman (Formal / Skripsi / Jurnal)', ref: StandardFonts.TimesRoman, boldRef: StandardFonts.TimesRomanBold },
  { id: 'Courier', label: 'Courier (Monospace / Ketikan Mesin)', ref: StandardFonts.Courier, boldRef: StandardFonts.CourierBold },
]

const FORMAT_TEMPLATES = [
  { id: 'num', label: '1, 2, 3...', template: '{n}' },
  { id: 'dash', label: '- 1 -, - 2 -...', template: '- {n} -' },
  { id: 'hal_n', label: 'Hal 1, Hal 2...', template: 'Hal {n}' },
  { id: 'hal_total', label: 'Hal 1 dari 10...', template: 'Hal {n} dari {total}' },
  { id: 'page_total', label: 'Page 1 of 10...', template: 'Page {n} of {total}' },
  { id: 'custom', label: 'Kustom Template...', template: '{n}' },
]

const POSITION_PRESETS = [
  { id: 'bottom-center', label: 'Tengah Bawah', xPct: 50, yPct: 95, align: 'center', desc: 'Standar Skripsi / Laporan' },
  { id: 'bottom-right', label: 'Kanan Bawah', xPct: 92, yPct: 95, align: 'right', desc: 'Standar Dokumen Bisnis' },
  { id: 'bottom-left', label: 'Kiri Bawah', xPct: 8, yPct: 95, align: 'left', desc: 'Margin Kiri' },
  { id: 'top-center', label: 'Tengah Atas', xPct: 50, yPct: 5, align: 'center', desc: 'Header Tengah' },
  { id: 'top-right', label: 'Kanan Atas', xPct: 92, yPct: 5, align: 'right', desc: 'Header Kanan' },
  { id: 'top-left', label: 'Kiri Atas', xPct: 8, yPct: 5, align: 'left', desc: 'Header Kiri' },
]

export default function AddPageNumber() {
  const [file, setFile] = useState(null)
  const [fileType, setFileType] = useState('pdf') // 'pdf' | 'docx'
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pagePreview, setPagePreview] = useState(null) // { dataUrl, width, height }

  // Numbering Settings
  const [positionPreset, setPositionPreset] = useState('bottom-center')
  const [customX, setCustomX] = useState(50) // %
  const [customY, setCustomY] = useState(95) // %
  const [formatId, setFormatId] = useState('num')
  const [customTemplate, setCustomTemplate] = useState('{n}')
  const [fontFamily, setFontFamily] = useState('TimesRoman')
  const [fontSize, setFontSize] = useState(11)
  const [fontColor, setFontColor] = useState('#000000')
  const [isBold, setIsBold] = useState(false)
  const [startNumber, setStartNumber] = useState(1)
  const [skipFirstPage, setSkipFirstPage] = useState(true) // Cover page skip
  const [pageRangeMode, setPageRangeMode] = useState('all') // 'all' | 'except-first' | 'range'
  const [customRange, setCustomRange] = useState('')
  const [perPageOverrides, setPerPageOverrides] = useState({}) // { [page]: { enabled: boolean, xPct, yPct, template } }

  // Auto-detection state
  const [detectedPosition, setDetectedPosition] = useState(null)
  const [isDetecting, setIsDetecting] = useState(false)

  const [loadingPreview, setLoadingPreview] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [resultBlob, setResultBlob] = useState(null)
  const [error, setError] = useState('')

  const pdfDocRef = useRef(null)

  const handleFile = async ([f]) => {
    setFile(f)
    setResultBlob(null)
    setError('')
    setCurrentPage(1)
    setPerPageOverrides({})
    setDetectedPosition(null)

    const isDocx = f.name.toLowerCase().endsWith('.docx')
    setFileType(isDocx ? 'docx' : 'pdf')

    if (!isDocx) {
      setLoadingPreview(true)
      try {
        const buf = await readAsArrayBuffer(f)
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) })
        const doc = await loadingTask.promise
        pdfDocRef.current = doc
        setTotalPages(doc.numPages)
        await loadPreview(doc, 1)

        // Run auto-detection for existing page numbers
        autoDetectExistingPageNumber(doc)
      } catch (e) {
        setError(`Gagal memuat PDF: ${e.message}`)
      } finally {
        setLoadingPreview(false)
      }
    } else {
      setTotalPages(1)
    }
  }

  const loadPreview = async (doc, pageNum) => {
    setLoadingPreview(true)
    try {
      const data = await renderPageToDataUrl(doc, pageNum, 1.2)
      setPagePreview(data)
    } catch (e) {
      setError(`Gagal merender halaman: ${e.message}`)
    } finally {
      setLoadingPreview(false)
    }
  }

  const changePage = async (delta) => {
    const target = currentPage + delta
    if (target < 1 || target > totalPages || !pdfDocRef.current) return
    setCurrentPage(target)
    await loadPreview(pdfDocRef.current, target)
  }

  // Detect if document already contains page numbers at margins
  const autoDetectExistingPageNumber = async (doc) => {
    setIsDetecting(true)
    try {
      const checkPages = Math.min(3, doc.numPages)
      for (let p = 1; p <= checkPages; p++) {
        const items = await extractPageTextItems(doc, p, 1.0)
        for (const item of items) {
          const str = item.text.trim()
          if (/^(\d+|hal\s*\d+|page\s*\d+|\-\s*\d+\s*\-)$/i.test(str)) {
            if (item.yPct > 85) {
              if (Math.abs(item.xPct - 50) < 15) {
                setDetectedPosition({ preset: 'bottom-center', text: str, page: p })
                return
              } else if (item.xPct > 75) {
                setDetectedPosition({ preset: 'bottom-right', text: str, page: p })
                return
              } else if (item.xPct < 25) {
                setDetectedPosition({ preset: 'bottom-left', text: str, page: p })
                return
              }
            } else if (item.yPct < 15) {
              if (item.xPct > 75) {
                setDetectedPosition({ preset: 'top-right', text: str, page: p })
                return
              }
            }
          }
        }
      }
    } catch {
      // Ignore detection errors
    } finally {
      setIsDetecting(false)
    }
  }

  const applyDetectedPosition = () => {
    if (detectedPosition) {
      setPositionPreset(detectedPosition.preset)
      const p = POSITION_PRESETS.find((pr) => pr.id === detectedPosition.preset)
      if (p) {
        setCustomX(p.xPct)
        setCustomY(p.yPct)
      }
    }
  }

  const selectPreset = (presetId) => {
    setPositionPreset(presetId)
    const p = POSITION_PRESETS.find((pr) => pr.id === presetId)
    if (p) {
      setCustomX(p.xPct)
      setCustomY(p.yPct)
    }
  }

  const getPageNumberText = (pageIdx, total) => {
    const num = pageIdx - (skipFirstPage ? 1 : 0) + startNumber - 1 + 1
    const tpl = formatId === 'custom' ? customTemplate : (FORMAT_TEMPLATES.find((f) => f.id === formatId)?.template || '{n}')
    return tpl.replace('{n}', num).replace('{total}', total)
  }

  const isPageIncluded = (page) => {
    if (perPageOverrides[page]?.enabled === false) return false
    if (perPageOverrides[page]?.enabled === true) return true

    if (pageRangeMode === 'except-first' || skipFirstPage) {
      return page > 1
    }
    if (pageRangeMode === 'range' && customRange) {
      const parts = customRange.split(',').map((s) => s.trim())
      for (const part of parts) {
        if (part.includes('-')) {
          const [a, b] = part.split('-').map(Number)
          if (page >= a && page <= b) return true
        } else if (Number(part) === page) {
          return true
        }
      }
      return false
    }
    return true
  }

  const toggleCurrentPageOverride = () => {
    setPerPageOverrides((prev) => ({
      ...prev,
      [currentPage]: {
        ...prev[currentPage],
        enabled: prev[currentPage]?.enabled !== undefined ? !prev[currentPage].enabled : !isPageIncluded(currentPage),
      },
    }))
  }

  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    return { r, g, b }
  }

  const processPageNumbering = async () => {
    if (!file) return
    setProcessing(true)
    setError('')

    try {
      const arrayBuf = await readAsArrayBuffer(file)
      const doc = await PDFDocument.load(arrayBuf, { ignoreEncryption: true })

      const fontObj = FONT_OPTIONS.find((f) => f.id === fontFamily) || FONT_OPTIONS[0]
      const font = await doc.embedFont(isBold ? fontObj.boldRef : fontObj.ref)
      const color = hexToRgb(fontColor)

      const pages = doc.getPages()
      const total = pages.length

      for (let i = 0; i < total; i++) {
        const pageNum = i + 1
        if (!isPageIncluded(pageNum)) continue

        const page = pages[i]
        const { width: pWidth, height: pHeight } = page.getSize()

        const numText = getPageNumberText(i + 1, total)
        const textWidth = font.widthOfTextAtSize(numText, fontSize)
        const textHeight = font.heightAtSize(fontSize)

        let targetX = (customX / 100) * pWidth
        let targetY = pHeight - (customY / 100) * pHeight

        if (positionPreset.includes('center')) {
          targetX -= textWidth / 2
        } else if (positionPreset.includes('right')) {
          targetX -= textWidth
        }

        page.drawText(numText, {
          x: targetX,
          y: targetY,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
        })
      }

      const bytes = await doc.save()
      setResultBlob(new Blob([bytes], { type: 'application/pdf' }))
    } catch (e) {
      setError(`Gagal memproses penomoran: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const currentIncluded = isPageIncluded(currentPage)
  const previewNumText = getPageNumberText(currentPage, totalPages)
  const base = file ? stripExt(file.name) : 'document'

  return (
    <ToolShell
      title="Tambah Nomor Halaman (Page Number)"
      description="Beri nomor halaman otomatis pada PDF & Dokumen. Dilengkapi deteksi posisi otomatis, penempatan tengah bawah satu klik, pilihan font resmi, dan kustomisasi per halaman."
    >
      <DropZone
        accept=".pdf,application/pdf"
        onFiles={handleFile}
        label="Pilih file PDF untuk diberi nomor halaman"
        hint="PDF — deteksi & atur posisi nomor halaman"
      />

      {file && (
        <div className="space-y-4 animate-fade-in">
          {/* Detected Position Banner */}
          {detectedPosition && (
            <div className="flex items-center justify-between rounded-lg border border-[--color-brand] bg-[--color-brand-light] p-3 text-xs animate-fade-in">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="shrink-0 text-[--color-brand]" />
                <span className="text-[--color-brand-text]">
                  <strong>Nomor Halaman Terdeteksi:</strong> Ditemukan pola &quot;{detectedPosition.text}&quot; di posisi <strong>{POSITION_PRESETS.find(p => p.id === detectedPosition.preset)?.label}</strong>.
                </span>
              </div>
              <button
                onClick={applyDetectedPosition}
                className="shrink-0 rounded bg-[--color-brand] px-2.5 py-1 font-bold text-white hover:bg-[--color-brand-hover] transition-colors"
              >
                Gunakan Posisi Ini
              </button>
            </div>
          )}

          {/* Settings Grid */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4">
            {/* Presets Button Row */}
            <div>
              <label className="block mb-2 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                Posisi Nomor Halaman
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {POSITION_PRESETS.map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => selectPreset(pos.id)}
                    className={[
                      'flex flex-col items-center justify-center rounded border p-2.5 text-xs text-center transition-all',
                      positionPreset === pos.id
                        ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand-text] font-bold shadow-xs'
                        : 'border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3]',
                    ].join(' ')}
                  >
                    <span>{pos.label}</span>
                    <span className="text-[10px] opacity-75 font-normal">{pos.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font & Template Configuration */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 border-t border-[--color-border] pt-4">
              <div>
                <label className="block mb-1 text-xs font-semibold text-[--color-text-2]">
                  Keluarga Font
                </label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-1.5 text-xs outline-none focus:border-[--color-brand]"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-1 text-xs font-semibold text-[--color-text-2]">
                  Format Penomoran
                </label>
                <select
                  value={formatId}
                  onChange={(e) => setFormatId(e.target.value)}
                  className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-1.5 text-xs outline-none focus:border-[--color-brand]"
                >
                  {FORMAT_TEMPLATES.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-1 text-xs font-semibold text-[--color-text-2]">
                  Mulai dari Angka
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={startNumber}
                  onChange={(e) => setStartNumber(Number(e.target.value))}
                  className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-1.5 text-xs outline-none focus:border-[--color-brand]"
                />
              </div>
            </div>

            {/* Font Styling Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-[--color-border] pt-3">
              <div>
                <label className="block mb-1 text-xs font-semibold text-[--color-text-2]">
                  Ukuran: {fontSize}pt
                </label>
                <input
                  type="range"
                  min="8"
                  max="24"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block mb-1 text-xs font-semibold text-[--color-text-2]">
                  Warna Teks
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={fontColor}
                    onChange={(e) => setFontColor(e.target.value)}
                    className="h-7 w-10 cursor-pointer rounded border border-[--color-border]"
                  />
                  <span className="font-mono text-xs text-[--color-text-3] uppercase">{fontColor}</span>
                </div>
              </div>

              <div className="flex items-end pb-1">
                <label className="flex items-center gap-1.5 text-xs text-[--color-text-2] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isBold}
                    onChange={(e) => setIsBold(e.target.checked)}
                  />
                  <span>Teks Tebal (Bold)</span>
                </label>
              </div>

              <div className="flex items-end pb-1">
                <label className="flex items-center gap-1.5 text-xs text-[--color-text-2] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipFirstPage}
                    onChange={(e) => setSkipFirstPage(e.target.checked)}
                  />
                  <span>Lewati Halaman Cover (Hal 1)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Interactive Document Page Preview */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3">
            {/* Page Navigation Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => changePage(-1)}
                  disabled={currentPage <= 1 || loadingPreview}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3] disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="font-bold text-[--color-text]">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <button
                  onClick={() => changePage(1)}
                  disabled={currentPage >= totalPages || loadingPreview}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3] disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-[--color-text-3]">
                  Status Halaman Ini:
                </span>
                <button
                  type="button"
                  onClick={toggleCurrentPageOverride}
                  className={[
                    'rounded border px-2.5 py-1 text-xs font-semibold transition-colors',
                    currentIncluded
                      ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400',
                  ].join(' ')}
                >
                  {currentIncluded ? '✓ Diberi Nomor' : '✕ Dilewati (Tanpa Nomor)'}
                </button>
              </div>
            </div>

            {/* Live Document Preview with simulated Number Tag */}
            <div className="relative flex justify-center rounded border border-[--color-border] bg-[--color-surface-2] p-4 overflow-auto min-h-[380px]">
              {loadingPreview && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-[--color-surface]/70 backdrop-blur-xs">
                  <Loader2 size={24} className="animate-spin text-[--color-brand]" />
                </div>
              )}

              {pagePreview && (
                <div className="relative inline-block border border-[--color-border] shadow-xs select-none bg-white">
                  <img
                    src={pagePreview.dataUrl}
                    alt={`Page ${currentPage}`}
                    className="block max-h-[500px] w-auto pointer-events-none"
                  />

                  {/* Simulated Live Number Overlay Tag */}
                  {currentIncluded && (
                    <div
                      className="absolute rounded bg-blue-500/10 border border-blue-500/60 px-1 py-0.5 pointer-events-none transition-all duration-150"
                      style={{
                        left: `${customX}%`,
                        top: `${customY}%`,
                        transform: positionPreset.includes('center') ? 'translate(-50%, -50%)' : positionPreset.includes('right') ? 'translate(-100%, -50%)' : 'translate(0%, -50%)',
                        color: fontColor,
                        fontSize: `${fontSize}px`,
                        fontWeight: isBold ? 'bold' : 'normal',
                        fontFamily: fontFamily === 'TimesRoman' ? 'Times New Roman, serif' : fontFamily === 'Courier' ? 'Courier, monospace' : 'Arial, sans-serif',
                      }}
                    >
                      {previewNumText}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger] animate-fade-in">
              {error}
            </p>
          )}

          {/* Action button */}
          {!resultBlob && (
            <button
              onClick={processPageNumbering}
              disabled={processing}
              className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-all active:scale-[0.99]"
            >
              {processing && <Loader2 size={16} className="animate-spin" />}
              {processing ? 'Menyematkan Nomor Halaman…' : 'Simpan & Terapkan Nomor Halaman'}
            </button>
          )}

          {resultBlob && (
            <ResultCard
              fileName={`${base}_numbered.pdf`}
              blob={resultBlob}
              extraInfo={`Nomor halaman berhasil disematkan — ${fmtBytes(resultBlob.size)}`}
              onReset={() => {
                setResultBlob(null)
                setFile(null)
              }}
            />
          )}
        </div>
      )}
    </ToolShell>
  )
}
