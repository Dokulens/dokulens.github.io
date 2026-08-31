import { detectWatermarkConfig, calculateWatermarkPosition } from '@pilio/gemini-watermark-remover/browser'

const configs = [
  [640, 480],
  [1280, 720],
  [1920, 1080],
  [1080, 1920],
  [3840, 2160],
  [720, 1280],
  [480, 640],
  [854, 480],
  [960, 540],
]

console.log('Watermark position detection:')
for (const [w, h] of configs) {
  const config = detectWatermarkConfig(w, h)
  const pos = calculateWatermarkPosition(w, h, config)
  console.log(`  ${w}x${h}: size=${config.logoSize} margin(R,B)=(${config.marginRight},${config.marginBottom}) -> pos(${pos.x},${pos.y}) ${pos.width}x${pos.height}`)
}
