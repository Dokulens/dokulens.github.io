import { useState, useRef } from 'react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import mammoth from 'mammoth'
import {
  FileText, ChevronLeft, ChevronRight, Hash,
  Sparkles, Sliders, Loader2, Check, RefreshCw,
  ShieldCheck, FileType, Download, X
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
import { BTN_CARD_ACTIVE, BTN_CARD_INACTIVE, BTN_CHECK_ACTIVE, BTN_CHECK_INACTIVE, BTN_SEG_ACTIVE, BTN_SEG_INACTIVE } from '../../utils/activeButtonStyles'

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

function parsePageRange(rangeStr, maxPages) {
  if (!rangeStr || rangeStr.trim() === '' || rangeStr.trim().toLowerCase() === 'semua' || rangeStr.trim().toLowerCase() === 'all') {
    return Array.from({ length: maxPages }, (_, i) => i)
  }
  const str = rangeStr.trim().toLowerCase()
  if (str === 'ganjil' || str === 'odd') {
    return Array.from({ length: maxPages }, (_, i) => i).filter((i) => (i + 1) % 2 !== 0)
  }
  if (str === 'genap' || str === 'even') {
    return Array.from({ length: maxPages }, (_, i) => i).filter((i) => (i + 1) % 2 === 0)
  }

  const indices = new Set()
  const parts = str.split(',')
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map((n) => parseInt(n.trim(), 10))
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.max(1, Math.min(start, end))
        const max = Math.min(maxPages, Math.max(start, end))
        for (let p = min; p <= max; p++) {
          indices.add(p - 1)
        }
      }
    } else {
      const p = parseInt(trimmed, 10)
      if (!isNaN(p) && p >= 1 && p <= maxPages) {
        indices.add(p - 1)
      }
    }
  }
  return Array.from(indices).sort((a, b) => a - b)
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
  const [paperColor, setPaperColor] = useState('#FFFFFF')
  const [coverExistingNumber, setCoverExistingNumber] = useState(true)
  // White-out Box (independent)
  const [woEnabled, setWoEnabled] = useState(true)
  const [woPreset, setWoPreset] = useState('bottom-center')
  const [woCustomX, setWoCustomX] = useState(50)
  const [woCustomY, setWoCustomY] = useState(95)
  const [woWidth, setWoWidth] = useState(120)
  const [woHeight, setWoHeight] = useState(24)
  const [usePerPageWo, setUsePerPageWo] = useState(false)
  const [perPageWoOverrides, setPerPageWoOverrides] = useState({})
  const [isBold, setIsBold] = useState(false)
  const [startNumber, setStartNumber] = useState(1)
  const [skipFirstPage, setSkipFirstPage] = useState(true)
  const [targetPageMode, setTargetPageMode] = useState('all') // 'all' | 'specific'
  const [targetPagesInput, setTargetPagesInput] = useState('Semua')
  const [perPageOverrides, setPerPageOverrides] = useState({})
  const [perPageFormatOverrides, setPerPageFormatOverrides] = useState({})
  const [perPageFormatRange, setPerPageFormatRange] = useState('')
  const [usePerPagePosition, setUsePerPagePosition] = useState(false)
  const [perPagePositionOverrides, setPerPagePositionOverrides] = useState({})

  // Auto-detection state
  const [detectedPosition, setDetectedPosition] = useState(null)

  const [loadingPreview, setLoadingPreview] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [resultBlob, setResultBlob] = useState(null)
  const [resultPages, setResultPages] = useState([])
  const [renderingResult, setRenderingResult] = useState(false)
  const [resultCurrentPage, setResultCurrentPage] = useState(1)
  const [error, setError] = useState('')
  const [pageDimensions, setPageDimensions] = useState({ width: 595, height: 842 }) // default A4

  const pdfDocRef = useRef(null)
  const previewContainerRef = useRef(null)
  const isDraggingTagRef = useRef(false)
  const dragStartPosRef = useRef({ startX: 0, startY: 0, origX: 50, origY: 95 })
  const isDraggingWoRef = useRef(false)
  const dragWoStartRef = useRef({ startX: 0, startY: 0, origX: 50, origY: 95 })

  const handleFile = async ([f]) => {
    setFile(f)
    setResultBlob(null)
    setError('')
    setCurrentPage(1)
    setPerPageOverrides({})
    setPerPageFormatOverrides({})
    setPerPageFormatRange('')
    setPerPagePositionOverrides({})
    setPerPageWoOverrides({})
    setUsePerPagePosition(false)
    setUsePerPageWo(false)
    setWoEnabled(true)
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
      setPageDimensions({ width: data.pageWidth, height: data.pageHeight })
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

  // Draggable White-out Box
  const startWoDrag = (e) => {
    e.stopPropagation()
    e.preventDefault()
    const woPos = getWoPosition(currentPage)
    isDraggingWoRef.current = true
    dragWoStartRef.current = { startX: e.clientX, startY: e.clientY, origX: woPos.x, origY: woPos.y }
    const onMouseMove = (moveEvent) => {
      if (!isDraggingWoRef.current || !previewContainerRef.current) return
      const rect = previewContainerRef.current.getBoundingClientRect()
      const dxPct = ((moveEvent.clientX - dragWoStartRef.current.startX) / rect.width) * 100
      const dyPct = ((moveEvent.clientY - dragWoStartRef.current.startY) / rect.height) * 100
      const newX = Math.max(3, Math.min(97, Math.round(dragWoStartRef.current.origX + dxPct)))
      const newY = Math.max(3, Math.min(97, Math.round(dragWoStartRef.current.origY + dyPct)))
      if (usePerPageWo) { setCurrentPageWo('custom', newX, newY) }
      else { setWoCustomX(newX); setWoCustomY(newY); setWoPreset('custom') }
    }
    const onMouseUp = () => { isDraggingWoRef.current = false; window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Resize handler for WO box (corner drag)
  const startWoResize = (e, corner) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startW = woWidth
    const startH = woHeight
    const onMouseMove = (moveEvent) => {
      if (!previewContainerRef.current) return
      const rect = previewContainerRef.current.getBoundingClientRect()
      const dxPx = moveEvent.clientX - startX
      let newW = startW
      let newH = startH
      if (corner.includes('e')) newW = Math.max(20, Math.min(300, Math.round(startW + dxPx)))
      if (corner.includes('w')) newW = Math.max(20, Math.min(300, Math.round(startW - dxPx)))
      if (corner.includes('s')) newH = Math.max(8, Math.min(100, Math.round(startH + dxPx * 0.5)))
      if (corner.includes('n')) newH = Math.max(8, Math.min(100, Math.round(startH - dxPx * 0.5)))
      setWoWidth(newW)
      setWoHeight(newH)
    }
    const onMouseUp = () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
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

  const getPageNumberText = (pageIdx, total, pageNum) => {
    const numRaw = pageIdx - (skipFirstPage ? 1 : 0) + startNumber - 1 + 1
    let numStr = String(numRaw)
    if (formatId === 'roman_upper') {
      numStr = toRoman(numRaw, true)
    } else if (formatId === 'roman_lower') {
      numStr = toRoman(numRaw, false)
    }
    
    // Check for per-page format override
    const pageFormat = pageNum && perPageFormatOverrides[pageNum]
    let tpl
    if (pageFormat) {
      // Apply per-page format but keep the sequential number
      if (pageFormat.formatId === 'roman_upper') {
        numStr = toRoman(numRaw, true)
      } else if (pageFormat.formatId === 'roman_lower') {
        numStr = toRoman(numRaw, false)
      }
      tpl = pageFormat.formatId === 'custom' 
        ? pageFormat.customTemplate 
        : (FORMAT_TEMPLATES.find((f) => f.id === pageFormat.formatId)?.template || '{n}')
    } else {
      tpl = formatId === 'custom' ? customTemplate : (FORMAT_TEMPLATES.find((f) => f.id === formatId)?.template || '{n}')
    }
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

  // White-out Box helpers
  const getWoPosition = (page) => {
    if (usePerPageWo && perPageWoOverrides[page]) return perPageWoOverrides[page]
    return { preset: woPreset, x: woCustomX, y: woCustomY }
  }
  const setCurrentPageWo = (preset, x, y) => {
    setPerPageWoOverrides((prev) => ({ ...prev, [currentPage]: { preset, x, y } }))
  }
  const selectWoPreset = (presetId) => {
    const p = POSITION_PRESETS.find((pr) => pr.id === presetId)
    if (usePerPageWo) {
      setCurrentPageWo(presetId, p?.xPct ?? 50, p?.yPct ?? 95)
    } else {
      setWoPreset(presetId)
      if (p) { setWoCustomX(p.xPct); setWoCustomY(p.yPct) }
    }
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

          const numText = getPageNumberText(i + 1, total, pageNum)
          const textWidth = font.widthOfTextAtSize(numText, fontSize)

          const pagePos = getPagePosition(pageNum)
          let targetX = (pagePos.x / 100) * pWidth
          let targetY = pHeight - (pagePos.y / 100) * pHeight

          if (pagePos.preset.includes('center')) {
            targetX -= textWidth / 2
          } else if (pagePos.preset.includes('right')) {
            targetX -= textWidth
          }

          // 1) White-out Box — preview px → PDF pt via dynamic scale (pageH / 500)
          if (woEnabled) {
            const paperRgb = hexToRgb(paperColor)
            const woPos = getWoPosition(pageNum)
            const pxToPt = pHeight / 500
            const woPtW = woWidth * pxToPt
            const woPtH = woHeight * pxToPt
            let woX = (woPos.x / 100) * pWidth
            let woY = pHeight - (woPos.y / 100) * pHeight
            if (woPos.preset.includes('center')) woX -= woPtW / 2
            else if (woPos.preset.includes('right')) woX -= woPtW
            page.drawRectangle({
              x: woX, y: woY - woPtH / 2,
              width: woPtW, height: woPtH,
              color: rgb(paperRgb.r, paperRgb.g, paperRgb.b),
            })
          }

          // 2) Font background (paper color behind new page number text)
          if (coverExistingNumber) {
            const paperRgb = hexToRgb(paperColor)
            const textPadX = 6
            const textPadY = 4
            page.drawRectangle({
              x: targetX - textPadX,
              y: targetY - textPadY,
              width: textWidth + textPadX * 2,
              height: fontSize + textPadY * 2,
              color: rgb(paperRgb.r, paperRgb.g, paperRgb.b),
            })
          }

          // 3) Draw page number text ON TOP of everything
          page.drawText(numText, {
            x: targetX,
            y: targetY,
            size: fontSize,
            font,
            color: rgb(color.r, color.g, color.b),
          })
        }

        const bytes = await doc.save()
        const blob = new Blob([bytes], { type: 'application/pdf' })
        setResultBlob(blob)
        setResultCurrentPage(1)

        // Render result pages for preview
        try {
          setRenderingResult(true)
          const resultDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise
          const pages = []
          for (let p = 1; p <= resultDoc.numPages; p++) {
            const data = await renderPageToDataUrl(resultDoc, p, 0.8)
            pages.push({ pageNum: p, dataUrl: data.dataUrl })
          }
          setResultPages(pages)
        } catch { setResultPages([]) }
        finally { setRenderingResult(false) }
      }
    } catch (e) {
      setError(`Gagal memproses penomoran: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const currentIncluded = isPageIncluded(currentPage)
  const previewNumText = getPageNumberText(currentPage, totalPages, currentPage)
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
          <div className="flex items-center justify-between rounded-lg border border-(--color-border) bg-(--color-surface) p-3 text-xs">
            <div className="flex items-center gap-2">
              {fileType === 'docx' ? (
                <FileType size={16} className="text-blue-500" />
              ) : (
                <FileText size={16} className="text-red-500" />
              )}
              <span className="font-semibold text-(--color-text) truncate">{file.name}</span>
              <span className="rounded bg-(--color-surface-3) px-2 py-0.5 font-bold uppercase text-(--color-text-3)">
                {fileType}
              </span>
            </div>
            <span className="text-(--color-text-3) shrink-0">{fmtBytes(file.size)}</span>
          </div>

          {/* Detected Position Banner for PDF */}
          {detectedPosition && fileType === 'pdf' && (
            <div className="flex items-center justify-between rounded-lg border border-(--color-brand) bg-(--color-brand-light) p-3 text-xs animate-fade-in">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="shrink-0 text-(--color-brand)" />
                <span className="text-(--color-brand-text)">
                  <strong>Nomor Halaman Terdeteksi:</strong> Ditemukan pola &quot;{detectedPosition.text}&quot; di posisi <strong>{POSITION_PRESETS.find(p => p.id === detectedPosition.preset)?.label}</strong>.
                </span>
              </div>
              <button
                onClick={applyDetectedPosition}
                className="shrink-0 rounded bg-(--color-brand) px-2.5 py-1 font-bold text-white hover:bg-(--color-brand-hover) transition-colors"
              >
                Gunakan Posisi Ini
              </button>
            </div>
          )}

          {/* Settings Grid */}
          <div className="space-y-4">
            
            {/* STEP 1: Position */}
            <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-(--color-brand) text-sm font-bold text-white shrink-0">1</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-(--color-text)">Posisi Nomor Halaman</h3>
                  <p className="text-[11px] text-(--color-text-3)">Pilih letak nomor di halaman</p>
                </div>
                {fileType === 'pdf' && (
                  <label className="flex items-center gap-2 text-xs text-(--color-brand) cursor-pointer bg-(--color-brand-light) px-3 py-1.5 rounded-full shrink-0">
                    <input
                      type="checkbox"
                      checked={usePerPagePosition}
                      onChange={(e) => setUsePerPagePosition(e.target.checked)}
                      className="accent-(--color-brand)"
                    />
                    <span className="font-semibold">Beda tiap halaman</span>
                  </label>
                )}
              </div>
              
              {usePerPagePosition && (
                <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-[11px] text-blue-700 dark:text-blue-300">
                  <strong>Sedang mengatur Halaman {currentPage}:</strong> {getPagePosition(currentPage).preset === 'custom' ? `Posisi kustom (${getPagePosition(currentPage).x}%, ${getPagePosition(currentPage).y}%)` : POSITION_PRESETS.find(p => p.id === getPagePosition(currentPage).preset)?.label || 'Custom'}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {POSITION_PRESETS.map((pos) => {
                  const activePreset = usePerPagePosition ? getPagePosition(currentPage).preset : positionPreset
                  const isActive = activePreset === pos.id
                  return (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => selectPreset(pos.id)}
                      className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-3 text-xs text-center transition-all min-h-[64px] ${
                        isActive
                          ? 'border-(--color-brand) bg-(--color-brand-light) text-(--color-brand) shadow-md'
                          : 'border-(--color-border) bg-(--color-surface) text-(--color-text-2) hover:border-(--color-border-strong) hover:bg-(--color-surface-3)'
                      }`}
                    >
                      {isActive && (
                        <div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-(--color-brand) flex items-center justify-center">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                      <span className="font-semibold text-sm">{pos.label}</span>
                      <span className="text-[10px] opacity-70 mt-0.5">{pos.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* STEP 2: Which Pages */}
            <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-(--color-brand) text-sm font-bold text-white shrink-0">2</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-(--color-text)">Halaman yang Diberi Nomor</h3>
                  <p className="text-[11px] text-(--color-text-3)">Pilih halaman mana saja yang akan diberi nomor</p>
                </div>
                <div className="text-xs font-bold text-(--color-brand) bg-(--color-brand-light) px-3 py-1.5 rounded-full shrink-0">
                  {getIncludedPagesList().length} / {totalPages}
                </div>
              </div>
              
              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => { setTargetPageMode('all'); setTargetPagesInput('Semua') }}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                    targetPageMode === 'all'
                      ? 'bg-(--color-brand) text-white shadow-md'
                      : 'bg-(--color-surface-2) text-(--color-text-2) hover:bg-(--color-surface-3) border border-(--color-border)'
                  }`}
                >
                  Semua Halaman
                </button>
                <button
                  type="button"
                  onClick={() => setTargetPageMode('specific')}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                    targetPageMode === 'specific'
                      ? 'bg-(--color-brand) text-white shadow-md'
                      : 'bg-(--color-surface-2) text-(--color-text-2) hover:bg-(--color-surface-3) border border-(--color-border)'
                  }`}
                >
                  Pilih Sendiri
                </button>
              </div>

              {targetPageMode === 'specific' && (
                <div className="rounded-xl bg-(--color-surface-2) p-4 border border-(--color-border) space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-(--color-text-2) mb-1.5">
                      Rentang Halaman
                    </label>
                    <input
                      type="text"
                      value={targetPagesInput}
                      onChange={(e) => setTargetPagesInput(e.target.value)}
                      placeholder="Contoh: 2-5, 8, 10-12"
                      className="w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs text-(--color-text) outline-none focus:border-(--color-brand) focus:ring-2 focus:ring-(--color-brand)/20"
                    />
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetPagesInput('2-' + totalPages)}
                      className="rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-[11px] font-medium text-(--color-text-2) hover:bg-(--color-brand-light) hover:text-(--color-brand) hover:border-(--color-brand) transition-all cursor-pointer"
                    >
                      Lewati Halaman 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetPagesInput('ganjil')}
                      className="rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-[11px] font-medium text-(--color-text-2) hover:bg-(--color-brand-light) hover:text-(--color-brand) hover:border-(--color-brand) transition-all cursor-pointer"
                    >
                      Halaman Ganjil
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetPagesInput('genap')}
                      className="rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-[11px] font-medium text-(--color-text-2) hover:bg-(--color-brand-light) hover:text-(--color-brand) hover:border-(--color-brand) transition-all cursor-pointer"
                    >
                      Halaman Genap
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-(--color-text-2)">Klik untuk pilih:</div>
                    <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-10 gap-1.5 max-h-40 overflow-y-auto p-2 bg-(--color-surface) rounded-xl border border-(--color-border)">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => {
                        const isChecked = getIncludedPagesList().includes(pNum)
                        return (
                          <button
                            key={pNum}
                            type="button"
                            onClick={() => togglePageCheck(pNum)}
                            className={`flex items-center justify-center rounded-lg border px-1 py-2 text-xs font-semibold transition-all cursor-pointer min-h-[36px] ${
                              isChecked
                                ? 'border-(--color-brand) bg-(--color-brand) text-white shadow-sm'
                                : 'border-(--color-border) bg-(--color-surface) text-(--color-text-3) hover:border-(--color-border-strong) hover:bg-(--color-surface-3)'
                            }`}
                          >
                            {pNum}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 3: Format & Style */}
            <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-(--color-brand) text-sm font-bold text-white shrink-0">3</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-(--color-text)">Format & Gaya Nomor</h3>
                  <p className="text-[11px] text-(--color-text-3)">Tampilan dan bentuk nomor halaman</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block mb-1.5 text-xs font-semibold text-(--color-text-2)">
                    Jenis Font
                  </label>
                  <select
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs text-(--color-text) outline-none focus:border-(--color-brand) focus:ring-2 focus:ring-(--color-brand)/20"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.id} value={f.id} className="bg-white text-gray-900 dark:bg-slate-800 dark:text-white">
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1.5 text-xs font-semibold text-(--color-text-2)">
                    Format Tampilan
                  </label>
                  <select
                    value={formatId}
                    onChange={(e) => setFormatId(e.target.value)}
                    className="w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs text-(--color-text) outline-none focus:border-(--color-brand) focus:ring-2 focus:ring-(--color-brand)/20"
                  >
                    {FORMAT_TEMPLATES.map((tpl) => (
                      <option key={tpl.id} value={tpl.id} className="bg-white text-gray-900 dark:bg-slate-800 dark:text-white">
                        {tpl.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1.5 text-xs font-semibold text-(--color-text-2)">
                    Ukuran Font (pt)
                  </label>
                  <input
                    type="number"
                    min="6"
                    max="72"
                    value={fontSize}
                    onChange={(e) => setFontSize(Math.max(6, Math.min(72, Number(e.target.value) || 6)))}
                    className="w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs text-(--color-text) outline-none focus:border-(--color-brand) focus:ring-2 focus:ring-(--color-brand)/20"
                  />
                </div>

                <div>
                  <label className="block mb-1.5 text-xs font-semibold text-(--color-text-2)">
                    Mulai dari Angka
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={startNumber}
                    onChange={(e) => setStartNumber(Number(e.target.value))}
                    className="w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs text-(--color-text) outline-none focus:border-(--color-brand) focus:ring-2 focus:ring-(--color-brand)/20"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-3 mt-3 border-t border-(--color-border)">
                {fileType === 'pdf' && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-(--color-text-2)">Warna:</label>
                    <input
                      type="color"
                      value={fontColor}
                      onChange={(e) => setFontColor(e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded-lg border border-(--color-border)"
                    />
                    <span className="font-mono text-[10px] text-(--color-text-3) uppercase">{fontColor}</span>
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-(--color-text-2) cursor-pointer bg-(--color-surface-2) px-3 py-2 rounded-lg border border-(--color-border)">
                  <input
                    type="checkbox"
                    checked={isBold}
                    onChange={(e) => setIsBold(e.target.checked)}
                    className="accent-(--color-brand)"
                  />
                  <span className="font-medium">Tebal (Bold)</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-(--color-text-2) cursor-pointer bg-(--color-surface-2) px-3 py-2 rounded-lg border border-(--color-border)">
                  <input
                    type="checkbox"
                    checked={skipFirstPage}
                    onChange={(e) => setSkipFirstPage(e.target.checked)}
                    className="accent-(--color-brand)"
                  />
                  <span className="font-medium">Lewati Halaman Pertama</span>
                </label>
              </div>

              {fileType === 'pdf' && (
                <div className="mt-4 rounded-xl bg-(--color-surface-2) p-4 border border-(--color-border)">
                  <label className="flex items-center gap-2 text-xs text-(--color-text-2) cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      checked={Object.keys(perPageFormatOverrides).length > 0}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          setPerPageFormatOverrides({})
                          setPerPageFormatRange('')
                        } else {
                          setPerPageFormatOverrides({
                            [currentPage]: { formatId, customTemplate }
                          })
                          setPerPageFormatRange(String(currentPage))
                        }
                      }}
                      className="accent-(--color-brand)"
                    />
                    <span className="font-semibold">Format Berbeda untuk Rentang Halaman Tertentu</span>
                  </label>
                  
                  {Object.keys(perPageFormatOverrides).length > 0 && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-(--color-text-2) mb-1.5">
                          Halaman yang pakai format khusus:
                        </label>
                        <input
                          type="text"
                          value={perPageFormatRange}
                          onChange={(e) => {
                            const val = e.target.value
                            setPerPageFormatRange(val)
                            const pages = parsePageRange(val, totalPages)
                            const newOverrides = {}
                            pages.forEach(idx => {
                              const pageNum = idx + 1
                              newOverrides[pageNum] = perPageFormatOverrides[pageNum] || { formatId, customTemplate }
                            })
                            setPerPageFormatOverrides(newOverrides)
                          }}
                          placeholder="Contoh: 1-5, 8, 10-12"
                          className="w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs text-(--color-text) outline-none focus:border-(--color-brand) focus:ring-2 focus:ring-(--color-brand)/20"
                        />
                      </div>
                      
                      {Object.keys(perPageFormatOverrides).length > 0 && (
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-(--color-text-2) shrink-0">Format khusus:</span>
                          <select
                            value={perPageFormatOverrides[currentPage]?.formatId || formatId}
                            onChange={(e) => {
                              const newFormatId = e.target.value
                              const newCustomTemplate = newFormatId === 'custom' 
                                ? (perPageFormatOverrides[currentPage]?.customTemplate || customTemplate || '{n}')
                                : (FORMAT_TEMPLATES.find(f => f.id === newFormatId)?.template || '{n}')
                              
                              setPerPageFormatOverrides(prev => {
                                const next = { ...prev }
                                Object.keys(next).forEach(pageNum => {
                                  next[pageNum] = { 
                                    formatId: newFormatId, 
                                    customTemplate: newCustomTemplate
                                  }
                                })
                                return next
                              })
                            }}
                            className="flex-1 rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs text-(--color-text) outline-none focus:border-(--color-brand) focus:ring-2 focus:ring-(--color-brand)/20"
                          >
                            {FORMAT_TEMPLATES.map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>
                                {tpl.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-(--color-text-3)">Diterapkan di halaman:</span>
                        {Object.keys(perPageFormatOverrides)
                          .sort((a, b) => Number(a) - Number(b))
                          .map(pageNum => (
                            <span 
                              key={pageNum}
                              className={`inline-flex items-center rounded-lg px-2 py-1 font-mono text-[11px] ${
                                Number(pageNum) === currentPage 
                                  ? 'bg-(--color-brand) text-white' 
                                  : 'bg-(--color-brand-light) text-(--color-brand)'
                              }`}
                            >
                              {pageNum}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cover-up / Wite-out Section for PDF */}
            {fileType === 'pdf' && (
              <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-sm space-y-3 text-xs">
                {/* Main toggle + paper color */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <label className="flex items-center gap-1.5 text-(--color-text-2) font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={coverExistingNumber}
                      onChange={(e) => setCoverExistingNumber(e.target.checked)}
                      className="accent-(--color-brand) cursor-pointer"
                    />
                    <span>Background Font (Warna Kertas)</span>
                  </label>
                  {coverExistingNumber && (
                    <div className="flex items-center gap-2">
                      <input type="color" value={paperColor} onChange={(e) => setPaperColor(e.target.value)}
                        className="h-6 w-8 cursor-pointer rounded border border-(--color-border)" />
                      <span className="font-mono text-[11px] text-(--color-text-3) uppercase">{paperColor}</span>
                    </div>
                  )}
                </div>

                {/* White-out Box (independent) */}
                <div className="rounded-lg bg-(--color-surface-2) p-3 border border-(--color-border) space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-1.5 text-(--color-text-2) font-semibold cursor-pointer">
                      <input type="checkbox" checked={woEnabled} onChange={(e) => setWoEnabled(e.target.checked)}
                        className="accent-orange-500 cursor-pointer" />
                      <span className="text-orange-600 dark:text-orange-400">Wite-out Independen</span>
                      <span className="text-(--color-text-3) font-normal">(Kotak Penimpa — posisi bebas, tidak terikat nomor)</span>
                    </label>
                    {woEnabled && (
                      <label className="flex items-center gap-1.5 text-(--color-text-2) cursor-pointer">
                        <input type="checkbox" checked={usePerPageWo} onChange={(e) => setUsePerPageWo(e.target.checked)} />
                        <span className="font-semibold">Custom per Halaman</span>
                      </label>
                    )}
                  </div>
                  {woEnabled && (
                    <>
                      <div className="flex items-center gap-2 text-[10px] text-orange-600 dark:text-orange-400 font-mono bg-orange-500/10 px-2 py-0.5 rounded w-fit">
                        {usePerPageWo
                          ? `Hal ${currentPage}: ${getWoPosition(currentPage).preset === 'custom' ? `${getWoPosition(currentPage).x}%, ${getWoPosition(currentPage).y}%` : POSITION_PRESETS.find(p => p.id === getWoPosition(currentPage).preset)?.label || 'Custom'}`
                          : `Semua: ${POSITION_PRESETS.find(p => p.id === woPreset)?.label || 'Custom'}`}
                        <span className="ml-2 text-(--color-text-3)">{woWidth}×{woHeight}pt</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
                        {POSITION_PRESETS.map((pos) => {
                          const active = usePerPageWo ? getWoPosition(currentPage).preset : woPreset
                          return (
                            <button key={pos.id} type="button" onClick={() => selectWoPreset(pos.id)}
                              className={`flex flex-col items-center justify-center rounded border p-1.5 text-[11px] text-center transition-all ${
                                active === pos.id
                                  ? `${BTN_CARD_ACTIVE} border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400 ring-1 ring-orange-500/30`
                                  : `${BTN_CARD_INACTIVE} hover:border-(--color-border-strong)`
                              }`}>
                              <span>{pos.label}</span>
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex items-center gap-4 pt-1">
                        <label className="flex items-center gap-1.5 text-(--color-text-3)">
                          Lebar: <input type="number" min="20" max="300" value={woWidth}
                            onChange={(e) => setWoWidth(Math.max(20, Math.min(300, Number(e.target.value) || 20)))}
                            className="w-16 rounded border border-(--color-border) bg-(--color-surface) px-1.5 py-0.5 text-[11px] text-(--color-text) outline-none" /> px
                        </label>
                        <label className="flex items-center gap-1.5 text-(--color-text-3)">
                          Tinggi: <input type="number" min="8" max="100" value={woHeight}
                            onChange={(e) => setWoHeight(Math.max(8, Math.min(100, Number(e.target.value) || 8)))}
                            className="w-16 rounded border border-(--color-border) bg-(--color-surface) px-1.5 py-0.5 text-[11px] text-(--color-text) outline-none" /> px
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Interactive Document Page Preview (PDF) or Summary Preview (DOCX) */}
          {fileType === 'pdf' ? (
            <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4 space-y-3">
              {/* Page Navigation Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => changePage(-1)}
                    disabled={currentPage <= 1 || loadingPreview}
                    className="flex h-7 w-7 items-center justify-center rounded border border-(--color-border) text-(--color-text-2) hover:bg-(--color-surface-3) disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="font-bold text-(--color-text)">
                    Halaman {currentPage} dari {totalPages}
                  </span>
                  <button
                    onClick={() => changePage(1)}
                    disabled={currentPage >= totalPages || loadingPreview}
                    className="flex h-7 w-7 items-center justify-center rounded border border-(--color-border) text-(--color-text-2) hover:bg-(--color-surface-3) disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-(--color-text-3)">
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

              {/* Live Document Preview with Page List Sidebar */}
              <div className="flex gap-3 rounded border border-(--color-border) bg-(--color-surface-2) p-4 overflow-auto min-h-[380px]">
                {/* Page List Sidebar */}
                {totalPages > 1 && (
                  <div className="flex flex-col gap-1 shrink-0 w-16 max-h-[520px] overflow-y-auto pr-1 scrollbar-thin">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => {
                      const included = isPageIncluded(pNum)
                      const isCurrent = pNum === currentPage
                      return (
                        <button
                          key={pNum}
                          type="button"
                          onClick={() => { setCurrentPage(pNum); if (pdfDocRef.current) loadPreview(pdfDocRef.current, pNum) }}
                          className={[
                            'flex items-center justify-center rounded border text-[11px] font-medium transition-all shrink-0 h-7',
                            isCurrent
                              ? 'border-(--color-brand) bg-(--color-brand) text-white shadow-xs font-bold'
                              : included
                                ? 'border-(--color-border) bg-(--color-surface) text-(--color-text-2) hover:bg-(--color-surface-3) hover:border-(--color-border-strong)'
                                : 'border-(--color-border) bg-(--color-surface) text-(--color-text-3) opacity-50 line-through',
                          ].join(' ')}
                          title={isCurrent ? `Halaman ${pNum} (aktif)` : included ? `Ke halaman ${pNum}` : `Halaman ${pNum} (dilewati)`}
                        >
                          {pNum}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Main Preview */}
                <div className="relative flex-1 flex justify-center">
                  {loadingPreview && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-(--color-surface)/70 backdrop-blur-xs">
                      <Loader2 size={24} className="animate-spin text-(--color-brand)" />
                    </div>
                  )}

                  {pagePreview && (() => {
                    const previewMaxH = 500
                    const containerW = Math.round(previewMaxH * (pageDimensions.width / pageDimensions.height))
                    return (
                  <div ref={previewContainerRef} className="relative inline-block border border-(--color-border) shadow-xs select-none bg-white overflow-hidden" style={{ height: `${previewMaxH}px`, width: `${containerW}px` }}>
                    <img
                      src={pagePreview.dataUrl}
                      alt={`Page ${currentPage}`}
                      className="block w-full h-full pointer-events-none"
                    />

                    {/* White-out Box (solid, draggable + resizable) — BOTTOM layer */}
                    {woEnabled && currentIncluded && (() => {
                      const woPos = getWoPosition(currentPage)
                      const handleStyle = 'absolute w-2.5 h-2.5 bg-orange-500 border border-white rounded-sm z-10'
                      return (
                        <div
                          onMouseDown={startWoDrag}
                          className="absolute cursor-grab active:cursor-grabbing select-none"
                          style={{
                            left: `${woPos.x}%`, top: `${woPos.y}%`,
                            transform: 'translate(-50%, -50%)',
                            width: `${woWidth}px`, height: `${woHeight}px`,
                            backgroundColor: paperColor,
                            border: '2px solid #f97316',
                            borderRadius: '3px',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                          }}
                          title={`Wite-out: ${woPos.preset === 'custom' ? `${woPos.x}%, ${woPos.y}%` : POSITION_PRESETS.find(p => p.id === woPos.preset)?.label || woPos.preset} (${woWidth}×${woHeight}px)`}
                        >
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-orange-600 opacity-70 pointer-events-none">WO</span>
                          <div className={`${handleStyle} -top-1.5 -left-1.5 cursor-nw-resize`} onMouseDown={(e) => startWoResize(e, 'nw')} />
                          <div className={`${handleStyle} -top-1.5 -right-1.5 cursor-ne-resize`} onMouseDown={(e) => startWoResize(e, 'ne')} />
                          <div className={`${handleStyle} -bottom-1.5 -left-1.5 cursor-sw-resize`} onMouseDown={(e) => startWoResize(e, 'sw')} />
                          <div className={`${handleStyle} -bottom-1.5 -right-1.5 cursor-se-resize`} onMouseDown={(e) => startWoResize(e, 'se')} />
                        </div>
                      )
                    })()}

                    {/* Number Tag (draggable) — TOP layer, always above WO */}
                    {currentIncluded && (() => {
                      const pagePos = getPagePosition(currentPage)
                      return (
                        <div
                          onMouseDown={startTagDrag}
                          className="absolute rounded border border-blue-600 px-1 py-0.5 cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-blue-400 select-none text-center z-10"
                          style={{
                            left: `${pagePos.x}%`,
                            top: `${pagePos.y}%`,
                            transform: 'translate(-50%, -50%)',
                            backgroundColor: coverExistingNumber ? paperColor : undefined,
                            color: fontColor,
                            fontSize: `${Math.max(8, Math.round(fontSize * 500 / pageDimensions.height))}px`,
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
                    )
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-(--color-text-3)">
                Pratinjau Dokumen Word (.docx)
              </span>
              <div className="rounded border border-(--color-border) bg-(--color-surface-2) p-3 text-xs text-(--color-text-2) font-mono leading-relaxed max-h-40 overflow-auto">
                {docxTextSummary || 'Membaca dokumen…'}
              </div>
              <p className="text-xs text-(--color-text-3)">
                Field code XML penomoran halaman standar Word (<code className="text-blue-500 font-mono">w:fldSimple w:instr=&quot;PAGE&quot;</code>) akan disematkan di {POSITION_PRESETS.find(p => p.id === positionPreset)?.label.toLowerCase()}.
              </p>
            </div>
          )}

          {error && (
            <p className="rounded border border-(--color-danger-light) bg-(--color-danger-light) px-3 py-2 text-sm text-(--color-danger) animate-fade-in">
              {error}
            </p>
          )}

          {/* Action button */}
          {!resultBlob && (
            <button
              onClick={processPageNumbering}
              disabled={processing}
              className="flex w-full items-center justify-center gap-2 rounded bg-(--color-brand) px-4 py-2.5 text-sm font-medium text-white hover:bg-(--color-brand-hover) disabled:opacity-60 transition-all active:scale-[0.99]"
            >
              {processing && <Loader2 size={16} className="animate-spin" />}
              {processing ? 'Menyematkan Nomor Halaman…' : `Simpan & Terapkan Nomor Halaman (${fileType.toUpperCase()})`}
            </button>
          )}

          {resultBlob && (
            <div className="rounded-lg border border-(--color-success-light) bg-(--color-success-light) p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-(--color-success)">✓ Selesai diproses</p>
                  <p className="text-xs text-(--color-text-3)">{base}_numbered.{outExt} — {fmtBytes(resultBlob.size)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={URL.createObjectURL(resultBlob)}
                    download={`${base}_numbered.${outExt}`}
                    className="flex items-center gap-1.5 rounded bg-(--color-success) px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity no-underline"
                  >
                    <Download size={14} /> Download
                  </a>
                  <button
                    onClick={() => { setResultBlob(null); setResultPages([]) }}
                    className="rounded p-1.5 text-(--color-text-3) hover:bg-(--color-surface-3)"
                    title="Tutup"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Result Preview */}
              {renderingResult && (
                <div className="rounded border border-(--color-border) bg-(--color-surface) p-6 space-y-3">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={28} className="animate-spin text-(--color-brand)" />
                    <span className="text-xs font-medium text-(--color-text-3)">Merender preview hasil…</span>
                  </div>
                </div>
              )}
              {!renderingResult && resultPages.length > 0 && (
                <div className="rounded border border-(--color-border) bg-(--color-surface) p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-(--color-text-2)">Preview Hasil</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setResultCurrentPage(Math.max(1, resultCurrentPage - 1))} disabled={resultCurrentPage <= 1}
                        className="flex h-6 w-6 items-center justify-center rounded border border-(--color-border) text-(--color-text-2) hover:bg-(--color-surface-3) disabled:opacity-40">
                        <ChevronLeft size={14} />
                      </button>
                      <span className="font-bold text-(--color-text)">{resultCurrentPage} / {resultPages.length}</span>
                      <button onClick={() => setResultCurrentPage(Math.min(resultPages.length, resultCurrentPage + 1))} disabled={resultCurrentPage >= resultPages.length}
                        className="flex h-6 w-6 items-center justify-center rounded border border-(--color-border) text-(--color-text-2) hover:bg-(--color-surface-3) disabled:opacity-40">
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-center rounded border border-(--color-border) bg-(--color-surface-2) p-3 overflow-auto max-h-[600px]">
                    {resultPages[resultCurrentPage - 1] && (
                      <img src={resultPages[resultCurrentPage - 1].dataUrl} alt={`Page ${resultCurrentPage}`}
                        className="block max-h-[550px] w-auto shadow-sm" />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </ToolShell>
  )
}
