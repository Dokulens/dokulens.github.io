// nav config — single source of truth
export const NAV_GROUPS = [
  {
    label: 'PDF Tools',
    items: [
      { path: 'edit-pdf',        label: 'Edit PDF (Teks & Anotasi)',    icon: 'FilePenLine',  desc: 'Deteksi & ganti teks otomatis pada dokumen PDF' },
      { path: 'merge-pdf',       label: 'Merge PDF / Gambar',          icon: 'Combine',      desc: 'Gabung beberapa PDF & Gambar dengan opsi lebar & urutan per-halaman' },
      { path: 'split-pdf',       label: 'Split PDF',                   icon: 'Scissors',     desc: 'Pisah halaman PDF jadi file terpisah' },
      { path: 'compress-pdf',    label: 'Compress PDF',                icon: 'PackageOpen',  desc: 'Kurangi ukuran file PDF' },
      { path: 'rotate-pdf',      label: 'Rotate, Reorder & Merge PDF / Gambar', icon: 'RotateCw',     desc: 'Putar orientasi, susun ulang & gabungkan halaman PDF dan Gambar' },
      { path: 'watermark-pdf',   label: 'Watermark PDF',               icon: 'Stamp',        desc: 'Tambah teks watermark ke PDF' },
      { path: 'password-pdf',    label: 'Password & Keamanan PDF',     icon: 'Lock',         desc: 'Kunci PDF (wajib password) atau buka proteksi' },
    ],
  },
  {
    label: 'Word & Dokumen',
    items: [
      { path: 'add-page-number', label: 'Tambah Nomor Halaman',         icon: 'Hash',         desc: 'Nomor halaman otomatis untuk PDF & Word (.docx)' },
      { path: 'pdf-to-docx',     label: 'PDF → Word (.docx)',          icon: 'FileText',     desc: 'Ubah file PDF jadi dokumen Word yang bisa diedit' },
      { path: 'docx-to-pdf',     label: 'Word (.docx) → PDF',          icon: 'FileType',     desc: 'Konversi file Word docx menjadi PDF' },
    ],
  },
  {
    label: 'Gambar & Media',
    items: [
      { path: 'watermark-remover', label: 'Hapus Watermark (AI/Foto)', icon: 'Eraser',       desc: 'Hapus logo, cap air & watermark AI (Reverse Alpha / Inpaint)' },
      { path: 'image-watermark',  label: 'Tambah Watermark (Teks/Ikon)', icon: 'Type',        desc: 'Tambah watermark teks atau ikon/gambar dengan drag & drop & opasitas' },
      { path: 'image-crop-rotate', label: 'Crop & Putar Gambar',       icon: 'Crop',         desc: 'Potong area drag manual, rotasi 90°, flip & aspek rasio' },
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
