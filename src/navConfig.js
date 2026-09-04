// nav config — single source of truth
export const NAV_GROUPS = [
  {
    label: 'PDF Tools',
    items: [
      { path: 'edit-pdf',        label: 'Edit PDF (Teks & Anotasi)',    icon: 'FilePenLine',  desc: 'Deteksi & ganti teks otomatis pada dokumen PDF' },
      { path: 'merge-pdf',       label: 'Merge PDF / Gambar',          icon: 'Combine',      desc: 'Gabung beberapa PDF & Gambar, samakan lebar, atur urutan, putar & ekspor ke PDF/Gambar' },
      { path: 'split-pdf',       label: 'Split PDF',                   icon: 'Scissors',     desc: 'Pisah halaman PDF jadi file terpisah' },
      { path: 'compress-pdf',    label: 'Compress PDF',                icon: 'PackageOpen',  desc: 'Kurangi ukuran file PDF' },
      { path: 'watermark-pdf',   label: 'Watermark PDF',               icon: 'Stamp',        desc: 'Tambah teks watermark ke PDF' },
      { path: 'password-pdf',    label: 'Password & Keamanan PDF',     icon: 'Lock',         desc: 'Kunci PDF (wajib password) atau buka proteksi' },
    ],
  },
  {
    label: 'Word & Dokumen',
    items: [
      { path: 'add-page-number', label: 'Tambah Nomor Halaman',         icon: 'Hash',         desc: 'Nomor halaman otomatis untuk PDF & Word (.docx)' },
      { path: 'doc-to-markdown', label: 'Dokumen → Markdown',           icon: 'FileCode2',     desc: 'Ubah DOCX, PDF, TXT jadi Markdown rapi siap kirim ke AI' },
      // hidden: pdf-to-docx, docx-to-pdf — see App.jsx + toolRegistry.js
    ],
  },
  {
    label: 'Gambar & Media',
    items: [
      { path: 'watermark-remover', label: 'Hapus Watermark (AI/Foto)', icon: 'Eraser',       desc: 'Hapus logo, cap air & watermark AI (Reverse Alpha / Inpaint)' },
      { path: 'image-watermark',  label: 'Tambah Watermark (Teks/Ikon)', icon: 'Type',        desc: 'Tambah watermark teks atau ikon/gambar dengan drag & drop & opasitas' },
      { path: 'image-crop-rotate', label: 'Crop & Putar Gambar',       icon: 'Crop',         desc: 'Potong area drag manual, rotasi 90°, flip & aspek rasio' },
      { path: 'image-collage',    label: 'Kolase Gambar',             icon: 'Grid',         desc: 'Susun gambar jadi kolase dengan preset grid atau custom drag & resize' },
      { path: 'signature',        label: 'Tanda Tangan (TTD)',         icon: 'PenLine',      desc: 'Buat tanda tangan PNG lalu terapkan presisi ke dokumen PDF/gambar' },
      { path: 'image-carver',    label: 'Image Carver (Seam Carving)', icon: 'Wand2',        desc: 'Content-aware resize & hapus objek bertarget pada foto' },
      { path: 'image-to-pdf',    label: 'Gambar → PDF',                icon: 'ImagePlus',    desc: 'Gabung JPG/PNG/WebP jadi PDF' },
      { path: 'pdf-to-image',    label: 'PDF → Gambar',                icon: 'FileImage',    desc: 'Ekspor halaman PDF sebagai gambar' },
      { path: 'image-convert',   label: 'Konversi & Resize Gambar',    icon: 'RefreshCw',    desc: 'WebP, JPG, PNG, AVIF, BMP, ICO & kompresi' },
    ],
  },
  {
    label: 'Informasi',
    items: [
      { path: 'about',           label: 'Tentang & Open-Source',       icon: 'Info',         desc: 'Daftar teknologi & pustaka open-source' },
    ],
  },
]
