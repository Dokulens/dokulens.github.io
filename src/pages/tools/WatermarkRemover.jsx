// Synchronized Video Watermark Removal — real-time playback, no seek drops
  const processVideoWatermark = async () => {
    if (!videoRef.current || processing) return
    setProcessing(true)
    setError('')
    setProgress(0)
    isCancelledRef.current = false

    const video = videoRef.current
    const w = video.videoWidth || 1280
    const h = video.videoHeight || 720

    // Detect actual FPS from source video
    const detectFPS = (vid) => new Promise((resolve) => {
      const times = []
      let count = 0
      const onFrame = (now, metadata) => {
        times.push(metadata.mediaTime)
        count++
        if (count >= 5) {
          const fps = Math.round((count - 1) / (times[count - 1] - times[0]))
          resolve(Math.min(Math.max(fps, 1), 120))
        } else {
          vid.requestVideoFrameCallback(onFrame)
        }
      }
      vid.requestVideoFrameCallback(onFrame)
      setTimeout(() => resolve(30), 3000)
    })

    // Use canvas for watermark processing, capture stream directly from video element
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    // Capture video stream - we'll process frames separately and reconstruct video
    const stream = canvas.captureStream(30)

    let mimeType = 'video/webm'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      // Fallback to generic webm if vp9 not supported
      mimeType = 'video/mp4'
    }

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 12000000,
    })
    const recordedChunks = []

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data)
    }

    try {
      setProgress(5)
      const processor = await createVideoFrameProcessor(w, h)

      // Wait for video to be ready
      if (video.readyState < 2) {
        await new Promise((res) => {
          video.oncanplay = res
          video.load()
        })
      }

      // Seek to first frame for calibration
      video.currentTime = 0
      await new Promise((res) => { video.onseeked = res })

      let detected = null
      if (removalMode === 'gemini') {
        // Calibrate on frame 0
        ctx.drawImage(video, 0, 0, w, h)
        detected = await processor.calibrate(canvas)

        // If detection failed, try fallback positions (video watermark might be at different position)
        if (!detected) {
          console.log('[WM] Calibration failed, trying fallback positions...')
          // Try with different sizes
          for (const testSize of [96, 48]) {
            // Adjust position for different margin assumptions
            for (const marginMult of [0.05, 0.1, 0.15, 0.2]) {
              const testPos = {
                x: Math.max(0, w - testSize - Math.round(w * marginMult)),
                y: Math.max(0, h - testSize - Math.round(h * marginMult)),
                width: testSize,
                height: testSize
              }
              const testDetected = { position: testPos, alphaGain: 1.0, logoSize: testSize }
              // Test if this position works by checking a few pixels
              const testCtx = canvas.getContext('2d')
              testCtx.drawImage(video, 0, 0, w, h)
              const testData = testCtx.getImageData(testPos.x, testPos.y, testPos.width, testPos.height)
              // Quick check: if region has high brightness variation (watermark area)
              let variation = 0
              for (let i = 0; i < testData.data.length; i += 4) {
                const brightness = (testData.data[i] + testData.data[i+1] + testData.data[i+2]) / 3
                variation += Math.abs(brightness - 128)
              }
              if (variation > 1000) { // Arbitrary threshold
                detected = testDetected
                console.log('[WM] Fallback detection found at:', testPos, 'size:', testSize)
                break
              }
            }
            if (detected) break
          }
        }

        if (!detected) {
          setError('Tidak bisa mendeteksi watermark pada video ini')
          setProcessing(false)
          return
        }
        console.log('[WM] Detected:', detected.position, 'logoSize:', detected.logoSize, 'gain:', detected.alphaGain)
      }

      // Start recording
      mediaRecorder.start(50) // smaller timeslice for more frequent data chunks
      setProgress(10)

      // Detect FPS (needs video playing for requestVideoFrameCallback)
      const fps = await detectFPS(video)
      console.log('[WM] Detected FPS:', fps)

      // Play video and draw frames to canvas so captureStream has content
      video.muted = true
      video.currentTime = 0
      await new Promise((res) => { video.onseeked = res })
      await video.play()

      const totalFrames = Math.ceil(video.duration * fps)
      let frameCount = 0

      // Process frames sequentially (async) so watermark removal completes per frame
      while (!isCancelledRef.current && !video.ended && video.currentTime < video.duration - 0.05) {
        // Wait for next frame
        await new Promise(res => requestAnimationFrame(res))

        const ct = video.currentTime

        ctx.drawImage(video, 0, 0, w, h)

        // Process watermark if gemini mode and detected
        if (removalMode === 'gemini' && detected) {
          console.log('[WM] Processing frame', frameCount, 'at time', ct)
          processor.processFrame(canvas, detected)
        } else if (removalMode === 'inpaint' && videoMaskSrc) {
          const imgData = ctx.getImageData(0, 0, w, h)
          const maskCtx = videoMaskSrc.getContext('2d')
          const maskData = maskCtx.getImageData(0, 0, videoMaskSrc.width, videoMaskSrc.height)
          inpaintWatermark(imgData, maskData.data, inpaintRadius)
          ctx.putImageData(imgData, 0, 0)
        }

        frameCount++
        if (frameCount % 5 === 0) {
          setProgress(10 + Math.round((frameCount / totalFrames) * 90))
        }
      }

      // Finish recording
      mediaRecorder.stop()
      await new Promise((res) => {
        mediaRecorder.onstop = () => {
          const videoBlob = new Blob(recordedChunks, { type: mimeType })
          setResultBlob(videoBlob)
          setResultUrl(URL.createObjectURL(videoBlob))
          setProgress(100)
          res()
        }
      })
    } catch (e) {
      setError(`Gagal memproses video: ${e.message}`)
    } finally {
      video.pause()
      setProcessing(false)
    }
  }