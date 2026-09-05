export const TOOL_REGISTRY = [
  {
    id: 'edit-pdf',
    route: 'edit-pdf',
    label: 'Edit PDF',
    icon: 'FilePenLine',
    accepts: ['application/pdf'],
  },
  {
    id: 'compress-pdf',
    route: 'compress-pdf',
    label: 'Compress PDF',
    icon: 'PackageOpen',
    accepts: ['application/pdf'],
  },
  {
    id: 'watermark-pdf',
    route: 'watermark-pdf',
    label: 'Watermark PDF',
    icon: 'Stamp',
    accepts: ['application/pdf'],
  },
  {
    id: 'add-page-number',
    route: 'add-page-number',
    label: 'Tambah Nomor Halaman',
    icon: 'Hash',
    accepts: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  {
    id: 'password-pdf',
    route: 'password-pdf',
    label: 'Password & Keamanan PDF',
    icon: 'Lock',
    accepts: ['application/pdf'],
  },
  {
    id: 'split-pdf',
    route: 'split-pdf',
    label: 'Split PDF',
    icon: 'Scissors',
    accepts: ['application/pdf'],
  },
  {
    id: 'merge-pdf',
    route: 'merge-pdf',
    label: 'Merge PDF / Gambar',
    icon: 'Combine',
    accepts: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  },
  {
    id: 'pdf-to-image',
    route: 'pdf-to-image',
    label: 'PDF → Gambar',
    icon: 'FileImage',
    accepts: ['application/pdf'],
  },
  // hidden: pdf-to-docx, docx-to-pdf — restore entries above
  {
    id: 'image-to-pdf',
    route: 'image-to-pdf',
    label: 'Gambar → PDF',
    icon: 'ImagePlus',
    accepts: ['image/png', 'image/jpeg', 'image/webp'],
  },
  {
    id: 'image-convert',
    route: 'image-convert',
    label: 'Konversi Gambar',
    icon: 'RefreshCw',
    accepts: ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/bmp', 'image/svg+xml', 'image/x-icon', 'image/tiff'],
  },
  {
    id: 'image-crop-rotate',
    route: 'image-crop-rotate',
    label: 'Crop & Putar Gambar',
    icon: 'Crop',
    accepts: ['image/png', 'image/jpeg', 'image/webp'],
  },
  {
    id: 'image-watermark',
    route: 'image-watermark',
    label: 'Tambah Watermark Gambar',
    icon: 'Type',
    accepts: ['image/png', 'image/jpeg', 'image/webp'],
  },
  {
    id: 'watermark-remover',
    route: 'watermark-remover',
    label: 'Hapus Watermark',
    icon: 'Eraser',
    accepts: ['image/png', 'image/jpeg', 'image/webp'],
  },
  {
    id: 'object-remover',
    route: 'object-remover',
    label: 'AI Hapus Objek',
    icon: 'Scissors',
    accepts: ['image/png', 'image/jpeg', 'image/webp'],
  },
  {
    id: 'image-carver',
    route: 'image-carver',
    label: 'Image Carver',
    icon: 'Wand2',
    accepts: ['image/png', 'image/jpeg', 'image/webp'],
  },
  {
    id: 'image-collage',
    route: 'image-collage',
    label: 'Kolase Gambar',
    icon: 'Grid',
    accepts: ['image/png', 'image/jpeg', 'image/webp'],
  },
  {
    id: 'signature',
    route: 'signature',
    label: 'Tanda Tangan (TTD)',
    icon: 'PenLine',
    accepts: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  },
  {
    id: 'image-upscale',
    route: 'image-upscale',
    label: 'Perbesar Gambar (Upscaler)',
    icon: 'ZoomIn',
    accepts: ['image/png', 'image/jpeg', 'image/webp'],
  },
  {
    id: 'background-remover',
    route: 'background-remover',
    label: 'Hapus Background Foto',
    icon: 'Eraser',
    accepts: ['image/png', 'image/jpeg', 'image/webp'],
  },
  {
    id: 'doc-to-markdown',
    route: 'doc-to-markdown',
    label: 'Dokumen → Markdown',
    icon: 'FileCode2',
    accepts: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/webp',
    ],
  },
]

export function getTargetsForOutput(outputMimeType, excludeRoute) {
  return TOOL_REGISTRY.filter(
    (t) => t.route !== excludeRoute && t.accepts.some((a) => outputMimeType.startsWith(a) || a.startsWith(outputMimeType))
  )
}

export function getMimeTypeFromFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  const map = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    tiff: 'image/tiff',
    heic: 'image/heic',
  }
  return map[ext] || 'application/octet-stream'
}
