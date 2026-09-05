import { useState, useRef, useEffect } from 'react'
import { Loader2, Eraser } from 'lucide-react'
import { removeBackground } from '@imgly/background-removal'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import ProgressBar from '../../components/ProgressBar'
import { fmtBytes, stripExt, readAsDataURL } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'
import { BTN_CARD_ACTIVE, BTN_CARD_INACTIVE, BTN_TOGGLE_ACTIVE, BTN_TOGGLE_INACTIVE } from '../../utils/activeButtonStyles'

const MODEL_OPTIONS = [
  { id: 'isnet_fp16', label: 'Kualitas', desc: 'Terbaik, model lebih besar', size: '~40MB' },
  { id: 'isnet_quint8', label: 'Seimbang', desc: 'Cepat, kualitas baik', size: '~10MB' },
]

const OUTPUT_FORMATS = [
  { ext: 'png', mime: 'image/png', label: 'PNG (transparan)' },
  { ext: 'webp', mime: 'image/webp', label: 'WebP' },
]

function BeforeAfterSlider({ beforeSrc, afterSrc }) {
  const containerRef = useRef(null)
  const [pos, setPos] = useState(50)
  const isDragging = useRef(false)

  const updatePos = (e) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left
    setPos(Math.max(2, Math.min(98, (x / rect.width) * 100)))
  }

  useEffect(() => {
    const onMove = (e) => { if (isDragging.current) { e.preventDefault(); updatePos(e) } }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [])

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative rounded-lg border border-(--color-border) overflow-hidden cursor-ew-resize select-none bg-(--color-surface-2)"
        onMouseDown={(e) => { isDragging.current = true; updatePos(e) }}
        onTouchStart={(e) => { isDragging.current = true; updatePos(e) }}
        style={{ backgroundImage: 'linear-gradient(45deg,#cbd5e1 25%,transparent 25%,transparent 75%,#cbd5e1 75%),linear-gradient(45deg,#cbd5e1 25%,transparent 25%,transparent 75%,#cbd5e1 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0,10px 10px' }}
      >
        <img src={afterSrc} alt="Hasil" className="block w-full h-auto" draggable={false} />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
          <img src={beforeSrc} alt="Asli" className="block max-w-none" style={{ width: containerRef.current ? containerRef.current.getBoundingClientRect().width : '100%', height: 'auto' }} draggable={false} />
        </div>
        <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${pos}%` }}>
          <div className="absolute inset-y-0 -translate-x-1/2 w-0.5 bg-white shadow" />
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-white shadow flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></svg>
          </div>
        </div>
      </div>
      <p className="text-center text-[11px] text-(--color-text-3)">Geser untuk membandingkan — kiri: asli, kanan: hasil tanpa latar</p>
    </div>
  )
}

export default function BackgroundRemover() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [previewBefore, setPreviewBefore] = useState(null)
  const [model, setModel] = useState('isnet_fp16')
  const [format, setFormat] = useState('image/png')
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [resultBlob, setResultBlob] = useState(null)
  const [resultUrl, setResultUrl] = useState(null)
  const [error, setError] = useState('')

  const handleFile = async ([f]) => {
    if (!f) return
    setFile(f)
    setResultBlob(null)
    setResultUrl(null)
    setError('')
    setProgress(0)
    const url = await readAsDataURL(f)
    setPreviewBefore(url)
  }

  const process = async () => {
    if (!previewBefore) return
    setProcessing(true)
    setError('')
    setProgress(0)
    setProgressText('Memuat model AI… (unduhan pertama bisa butuh waktu)')
    setResultBlob(null)
    setResultUrl(null)
    try {
      const blob = await removeBackground(previewBefore, {
        model,
        device: 'gpu',
        output: { format, quality: 0.9 },
        progress: (key, current, total) => {
          const pct = total > 0 ? Math.round((current / total) * 100) : 0
          setProgress(pct)
          setProgressText(`${key} — ${pct}%`)
        },
      })
      setResultBlob(blob)
      const url = URL.createObjectURL(blob)
      setResultUrl(url)
    } catch {
      // GPU may fail on some devices; retry with CPU
      try {
        setProgressText('GPU tidak tersedia — mencoba CPU…')
        const blob = await removeBackground(previewBefore, {
          model,
          device: 'cpu',
          output: { format, quality: 0.9 },
          progress: (key, current, total) => {
            const pct = total > 0 ? Math.round((current / total) * 100) : 0
            setProgress(pct)
            setProgressText(`${key} — ${pct}%`)
          },
        })
        setResultBlob(blob)
        setResultUrl(URL.createObjectURL(blob))
      } catch (e2) {
        setError(`Gagal menghapus background: ${e2?.message || String(e2)}`)
      }
    } finally {
      setProcessing(false)
    }
  }

  const base = file ? stripExt(file.name) : 'image'
  const ext = format === 'image/webp' ? 'webp' : 'png'

  return (
    <ToolShell
      title="Hapus Background Foto"
      description="Hapus latar belakang foto secara otomatis dengan AI, hasil PNG transparan. Diproses 100% di browser, tanpa upload server."
    >
      <DropZone
        accept="image/*"
        onFiles={handleFile}
        label="Pilih foto yang latarnya ingin dihapus"
        hint="JPG, PNG, WebP — hasil transparan"
      />
      {file && <FilePreview file={file} />}

      {previewBefore && (
        <div className="space-y-3 animate-fade-in">
          <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3 space-y-3">
            <div>
              <label className="block mb-1.5 text-[10px] font-bold uppercase tracking-wider text-(--color-text-3)">Mode Model AI</label>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {MODEL_OPTIONS.map((m) => (
                  <button key={m.id} onClick={() => setModel(m.id)} disabled={processing}
                    className={`rounded border p-2 text-left transition ${model === m.id ? BTN_CARD_ACTIVE : BTN_CARD_INACTIVE}`}>
                    <span className="block text-xs font-bold">{m.label}</span>
                    <span className="block text-[10px] text-(--color-text-3)">{m.desc} · {m.size}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block mb-1.5 text-[10px] font-bold uppercase tracking-wider text-(--color-text-3)">Format Hasil</label>
              <div className="flex flex-wrap gap-1.5">
                {OUTPUT_FORMATS.map((f) => (
                  <button key={f.ext} onClick={() => setFormat(f.mime)} disabled={processing}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${format === f.mime ? BTN_TOGGLE_ACTIVE : BTN_TOGGLE_INACTIVE}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={process} disabled={processing}
              className={`flex w-full items-center justify-center gap-2 rounded px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.99] ${processing ? BTN_CARD_INACTIVE : BTN_CARD_ACTIVE}`}>
              {processing ? (<><Loader2 size={16} className="animate-spin" /> Membersihkan latar…</>) : (<><Eraser size={16} /> Hapus Background</>)}
            </button>
          </div>

          {processing && (
            <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4 space-y-2 animate-fade-in">
              <ProgressBar value={progress} label={progressText} />
            </div>
          )}

          {error && <p className="rounded border border-(--color-danger-light) bg-(--color-danger-light) px-3 py-2 text-sm text-(--color-danger) animate-fade-in">{error}</p>}

          {previewBefore && !resultUrl && !processing && (
            <div className="rounded-lg border border-(--color-border) overflow-hidden">
              <img src={previewBefore} alt="Pratinjau" className="block w-full h-auto max-h-[50vh] object-contain bg-(--color-surface-2)" />
            </div>
          )}

          {resultUrl && (
            <BeforeAfterSlider beforeSrc={previewBefore} afterSrc={resultUrl} />
          )}

          {resultBlob && (
            <ResultCard
              fileName={`${base}_no-bg.${ext}`}
              blob={resultBlob}
              extraInfo={`${fmtBytes(resultBlob.size)} · latar transparan`}
              outputMimeType={format}
              sourceRoute="background-remover"
              onReset={() => { setResultBlob(null); setResultUrl(null); setPreviewBefore(null); setFile(null) }}
            />
          )}
        </div>
      )}
    </ToolShell>
  )
}