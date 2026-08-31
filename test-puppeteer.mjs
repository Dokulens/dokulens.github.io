import puppeteer from 'puppeteer'
import { readFileSync } from 'fs'

const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()

page.on('console', msg => console.log('BROWSER:', msg.text()))
page.on('pageerror', err => console.log('PAGE ERROR:', err.message))

console.log('Navigating to Watermark Remover...')
await page.goto('http://localhost:5173/#/watermark-remover', { waitUntil: 'networkidle0' })
await page.waitForTimeout(2000)

// Upload video file
console.log('Uploading video...')
const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 5000 })
await fileInput.uploadFile('C:\\Users\\TBench\\Downloads\\mp4.mp4')
await page.waitForTimeout(3000)

// Take screenshot after upload
await page.screenshot({ path: 'C:\\Users\\TBench\\AppData\\Local\\Temp\\opencode\\dokulens\\test-step1-upload.png' })
console.log('Screenshot saved: test-step1-upload.png')

// Click process button
console.log('Clicking process button...')
const processBtn = await page.$('button:has-text("Proses"), button:has-text("Hapus"), button:has-text("Process")')
if (processBtn) {
  await processBtn.click()
  console.log('Clicked!')
  
  // Wait for processing
  await page.waitForTimeout(15000)
  
  await page.screenshot({ path: 'C:\\Users\\TBench\\AppData\\Local\\Temp\\opencode\\dokulens\\test-step2-result.png' })
  console.log('Result screenshot saved: test-step2-result.png')
} else {
  console.log('Process button not found, trying all buttons...')
  const buttons = await page.$$('button')
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn)
    console.log('  Button:', text.trim().substring(0, 50))
  }
}

await browser.close()
console.log('DONE')
