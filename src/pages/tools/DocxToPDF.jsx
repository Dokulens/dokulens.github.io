import { useState, useEffect } from 'react'
import ConvertApi from 'convertapi-js'
import JSZip from 'jszip'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { Loader2, FileType, Cloud, Cpu, ExternalLink } from 'lucide-react'
import ToolShell from '../../components/ToolShell'
import DropZone from '../../components/DropZone'
import ResultCard from '../../components/ResultCard'
import FilePreview from '../../components/FilePreview'
import ProgressBar from '../../components/ProgressBar'
import { readAsArrayBuffer, fmtBytes, stripExt } from '../../utils/helpers'
import { useIncomingFile } from '../../hooks/useIncomingFile'

const LS_TOKEN_KEY = 'convertapi_token'

// ========= Unit helpers (docx = twip/EMU, PDF = pt) =========
const twipToPt = (twip) => (twip || 0) / 20
const emuToPt = (emu) => (emu || 0) / 12700
const hexToRgb = (hex) => {
  if (!hex || typeof hex !== 'string') return null
  const h = hex.replace(/^#/, '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 }
}
const HIGHLIGHT_MAP = {
  yellow: '#FFFF00', green: '#00FF00', cyan: '#00FFFF', magenta: '#FF00FF',
  blue: '#0000FF', red: '#FF0000', darkBlue: '#00008B', darkCyan: '#008B8B',
  darkGreen: '#006400', darkMagenta: '#8B008B', darkRed: '#8B0000', darkYellow: '#808000',
  darkGray: '#808080', lightGray: '#D3D3D3', black: '#000000', white: '#FFFFFF',
  brightGreen: '#00FF00', pink: '#FFC0CB',
}
function isTag(node, local) {
  if (!node || !node.nodeName) return false
  const n = node.nodeName
  return n === `w:${local}` || n === local || node.localName === local
}
function findChild(parent, local) {
  if (!parent || !parent.childNodes) return null
  for (const c of Array.from(parent.childNodes)) if (isTag(c, local)) return c
  return null
}
function findChildren(parent, local) {
  if (!parent || !parent.childNodes) return []
  return Array.from(parent.childNodes).filter((c) => isTag(c, local))
}
function getAttr(node, local) {
  if (!node || !node.getAttribute) return null
  return node.getAttribute(`w:${local}`) ?? node.getAttribute(local) ?? node.getAttribute(`r:${local}`) ?? node.getAttribute(`a:${local}`) ?? node.getAttribute(`wp:${local}`) ?? node.getAttribute(`pic:${local}`)
}
function attrInt(node, local, fallback = null) {
  const v = getAttr(node, local)
  if (v == null || v === '') return fallback
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

// ---------- SectPr / page size 1:1 ----------
const DEFAULT_SECT = {
  pageW: 595.28, pageH: 841.89,
  margin: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
  cols: 1,
}
function parseSectPr(sectPrNode) {
  if (!sectPrNode) return null
  const pgSz = findChild(sectPrNode, 'pgSz')
  const pgMar = findChild(sectPrNode, 'pgMar')
  let wTwip = pgSz ? attrInt(pgSz, 'w', 11906) : 11906
  let hTwip = pgSz ? attrInt(pgSz, 'h', 16838) : 16838
  let orient = pgSz ? getAttr(pgSz, 'orient') : null
  let pageW = twipToPt(wTwip)
  let pageH = twipToPt(hTwip)
  if (orient === 'landscape' && pageW < pageH) { const t = pageW; pageW = pageH; pageH = t }
  let margin = { ...DEFAULT_SECT.margin }
  if (pgMar) {
    const top = attrInt(pgMar, 'top', null)
    const bottom = attrInt(pgMar, 'bottom', null)
    const left = attrInt(pgMar, 'left', null)
    const right = attrInt(pgMar, 'right', null)
    const header = attrInt(pgMar, 'header', null)
    const footer = attrInt(pgMar, 'footer', null)
    if (top != null) margin.top = twipToPt(top)
    if (bottom != null) margin.bottom = twipToPt(bottom)
    if (left != null) margin.left = twipToPt(left)
    if (right != null) margin.right = twipToPt(right)
    if (header != null) margin.header = twipToPt(header)
    if (footer != null) margin.footer = twipToPt(footer)
  }
  const colsNode = findChild(sectPrNode, 'cols')
  const cols = colsNode ? Math.max(1, attrInt(colsNode, 'num', 1) || 1) : 1
  return { pageW, pageH, margin, orient, cols }
}

// ---------- Parse document.xml (JSZip, layout-aware) ----------
async function parseDocxXml(arrayBuf) {
  const zip = await JSZip.loadAsync(arrayBuf)
  let relsMap = new Map()
  const relsFile = zip.file('word/_rels/document.xml.rels') || zip.file('word/document.xml.rels') || null
  if (relsFile) {
    try {
      const relsStr = await relsFile.async('string')
      const relsDoc = new DOMParser().parseFromString(relsStr, 'application/xml')
      for (const rel of Array.from(relsDoc.getElementsByTagName('Relationship'))) {
        const id = rel.getAttribute('Id')
        const target = rel.getAttribute('Target')
        if (id && target) relsMap.set(id, target)
      }
    } catch {}
  }
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('word/document.xml tidak ditemukan')
  const xmlStr = await docFile.async('string')
  const xmlDoc = new DOMParser().parseFromString(xmlStr, 'application/xml')
  if (xmlDoc.getElementsByTagName('parsererror')[0]) throw new Error('Gagal parse document.xml')
  const body = xmlDoc.getElementsByTagName('w:body')[0] || xmlDoc.getElementsByTagName('body')[0] || xmlDoc.documentElement
  if (!body) throw new Error('body tidak ditemukan')
  let defaultSect = null
  for (const c of Array.from(body.childNodes)) if (c.nodeType === 1 && isTag(c, 'sectPr')) defaultSect = parseSectPr(c) || defaultSect
  if (!defaultSect) defaultSect = { ...DEFAULT_SECT }
  const blocks = []
  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType !== 1) continue
    if (isTag(node, 'p')) {
      const pPr = findChild(node, 'pPr')
      const sectPrInP = pPr ? findChild(pPr, 'sectPr') : null
      const para = parseParagraph(node, relsMap)
      blocks.push(para)
      if (sectPrInP) {
        const sect = parseSectPr(sectPrInP)
        if (sect) blocks.push({ type: 'sectBreak', sect })
      }
    } else if (isTag(node, 'tbl')) {
      blocks.push(parseTable(node, relsMap))
    } else if (isTag(node, 'sectPr')) {
      continue
    } else if (isTag(node, 'sdt')) {
      const sdtContent = findChild(node, 'sdtContent')
      if (sdtContent) {
        for (const inner of Array.from(sdtContent.childNodes)) {
          if (inner.nodeType !== 1) continue
          if (isTag(inner, 'p')) blocks.push(parseParagraph(inner, relsMap))
          else if (isTag(inner, 'tbl')) blocks.push(parseTable(inner, relsMap))
        }
      }
    }
  }
  return { blocks, defaultSect, relsMap, zip }
}

