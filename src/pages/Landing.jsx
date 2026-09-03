import { Link } from 'react-router-dom'
import * as Icons from 'lucide-react'
import { NAV_GROUPS } from '../navConfig'

function NavIcon({ name, size = 20 }) {
  const Comp = Icons[name]
  return Comp ? <Comp size={size} /> : null
}

const FEATURES = [
  { icon: 'ShieldCheck', title: '100% Client-Side & Offline', desc: 'File tidak pernah dikirim ke server. Semua proses terjadi langsung di browser perangkat Anda.' },
  { icon: 'Zap', title: 'Cepat & Tanpa Antrean', desc: 'Tanpa proses antrean upload. Hasil dokumen selesai diproses dalam hitungan detik.' },
  { icon: 'Sparkles', title: 'Lengkap & Gratis', desc: 'Semua alat pengolah PDF, dokumen Word, dan editor gambar tersedia gratis tanpa batasan akun.' },
]

export default function Landing() {
  return (
    <div className="mx-auto max-w-5xl animate-fade-in pb-8">
      {/* Hero */}
      <section className="mb-10 text-center">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-surface) px-3.5 py-1 text-xs font-medium text-(--color-text-2) transition-colors">
          <Icons.ShieldCheck size={14} className="text-(--color-success)" />
          <span>Privasi Mutlak — Nol Data Diunggah ke Server</span>
        </div>
        <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-(--color-text) sm:text-4xl">
          Studio Olah Dokumen & Gambar
        </h1>
        <p className="mx-auto max-w-2xl text-sm sm:text-base text-(--color-text-2) leading-relaxed">
          Edit, tambah nomor halaman, gabung, kompresi, ubah PDF ↔ Word, crop & rotasi, dan content-aware image carver langsung di browser.
        </p>
      </section>

      {/* Feature cards */}
      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="interactive-card rounded-lg bg-(--color-surface) p-4 transition-all"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded bg-(--color-brand-light) text-(--color-brand)">
              <NavIcon name={f.icon} size={18} />
            </div>
            <p className="mb-1 text-sm font-semibold text-(--color-text)">{f.title}</p>
            <p className="text-xs text-(--color-text-2) leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Tool Groups */}
      <div className="space-y-8">
        {NAV_GROUPS.map((group) => (
          <section key={group.label}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-(--color-text-3)">
                {group.label}
              </h2>
              <div className="h-px flex-1 bg-(--color-border)" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <Link
                  key={item.path}
                  to={`/${item.path}`}
                  className="interactive-card group flex items-start gap-3 rounded-lg border border-(--color-border) bg-(--color-surface) p-3.5 no-underline transition-all hover:bg-(--color-brand-light)"
                >
                  <div className="mt-0.5 shrink-0 text-(--color-brand) transition-transform duration-200 group-hover:scale-110">
                    <NavIcon name={item.icon} size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-(--color-text) group-hover:text-(--color-brand-text) transition-colors">
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-xs text-(--color-text-2) leading-snug">
                      {item.desc}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
