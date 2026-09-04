// SEO + social meta management (client-side SPA friendly).
// Updates <title>, meta description, canonical, and Open Graph / Twitter tags
// imperatively. Also injects a JSON-LD WebSite/SoftwareApplication block.

const SITE_NAME = 'DokuLens'
const SITE_URL = 'https://dokulens.github.io'
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`

function upsertMeta(attr, key, content) {
  if (!content) return
  const selector = `meta[${attr}="${key}"]`
  let el = document.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertProperty(prop, content) {
  upsertMeta('property', prop, content)
}

function upsertName(name, content) {
  upsertMeta('name', name, content)
}

function upsertCanonical(url) {
  let el = document.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', url)
}

/**
 * Set per-page SEO meta.
 * @param {{title:string, description:string, path?:string, image?:string, keywords?:string}} opts
 */
export function setMeta({ title, description, path = '/', image = DEFAULT_IMAGE, keywords }) {
  // clean path -> no trailing slash, "/" for root
  const cleanPath = path === '/' || path === '' ? '/' : `/${path.replace(/^\/+|\/+$/g, '')}`
  // Append brand only if it does not push the title past ~60 chars (Google truncation).
  const branded = title === SITE_NAME ? SITE_NAME : `${title} — ${SITE_NAME}`
  const fullTitle = title === SITE_NAME ? SITE_NAME : (branded.length <= 60 ? branded : title)
  const canonical = `${SITE_URL}${cleanPath === '/' ? '/' : cleanPath}`

  document.title = fullTitle

  upsertName('description', description)
  if (keywords) upsertName('keywords', keywords)

  // Open Graph
  upsertProperty('og:site_name', SITE_NAME)
  upsertProperty('og:title', fullTitle)
  upsertProperty('og:description', description)
  upsertProperty('og:type', 'website')
  upsertProperty('og:url', canonical)
  upsertProperty('og:image', image)

  // Twitter
  upsertName('twitter:card', 'summary_large_image')
  upsertName('twitter:title', fullTitle)
  upsertName('twitter:description', description)
  upsertName('twitter:image', image)

  upsertCanonical(canonical)
}

/**
 * Inject (once) a JSON-LD SoftwareApplication + WebSite structured-data blob.
 */
export function injectStructuredData() {
  if (document.getElementById('dokulens-jsonld')) return
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: SITE_NAME,
        url: SITE_URL,
        description: 'Studio olah dokumen & gambar 100% client-side: edit PDF, merge, split, kompresi, watermark, nomor halaman, crop, kolase, dan content-aware image carver — semua diproses lokal di browser tanpa server.',
        inLanguage: 'id',
      },
      {
        '@type': 'SoftwareApplication',
        name: SITE_NAME,
        url: SITE_URL,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Any',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'IDR' },
        featureList: [
          'Edit PDF',
          'Merge PDF',
          'Split PDF',
          'Compress PDF',
          'Watermark PDF',
          'Password & Keamanan PDF',
          'Tambah Nomor Halaman',
          'Konversi Gambar',
          'Kolase Gambar',
          'Content-aware Image Carver',
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Apakah DokuLens benar-benar gratis?',
            acceptedAnswer: { '@type': 'Answer', text: 'Ya, semua alat DokuLens 100% gratis tanpa batasan, tanpa akun, dan tanpa watermark.' },
          },
          {
            '@type': 'Question',
            name: 'Apakah file saya aman dan tidak diunggah ke server?',
            acceptedAnswer: { '@type': 'Answer', text: 'DokuLens bekerja sepenuhnya di browser (client-side). File tidak pernah meninggalkan perangkat Anda, sehingga privasi terjamin.' },
          },
          {
            '@type': 'Question',
            name: 'Bagaimana cara menggabungkan beberapa PDF?',
            acceptedAnswer: { '@type': 'Answer', text: 'Buka alat Merge PDF, pilih beberapa file PDF atau gambar, atur urutan, lalu unduh hasil gabungannya.' },
          },
          {
            '@type': 'Question',
            name: 'Bisakah saya mengompres PDF agar lebih kecil?',
            acceptedAnswer: { '@type': 'Answer', text: 'Gunakan alat Compress PDF untuk memperkecil ukuran PDF dengan tetap menjaga kualitas.' },
          },
        ],
      },
    ],
  }
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.id = 'dokulens-jsonld'
  script.textContent = JSON.stringify(data)
  document.head.appendChild(script)
}