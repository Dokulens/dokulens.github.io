// nav config — single source of truth
export const NAV_GROUPS = [
  {
    label: 'PDF Tools',
    items: [
      { path: 'edit-pdf',        label: 'Edit PDF (Teks & Anotasi)',    icon: 'FilePenLine',  desc: 'Deteksi & ganti teks otomatis pada dokumen PDF' },
      { path: 'add-page-number', label: 'Tambah Nomor Halaman',         icon: 'Hash',         desc: 'Nomor halaman otomatis, deteksi posisi & font' },
      { path: 'merge-pdf',       label: 'Merge PDF',                   icon: 'Combine',      desc: 'Gabung beberapa PDF jadi satu' },
      { path: 'split-pdf',       label: 'Split PDF',                   icon: 'Scissors',     desc: 'Pisah halaman PDF jadi file terpisah' },
      { path: 'compress-pdf',    label: 'Compress PDF',                icon: 'PackageOpen',  desc: 'Kurangi ukuran file PDF' },
      { path: 'rotate-pdf',      label: 'Rotate / Reorder Halaman',   icon: 'RotateCw',     desc: 'Putar & susun ulang urutan halaman PDF' },
      { path: 'watermark-pdf',   label: 'Watermark PDF',               icon: 'Stamp',        desc: 'Tambah teks watermark ke PDF' },
      { path: 'password-pdf',    label: 'Password & Keamanan PDF',     icon: 'Lock',         desc: 'Kunci PDF (wajib password) atau buka proteksi' },
    ],
  },
  {
    label: 'Word & Dokumen',
    items: [
      { path: 'pdf-to-docx',     label: 'PDF → Word (.docx)',          icon: 'FileText',     desc: 'Ubah file PDF jadi dokumen Word yang bisa diedit' },
      { path: 'docx-to-pdf',     label: 'Word (.docx) → PDF',          icon: 'FileType',     desc: 'Konversi file Word docx menjadi PDF' },
    ],
  },
  {
    label: 'Gambar & Media',
    items: [
      { path: 'image-crop-rotate', label: 'Crop & Putar Gambar',       icon: 'Crop',         desc: 'Potong area drag manual, rotasi 90°, flip & aspek rasio' },
      { path: 'image-carver',    label: 'Image Carver (Seam Carving)', icon: 'Wand2',        desc: 'Content-aware resize & hapus objek pada foto' },
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
