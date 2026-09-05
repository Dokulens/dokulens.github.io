import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ShieldCheck, Zap, HelpCircle } from 'lucide-react'
import { setMeta, injectStructuredData } from '../utils/seo'

const FAQS = [
  {
    q: 'Apakah DokuLens benar-benar gratis?',
    a: 'Ya, semua alat DokuLens 100% gratis tanpa batasan, tanpa akun, dan tanpa watermark. Kamu bisa gunakan berulang kali tanpa biaya.',
  },
  {
    q: 'Apakah file saya aman? Apakah diunggah ke server?',
    a: 'Tidak pernah. DokuLens bekerja sepenuhnya di browser (client-side). Semua proses edit PDF, kompresi, watermark, hingga image carver dilakukan di perangkatmu sendiri. File tidak pernah meninggalkan komputermu — privasi mutlak terjamin.',
  },
  {
    q: 'Bagaimana cara menggabungkan beberapa PDF?',
    a: <>Buka alat <Link to="/merge-pdf" className="text-(--color-brand) hover:underline">Merge PDF</Link>, pilih beberapa file PDF atau gambar, atur urutan, samakan ukuran halaman, lalu unduh hasil gabungannya. Semua selesai dalam hitungan detik.</>,
  },
  {
    q: 'Bisakah saya mengompres PDF agar lebih kecil?',
    a: <>Ya, gunakan <Link to="/compress-pdf" className="text-(--color-brand) hover:underline">Compress PDF</Link> untuk memperkecil ukuran PDF dengan tetap menjaga kualitas teks dan gambar.</>,
  },
  {
    q: 'Bagaimana cara menambah nomor halaman pada PDF?',
    a: <>Gunakan <Link to="/add-page-number" className="text-(--color-brand) hover:underline">Tambah Nomor Halaman</Link>. Pilih posisi (atas/bawah/kiri/kanan), format angka, dan rentang halaman, lalu unduh hasilnya.</>,
  },
  {
    q: 'Apakah ada watermark AI yang bisa dihapus?',
    a: <>Ya. Alat <Link to="/watermark-remover" className="text-(--color-brand) hover:underline">Hapus Watermark</Link> memakai Reverse Alpha Blending dan inpainting untuk menghilangkan cap air (termasuk watermark AI seperti Gemini/Imagen), logo, dan objek tak diinginkan dari foto.</>,
  },
  {
    q: 'Format gambar apa saja yang didukung?',
    a: <>Kami mendukung JPG, PNG, WebP, AVIF, BMP, GIF dan ICO melalui <Link to="/image-convert" className="text-(--color-brand) hover:underline">Konversi Gambar</Link>. Kamu juga bisa mengubah gambar menjadi PDF atau sebaliknya.</>,
  },
  {
    q: 'Apakah DokuLens bekerja offline?',
    a: 'Ya. Setelah halaman dimuat, hampir semua alat dapat berjalan tanpa koneksi internet karena semua pustaka dipakai secara lokal di browser (PWA).',
  },
]

export default function Faq() {
  useEffect(() => {
    injectStructuredData()
    setMeta({
      title: 'FAQ — Pertanyaan Umum',
      path: '/faq',
      description: 'Jawaban atas pertanyaan umum tentang DokuLens: keamanan file, cara merge/kompres PDF, hapus watermark, format gambar, dan cara kerja offline.',
      keywords: 'faq dokulens, tanya jawab pdf, cara merge pdf, cara kompres pdf, hapus watermark, privasi pdf',
    })
  }, [])

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-(--color-brand-light) text-(--color-brand)">
          <HelpCircle size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-(--color-text)">Pertanyaan yang Sering Diajukan (FAQ)</h1>
          <p className="mt-1 text-sm text-(--color-text-2)">Informasi lengkap tentang privasi, fitur, dan cara menggunakan DokuLens.</p>
        </div>
      </div>

      <div className="space-y-3">
        {FAQS.map((f, i) => (
          <details key={i} className="group rounded-lg border border-(--color-border) bg-(--color-surface) p-4 open:bg-(--color-surface-2)">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-(--color-text)">
              <span>{f.q}</span>
              <ChevronDown size={16} className="shrink-0 text-(--color-text-3) transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2 text-sm text-(--color-text-2) leading-relaxed">{f.a}</p>
          </details>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-2.5 rounded-lg border border-(--color-border) bg-(--color-surface) p-3.5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-(--color-success)" />
          <p className="text-xs text-(--color-text-2) leading-relaxed"><span className="font-semibold text-(--color-text)">Privasi mutlak.</span> File diproses lokal di browser — tidak pernah diunggah.</p>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-(--color-border) bg-(--color-surface) p-3.5">
          <Zap size={18} className="mt-0.5 shrink-0 text-(--color-brand)" />
          <p className="text-xs text-(--color-text-2) leading-relaxed"><span className="font-semibold text-(--color-text)">Cepat & gratis.</span> Tanpa antrean upload, hasil selesai dalam hitungan detik.</p>
        </div>
      </div>
    </div>
  )
}