import JSZip from 'jszip'

/**
 * Injects genuine Microsoft Word page numbering (PAGE & NUMPAGES field codes)
 * into any user-provided .docx document header or footer.
 */
export async function addPageNumberToDocx(docxArrayBuffer, options = {}) {
  const {
    position = 'bottom-center',
    format = 'num', // 'num' | 'dash' | 'hal_n' | 'hal_total' | 'page_total' | 'custom'
    customTemplate = '{n}',
    fontFamily = 'Times New Roman',
    fontSize = 11, // pt
    isBold = false,
    skipFirstPage = true,
  } = options

  const zip = await JSZip.loadAsync(docxArrayBuffer)

  // 1. Determine alignment
  let jcVal = 'center'
  if (position.includes('right')) jcVal = 'right'
  if (position.includes('left')) jcVal = 'left'

  const isHeader = position.startsWith('top')
  const partName = isHeader ? 'header1.xml' : 'footer1.xml'
  const relType = isHeader
    ? 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header'
    : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer'
  const contentType = isHeader
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml'
  const refTag = isHeader ? 'w:headerReference' : 'w:footerReference'
  const relId = isHeader ? 'rIdHeaderDokuLens' : 'rIdFooterDokuLens'

  const halfPtSize = fontSize * 2
  const fontXml = fontFamily === 'Calibri' ? 'Calibri' : fontFamily === 'TimesRoman' ? 'Times New Roman' : fontFamily === 'Courier' ? 'Courier New' : 'Arial'
  const rPr = `<w:rPr><w:rFonts w:ascii="${fontXml}" w:hAnsi="${fontXml}"/><w:sz w:val="${halfPtSize}"/>${isBold ? '<w:b/>' : ''}</w:rPr>`

  let runXml = ''
  if (format === 'num') {
    runXml = `<w:fldSimple w:instr="PAGE">${rPr}</w:fldSimple>`
  } else if (format === 'roman_upper') {
    runXml = `<w:fldSimple w:instr="PAGE \\* ROMAN">${rPr}</w:fldSimple>`
  } else if (format === 'roman_lower') {
    runXml = `<w:fldSimple w:instr="PAGE \\* roman">${rPr}</w:fldSimple>`
  } else if (format === 'dash') {
    runXml = `<w:r>${rPr}<w:t xml:space="preserve">- </w:t></w:r><w:fldSimple w:instr="PAGE">${rPr}</w:fldSimple><w:r>${rPr}<w:t xml:space="preserve"> -</w:t></w:r>`
  } else if (format === 'hal_n') {
    runXml = `<w:r>${rPr}<w:t xml:space="preserve">Hal </w:t></w:r><w:fldSimple w:instr="PAGE">${rPr}</w:fldSimple>`
  } else if (format === 'hal_total') {
    runXml = `<w:r>${rPr}<w:t xml:space="preserve">Hal </w:t></w:r><w:fldSimple w:instr="PAGE">${rPr}</w:fldSimple><w:r>${rPr}<w:t xml:space="preserve"> dari </w:t></w:r><w:fldSimple w:instr="NUMPAGES">${rPr}</w:fldSimple>`
  } else if (format === 'page_total') {
    runXml = `<w:r>${rPr}<w:t xml:space="preserve">Page </w:t></w:r><w:fldSimple w:instr="PAGE">${rPr}</w:fldSimple><w:r>${rPr}<w:t xml:space="preserve"> of </w:t></w:r><w:fldSimple w:instr="NUMPAGES">${rPr}</w:fldSimple>`
  } else {
    // Custom template parsing
    const parts = (customTemplate || '{n}').split(/(\{n\}|\{total\})/)
    runXml = parts
      .map((part) => {
        if (part === '{n}') return `<w:fldSimple w:instr="PAGE">${rPr}</w:fldSimple>`
        if (part === '{total}') return `<w:fldSimple w:instr="NUMPAGES">${rPr}</w:fldSimple>`
        return `<w:r>${rPr}<w:t xml:space="preserve">${part}</w:t></w:r>`
      })
      .join('')
  }

  const partXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<${isHeader ? 'w:hdr' : 'w:ftr'} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr>${runXml}</w:p>` +
    `</${isHeader ? 'w:hdr' : 'w:ftr'}>`

  // Write header or footer file inside DOCX zip
  zip.file(`word/${partName}`, partXml)

  // Update [Content_Types].xml
  if (zip.file('[Content_Types].xml')) {
    let ct = await zip.file('[Content_Types].xml').async('string')
    if (!ct.includes(`PartName="/word/${partName}"`)) {
      ct = ct.replace('</Types>', `<Override PartName="/word/${partName}" ContentType="${contentType}"/></Types>`)
      zip.file('[Content_Types].xml', ct)
    }
  }

  // Update word/_rels/document.xml.rels
  if (zip.file('word/_rels/document.xml.rels')) {
    let rels = await zip.file('word/_rels/document.xml.rels').async('string')
    if (!rels.includes(`Id="${relId}"`)) {
      rels = rels.replace('</Relationships>', `<Relationship Id="${relId}" Type="${relType}" Target="${partName}"/></Relationships>`)
      zip.file('word/_rels/document.xml.rels', rels)
    }
  }

  // Update word/document.xml
  if (zip.file('word/document.xml')) {
    let docXml = await zip.file('word/document.xml').async('string')
    const refTagXml = `<${refTag} w:type="default" r:id="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>`
    const titlePgXml = skipFirstPage ? '<w:titlePg/>' : ''

    if (docXml.includes('</w:sectPr>')) {
      docXml = docXml.replace(/<\/w:sectPr>/g, `${refTagXml}${titlePgXml}</w:sectPr>`)
    } else if (docXml.includes('</w:body>')) {
      docXml = docXml.replace('</w:body>', `<w:sectPr>${refTagXml}${titlePgXml}</w:sectPr></w:body>`)
    }
    zip.file('word/document.xml', docXml)
  }

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}