function parseParagraph(pNode, relsMap) {
  const pPr = findChild(pNode, 'pPr')
  let pStyle = null, jc = null, numPr = null, ind = { left: 0, right: 0, hanging: 0, firstLine: 0 }, spacing = { before: 0, after: 0, line: null, lineRule: null }, tabs = [], shdFill = null
  if (pPr) {
    const s = findChild(pPr, 'pStyle'); if (s) pStyle = getAttr(s, 'val')
    const j = findChild(pPr, 'jc'); if (j) jc = getAttr(j, 'val')
    const np = findChild(pPr, 'numPr'); if (np) numPr = true
    const indNode = findChild(pPr, 'ind')
    if (indNode) {
      const l = attrInt(indNode, 'left', null); if (l != null) ind.left = twipToPt(l)
      const r = attrInt(indNode, 'right', null); if (r != null) ind.right = twipToPt(r)
      const hang = attrInt(indNode, 'hanging', null); if (hang != null) ind.hanging = twipToPt(hang)
      const fl = attrInt(indNode, 'firstLine', null); if (fl != null) ind.firstLine = twipToPt(fl)
    }
    const sp = findChild(pPr, 'spacing')
    if (sp) {
      const b = attrInt(sp, 'before', null); if (b != null) spacing.before = twipToPt(b)
      const a = attrInt(sp, 'after', null); if (a != null) spacing.after = twipToPt(a)
      const ln = attrInt(sp, 'line', null); if (ln != null) spacing.line = twipToPt(ln * 20)
      if (spacing.line != null && spacing.line > 60) spacing.line = spacing.line / 20
      spacing.lineRule = getAttr(sp, 'lineRule')
    }
    const tabsNode = findChild(pPr, 'tabs')
    if (tabsNode) for (const t of findChildren(tabsNode, 'tab')) { const val = getAttr(t, 'val') || 'left'; const pos = attrInt(t, 'pos', null); if (pos != null) tabs.push({ val, pos: twipToPt(pos) }) }
    const shd = findChild(pPr, 'shd'); if (shd) { const f = getAttr(shd, 'fill'); if (f && f !== 'auto' && /^[0-9a-fA-F]{6}$/.test(f)) shdFill = `#${f}` }
  }
  const runs = []
  for (const child of Array.from(pNode.childNodes)) {
    if (isTag(child, 'r')) collectRunsFromR(child, runs, relsMap, false)
    else if (isTag(child, 'hyperlink')) for (const r of Array.from(child.childNodes)) if (r.nodeType === 1 && isTag(r, 'r')) collectRunsFromR(r, runs, relsMap, true)
    else if (isTag(child, 'proofErr') || isTag(child, 'bookmarkStart') || isTag(child, 'bookmarkEnd') || isTag(child, 'pPr')) continue
  }
  return { type: 'paragraph', runs, pStyle, jc, ind, spacing, tabs, shdFill, numPr }
}

