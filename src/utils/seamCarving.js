/**
 * Pure client-side Seam Carving (Content-Aware Image Resizing & Object Removal)
 * Inspired by Shai Avidan & Ariel Shamir's Seam Carving algorithm and js-image-carver.
 */

/** Compute pixel energy using Dual-Gradient Energy function */
export function calculateEnergyMap(imgData, maskData = null) {
  const { width, height, data } = imgData
  const energy = new Float32Array(width * height)

  const getPixel = (x, y) => {
    // Clamp coordinate
    const cx = Math.max(0, Math.min(width - 1, x))
    const cy = Math.max(0, Math.min(height - 1, y))
    const offset = (cy * width + cx) * 4
    return [data[offset], data[offset + 1], data[offset + 2]]
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x

      // Mask influence:
      // Red mask = remove (heavily negative energy)
      // Green mask = protect (heavily positive energy)
      if (maskData) {
        const mOffset = idx * 4
        const mr = maskData[mOffset]
        const mg = maskData[mOffset + 1]
        const ma = maskData[mOffset + 3]

        if (ma > 30) {
          if (mr > 150 && mg < 80) {
            energy[idx] = -100000 // Remove first
            continue
          } else if (mg > 150 && mr < 80) {
            energy[idx] = 100000 // Protect
            continue
          }
        }
      }

      // X gradient
      const [rx, gx, bx] = getPixel(x + 1, y)
      const [lx, glx, blx] = getPixel(x - 1, y)
      const dx = (rx - lx) ** 2 + (gx - glx) ** 2 + (bx - blx) ** 2

      // Y gradient
      const [dy_r, dy_g, dy_b] = getPixel(x, y + 1)
      const [uy_r, uy_g, uy_b] = getPixel(x, y - 1)
      const dy = (dy_r - uy_r) ** 2 + (dy_g - uy_g) ** 2 + (dy_b - uy_b) ** 2

      energy[idx] = Math.sqrt(dx + dy)
    }
  }

  return energy
}

/** Find minimum energy vertical seam using Dynamic Programming */
export function findVerticalSeam(energy, width, height) {
  // DP table for accumulated minimum energy
  const dp = new Float32Array(width * height)
  const backtrack = new Int32Array(width * height)

  // Initialize first row
  for (let x = 0; x < width; x++) {
    dp[x] = energy[x]
  }

  // Fill DP table row by row
  for (let y = 1; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const prevRow = (y - 1) * width

      // Check 3 predecessors: (x-1, y-1), (x, y-1), (x+1, y-1)
      let minPrev = dp[prevRow + x]
      let bestX = x

      if (x > 0 && dp[prevRow + x - 1] < minPrev) {
        minPrev = dp[prevRow + x - 1]
        bestX = x - 1
      }
      if (x < width - 1 && dp[prevRow + x + 1] < minPrev) {
        minPrev = dp[prevRow + x + 1]
        bestX = x + 1
      }

      dp[idx] = energy[idx] + minPrev
      backtrack[idx] = bestX
    }
  }

  // Find minimum in bottom row
  let minEnergy = Infinity
  let minX = 0
  const lastRow = (height - 1) * width
  for (let x = 0; x < width; x++) {
    if (dp[lastRow + x] < minEnergy) {
      minEnergy = dp[lastRow + x]
      minX = x
    }
  }

  // Backtrack to find full seam
  const seam = new Int32Array(height)
  seam[height - 1] = minX
  for (let y = height - 2; y >= 0; y--) {
    const nextX = seam[y + 1]
    seam[y] = backtrack[(y + 1) * width + nextX]
  }

  return seam
}

/** Remove a vertical seam from ImageData */
export function removeVerticalSeam(imgData, seam, maskData = null) {
  const { width, height, data } = imgData
  const newWidth = width - 1
  const newImgData = new ImageData(newWidth, height)
  const newData = newImgData.data

  let newMaskData = null
  if (maskData) {
    newMaskData = new Uint8ClampedArray(newWidth * height * 4)
  }

  for (let y = 0; y < height; y++) {
    const seamX = seam[y]
    let targetX = 0
    for (let x = 0; x < width; x++) {
      if (x === seamX) continue
      const srcIdx = (y * width + x) * 4
      const dstIdx = (y * newWidth + targetX) * 4

      newData[dstIdx] = data[srcIdx]
      newData[dstIdx + 1] = data[srcIdx + 1]
      newData[dstIdx + 2] = data[srcIdx + 2]
      newData[dstIdx + 3] = data[srcIdx + 3]

      if (maskData) {
        newMaskData[dstIdx] = maskData[srcIdx]
        newMaskData[dstIdx + 1] = maskData[srcIdx + 1]
        newMaskData[dstIdx + 2] = maskData[srcIdx + 2]
        newMaskData[dstIdx + 3] = maskData[srcIdx + 3]
      }
      targetX++
    }
  }

  return { imgData: newImgData, maskData: newMaskData }
}

/** Transpose ImageData (swap width & height) for horizontal seam carving */
export function transposeImageData(imgData) {
  const { width, height, data } = imgData
  const transposed = new ImageData(height, width)
  const tData = transposed.data

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4
      const dstIdx = (x * height + y) * 4
      tData[dstIdx] = data[srcIdx]
      tData[dstIdx + 1] = data[srcIdx + 1]
      tData[dstIdx + 2] = data[srcIdx + 2]
      tData[dstIdx + 3] = data[srcIdx + 3]
    }
  }

  return transposed
}

/** Transpose mask byte array */
export function transposeMask(maskData, width, height) {
  if (!maskData) return null
  const transposed = new Uint8ClampedArray(height * width * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4
      const dstIdx = (x * height + y) * 4
      transposed[dstIdx] = maskData[srcIdx]
      transposed[dstIdx + 1] = maskData[srcIdx + 1]
      transposed[dstIdx + 2] = maskData[srcIdx + 2]
      transposed[dstIdx + 3] = maskData[srcIdx + 3]
    }
  }
  return transposed
}
