import { removeWatermarkFromImage, createWatermarkEngine } from '@pilio/gemini-watermark-remover/browser'
import { readFileSync, writeFileSync } from 'fs'

// Simple test: create a test image with a white watermark-like overlay
const w = 100, h = 100
const canvas = { width: w, height: h }
const data = new Uint8ClampedArray(w * h * 4)

// Fill with random-ish pixels
for (let i = 0; i < w * h * 4; i += 4) {
  data[i] = 128 + (i % 50)   // R
  data[i+1] = 100 + (i % 30) // G
  data[i+2] = 80 + (i % 40)  // B
  data[i+3] = 255             // A
}

console.log('Library loaded successfully')
console.log('Testing createWatermarkEngine...')

try {
  const engine = await createWatermarkEngine()
  console.log('Engine created:', typeof engine)
  console.log('Engine methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(engine)))
  
  const info = engine.getWatermarkInfo(1024, 1024)
  console.log('Watermark info for 1024x1024:', JSON.stringify(info, null, 2))
  
  const info2 = engine.getWatermarkInfo(1920, 1080)
  console.log('Watermark info for 1920x1080:', JSON.stringify(info2, null, 2))
  
} catch(err) {
  console.error('Error:', err.message)
  console.error(err.stack)
}
