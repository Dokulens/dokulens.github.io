/**
 * Gemini Watermark Remover SDK — official engine from @pilio/gemini-watermark-remover
 * Loaded via esm.sh CDN for 100% client-side browser usage.
 * No server required. Alpha maps embedded in the SDK bundle.
 */
import { createWatermarkEngine, calculateWatermarkPosition, detectWatermarkConfig, removeWatermarkFromImage } from 'https://esm.sh/@pilio/gemini-watermark-remover@1.0.41'

export { createWatermarkEngine, calculateWatermarkPosition, detectWatermarkConfig, removeWatermarkFromImage }

export async function removeWatermarkFromCanvas(canvas) {
  const result = await removeWatermarkFromImage(canvas, { adaptiveMode: 'auto' })
  return result
}

export async function removeWatermarkFromImageElement(img) {
  const result = await removeWatermarkFromImage(img, { adaptiveMode: 'auto' })
  return result
}
