import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './components/Layout'

const Landing = lazy(() => import('./pages/Landing'))
const EditPDF = lazy(() => import('./pages/tools/EditPDF'))
const AddPageNumber = lazy(() => import('./pages/tools/AddPageNumber'))
const MergePDF = lazy(() => import('./pages/tools/MergePDF'))
const SplitPDF = lazy(() => import('./pages/tools/SplitPDF'))
const DocToMarkdown = lazy(() => import('./pages/tools/DocToMarkdown'))
const CompressPDF = lazy(() => import('./pages/tools/CompressPDF'))
// hidden: PDFToDocx, DocxToPDF — restore by uncommenting imports + routes below
const WatermarkRemover = lazy(() => import('./pages/tools/WatermarkRemover'))
const ObjectRemover = lazy(() => import('./pages/tools/ObjectRemover'))
const ImageWatermark = lazy(() => import('./pages/tools/ImageWatermark'))
const ImageCropRotate = lazy(() => import('./pages/tools/ImageCropRotate'))
const ImageCarver = lazy(() => import('./pages/tools/ImageCarver'))
const ImageToPDF = lazy(() => import('./pages/tools/ImageToPDF'))
const PDFToImage = lazy(() => import('./pages/tools/PDFToImage'))
const ImageConvert = lazy(() => import('./pages/tools/ImageConvert'))
const ImageEditText = lazy(() => import('./pages/tools/ImageEditText'))
const ImageUpscaler = lazy(() => import('./pages/tools/ImageUpscaler'))
const ImageCollage = lazy(() => import('./pages/tools/ImageCollage'))
const Signature = lazy(() => import('./pages/tools/Signature'))
const WatermarkPDF = lazy(() => import('./pages/tools/WatermarkPDF'))
const PasswordPDF = lazy(() => import('./pages/tools/PasswordPDF'))
const About = lazy(() => import('./pages/About'))

function PageFallback() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 size={24} className="animate-spin text-(--color-brand)" />
    </div>
  )
}

// Restore deep-link routes after GitHub Pages 404.html SPA fallback rewrite.
function RestoreRoute() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    const sp = new URLSearchParams(location.search)
    const p = sp.get('p')
    if (p) {
      // strip leading slash, decode, drop query/hash remnants captured
      const target = p.replace(/^\/+/, '')
      navigate(`/${target}`, { replace: true })
    }
  }, [location.search, navigate])
  return null
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <RestoreRoute />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Landing />} />
              <Route path="edit-pdf" element={<EditPDF />} />
              <Route path="add-page-number" element={<AddPageNumber />} />
              <Route path="merge-pdf" element={<MergePDF />} />
              <Route path="split-pdf" element={<SplitPDF />} />
              <Route path="doc-to-markdown" element={<DocToMarkdown />} />
              <Route path="compress-pdf" element={<CompressPDF />} />
              {/* hidden: pdf-to-docx, docx-to-pdf */}
              <Route path="watermark-remover" element={<WatermarkRemover />} />
              <Route path="image-watermark" element={<ImageWatermark />} />
              <Route path="object-remover" element={<ObjectRemover />} />
              <Route path="image-crop-rotate" element={<ImageCropRotate />} />
              <Route path="image-carver" element={<ImageCarver />} />
              <Route path="image-to-pdf" element={<ImageToPDF />} />
              <Route path="pdf-to-image" element={<PDFToImage />} />
              <Route path="image-convert" element={<ImageConvert />} />
              <Route path="image-collage" element={<ImageCollage />} />
              <Route path="signature" element={<Signature />} />
              <Route path="image-edit-text" element={<ImageEditText />} />
              <Route path="image-upscale" element={<ImageUpscaler />} />
              <Route path="watermark-pdf" element={<WatermarkPDF />} />
              <Route path="password-pdf" element={<PasswordPDF />} />
              <Route path="about" element={<About />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  )
}