function collectRunsFromR(rNode, out, relsMap, forceUnderline = false) {
  const rPr = findChild(rNode, 'rPr')
  let bold = false, italic = false, underline = forceUnderline, strike = false, caps = false
  let szHalfPt = null, colorHex = null, highlightHex = null, shdFill = null, vertAlign = null, rFonts = null
  if (rPr) {
    if (findChild(rPr, 'b') || findChild(rPr, 'bCs')) bold = true
    if (findChild(rPr, 'i') || findChild(rPr, 'iCs')) italic = true
    if (findChild(rPr, 'u')) underline = true
    if (findChild(rPr, 'strike')) strike = true
    if (findChild(rPr, 'caps')) caps = true
    const sz = findChild(rPr, 'sz'); if (sz) { const v = attrInt(sz, 'val', null); if (v != null) szHalfPt = v }
    const szCs = findChild(rPr, 'szCs'); if (szCs && szHalfPt == null) { const v = attrInt(szCs, 'val', null); if (v != null) szHalfPt = v }
    const color = findChild(rPr, 'color'); if (color) { const v = getAttr(color, 'val'); if (v && /^[0-9a-fA-F]{6}$/.test(v)) colorHex = `#${v}` }
    const hl = findChild(rPr, 'highlight'); if (hl) { const v = getAttr(hl, 'val'); if (v && HIGHLIGHT_MAP[v]) highlightHex = HIGHLIGHT_MAP[v] }
    const shd = findChild(rPr, 'shd'); if (shd) { const f = getAttr(shd, 'fill'); if (f && f !== 'auto' && /^[0-9a-fA-F]{6}$/.test(f)) shdFill = `#${f}` }
    const va = findChild(rPr, 'vertAlign'); if (va) vertAlign = getAttr(va, 'val')
    const fonts = findChild(rPr, 'rFonts')
    if (fonts) {
      const ascii = getAttr(fonts, 'ascii'); const hAnsi = getAttr(fonts, 'hAnsi'); const eastAsia = getAttr(fonts, 'eastAsia'); const cs = getAttr(fonts, 'cs')
      rFonts = { ascii: ascii || hAnsi || null, hAnsi: hAnsi || ascii || null, eastAsia, cs }
    }
  }
  for (const rc of Array.from(rNode.childNodes)) {
    if (rc.nodeType !== 1) continue
    if (isTag(rc, 't')) {
      let txt = rc.textContent ?? ''
      if (caps) txt = txt.toUpperCase()
      if (txt) out.push({ kind: 'text', text: txt, bold, italic, underline, strike, szHalfPt, colorHex, highlightHex, shdFill, vertAlign, rFonts })
    } else if (isTag(rc, 'tab')) out.push({ kind: 'tab', text: '\t', bold, italic, underline, strike, szHalfPt, colorHex, highlightHex, vertAlign, rFonts, isTab: true })
    else if (isTag(rc, 'br')) out.push({ kind: 'break', text: '\n', isBreak: true })
    else if (isTag(rc, 'cr')) out.push({ kind: 'break', text: '\n', isBreak: true })
    else if (isTag(rc, 'drawing')) { const d = parseDrawing(rc, relsMap); if (d) out.push({ kind: 'image', ...d }) }
    else if (isTag(rc, 'pict')) { const d2 = parsePict(rc, relsMap); if (d2) out.push({ kind: 'image', ...d2 }) }
    else if (isTag(rc, 'object')) { const d3 = parseObject(rc, relsMap); if (d3) out.push({ kind: 'image', ...d3 }) }
  }
}

function parseDrawing(drawingNode, relsMap) {
  const inline = findChild(drawingNode, 'inline') || drawingNode.getElementsByTagName('wp:inline')[0] || null
  const anchor = !inline ? (findChild(drawingNode, 'anchor') || drawingNode.getElementsByTagName('wp:anchor')[0] || null) : null
  const wpNode = inline || anchor
  if (!wpNode) return null
  let cx = null, cy = null
  const extent = findChild(wpNode, 'extent') || wpNode.getElementsByTagName('wp:extent')[0] || null
  if (extent) {
    const cxs = getAttr(extent, 'cx') ?? extent.getAttribute('cx')
    const cys = getAttr(extent, 'cy') ?? extent.getAttribute('cy')
    if (cxs) cx = emuToPt(parseInt(cxs, 10))
    if (cys) cy = emuToPt(parseInt(cys, 10))
  }
  if (cx == null || cy == null) {
    const xfrm = wpNode.getElementsByTagName('a:xfrm')[0] || wpNode.getElementsByTagName('xfrm')[0]
    if (xfrm) {
      const ext = xfrm.getElementsByTagName('a:ext')[0] || xfrm.getElementsByTagName('ext')[0]
      if (ext) {
        const cxs = ext.getAttribute('cx') ?? getAttr(ext, 'cx')
        const cys = ext.getAttribute('cy') ?? getAttr(ext, 'cy')
        if (cxs && cx == null) cx = emuToPt(parseInt(cxs, 10))
        if (cys && cy == null) cy = emuToPt(parseInt(cys, 10))
      }
    }
  }
  let rId = null
  const blip = drawingNode.getElementsByTagName('a:blip')[0] || drawingNode.getElementsByTagName('blip')[0]
  if (blip) rId = blip.getAttribute('r:embed') || blip.getAttribute('embed') || getAttr(blip, 'embed')
  if (!rId) {
    const blipFill = drawingNode.getElementsByTagName('pic:blipFill')[0] || drawingNode.getElementsByTagName('blipFill')[0]
    if (blipFill) { const b2 = blipFill.getElementsByTagName('a:blip')[0] || blipFill.getElementsByTagName('blip')[0]; if (b2) rId = b2.getAttribute('r:embed') || b2.getAttribute('embed') || getAttr(b2, 'embed') }
  }
  return { rId: rId || null, alt: '', cx: cx || 120, cy: cy || 80 }
}
function parsePict(pictNode, relsMap) {
  const shape = pictNode.getElementsByTagName('v:shape')[0] || pictNode.getElementsByTagName('shape')[0]
  if (!shape) return null
  const imagedata = shape.getElementsByTagName('v:imagedata')[0] || shape.getElementsByTagName('imagedata')[0]
  if (!imagedata) return null
  let rId = imagedata.getAttribute('r:id') || imagedata.getAttribute('o:relid') || getAttr(imagedata, 'id')
  let cx = 120, cy = 80
  const style = shape.getAttribute('style') || ''
  const wMatch = style.match(/width:\s*([\d.]+)pt/i); const hMatch = style.match(/height:\s*([\d.]+)pt/i)
  if (wMatch) cx = parseFloat(wMatch[1])
  if (hMatch) cy = parseFloat(hMatch[1])
  return { rId: rId || null, alt: shape.getAttribute('alt') || '', cx, cy }
}
function parseObject(objNode, relsMap) {
  const shape = objNode.getElementsByTagName('v:shape')[0] || objNode.getElementsByTagName('shape')[0]
  if (!shape) return null
  const imagedata = shape.getElementsByTagName('v:imagedata')[0] || shape.getElementsByTagName('imagedata')[0]
  if (!imagedata) return null
  const rId = imagedata.getAttribute('r:id') || null
  if (!rId) return null
  return { rId, alt: '', cx: 120, cy: 80 }
}

