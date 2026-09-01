import { useState, useRef } from 'react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import {
  ChevronLeft, ChevronRight, Trash2,
  ScanText, Loader2, Sparkles, Eye, EyeOff,
  Type, RefreshCw, Check
} from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import { pdfjsLib, renderPageToDataUrl, extractPageTextItems } from '../../utils/pdfRender'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

const FONT_OPTIONS = [
  { id: 'Helvetica', label: 'Helvetica / Arial (Modern Sans-Serif)', css: 'font-sans' },
  { id: 'TimesRoman', label: 'Times Roman (Formal / Skripsi / Serif)', css: 'font-serif' },
  { id: 'Courier', label: 'Courier (Monospace / Ketikan Mesin)', css: 'font-mono' },
]

export default function EditPDF() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageData, setPageData] = useState(null)
  const [textBlocks, setTextBlocks] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showDetectedBoxes, setShowDetectedBoxes] = useState(true)
  const [hoveredId, setHoveredId] = useState(null)
  const [loadingPage, setLoadingPage] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const containerRef = useRef(null)
  const pdfDocRef = useRef(null)

  const handleFile = async ([f]) => {
    setFile(f)
    setTextBlocks([])
    setSelectedId(null)
    setResult(null)
    setError('')
    setCurrentPage(1)
    setLoadingPage(true)

    try {
      const arrayBuf = await readAsArrayBuffer(f)
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) })
      const doc = await loadingTask.promise
      pdfDocRef.current = doc
      setTotalPages(doc.numPages)
      await loadPageAndDetectText(doc, 1)
    } catch (e) {
      setError(`Gagal membaca file PDF: ${e.message}`)
    } finally {
      setLoadingPage(false)
    }
  }

  const loadPageAndDetectText = async (doc, pageNum) => {
    setLoadingPage(true)
    try {
      const data = await renderPageToDataUrl(doc, pageNum, 1.5)
      setPageData(data)

      const alreadyHasPage = textBlocks.some((b) => b.page === pageNum)
      if (!alreadyHasPage) {
        const detected = await extractPageTextItems(doc, pageNum, 1.5, data.canvas)
        setTextBlocks((prev) => [...prev, ...detected])
      }
    } catch (e) {
      setError(`Gagal mendeteksi teks halaman: ${e.message}`)
    } finally {
      setLoadingPage(false)
    }
  }

  const changePage = async (delta) => {
    const target = currentPage + delta
    if (target < 1 || target > totalPages || !pdfDocRef.current) return
    setCurrentPage(target)
    setSelectedId(null)
    await loadPageAndDetectText(pdfDocRef.current, target)
  }

  const handleCanvasClick = (e) => {
    if (!containerRef.current) return
    if (e.target.closest('.text-block-item')) return

    const rect = containerRef.current.getBoundingClientRect()
    const xPct = ((e.clientX - rect.left) / rect.width) * 100
    const yPct = ((e.clientY - rect.top) / rect.height) * 100

    const pW = pageData?.pageWidth || 595.28
    const pH = pageData?.pageHeight || 841.89

    const pdfX = (xPct / 100) * pW
    const pdfY = pH - (yPct / 100) * pH - 12

    const newId = `custom-${currentPage}-${crypto.randomUUID().slice(0, 6)}`
    const newBlock = {
      id: newId,
      page: currentPage,
      originalText: '',
      text: 'Teks Baru',
      fontSize: 12,
      fontFamily: 'Helvetica',
      fontNameRaw: 'Helvetica',
      pdfX,
      pdfY,
      pdfWidth: 60,
      pdfHeight: 12,
      pageWidth: pW,
      pageHeight: pH,
      xPct,
      yPct,
      wPct: 15,
      hPct: 3,
      isEdited: true,
      isCustom: true,
      color: '#000000',
      bgColor: '#ffffff',
      bgR: 1, bgG: 1, bgB: 1,
      bold: false,
      italic: false,
    }
    setTextBlocks((prev) => [...prev, newBlock])
    setSelectedId(newId)
  }

  const updateBlock = (id, field, value) => {
    setTextBlocks((prev) =>
      prev.map((b) => {
        if (b.id === id) {
          const updated = { ...b, [field]: value }
          if (field === 'text') {
            updated.isEdited = value !== b.originalText
          } else if (field === 'fontSize' || field === 'color' || field === 'bold' || field === 'italic' || field === 'fontFamily' || field === 'bgColor') {
            updated.isEdited = true
          }
          return updated
        }
        return b
      }),
    )
  }

  const removeCustomBlock = (id) => {
    setTextBlocks((prev) => prev.filter((b) => b.id !== id))
    setSelectedId(null)
  }

  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    return { r, g, b }
  }

  const savePDF = async () => {
    if (!file) return
    setProcessing(true)
    setError('')
    try {
      const arrayBuf = await readAsArrayBuffer(file)
      const doc = await PDFDocument.load(arrayBuf, { ignoreEncryption: true })

      // Embed full font variants (regular, bold, italic, bold-italic)
      const fonts = {
        Helvetica: {
          regular: await doc.embedFont(StandardFonts.Helvetica),
          bold: await doc.embedFont(StandardFonts.HelveticaBold),
          italic: await doc.embedFont(StandardFonts.HelveticaOblique),
          boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
        },
        TimesRoman: {
          regular: await doc.embedFont(StandardFonts.TimesRoman),
          bold: await doc.embedFont(StandardFonts.TimesRomanBold),
          italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
          boldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
        },
        Courier: {
          regular: await doc.embedFont(StandardFonts.Courier),
          bold: await doc.embedFont(StandardFonts.CourierBold),
          italic: await doc.embedFont(StandardFonts.CourierOblique),
          boldItalic: await doc.embedFont(StandardFonts.CourierBoldOblique),
        },
      }

      const pages = doc.getPages()
      const editedBlocks = textBlocks.filter((b) => b.isEdited)

      for (const block of editedBlocks) {
        const pageIdx = block.page - 1
        if (pageIdx < 0 || pageIdx >= pages.length) continue
        const page = pages[pageIdx]
        const { width: pWidth, height: pHeight } = page.getSize()

        const fontSet = fonts[block.fontFamily] || fonts.Helvetica
        let font = fontSet.regular
        if (block.bold && block.italic) font = fontSet.boldItalic
        else if (block.bold) font = fontSet.bold
        else if (block.italic) font = fontSet.italic

        const fontSize = Number(block.fontSize) || 12
        const textColor = hexToRgb(block.color || '#000000')
        const bgColor = block.bgColor ? hexToRgb(block.bgColor) : { r: 1, g: 1, b: 1 }

        if (block.isCustom) {
          // Custom inserted text
          const itemX = (block.xPct / 100) * pWidth
          const itemY = pHeight - (block.yPct / 100) * pHeight - fontSize

          page.drawText(block.text || '', {
            x: itemX,
            y: itemY,
            size: fontSize,
            font,
            color: rgb(textColor.r, textColor.g, textColor.b),
          })
        } else {
          // Detected text in-place modification
          const origX = block.pdfX
          const origY = block.pdfY
          const origW = Math.max(block.pdfWidth, font.widthOfTextAtSize(block.originalText || '', fontSize))
          const coverHeight = fontSize * 1.25

          // 1. Cover old text precisely
          page.drawRectangle({
            x: origX - 0.5,
            y: origY - (fontSize * 0.25),
            width: origW + 1.5,
            height: coverHeight,
            color: rgb(bgColor.r, bgColor.g, bgColor.b),
          })

          // 2. Draw replacement text at exact baseline
          if (block.text && block.text.trim()) {
            page.drawText(block.text, {
              x: origX,
              y: origY,
              size: fontSize,
              font,
              color: rgb(textColor.r, textColor.g, textColor.b),
            })
          }
        }
      }

      const bytes = await doc.save()
      setResult(new Blob([bytes], { type: 'application/pdf' }))
    } catch (e) {
      setError(`Gagal menyimpan: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const currentPageBlocks = textBlocks.filter((b) => b.page === currentPage)
  const editedCount = textBlocks.filter((b) => b.isEdited).length
  const selectedBlock = textBlocks.find((b) => b.id === selectedId)
  const base = file ? stripExt(file.name) : 'document'

  return (
    <ToolShell
      title="Edit PDF (Deteksi Teks & Font Presisi)"
      description="Teks, jenis font asli, ukuran (pt), ketebalan (bold/italic), dan warna latar terdeteksi otomatis secara presisi. Klik langsung kata pada dokumen untuk menggantinya."
    >
      <DropZone accept=".pdf,application/pdf" onFiles={handleFile} label="Pilih file PDF untuk diedit" />
      {file && <FilePreview file={file} />}

      {file && (
        <div className="space-y-4 animate-fade-in">
          {/* Top toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[--color-border] bg-[--color-surface] p-3 text-xs">
            {/* Page navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => changePage(-1)}
                disabled={currentPage <= 1 || loadingPage}
                className="flex h-7 w-7 items-center justify-center rounded border border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3] hover:text-[--color-text] disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-semibold text-[--color-text]">
                Halaman {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => changePage(1)}
                disabled={currentPage >= totalPages || loadingPage}
                className="flex h-7 w-7 items-center justify-center rounded border border-[--color-border] text-[--color-text-2] hover:bg-[--color-surface-3] hover:text-[--color-text] disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Status & view options */}
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 font-semibold text-[--color-brand-text] bg-[--color-brand-light] px-2.5 py-1 rounded">
                <ScanText size={14} />
                {currentPageBlocks.length} teks terdeteksi
              </span>
              <button
                type="button"
                onClick={() => setShowDetectedBoxes(!showDetectedBoxes)}
                className="flex items-center gap-1 rounded border border-[--color-border] bg-[--color-surface] px-2.5 py-1 text-[--color-text-2] hover:bg-[--color-surface-3] hover:text-[--color-text] transition-colors"
                title="Tampilkan / Sembunyikan Kotak Deteksi"
              >
                {showDetectedBoxes ? <Eye size={14} /> : <EyeOff size={14} />}
                <span>{showDetectedBoxes ? 'Kotak Aktif' : 'Kotak Tersembunyi'}</span>
              </button>
            </div>
          </div>

          <div className="rounded border border-[--color-border] bg-[--color-surface-3] p-2.5 text-xs text-[--color-text-2] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="shrink-0 text-[--color-brand]" />
              <span>
                <strong>Klik teks apapun</strong> pada dokumen untuk mengubah isi kata. Ukuran & jenis font asli otomatis terisi.
              </span>
            </div>
            {editedCount > 0 && (
              <span className="font-bold text-[--color-brand] bg-[--color-brand-light] px-2 py-0.5 rounded shrink-0">
                {editedCount} diedit
              </span>
            )}
          </div>

          {/* Interactive Document Preview */}
          <div className="relative flex justify-center rounded-lg border border-[--color-border] bg-[--color-surface-2] p-4 overflow-auto min-h-[450px]">
            {loadingPage && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[--color-surface]/70 backdrop-blur-xs">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 size={26} className="animate-spin text-[--color-brand]" />
                  <span className="text-xs font-medium text-[--color-text-2]">Menganalisis teks & font dokumen…</span>
                </div>
              </div>
            )}

            {pageData && (
              <div
                ref={containerRef}
                onClick={handleCanvasClick}
                className="relative inline-block border border-[--color-border] bg-white cursor-text select-none"
                style={{ maxWidth: '100%' }}
              >
                <img
                  src={pageData.dataUrl}
                  alt={`Page ${currentPage}`}
                  className="block max-h-[650px] w-auto pointer-events-none"
                />

                {/* Detected & Custom Text Overlays (Exact Font Matching) */}
                {currentPageBlocks.map((b) => {
                  const isSelected = b.id === selectedId
                  const isHovered = b.id === hoveredId
                  const hasChanged = b.isEdited

                  return (
                    <div
                      key={b.id}
                      onMouseEnter={() => setHoveredId(b.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedId(b.id)
                      }}
                      className={[
                        'text-block-item absolute cursor-pointer rounded transition-all duration-100 select-none',
                        hasChanged ? 'font-semibold ring-1.5 ring-[--color-brand]' : '',
                        !hasChanged && showDetectedBoxes
                          ? isHovered
                            ? 'bg-blue-500/25 ring-1.5 ring-blue-500'
                            : 'bg-blue-500/10 hover:bg-blue-500/20 ring-0.5 ring-blue-400/40'
                          : '',
                        isSelected ? 'ring-2 ring-[--color-brand] z-10' : 'z-5',
                      ].join(' ')}
                      style={{
                        left: `${b.xPct}%`,
                        top: `${b.yPct}%`,
                        backgroundColor: hasChanged ? b.bgColor || '#ffffff' : undefined,
                        color: hasChanged ? b.color : 'transparent',
                        fontSize: `${b.fontSize}px`,
                        fontWeight: b.bold ? 'bold' : 'normal',
                        fontStyle: b.italic ? 'italic' : 'normal',
                        fontFamily: b.fontFamily === 'TimesRoman' ? 'Times New Roman, serif' : b.fontFamily === 'Courier' ? 'Courier New, monospace' : 'Arial, sans-serif',
                        lineHeight: 1.0,
                        padding: 0,
                        margin: 0,
                      }}
                    >
                      <span className={hasChanged ? '' : 'opacity-0 select-none'}>
                        {b.text || ' '}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Inline Edit Panel with Automatic Font Detection Values */}
          {selectedBlock && (
            <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-[--color-border] pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-[--color-brand-light] text-[--color-brand]">
                    <Type size={14} />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-[--color-text]">
                    {selectedBlock.isCustom ? 'Teks Kustom Baru' : 'Edit Teks Terdeteksi'}
                  </span>
                  {!selectedBlock.isCustom && (
                    <span className="rounded bg-[--color-surface-3] px-2 py-0.5 text-[10px] font-semibold text-[--color-text-2]">
                      Font Terdeteksi: <strong>{selectedBlock.fontNameRaw}</strong> ({selectedBlock.fontSize}pt {selectedBlock.bold ? 'Bold' : ''} {selectedBlock.italic ? 'Italic' : ''})
                    </span>
                  )}
                </div>

                {selectedBlock.isCustom ? (
                  <button
                    onClick={() => removeCustomBlock(selectedBlock.id)}
                    className="flex items-center gap-1 text-xs text-[--color-danger] hover:underline"
                  >
                    <Trash2 size={13} /> Hapus
                  </button>
                ) : (
                  <button
                    onClick={() => updateBlock(selectedBlock.id, 'text', selectedBlock.originalText)}
                    disabled={!selectedBlock.isEdited}
                    className="text-xs text-[--color-text-3] hover:text-[--color-text] disabled:opacity-40"
                  >
                    Kembalikan ke Asli
                  </button>
                )}
              </div>

              {!selectedBlock.isCustom && (
                <div className="text-xs text-[--color-text-3] bg-[--color-surface-2] p-2.5 rounded border border-[--color-border]">
                  <span className="font-semibold text-[--color-text-2]">Teks Asli: </span>
                  &quot;{selectedBlock.originalText}&quot;
                </div>
              )}

              <div>
                <label className="block mb-1 text-xs font-semibold text-[--color-text-2]">
                  Teks Pengganti
                </label>
                <input
                  type="text"
                  autoFocus
                  value={selectedBlock.text}
                  onChange={(e) => updateBlock(selectedBlock.id, 'text', e.target.value)}
                  placeholder="Ketik teks pengganti..."
                  className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm font-medium outline-none focus:border-[--color-brand] transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <label className="block mb-1 text-xs font-semibold text-[--color-text-2]">Keluarga Font</label>
                  <select
                    value={selectedBlock.fontFamily || 'Helvetica'}
                    onChange={(e) => updateBlock(selectedBlock.id, 'fontFamily', e.target.value)}
                    className="w-full rounded border border-[--color-border] bg-[--color-surface] px-2.5 py-1.5 text-xs outline-none focus:border-[--color-brand]"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-xs font-semibold text-[--color-text-2]">
                    Ukuran Font: {selectedBlock.fontSize}pt
                  </label>
                  <input
                    type="number"
                    min="4"
                    max="72"
                    step="0.5"
                    value={selectedBlock.fontSize}
                    onChange={(e) => updateBlock(selectedBlock.id, 'fontSize', Number(e.target.value))}
                    className="w-full rounded border border-[--color-border] bg-[--color-surface] px-2.5 py-1.5 text-xs outline-none focus:border-[--color-brand]"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-xs font-semibold text-[--color-text-2]">Warna Teks</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={selectedBlock.color}
                      onChange={(e) => updateBlock(selectedBlock.id, 'color', e.target.value)}
                      className="h-7 w-10 cursor-pointer rounded border border-[--color-border]"
                    />
                    <span className="text-xs text-[--color-text-3] uppercase font-mono">{selectedBlock.color}</span>
                  </div>
                </div>

                <div>
                  <label className="block mb-1 text-xs font-semibold text-[--color-text-2]">Warna Penutup Latar</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={selectedBlock.bgColor || '#ffffff'}
                      onChange={(e) => updateBlock(selectedBlock.id, 'bgColor', e.target.value)}
                      className="h-7 w-10 cursor-pointer rounded border border-[--color-border]"
                    />
                    <span className="text-xs text-[--color-text-3] uppercase font-mono">{selectedBlock.bgColor || '#ffffff'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-5 pt-1 text-xs text-[--color-text-2]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBlock.bold}
                    onChange={(e) => updateBlock(selectedBlock.id, 'bold', e.target.checked)}
                  />
                  <span>Tebal (Bold)</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBlock.italic}
                    onChange={(e) => updateBlock(selectedBlock.id, 'italic', e.target.checked)}
                  />
                  <span>Miring (Italic)</span>
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger] animate-fade-in">
          {error}
        </p>
      )}

      {file && !result && (
        <button
          onClick={savePDF}
          disabled={processing || editedCount === 0}
          className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-50 transition-all active:scale-[0.99]"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing
            ? 'Menyimpan Perubahan…'
            : editedCount > 0
            ? `Simpan & Download PDF (${editedCount} Teks Diperbarui)`
            : 'Pilih & Ubah Teks untuk Menyimpan'}
        </button>
      )}

      {result && (
        <ResultCard
          fileName={`${base}_edited.pdf`}
          blob={result}
          extraInfo={`${editedCount} teks diperbarui — ${fmtBytes(result.size)}`}
          outputMimeType="application/pdf"
          sourceRoute="edit-pdf"
          onReset={() => {
            setResult(null)
            setFile(null)
            setTextBlocks([])
            setSelectedId(null)
          }}
        />
      )}
    </ToolShell>
  )
}
