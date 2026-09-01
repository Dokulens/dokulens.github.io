import { useState } from 'react'
import { PDFDocument } from '@cantoo/pdf-lib'
import { Lock, Unlock, Loader2, KeyRound, ShieldAlert, CheckCircle2 } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

export default function PasswordPDF() {
  const [activeTab, setActiveTab] = useState('protect') // 'protect' | 'remove'
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [userPassword, setUserPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [restrictPermissions, setRestrictPermissions] = useState(true)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const handleFile = ([f]) => {
    setFile(f)
    setResult(null)
    setError('')
    setSuccessMsg('')
  }

  // 1. Genuine PDF Encryption with User/Owner Password and Permissions
  const handleProtect = async () => {
    if (!userPassword) {
      setError('Masukkan password pengguna untuk mengunci file.')
      return
    }
    if (userPassword !== confirmPassword) {
      setError('Konfirmasi password tidak cocok.')
      return
    }
    setProcessing(true)
    setError('')
    setSuccessMsg('')
    try {
      const arrayBuf = await readAsArrayBuffer(file)
      // Load source document
      const srcDoc = await PDFDocument.load(arrayBuf, { ignoreEncryption: true })
      
      // Create new clean document and copy all pages
      const doc = await PDFDocument.create()
      const copiedPages = await doc.copyPages(srcDoc, srcDoc.getPageIndices())
      copiedPages.forEach((p) => doc.addPage(p))

      // Apply real Standard PDF Encryption (AES-128 / RC4 compatible across Acrobat, Chrome, Preview, etc.)
      doc.encrypt({
        userPassword,
        ownerPassword: ownerPassword || `${userPassword}_admin_${Date.now()}`,
        permissions: restrictPermissions
          ? {
              printing: 'highResolution',
              modifying: false,
              copying: false,
              annotating: false,
              fillingForms: false,
              contentAccessibility: false,
              documentAssembly: false,
            }
          : undefined,
      })

      const encryptedBytes = await doc.save()
      const blob = new Blob([encryptedBytes], { type: 'application/pdf' })
      setResult(blob)
      setSuccessMsg('PDF berhasil dienkripsi! Siapapun yang membuka file ini harus memasukkan password yang Anda buat.')
    } catch (e) {
      setError(`Gagal mengenkripsi PDF: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  // 2. Remove Password & Decrypt Document
  const handleRemove = async () => {
    setProcessing(true)
    setError('')
    setSuccessMsg('')
    try {
      const arrayBuf = await readAsArrayBuffer(file)
      let doc
      try {
        // First try to load using the provided unlock password
        doc = await PDFDocument.load(arrayBuf, {
          password: unlockPassword || undefined,
        })
      } catch (loadErr) {
        // If failed and no password was provided, notify user
        if (!unlockPassword) {
          throw new Error('Dokumen ini terkunci. Silakan masukkan password pembuka di atas.')
        } else {
          throw new Error('Password yang dimasukkan salah. Dokumen tidak dapat dibuka.')
        }
      }

      // Re-save as completely unencrypted document
      const cleanDoc = await PDFDocument.create()
      const pages = await cleanDoc.copyPages(doc, doc.getPageIndices())
      pages.forEach((p) => cleanDoc.addPage(p))

      const decryptedBytes = await cleanDoc.save()
      const blob = new Blob([decryptedBytes], { type: 'application/pdf' })
      setResult(blob)
      setSuccessMsg('Password berhasil dihapus! File baru sekarang dapat dibuka bebas tanpa password.')
    } catch (e) {
      setError(e.message)
    } finally {
      setProcessing(false)
    }
  }

  const base = file ? stripExt(file.name) : 'document'

  return (
    <ToolShell
      title="Password & Keamanan PDF"
      description="Kunci PDF dengan enkripsi standar (wajib password saat dibuka) atau buka kunci PDF yang terproteksi."
    >
      <div className="flex border-b border-[--color-border]">
        <button
          onClick={() => { setActiveTab('protect'); setResult(null); setError(''); setSuccessMsg('') }}
          className={[
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'protect'
              ? 'border-[--color-brand] text-[--color-brand] font-semibold'
              : 'border-transparent text-[--color-text-2] hover:text-[--color-text]',
          ].join(' ')}
        >
          <Lock size={15} />
          Beri Password (Enkripsi)
        </button>
        <button
          onClick={() => { setActiveTab('remove'); setResult(null); setError(''); setSuccessMsg('') }}
          className={[
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'remove'
              ? 'border-[--color-brand] text-[--color-brand] font-semibold'
              : 'border-transparent text-[--color-text-2] hover:text-[--color-text]',
          ].join(' ')}
        >
          <Unlock size={15} />
          Buka Kunci Password
        </button>
      </div>

      <DropZone accept=".pdf,application/pdf" onFiles={handleFile} label="Pilih file PDF" />

      {file && activeTab === 'protect' && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[--color-text] truncate">{file.name}</span>
            <span className="shrink-0 text-[--color-text-3] ml-2">{fmtBytes(file.size)}</span>
          </div>

          <div className="rounded border border-[--color-brand-light] bg-[--color-brand-light] p-3 text-xs text-[--color-brand-text] flex gap-2">
            <KeyRound size={16} className="shrink-0 mt-0.5" />
            <span>
              File akan dienkripsi dengan standar PDF Security. Saat file dibuka di browser (Chrome, Edge, Safari), Adobe Acrobat, atau HP, aplikasi akan langsung meminta password ini.
            </span>
          </div>

          <div>
            <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
              Password Pembuka (User Password) *
            </label>
            <input
              type="password"
              value={userPassword}
              onChange={(e) => setUserPassword(e.target.value)}
              placeholder="Masukkan password untuk membuka PDF"
              className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm outline-none focus:border-[--color-brand]"
            />
          </div>

          <div>
            <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
              Konfirmasi Password *
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi password di atas"
              className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm outline-none focus:border-[--color-brand]"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs text-[--color-text-2] cursor-pointer">
              <input
                type="checkbox"
                checked={restrictPermissions}
                onChange={(e) => setRestrictPermissions(e.target.checked)}
              />
              Batasi izin edit dan salin teks (Permissions Restriction)
            </label>
          </div>
        </div>
      )}

      {file && activeTab === 'remove' && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[--color-text] truncate">{file.name}</span>
            <span className="shrink-0 text-[--color-text-3] ml-2">{fmtBytes(file.size)}</span>
          </div>

          <div className="rounded border border-[--color-border] bg-[--color-surface-2] p-3 text-xs text-[--color-text-2] flex gap-2">
            <ShieldAlert size={16} className="shrink-0 mt-0.5 text-amber-500" />
            <span>
              Masukkan password yang saat ini digunakan untuk membuka file. Dokumen baru akan disimpan tanpa proteksi password apapun.
            </span>
          </div>

          <div>
            <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-[--color-text-3]">
              Password Dokumen Saat Ini
            </label>
            <input
              type="password"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              placeholder="Ketik password untuk membuka kunci..."
              className="w-full rounded border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm outline-none focus:border-[--color-brand]"
            />
          </div>
        </div>
      )}

      {error && (
        <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger] animate-fade-in">
          {error}
        </p>
      )}

      {successMsg && !result && (
        <p className="rounded border border-[--color-success-light] bg-[--color-success-light] px-3 py-2 text-sm text-[--color-success] flex items-center gap-1.5 animate-fade-in">
          <CheckCircle2 size={16} />
          {successMsg}
        </p>
      )}

      {file && !result && (
        <button
          onClick={activeTab === 'protect' ? handleProtect : handleRemove}
          disabled={processing || (activeTab === 'protect' && !userPassword)}
          className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-colors"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Memproses Enkripsi…' : activeTab === 'protect' ? 'Enkripsi & Kunci PDF' : 'Buka Kunci Dokumen'}
        </button>
      )}

      {result && (
        <ResultCard
          fileName={activeTab === 'protect' ? `${base}_protected.pdf` : `${base}_unlocked.pdf`}
          blob={result}
          extraInfo={activeTab === 'protect' ? `Terkunci dengan password — ${fmtBytes(result.size)}` : `Bebas password — ${fmtBytes(result.size)}`}
          outputMimeType="application/pdf"
          sourceRoute="password-pdf"
          onReset={() => {
            setResult(null)
            setFile(null)
            setUserPassword('')
            setConfirmPassword('')
            setOwnerPassword('')
            setUnlockPassword('')
            setError('')
            setSuccessMsg('')
          }}
        />
      )}
    </ToolShell>
  )
}