function parseTable(tblNode, relsMap) {
  const grid = findChild(tblNode, 'tblGrid')
  let gridCols = []
  if (grid) for (const gc of findChildren(grid, 'gridCol')) gridCols.push(attrInt(gc, 'w', 1200))
  const tblPr = findChild(tblNode, 'tblPr')
  let tblW = null, jc = null
  if (tblPr) {
    const wNode = findChild(tblPr, 'tblW'); if (wNode) { const w = attrInt(wNode, 'w', null); const type = getAttr(wNode, 'type'); if (w != null) tblW = { w, type: type || 'dxa' } }
    const j = findChild(tblPr, 'jc'); if (j) jc = getAttr(j, 'val')
  }
  const rows = []
  for (const tr of findChildren(tblNode, 'tr')) {
    const cells = []
    for (const tc of findChildren(tr, 'tc')) {
      const tcPr = findChild(tc, 'tcPr')
      let gridSpan = 1, tcShd = null
      if (tcPr) {
        const gs = findChild(tcPr, 'gridSpan'); if (gs) { const v = attrInt(gs, 'val', 1); if (v) gridSpan = v }
        const shd = findChild(tcPr, 'shd'); if (shd) { const f = getAttr(shd, 'fill'); if (f && /^[0-9a-fA-F]{6}$/.test(f)) tcShd = `#${f}` }
      }
      const cellParas = []
      for (const c of Array.from(tc.childNodes)) if (c.nodeType === 1 && isTag(c, 'p')) cellParas.push(parseParagraph(c, relsMap))
      const flatRuns = cellParas.flatMap((p) => p.runs)
      const text = flatRuns.filter((r) => r.kind === 'text').map((r) => r.text).join('')
      cells.push({ gridSpan, tcShd, paras: cellParas, flatRuns, text: text.trim() })
    }
    rows.push({ cells })
  }
  return { type: 'table', gridCols, tblW, jc, rows }
}

