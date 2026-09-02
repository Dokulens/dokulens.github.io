import { useState, useRef } from 'react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import mammoth from 'mammoth'
import {
  FileText, ChevronLeft, ChevronRight, Hash,
  Sparkles, Sliders, Loader2, Check, RefreshCw,
  ShieldCheck, FileType
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import ProgressBar from '../../components/ProgressBar'
import { pdfjsLib, renderPageToDataUrl, extractPageTextItems } from '../../utils/pdfRender'
import { addPageNumberToDocx } from '../../utils/docxNumbering'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

function toRoman(num, isUpper = true) {
  if (num <= 0) return String(num)
  const lookup = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let roman = ''
  let n = num
  for (const [value, char] of lookup) {
    while (n >= value) {
      roman += char
      n -= value
    }
  }
  return isUpper ? roman : roman.toLowerCase()
}

const FONT_OPTIONS = [
  { id: 'Calibri', label: 'Calibri (Standard Word / Laporan)', ref: StandardFonts.Helvetica, boldRef: StandardFonts.HelveticaBold },
  { id: 'Helvetica', label: 'Helvetica / Arial (Standard Modern)', ref: StandardFonts.Helvetica, boldRef: StandardFonts.HelveticaBold },
  { id: 'TimesRoman', label: 'Times Roman (Formal / Skripsi / Jurnal)', ref: StandardFonts.TimesRoman, boldRef: StandardFonts.TimesRomanBold },
  { id: 'Courier', label: 'Courier (Monospace / Ketikan Mesin)', ref: StandardFonts.Courier, boldRef: StandardFonts.CourierBold },
]

const FORMAT_TEMPLATES = [
  { id: 'num', label: '1, 2, 3...', template: '{n}' },
  { id: 'roman_upper', label: 'I, II, III... (Romawi Kapital)', template: '{n}' },
  { id: 'roman_lower', label: 'i, ii, iii... (Romawi Kecil)', template: '{n}' },
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
  useIncomingFile(setFile)
  const [fileType, setFileType] = useState('pdf') // 'pdf' | 'docx'
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pagePreview, setPagePreview] = useState(null)
  const [docxTextSummary, setDocxTextSummary] = useState('')

  // Numbering Settings
  const [positionPreset, setPositionPreset] = useState('bottom-center')
  const [customX, setCustomX] = useState(50)
  const [customY, setCustomY] = useState(95)
  const [formatId, setFormatId] = useState('num')
  const [customTemplate, setCustomTemplate] = useState('{n}')
  const [fontFamily, setFontFamily] = useState('TimesRoman')
  const [fontSize, setFontSize] = useState(11)
  const [fontColor, setFontColor] = useState('#000000')
  const [isBold, setIsBold] = useState(false)
  const [startNumber, setStartNumber] = useState(1)
  const [skipFirstPage, setSkipFirstPage] = useState(true)
  const [targetPageMode, setTargetPageMode] = useState('all') // 'all' | 'specific'
  const [targetPagesInput, setTargetPagesInput] = useState('Semua')
  const [perPageOverrides, setPerPageOverrides] = useState({})
  const [usePerPagePosition, setUsePerPagePosition] = useState(false)
  const [perPagePositionOverrides, setPerPagePositionOverrides] = useState({})

  // Auto-detection state
  const [detectedPosition, setDetectedPosition] = useState(null)

  const [loadingPreview, setLoadingPreview] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [resultBlob, setResultBlob] = useState(null)
  const [error, setError] = useState('')

  const pdfDocRef = useRef(null)
  const previewContainerRef = useRef(null)
  const isDraggingTagRef = useRef(false)
  const dragStartPosRef = useRef({ startX: 0, startY: 0, origX: 50, origY: 95 })

  const handleFile = async ([f]) => {
    setFile(f)
    setResultBlob(null)
    setError('')
    setCurrentPage(1)
    setPerPageOverrides({})
    setPerPagePositionOverrides({})
    setUsePerPagePosition(false)
    setDetectedPosition(null)
    setDocxTextSummary('')

    const isDocx = f.name.toLowerCase().endsWith('.docx')
    setFileType(isDocx ? 'docx' : 'pdf')

    if (isDocx) {
      setLoadingPreview(true)
      try {
        const buf = await readAsArrayBuffer(f)
        const res = await mammoth.extractRawText({ arrayBuffer: buf })
        const text = res.value || ''
        setDocxTextSummary(text.slice(0, 350) + (text.length > 350 ? '…' : ''))
        setTotalPages(Math.max(1, Math.ceil(text.split(/\r?\n/).length / 30)))
      } catch (e) {
        setError(`Gagal membaca DOCX: ${e.message}`)
      } finally {
        setLoadingPreview(false)
      }
    } else {
      setLoadingPreview(true)
      try {
        const buf = await readAsArrayBuffer(f)
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) })
        const doc = await loadingTask.promise
        pdfDocRef.current = doc
        setTotalPages(doc.numPages)
        await loadPreview(doc, 1)

        autoDetectExistingPageNumber(doc)
      } catch (e) {
        setError(`Gagal memuat PDF: ${e.message}`)
      } finally {
        setLoadingPreview(false)
      }
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

  // Draggable tag on preview stage (Pure text bounding without offset icons)
  const startTagDrag = (e) => {
    e.stopPropagation()
    e.preventDefault()
    const pagePos = getPagePosition(currentPage)
    isDraggingTagRef.current = true
    dragStartPosRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pagePos.x,
      origY: pagePos.y,
    }

    const onMouseMove = (moveEvent) => {
      if (!isDraggingTagRef.current || !previewContainerRef.current) return
      const rect = previewContainerRef.current.getBoundingClientRect()
      const dxPct = ((moveEvent.clientX - dragStartPosRef.current.startX) / rect.width) * 100
      const dyPct = ((moveEvent.clientY - dragStartPosRef.current.startY) / rect.height) * 100

      const newX = Math.max(3, Math.min(97, Math.round(dragStartPosRef.current.origX + dxPct)))
      const newY = Math.max(3, Math.min(97, Math.round(dragStartPosRef.current.origY + dyPct)))

      if (usePerPagePosition) {
        setCurrentPagePosition('custom', newX, newY)
      } else {
        setCustomX(newX)
        setCustomY(newY)
        setPositionPreset('custom')
      }
    }

    const onMouseUp = () => {
      isDraggingTagRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const autoDetectExistingPageNumber = async (doc) => {
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
    const p = POSITION_PRESETS.find((pr) => pr.id === presetId)
    if (usePerPagePosition) {
      setCurrentPagePosition(presetId, p?.xPct ?? 50, p?.yPct ?? 95)
    } else {
      setPositionPreset(presetId)
      if (p) {
        setCustomX(p.xPct)
        setCustomY(p.yPct)
      }
    }
  }

  const getPageNumberText = (pageIdx, total) => {
    const numRaw = pageIdx - (skipFirstPage ? 1 : 0) + startNumber - 1 + 1
    let numStr = String(numRaw)
    if (formatId === 'roman_upper') {
      numStr = toRoman(numRaw, true)
    } else if (formatId === 'roman_lower') {
      numStr = toRoman(numRaw, false)
    }
    const tpl = formatId === 'custom' ? customTemplate : (FORMAT_TEMPLATES.find((f) => f.id === formatId)?.template || '{n}')
    return tpl.replace('{n}', numStr).replace('{total}', total)
  }

  const getIncludedPagesList = () => {
    if (targetPageMode === 'specific') {
      const validIndices = parsePageRange(targetPagesInput, totalPages)
      return validIndices.map((i) => i + 1)
    }
    const included = []
    for (let p = 1; p <= totalPages; p++) {
      if (isPageIncluded(p)) included.push(p)
    }
    return included
  }

  const isPageIncluded = (page) => {
    if (targetPageMode === 'specific') {
      const validIndices = parsePageRange(targetPagesInput, totalPages)
      return validIndices.includes(page - 1)
    }
    if (perPageOverrides[page]?.enabled === false) return false
    if (perPageOverrides[page]?.enabled === true) return true
    if (skipFirstPage) return page > 1
    return true
  }

  const togglePageCheck = (pNum) => {
    setTargetPageMode('specific')
    const currentList = getIncludedPagesList()
    let newList
    if (currentList.includes(pNum)) {
      newList = currentList.filter((p) => p !== pNum)
    } else {
      newList = [...currentList, pNum].sort((a, b) => a - b)
    }
    setTargetPagesInput(newList.length === 0 ? '' : newList.join(', '))
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

  const getPagePosition = (page) => {
    if (usePerPagePosition && perPagePositionOverrides[page]) {
      return perPagePositionOverrides[page]
    }
    return { preset: positionPreset, x: customX, y: customY }
  }

  const setCurrentPagePosition = (preset, x, y) => {
    setPerPagePositionOverrides((prev) => ({
      ...prev,
      [currentPage]: { preset, x, y },
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

      if (fileType === 'docx') {
        const blob = await addPageNumberToDocx(arrayBuf, {
          position: positionPreset,
          format: formatId,
          customTemplate,
          fontFamily,
          fontSize,
          isBold,
          skipFirstPage,
        })
        setResultBlob(blob)
      } else {
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

          const pagePos = getPagePosition(pageNum)
          let targetX = (pagePos.x / 100) * pWidth
          let targetY = pHeight - (pagePos.y / 100) * pHeight

          if (pagePos.preset.includes('center')) {
            targetX -= textWidth / 2
          } else if (pagePos.preset.includes('right')) {
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
      }
    } catch (e) {
      setError(`Gagal memproses penomoran: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const currentIncluded = isPageIncluded(currentPage)
  const previewNumText = getPageNumberText(currentPage, totalPages)
  const base = file ? stripExt(file.name) : 'document'
  const outExt = fileType === 'docx' ? 'docx' : 'pdf'

  return (
    <ToolShell
      title="Tambah Nomor Halaman (PDF & Word DOCX)"
      description="Beri nomor halaman otomatis pada PDF dan dokumen Microsoft Word (.docx). Dilengkapi deteksi posisi otomatis, penempatan tengah bawah satu klik, pilihan font resmi, dan kustomisasi per halaman."
    >
      <DropZone
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onFiles={handleFile}
        label="Pilih file PDF atau Word (.docx)"
        hint="Mendukung dokumen PDF (.pdf) & Microsoft Word (.docx)"
      />
      {file && <FilePreview file={file} />}

      {file && (
        <div className="space-y-4 animate-fade-in">
          {/* File format indicator */}
          <div className="flex items-center justify-between rounded-lg border border-[--color-border] bg-[--color-surface] p-3 text-xs">
            <div className="flex items-center gap-2">
              {fileType === 'docx' ? (
                <FileType size={16} className="text-blue-500" />
              ) : (
                <FileText size={16} className="text-red-500" />
              )}
              <span className="font-semibold text-[--color-text] truncate">{file.name}</span>
              <span className="rounded bg-[--color-surface-3] px-2 py-0.5 font-bold uppercase text-[--color-text-3]">
                {fileType}
              </span>
            </div>
            <span className="text-[--color-text-3] shrink-0">{fmtBytes(file.size)}</span>
          </div>

          {/* Detected Position Banner for PDF */}
          {detectedPosition && fileType === 'pdf' && (
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
            {/* Per-page position toggle */}
            {fileType === 'pdf' && (
              <div className="flex items-center justify-between border-b border-[--color-border] pb-3">
                <label className="flex items-center gap-2 text-xs text-[--color-text-2] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usePerPagePosition}
                    onChange={(e) => setUsePerPagePosition(e.target.checked)}
                  />
                  <span className="font-semibold">Custom Posisi per Halaman</span>
                </label>
                {usePerPagePosition && (
                  <span className="text-[10px] text-[--color-brand] font-mono bg-[--color-brand-light] px-2 py-0.5 rounded">
                    Hal {currentPage}: {getPagePosition(currentPage).preset === 'custom' ? `${getPagePosition(currentPage).x}%, ${getPagePosition(currentPage).y}%` : POSITION_PRESETS.find(p => p.id === getPagePosition(currentPage).preset)?.label || 'Custom'}
                  </span>
                )}
              </div>
            )}

            {/* Presets Button Row */}
            <div>
              <label className="block mb-2 text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                {usePerPagePosition ? `Posisi Halaman ${currentPage}` : 'Posisi Nomor Halaman (Semua Halaman)'}
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {POSITION_PRESETS.map((pos) => {
                  const activePreset = usePerPagePosition ? getPagePosition(currentPage).preset : positionPreset
                  return (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => selectPreset(pos.id)}
                      className={[
                        'flex flex-col items-center justify-center rounded border p-2.5 text-xs text-center transition-all',
                        activePreset === pos.id
                          ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand-text] font-bold shadow-xs'
                          : 'border-[--color-border] bg-[--color-surface] text-[--color-text-2] hover:bg-[--color-surface-3]',
                      ].join(' ')}
                    >
                      <span>{pos.label}</span>
                      <span className="text-[10px] opacity-75 font-normal">{pos.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Target Pages Selection / Checklist Box */}
            <div className="border-t border-[--color-border] pt-3 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="font-semibold text-[--color-text-2] flex items-center gap-1.5">
                  <Sparkles size={14} className="text-[--color-brand]" />
                  <span>Target Halaman yang Ingin Diberi Nomor (Tanpa Merusak Halaman Lain):</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setTargetPageMode('all'); setTargetPagesInput('Semua') }}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium border transition-colors cursor-pointer ${
                      targetPageMode === 'all'
                        ? 'bg-[--color-brand] text-white border-[--color-brand]'
                        : 'bg-[--color-surface-2] text-[--color-text-2] border-[--color-border] hover:bg-[--color-surface-3]'
                    }`}
                  >
                    Semua Halaman
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetPageMode('specific')}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium border transition-colors cursor-pointer ${
                      targetPageMode === 'specific'
                        ? 'bg-[--color-brand] text-white border-[--color-brand]'
                        : 'bg-[--color-surface-2] text-[--color-text-2] border-[--color-border] hover:bg-[--color-surface-3]'
                    }`}
                  >
                    Pilih Halaman Tertentu
                  </button>
                </div>
              </div>

              {targetPageMode === 'specific' && (
                <div className="rounded-lg bg-[--color-surface-2] p-3 border border-[--color-border] space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-[--color-text-2] shrink-0">Rentang Halaman:</span>
                    <input
                      type="text"
                      value={targetPagesInput}
                      onChange={(e) => setTargetPagesInput(e.target.value)}
                      placeholder="misal: 2-5, 8 atau ganjil"
                      className="flex-1 min-w-[180px] rounded border border-[--color-border] bg-[--color-surface] px-2.5 py-1 text-xs text-[--color-text] outline-none focus:border-[--color-brand]"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setTargetPagesInput('2-' + totalPages)}
                        className="rounded border border-[--color-border] bg-[--color-surface] px-2 py-1 text-[11px] text-[--color-text-2] hover:bg-[--color-brand-light] hover:text-[--color-brand] cursor-pointer"
                      >
                        Hal 2-{totalPages}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetPagesInput('ganjil')}
                        className="rounded border border-[--color-border] bg-[--color-surface] px-2 py-1 text-[11px] text-[--color-text-2] hover:bg-[--color-brand-light] hover:text-[--color-brand] cursor-pointer"
                      >
                        Ganjil
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetPagesInput('genap')}
                        className="rounded border border-[--color-border] bg-[--color-surface] px-2 py-1 text-[11px] text-[--color-text-2] hover:bg-[--color-brand-light] hover:text-[--color-brand] cursor-pointer"
                      >
                        Genap
                      </button>
                    </div>
                  </div>

                  {/* Visual Checklist Grid for all pages */}
                  <div className="space-y-1.5 pt-2 border-t border-[--color-border]/60">
                    <div className="flex items-center justify-between text-[11px] text-[--color-text-3]">
                      <span>Checklist Visual (Centang halaman yang ingin diberi nomor):</span>
                      <span className="font-semibold text-[--color-brand]">{getIncludedPagesList().length} dari {totalPages} halaman terpilih</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-[--color-surface] rounded border border-[--color-border]">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => {
                        const isChecked = getIncludedPagesList().includes(pNum)
                        return (
                          <button
                            key={pNum}
                            type="button"
                            onClick={() => togglePageCheck(pNum)}
                            className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                              isChecked
                                ? 'border-[--color-brand] bg-[--color-brand-light] text-[--color-brand-text] font-bold shadow-xs'
                                : 'border-[--color-border] bg-[--color-surface-2] text-[--color-text-3] hover:text-[--color-text-2]'
                            }`}
                          >
                            <span>{isChecked ? '✓' : '✗'}</span>
                            <span>Hal {pNum}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
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
                  className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-1.5 text-xs text-[--color-text] outline-none focus:border-[--color-brand]"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.id} value={f.id} className="bg-white text-gray-900 dark:bg-slate-800 dark:text-white">
                      {f.label}
                    </option>
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
                  className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-1.5 text-xs text-[--color-text] outline-none focus:border-[--color-brand]"
                >
                  {FORMAT_TEMPLATES.map((tpl) => (
                    <option key={tpl.id} value={tpl.id} className="bg-white text-gray-900 dark:bg-slate-800 dark:text-white">
                      {tpl.label}
                    </option>
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
                  className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-1.5 text-xs text-[--color-text] outline-none focus:border-[--color-brand]"
                />
              </div>
            </div>

            {/* Font Styling Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-[--color-border] pt-3">
              <div>
                <label className="block mb-1 text-xs font-semibold text-[--color-text-2]">
                  Ukuran Font (pt)
                </label>
                <input
                  type="number"
                  min="6"
                  max="72"
                  value={fontSize}
                  onChange={(e) => setFontSize(Math.max(6, Math.min(72, Number(e.target.value) || 6)))}
                  className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-1.5 text-xs text-[--color-text] outline-none focus:border-[--color-brand]"
                />
              </div>

              {fileType === 'pdf' && (
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
              )}

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

          {/* Interactive Document Page Preview (PDF) or Summary Preview (DOCX) */}
          {fileType === 'pdf' ? (
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

              {/* Live Document Preview with Draggable simulated Number Tag without offset icon */}
              <div className="relative flex justify-center rounded border border-[--color-border] bg-[--color-surface-2] p-4 overflow-auto min-h-[380px]">
                {loadingPreview && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-[--color-surface]/70 backdrop-blur-xs">
                    <Loader2 size={24} className="animate-spin text-[--color-brand]" />
                  </div>
                )}

                {pagePreview && (
                  <div ref={previewContainerRef} className="relative inline-block border border-[--color-border] shadow-xs select-none bg-white">
                    <img
                      src={pagePreview.dataUrl}
                      alt={`Page ${currentPage}`}
                      className="block max-h-[500px] w-auto pointer-events-none"
                    />

                    {/* Precise Draggable Number Tag (1:1 with output PDF) */}
                    {currentIncluded && (() => {
                      const pagePos = getPagePosition(currentPage)
                      return (
                        <div
                          onMouseDown={startTagDrag}
                          className="absolute rounded bg-blue-500/10 border border-blue-600 px-1 py-0.5 cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-blue-400 select-none text-center"
                          style={{
                            left: `${pagePos.x}%`,
                            top: `${pagePos.y}%`,
                            transform: 'translate(-50%, -50%)',
                            color: fontColor,
                            fontSize: `${Math.max(9, fontSize)}px`,
                            fontWeight: isBold ? 'bold' : 'normal',
                            fontFamily: fontFamily === 'TimesRoman' ? 'Times New Roman, serif' : fontFamily === 'Courier' ? 'Courier, monospace' : 'Arial, sans-serif',
                            lineHeight: 1.1,
                          }}
                        >
                          {previewNumText}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[--color-text-3]">
                Pratinjau Dokumen Word (.docx)
              </span>
              <div className="rounded border border-[--color-border] bg-[--color-surface-2] p-3 text-xs text-[--color-text-2] font-mono leading-relaxed max-h-40 overflow-auto">
                {docxTextSummary || 'Membaca dokumen…'}
              </div>
              <p className="text-xs text-[--color-text-3]">
                Field code XML penomoran halaman standar Word (<code className="text-blue-500 font-mono">w:fldSimple w:instr=&quot;PAGE&quot;</code>) akan disematkan di {POSITION_PRESETS.find(p => p.id === positionPreset)?.label.toLowerCase()}.
              </p>
            </div>
          )}

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
              {processing ? 'Menyematkan Nomor Halaman…' : `Simpan & Terapkan Nomor Halaman (${fileType.toUpperCase()})`}
            </button>
          )}

          {resultBlob && (
            <ResultCard
              fileName={`${base}_numbered.${outExt}`}
              blob={resultBlob}
              extraInfo={`Nomor halaman berhasil disematkan ke ${fileType.toUpperCase()} — ${fmtBytes(resultBlob.size)}`}
              outputMimeType={fileType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}
              sourceRoute="add-page-number"
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
