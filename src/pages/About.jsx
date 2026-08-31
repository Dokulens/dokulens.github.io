import { ExternalLink, Code2, ShieldCheck, Cpu, HardDrive, Sparkles } from 'lucide-react'

const LIBRARIES = [
  {
    name: 'pdf-lib & @cantoo/pdf-lib',
    category: 'Manipulasi & Enkripsi PDF',
    desc: 'Membuat, menggabungkan, membagi, memutar, memberi watermark, dan menerapkan enkripsi password dokumen PDF standar.',
    link: 'https://github.com/cantoo-scribe/pdf-lib',
    license: 'MIT',
  },
  {
    name: 'pdfjs-dist (Mozilla PDF.js)',
    category: 'Rendering & Text Parsing',
    desc: 'Merender halaman PDF ke resolusi tinggi dan mengekstrak lapisan teks, bounding box, serta deteksi font secara presisi.',
    link: 'https://github.com/mozilla/pdf.js',
    license: 'Apache 2.0',
  },
  {
    name: 'docx',
    category: 'Generasi Dokumen Word',
    desc: 'Menghasilkan file Microsoft Word (.docx) berbasis XML standar secara murni di JavaScript client-side.',
    link: 'https://github.com/dolanmiu/docx',
    license: 'MIT',
  },
  {
    name: 'mammoth.js',
    category: 'Parser Dokumen Word (.docx)',
    desc: 'Membaca dan mengonversi berkas dokumen .docx menjadi teks dan format paragraf yang terstruktur.',
    link: 'https://github.com/mwilliamson/mammoth.js',
    license: 'BSD-2-Clause',
  },
  {
    name: 'js-image-carver (Seam Carving Algorithm)',
    category: 'Content-Aware Image Resizing',
    desc: 'Algoritma Dual-Gradient Energy & Dynamic Programming untuk resize foto cerdas tanpa distorsi dan penghapusan objek bertarget.',
    link: 'https://github.com/trekhleb/js-image-carver',
    license: 'MIT',
  },
  {
    name: 'jszip',
    category: 'Kompresi & Arsip File',
    desc: 'Membuat arsip berkas ZIP secara otomatis di browser untuk ekspor banyak halaman atau batch berkas gambar.',
    link: 'https://github.com/Stuk/jszip',
    license: 'MIT / GPLv3',
  },
  {
    name: '@dnd-kit (Core & Sortable)',
    category: 'Interaksi Drag and Drop',
    desc: 'Toolkit drag & drop modern yang ringan dan aksesibel untuk pengurutan halaman PDF dan berkas gambar.',
    link: 'https://dndkit.com',
    license: 'MIT',
  },
  {
    name: 'lucide-react',
    category: 'Ikonografi Antarmuka',
    desc: 'Kumpulan ikon vektor modern yang konsisten dan tajam untuk antarmuka pengguna.',
    link: 'https://lucide.dev',
    license: 'ISC',
  },
  {
    name: 'Tailwind CSS & Vite',
    category: 'Styling & Build Engine',
    desc: 'Kerangka styling utility-first dan bundler ultra-cepat untuk static single-page application (SPA).',
    link: 'https://vite.dev',
    license: 'MIT',
  },
]

export default function About() {
  return (
    <div className="mx-auto max-w-4xl animate-fade-in pb-10">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[--color-border] bg-[--color-surface] px-3 py-0.5 text-xs font-semibold text-[--color-brand-text]">
          <ShieldCheck size={14} className="text-[--color-success]" />
          Arsitektur 100% Client-Side
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[--color-text] sm:text-3xl">
          Tentang DokuLens & Open-Source Libraries
        </h1>
        <p className="mt-2 text-sm sm:text-base text-[--color-text-2] leading-relaxed">
          DokuLens dirancang dengan filosofi privasi total tanpa backend server, tanpa basis data, dan tanpa biaya infrastruktur. Semua komputasi berlangsung di browser perangkat pengguna melalui teknologi Web API dan pustaka open-source JavaScript pilihan.
        </p>
      </div>

      {/* Highlights Grid */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded bg-[--color-brand-light] text-[--color-brand]">
            <HardDrive size={16} />
          </div>
          <p className="text-sm font-semibold text-[--color-text]">Nol Upload Server</p>
          <p className="text-xs text-[--color-text-2] mt-0.5 leading-relaxed">
            Data atau dokumen Anda tidak pernah terkirim ke jaringan manapun.
          </p>
        </div>

        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded bg-[--color-brand-light] text-[--color-brand]">
            <Cpu size={16} />
          </div>
          <p className="text-sm font-semibold text-[--color-text]">Komputasi Lokal</p>
          <p className="text-xs text-[--color-text-2] mt-0.5 leading-relaxed">
            Memanfaatkan Canvas API, TypedArrays, dan Worker browser untuk performa instan.
          </p>
        </div>

        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded bg-[--color-brand-light] text-[--color-brand]">
            <Code2 size={16} />
          </div>
          <p className="text-sm font-semibold text-[--color-text]">Static Hosting</p>
          <p className="text-xs text-[--color-text-2] mt-0.5 leading-relaxed">
            Dapat di-deploy gratis di GitHub Pages, Vercel, Netlify, atau Cloudflare Pages.
          </p>
        </div>
      </div>

      {/* Library Table / Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[--color-border] pb-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[--color-text-3]">
            Daftar Library & Teknologi yang Digunakan
          </h2>
          <span className="text-xs text-[--color-text-3] font-medium">{LIBRARIES.length} Komponen</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LIBRARIES.map((lib) => (
            <div
              key={lib.name}
              className="interactive-card flex flex-col justify-between rounded-lg border border-[--color-border] bg-[--color-surface] p-4 transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-sm text-[--color-text]">{lib.name}</span>
                  <span className="rounded bg-[--color-surface-3] px-2 py-0.5 text-[10px] font-semibold text-[--color-text-3] shrink-0">
                    {lib.license}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-[--color-brand-text] mt-0.5">
                  {lib.category}
                </p>
                <p className="mt-2 text-xs text-[--color-text-2] leading-relaxed">
                  {lib.desc}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-[--color-border] flex justify-end">
                <a
                  href={lib.link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-[--color-brand] hover:underline font-medium"
                >
                  <span>Dokumentasi / Repo</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