// ========= Rendering helpers =========
function resolveRunFont(rFonts) {
  if (!rFonts || (!rFonts.ascii && !rFonts.hAnsi)) return null
  const name = (rFonts.ascii || rFonts.hAnsi || '').trim()
  if (!name) return null
  const low = name.toLowerCase()
  if (low.includes('times') || low.includes('georgia') || low.includes('garamond') || low.includes('cambria') || low.includes('roman') || low.includes('mincho') || low.includes('batang')) return { name, pdfFamily: 'TimesRoman' }
  if (low.includes('courier') || low.includes('consolas') || low.includes('mono') || low.includes('menlo')) return { name, pdfFamily: 'Courier' }
  return { name, pdfFamily: 'Helvetica' }
}
function getRunSize(run, pStyle) {
  if (run.szHalfPt != null) return run.szHalfPt / 2
  if (pStyle) {
    const s = pStyle.toLowerCase()
    if (s.includes('heading1') || s === 'heading 1' || s === '1') return 16
    if (s.includes('heading2') || s === 'heading 2' || s === '2') return 14
    if (s.includes('heading3') || s === 'heading 3' || s === '3') return 12
  }
  return 11
}
function getRunPdfFont(run, fonts) {
  const rf = resolveRunFont(run.rFonts)
  const fam = rf ? rf.pdfFamily : 'Helvetica'
  const b = !!run.bold, i = !!run.italic
  if (fam === 'TimesRoman') { if (b && i) return fonts.timesBi; if (b) return fonts.timesBold; if (i) return fonts.timesItalic; return fonts.times }
  if (fam === 'Courier') { if (b && i) return fonts.courierBi; if (b) return fonts.courierBold; if (i) return fonts.courierItalic; return fonts.courier }
  if (b && i) return fonts.helvBi; if (b) return fonts.helvBold; if (i) return fonts.helvItalic; return fonts.helv
}
function ensureSect(s) { return s && s.pageW && s.margin ? s : DEFAULT_SECT }
function ensurePage(doc, currentPage, currentY, neededH, sect) {
  sect = ensureSect(sect)
  if (currentY - neededH < sect.margin.bottom) {
    const np = doc.addPage([sect.pageW, sect.pageH])
    return { page: np, y: sect.pageH - sect.margin.top, sect }
  }
  return { page: currentPage, y: currentY, sect }
}
function drawParagraphBlock(block, doc, currentPage, currentY, fonts, sect) {
  sect = ensureSect(sect)
  const runs = block.runs
  const contentW = sect.pageW - sect.margin.left - sect.margin.right
  const hasVisible = runs.some((r) => r.kind === 'text' ? r.text?.trim() : r.kind !== 'break')
  if (!hasVisible) { const gap = (block.spacing?.after || 0) + (block.spacing?.before || 0); return { page: currentPage, y: currentY - (gap || 6), sect } }
  const maxW = Math.max(20, contentW - (block.ind?.left || 0) - (block.ind?.right || 0))
  const lines = []
  let curLine = []; let curW = 0
  const flush = () => { if (curLine.length) lines.push(curLine); curLine = []; curW = 0 }
  for (const run of runs) {
    if (run.kind === 'break') { flush(); continue }
    if (run.kind === 'image') {
      const iw = Math.min(run.cx || 80, contentW * 0.9), ih = run.cy || 60
      if (curW + iw > maxW && curLine.length) flush()
      curLine.push({ kind: 'image', run, width: iw, height: ih }); curW += iw; continue
    }
    if (run.kind === 'tab' || run.isTab) {
      const tabW = 36; if (curW + tabW > maxW && curLine.length) flush()
      curLine.push({ kind: 'text', text: '    ', width: tabW, run, size: getRunSize(run, block.pStyle), font: getRunPdfFont(run, fonts), isTab: true }); curW += tabW; continue
    }
    const size = getRunSize(run, block.pStyle), font = getRunPdfFont(run, fonts)
    const parts = String(run.text).split(/(\t|\s+)/)
    for (const part of parts) {
      if (!part) continue
      if (part === '\t') { const tabW = 36; if (curW + tabW > maxW && curLine.length) flush(); curLine.push({ kind: 'text', text: '    ', width: tabW, run, size, font, isTab: true }); curW += tabW; continue }
      if (/^\s+$/.test(part)) { if (!curLine.length) continue; const spW = font.widthOfTextAtSize(' ', size); if (curW + spW > maxW) { flush(); continue } curLine.push({ kind: 'text', text: ' ', width: spW, run, size, font }); curW += spW; continue }
      const w = font.widthOfTextAtSize(part, size)
      if (curW + w > maxW && curLine.length) flush()
      if (w > maxW) {
        let acc = '', accW = 0
        for (const ch of part) {
          const cw = font.widthOfTextAtSize(ch, size)
          if (accW + cw > maxW && acc) { curLine.push({ kind: 'text', text: acc, width: accW, run, size, font }); lines.push(curLine); curLine = []; curW = 0; acc = ch; accW = cw } else { acc += ch; accW += cw }
        }
        if (acc) { curLine.push({ kind: 'text', text: acc, width: accW, run, size, font }); curW += accW }
      } else { curLine.push({ kind: 'text', text: part, width: w, run, size, font }); curW += w }
    }
  }
  flush()
  let page = currentPage, y = currentY
  if (block.spacing?.before) y -= block.spacing.before
  const isHeading = block.pStyle && /heading/i.test(block.pStyle)
  const jc = block.jc
  for (let li = 0; li < lines.length; li++) {
    const segs = lines[li]
    const lineW = segs.reduce((a, s) => a + (s.width || 0), 0)
    const maxSize = Math.max(...segs.filter((s) => s.kind === 'text').map((s) => s.size || 11), 11)
    const lineH = Math.max(14, maxSize * 1.42)
    let x
    if (jc === 'center') x = sect.margin.left + (block.ind?.left || 0) + (maxW - lineW) / 2
    else if (jc === 'right' || jc === 'end') x = sect.pageW - sect.margin.right - lineW - (block.ind?.right || 0)
    else if (jc === 'both' && li < lines.length - 1) x = sect.margin.left + (block.ind?.left || 0)
    else x = sect.margin.left + (block.ind?.left || 0) + (li === 0 ? (block.ind?.firstLine || 0) : 0)
    const need = ensurePage(doc, page, y, lineH, sect); page = need.page; y = need.y; sect = need.sect
    let justifyExtra = 0, gapCount = 0
    if (jc === 'both' && li < lines.length - 1) { gapCount = segs.filter((s) => s.kind === 'text' && s.text === ' ').length; if (gapCount > 0) justifyExtra = (maxW - lineW) / gapCount }
    let curX = x
    for (const seg of segs) {
      if (seg.kind === 'image') {
        const yy = y - seg.height + 3
        if (seg.run._pdfImage) page.drawImage(seg.run._pdfImage, { x: curX, y: yy, width: seg.width, height: seg.height })
        else { page.drawRectangle({ x: curX, y: yy, width: seg.width, height: seg.height, borderColor: rgb(0.7, 0.72, 0.76), borderWidth: 0.6 }); page.drawText('[gambar]', { x: curX + 4, y: yy + seg.height / 2 - 4, size: 7, font: fonts.helv, color: rgb(0.5, 0.5, 0.5) }) }
        curX += seg.width; continue
      }
      const run = seg.run
      const bgHex = run.highlightHex || run.shdFill
      if (bgHex && seg.text.trim()) { const c = hexToRgb(bgHex); if (c) page.drawRectangle({ x: curX - 1, y: y - 2, width: seg.width + 2, height: seg.size + 3, color: rgb(c.r, c.g, c.b) }) }
      let drawY = y
      if (run.vertAlign === 'superscript') drawY = y + seg.size * 0.35
      else if (run.vertAlign === 'subscript') drawY = y - seg.size * 0.2
      const col = run.colorHex ? hexToRgb(run.colorHex) : null
      const color = col ? rgb(col.r, col.g, col.b) : (isHeading ? rgb(0.12, 0.18, 0.45) : rgb(0.1, 0.1, 0.1))
      const drawW = seg.text === ' ' && justifyExtra ? seg.width + justifyExtra : seg.width
      page.drawText(seg.text, { x: curX, y: drawY, size: seg.size, font: seg.font, color })
      if (run.underline) page.drawLine({ start: { x: curX, y: y - 1.5 }, end: { x: curX + seg.width, y: y - 1.5 }, thickness: 0.6, color })
      if (run.strike) page.drawLine({ start: { x: curX, y: y + seg.size * 0.32 }, end: { x: curX + seg.width, y: y + seg.size * 0.32 }, thickness: 0.6, color })
      curX += drawW
    }
    y -= lineH
  }
  y -= (block.spacing?.after || 4)
  return { page, y, sect }
}
function drawTableBlock(block, doc, currentPage, currentY, fonts, sect) {
  sect = ensureSect(sect)
  const numCols = Math.max(...block.rows.map((r) => r.cells.length), block.gridCols.length || 0) || 1
  let colWidthsPt = []
  if (block.gridCols.length >= numCols && block.gridCols.length > 0) {
    const total = block.gridCols.reduce((a, b) => a + b, 0) || numCols * 1000
    const contentW = sect.pageW - sect.margin.left - sect.margin.right
    colWidthsPt = block.gridCols.slice(0, numCols).map((w) => (w / total) * contentW)
  } else {
    const contentW = sect.pageW - sect.margin.left - sect.margin.right
    colWidthsPt = Array(numCols).fill(contentW / numCols)
  }
  const expandedRows = block.rows.map((row) => {
    const ex = []
    for (const c of row.cells) for (let k = 0; k < (c.gridSpan || 1); k++) ex.push(k === 0 ? c : { ...c, text: '', flatRuns: [], paras: [], isSpan: true })
    while (ex.length < numCols) ex.push({ text: '', flatRuns: [], paras: [], gridSpan: 1 })
    return { ...row, cells: ex.slice(0, numCols) }
  })
  const CELL_PAD = 4
  function wrapCellText(text, colW, size, font) {
    const innerW = Math.max(10, colW - CELL_PAD * 2)
    if (!text) return ['']
    const words = text.split(/\s+/); const lines = []; let cur = ''
    for (const w of words) { const test = cur ? `${cur} ${w}` : w; if (font.widthOfTextAtSize(test, size) > innerW && cur) { lines.push(cur); cur = w } else cur = test }
    if (cur) lines.push(cur); return lines
  }
  let page = currentPage, y = currentY
  for (let r = 0; r < expandedRows.length; r++) {
    const row = expandedRows[r]
    let maxLines = 1
    const cellLinesArr = []
    for (let c = 0; c < numCols; c++) {
      const cell = row.cells[c]
      const txt = cell ? cell.text : ''
      const size = 10.5, font = fonts.helv, colW = colWidthsPt[c]
      const cellLines = wrapCellText(txt, colW, size, font)
      const maxImgH = Math.max(0, ...((cell.paras || []).flatMap((p) => p.runs.filter((x) => x.kind === 'image').map((x) => x.cy || 30)), [0]))
      const needH = maxImgH ? Math.ceil(maxImgH / 14) : 0
      maxLines = Math.max(maxLines, Math.max(cellLines.length, needH))
      cellLinesArr.push(cellLines)
    }
    const rowH = Math.max(18, maxLines * 13 + CELL_PAD * 2 + 2)
    const need = ensurePage(doc, page, y, rowH, sect); page = need.page; y = need.y; sect = need.sect
    let curX = sect.margin.left
    for (let c = 0; c < numCols; c++) {
      const colW = colWidthsPt[c], cell = row.cells[c], isHeaderRow = r === 0
      const bg = cell?.tcShd ? hexToRgb(cell.tcShd) : null
      page.drawRectangle({ x: curX, y: y - rowH, width: colW, height: rowH, borderColor: rgb(0.78, 0.82, 0.88), borderWidth: 0.7, color: bg ? rgb(bg.r, bg.g, bg.b) : (isHeaderRow ? rgb(0.96, 0.97, 0.99) : undefined) })
      const size = 10.5, cellFont = cell && cell.flatRuns.some((x) => x.bold) ? fonts.helvBold : fonts.helv
      for (let li = 0; li < cellLinesArr[c].length; li++) { const line = cellLinesArr[c][li]; const ty = y - CELL_PAD - 9 - li * 13; page.drawText(line, { x: curX + CELL_PAD, y: ty, size, font: cellFont, color: rgb(0.1, 0.1, 0.1), maxWidth: colW - CELL_PAD * 2 }) }
      const imgRuns = (cell.paras || []).flatMap((p) => p.runs.filter((x) => x.kind === 'image'))
      if (imgRuns.length) { let imgY = y - CELL_PAD - 10; for (const ir of imgRuns) { const iw = Math.min(ir.cx || 60, colW - CELL_PAD * 2), ih = ir.cy || 30; if (ir._pdfImage) page.drawImage(ir._pdfImage, { x: curX + CELL_PAD, y: imgY - ih, width: iw, height: ih }); imgY -= ih + 4 } }
      curX += colW
    }
    y -= rowH
  }
  y -= 6
  return { page, y, sect }
}
async function embedDocxImages(blocks, zip, relsMap, pdfDoc) {
  const allRuns = []
  for (const b of blocks) {
    if (b.type === 'paragraph') allRuns.push(...b.runs)
    else if (b.type === 'table') for (const r of b.rows) for (const c of r.cells) for (const p of (c.paras || [])) allRuns.push(...p.runs)
  }
  const imgRuns = allRuns.filter((r) => r.kind === 'image' && r.rId)
  const cache = new Map()
  const pending = []
  for (const r of imgRuns) {
    const key = r.rId
    if (cache.has(key)) { r._pdfImage = cache.get(key); continue }
    const target = relsMap.get(key)
    if (!target) continue
    let zipPath = target
    if (zipPath.startsWith('/')) zipPath = zipPath.slice(1)
    if (!zipPath.startsWith('word/')) zipPath = `word/${zipPath.replace(/^\.?\//, '')}`
    let file = zip.file(zipPath)
    if (!file) { const base = target.split('/').pop(); const cand = Object.keys(zip.files).find((k) => k.endsWith(base)); if (cand) file = zip.file(cand) }
    if (!file) continue
    pending.push((async () => {
      try {
        const buf = await file.async('uint8Array')
        const isPng = /\.png$/i.test(target) || buf[0] === 0x89
        const isJpg = /\.jpe?g$/i.test(target) || (buf[0] === 0xff && buf[1] === 0xd8)
        let img
        if (isPng) img = await pdfDoc.embedPng(buf)
        else if (isJpg) img = await pdfDoc.embedJpg(buf)
        else { try { img = await pdfDoc.embedPng(buf) } catch { img = await pdfDoc.embedJpg(buf) } }
        cache.set(key, img); r._pdfImage = img
      } catch {}
    })())
  }
  await Promise.all(pending)
}

