import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')
const templatePath = join(distDir, 'index.html')

if (!existsSync(templatePath)) {
  console.error('dist/index.html not found. Run vite build first.')
  process.exit(1)
}

const template = readFileSync(templatePath, 'utf8')

// Import SEO config (ESM) — we can't import directly due to path, so parse or require via dynamic import
// Use dynamic import with file URL
const seoConfigUrl = new URL('../src/utils/seoConfig.js', import.meta.url)
const { SEO_CONFIG } = await import(seoConfigUrl)

const SITE_URL = 'https://dokulens.github.io'
const SITE_NAME = 'DokuLens'

function brandedTitle(title) {
  if (title === SITE_NAME) return SITE_NAME
  const branded = `${title} — ${SITE_NAME}`
  return branded.length <= 60 ? branded : title
}

function buildHtml({ title, description, keywords, canonical, h1 }) {
  const fullTitle = brandedTitle(title)
  let html = template

  // Replace <title>
  html = html.replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(fullTitle)}</title>`)
  // meta description
  html = replaceMeta(html, 'name', 'description', description)
  if (keywords) html = replaceMeta(html, 'name', 'keywords', keywords)
  // canonical
  html = html.replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonical}" />`)
  // handle without self-closing slash too
  html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`)
  // og
  html = replaceMeta(html, 'property', 'og:title', fullTitle)
  html = replaceMeta(html, 'property', 'og:description', description)
  html = replaceMeta(html, 'property', 'og:url', canonical)
  // twitter
  html = replaceMeta(html, 'name', 'twitter:title', fullTitle)
  html = replaceMeta(html, 'name', 'twitter:description', description)
  
  // Inject prerendered content into #root for crawler (hidden until JS hydrates, but crawlable)
  // Replace <div id="root"></div> with static SEO content
  const seoBlock = `<div id="root"><div style="max-width:800px;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif;color:#0f172a"><h1 style="font-size:1.75rem;font-weight:800;margin:0 0 0.5rem">${escapeHtml(h1 || title)}</h1><p style="color:#475569;line-height:1.6;margin:0 0 1rem">${escapeHtml(description)}</p><p style="color:#64748b;font-size:0.875rem">Muat aplikasi untuk menggunakan alat ini — 100% gratis &amp; privat, diproses lokal di browser.</p><noscript><p>Butuh JavaScript untuk menjalankan alat ini.</p></noscript></div></div>`
  html = html.replace(/<div id="root"><\/div>/, seoBlock)
  // Also inject JSON-LD per page (SoftwareApplication per tool)
  html = injectJsonLd(html, { title: fullTitle, description, canonical, h1 })

  return html
}

function replaceMeta(html, attr, key, content) {
  const esc = escapeHtml(content)
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/?>`)
  if (re.test(html)) {
    return html.replace(re, `<meta ${attr}="${key}" content="${esc}">`)
  }
  // not found, insert before </head>
  return html.replace('</head>', `  <meta ${attr}="${key}" content="${esc}">\n  </head>`)
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function injectJsonLd(html, { title, description, canonical }) {
  // Insert additional JSON-LD for this tool page before </head>
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": title,
    "description": description,
    "url": canonical,
    "applicationCategory": "MultimediaApplication",
    "operatingSystem": "Any",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "IDR" }
  }
  const tag = `<script type="application/ld+json">${JSON.stringify(data)}</script>`
  return html.replace('</head>', `  ${tag}\n  </head>`)
}

// Routes: root + all SEO_CONFIG keys
const routes = [
  { path: '/', title: 'DokuLens — Studio Olah Dokumen & Gambar (100% Client-Side)', description: 'Edit PDF, merge, split, compress, ubah PDF ↔ Word, content-aware image carver langsung di browser tanpa server dan tanpa database. 100% Offline & Privat.', keywords: 'edit pdf, merge pdf, split pdf, compress pdf, watermark, nomor halaman, konversi gambar, kolase, image carver, offline', h1: 'DokuLens — Studio Olah Dokumen & Gambar' },
]

for (const [key, cfg] of Object.entries(SEO_CONFIG)) {
  routes.push({
    path: `/${key}`,
    title: cfg.title,
    description: cfg.description,
    keywords: cfg.keywords,
    h1: cfg.h1,
  })
}

let generated = 0
for (const r of routes) {
  const canonical = r.path === '/' ? `${SITE_URL}/` : `${SITE_URL}${r.path}/`
  const html = buildHtml({ ...r, canonical })
  if (r.path === '/') {
    writeFileSync(templatePath, html, 'utf8')
    generated++
    continue
  }
  const outPath = join(distDir, r.path.slice(1), 'index.html')
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, html, 'utf8')
  generated++
}

// Also generate sitemap.xml with all routes (trailing slash -> 200, avoids 301)
const sitemapRoutes = routes.map(r => {
  const loc = r.path === '/' ? `${SITE_URL}/` : `${SITE_URL}${r.path}/`
  const priority = r.path === '/' ? '1.0' : r.path === '/faq' ? '0.6' : r.path === '/about' ? '0.5' : '0.8'
  const changefreq = r.path === '/' ? 'weekly' : 'monthly'
  return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
}).join('\n')

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapRoutes}\n</urlset>\n`
writeFileSync(join(distDir, 'sitemap.xml'), sitemap, 'utf8')
writeFileSync(join(distDir, '..', 'public', 'sitemap.xml'), sitemap, 'utf8')

console.log(`Prerendered ${generated} routes + sitemap.xml (${routes.length} urls)`)
