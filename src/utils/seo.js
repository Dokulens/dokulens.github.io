// SEO + social meta management (client-side SPA friendly).
// Updates <title>, meta description, canonical, and Open Graph / Twitter tags
// imperatively. Also injects a JSON-LD WebSite/SoftwareApplication block.

const SITE_NAME = 'DokuLens'
const SITE_URL = 'https://dokulens.github.io'
const DEFAULT_IMAGE = `${SITE_URL}/favicon.svg`

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
  // path like "/merge-pdf" -> "/merge-pdf/" for consistency (no trailing index.html in canonicals)
  const cleanPath = path === '/' || path === '' ? '/' : `/${path.replace(/^\/+|\/+$/g, '')}/`
  const fullTitle = title === SITE_NAME ? SITE_NAME : `${title} — ${SITE_NAME}`
  const canonical = `${SITE_URL}${cleanPath}`

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
    ],
  }
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.id = 'dokulens-jsonld'
  script.textContent = JSON.stringify(data)
  document.head.appendChild(script)
}