async function convertViaConvertApi(file, token, fromExt, toExt) {
  const api = ConvertApi.auth(token.trim())
  const params = api.createParams()
  params.add('File', file)
  const result = await api.convert(fromExt, toExt, params)
  const f = result.files?.[0] || result.dto?.Files?.[0]
  if (!f) throw new Error('ConvertAPI tidak mengembalikan file')
  const url = f.Url || f.url
  if (!url) {
    const data = f.FileData || f.fileData
    if (data) {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      const mime = toExt === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      return new Blob([bytes], { type: mime })
    }
    throw new Error('URL hasil ConvertAPI tidak tersedia')
  }
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Gagal unduh hasil ConvertAPI: ${r.status}`)
  return r.blob()
}

async function convertOfflineDocxToPdf(arrayBuf, setProgressText, setProgress) {
  let parsed
  try { parsed = await parseDocxXml(arrayBuf) } catch (e) { throw new Error(`Gagal baca document.xml: ${e.message}`) }
  const { blocks, defaultSect, zip, relsMap } = parsed
  if (!blocks.length) throw new Error('Dokumen kosong atau tidak ada paragraf/tabel terbaca')
  setProgressText('Memuat gambar & font…')
  setProgress(28)
  const doc = await PDFDocument.create()
  const fonts = {
    helv: await doc.embedFont(StandardFonts.Helvetica),
    helvBold: await doc.embedFont(StandardFonts.HelveticaBold),
    helvItalic: await doc.embedFont(StandardFonts.HelveticaOblique),
    helvBi: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    times: await doc.embedFont(StandardFonts.TimesRoman),
    timesBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    timesItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    timesBi: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
    courier: await doc.embedFont(StandardFonts.Courier),
    courierBold: await doc.embedFont(StandardFonts.CourierBold),
    courierItalic: await doc.embedFont(StandardFonts.CourierOblique),
    courierBi: await doc.embedFont(StandardFonts.CourierBoldOblique),
  }
  await embedDocxImages(blocks, zip, relsMap, doc)
  setProgressText('Menyiapkan halaman PDF…')
  setProgress(40)
  let sect = ensureSect({ ...defaultSect })
  let currentPage = doc.addPage([sect.pageW, sect.pageH])
  let currentY = sect.pageH - sect.margin.top
  setProgressText('Merender layout koordinat (X,Y) — 1:1 kertas & posisi…')
  setProgress(50)
  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx]
    if (block.type === 'sectBreak') {
      const nextSect = ensureSect(block.sect)
      const curW = currentPage.getWidth(), curH = currentPage.getHeight()
      if (Math.abs(nextSect.pageW - curW) > 0.5 || Math.abs(nextSect.pageH - curH) > 0.5) {
        currentPage = doc.addPage([nextSect.pageW, nextSect.pageH])
        currentY = nextSect.pageH - nextSect.margin.top
      }
      sect = nextSect; continue
    }
    if (block.type === 'paragraph') {
      const res = drawParagraphBlock(block, doc, currentPage, currentY, fonts, sect)
      currentPage = res.page; currentY = res.y; sect = ensureSect(res.sect)
    } else if (block.type === 'table') {
      const res = drawTableBlock(block, doc, currentPage, currentY, fonts, sect)
      currentPage = res.page; currentY = res.y; sect = ensureSect(res.sect)
    }
    setProgress(50 + Math.round((idx / blocks.length) * 40))
  }
  setProgressText('Menyimpan file PDF…')
  setProgress(95)
  const pdfBytes = await doc.save()
  return new Blob([pdfBytes], { type: 'application/pdf' })
}

export default function DocxToPDF() {
  const [file, setFile] = useState(null)
  useIncomingFile(setFile)
  const [useCloud, setUseCloud] = useState(true)
  const [token, setToken] = useState(() => { try { return localStorage.getItem(LS_TOKEN_KEY) || '' } catch { return '' } })
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { try { localStorage.setItem(LS_TOKEN_KEY, token) } catch {} }, [token])
  const handleFile = ([f]) => { setFile(f); setResult(null); setError(''); setProgress(0) }
  const convert = async () => {
    if (!file) return
    setProcessing(true); setError(''); setProgress(0)
    try {
      if (useCloud) {
        if (!token.trim()) throw new Error('Masukkan ConvertAPI token dulu (https://www.convertapi.com/a/authentication) — daftar gratis 250 konversi')
        setProgressText('Mengirim ke ConvertAPI (docx → pdf, 1:1)…')
        setProgress(20)
        const blob = await convertViaConvertApi(file, token, 'docx', 'pdf')
        setProgress(100)
        setResult(blob)
        return
      }
      setProgressText('Mengekstrak struktur XML Word (.docx)…')
      setProgress(12)
      const arrayBuf = await readAsArrayBuffer(file)
      const blob = await convertOfflineDocxToPdf(arrayBuf, setProgressText, setProgress)
      setProgress(100)
      setResult(blob)
    } catch (e) { setError(`Gagal konversi: ${e?.message || String(e)}`) } finally { setProcessing(false) }
  }
  const base = file ? stripExt(file.name) : 'document'
  return (
    <ToolShell title="Word (.docx) → PDF" description="Ubah .docx menjadi PDF 1:1 — via ConvertAPI cloud (seperti pdf24) atau offline koordinat.">
      <DropZone accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onFiles={handleFile} label="Pilih file Word (.docx)" hint="Mendukung .docx" />
      {file && <FilePreview file={file} />}
      <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setUseCloud(true)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${useCloud ? 'bg-[--color-brand] text-white border-[--color-brand]' : 'bg-[--color-surface] text-[--color-text-2] border-[--color-border]'}`}><Cloud size={14} /> Cloud 1:1 (ConvertAPI)</button>
          <button type="button" onClick={() => setUseCloud(false)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${!useCloud ? 'bg-[--color-brand] text-white border-[--color-brand]' : 'bg-[--color-surface] text-[--color-text-2] border-[--color-border]'}`}><Cpu size={14} /> Offline (koordinat)</button>
          <a href="https://www.convertapi.com/docx-to-pdf/javascript" target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] text-[--color-brand] hover:underline">Docs ConvertAPI <ExternalLink size={11} /></a>
        </div>
        {useCloud && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[--color-text]">ConvertAPI Secret / Token</label>
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste token dari convertapi.com/a/authentication" className="w-full rounded-lg border border-[--color-border] bg-[--color-surface] px-3 py-2 text-xs font-mono text-[--color-text] outline-none focus:border-[--color-brand] focus:ring-2 focus:ring-[--color-brand]/20" />
            <p className="text-[11px] text-[--color-text-3]">Token disimpan lokal di browser. Daftar gratis 250 konversi. Tanpa token, pakai mode Offline.</p>
          </div>
        )}
        {!useCloud && (
          <div className="flex items-start gap-2 rounded-lg border border-[--color-border] bg-[--color-surface-2] p-2.5 text-xs text-[--color-text-2]"><FileType size={16} className="shrink-0 text-[--color-brand] mt-0.5" /><span>Offline 1:1 via <code className="font-mono text-[--color-text]">word/document.xml</code> + <code className="font-mono">word/_rels</code> + <code className="font-mono">word/media</code>: <code className="font-mono">sectPr/pgSz/pgMar</code> → page &amp; margin, <code className="font-mono">rFonts/sz/color</code> → font, <code className="font-mono">w:p</code> Y sejajar &amp; X horizontal.</span></div>
        )}
        {useCloud && (<div className="flex items-start gap-2 rounded-lg border border-[--color-border] bg-[--color-surface-2] p-2.5 text-xs text-[--color-text-2]"><FileType size={16} className="shrink-0 text-[--color-brand] mt-0.5" /><span>Cloud 1:1 via <code className="font-mono">convertapi-js</code> <code>docx→pdf</code> — layout, font, gambar, tabel pixel-perfect seperti <a href="https://tools.pdf24.org/en/pdf-converter" target="_blank" rel="noreferrer" className="text-[--color-brand] underline">pdf24</a>.</span></div>)}
      </div>
      {file && (<div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-3 flex items-center justify-between text-xs"><span className="font-medium text-[--color-text] truncate">{file.name}</span><span className="shrink-0 text-[--color-text-3] ml-2">{fmtBytes(file.size)}</span></div>)}
      {processing && (<div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 space-y-2 animate-fade-in"><ProgressBar value={progress} label={progressText} /></div>)}
      {error && <p className="rounded border border-[--color-danger-light] bg-[--color-danger-light] px-3 py-2 text-sm text-[--color-danger] animate-fade-in">{error}</p>}
      {file && !result && (<button onClick={convert} disabled={processing} className="flex w-full items-center justify-center gap-2 rounded bg-[--color-brand] px-4 py-2.5 text-sm font-medium text-white hover:bg-[--color-brand-hover] disabled:opacity-60 transition-all active:scale-[0.99]">{processing && <Loader2 size={16} className="animate-spin" />}{processing ? 'Mengonversi…' : useCloud ? 'Konversi Cloud 1:1 (ConvertAPI)' : 'Konversi Offline'}</button>)}
      {result && (<ResultCard fileName={`${base}.pdf`} blob={result} extraInfo={fmtBytes(result.size)} outputMimeType="application/pdf" sourceRoute="docx-to-pdf" onReset={() => { setResult(null); setFile(null); setProgress(0) }} />)}
    </ToolShell>
  )
}
