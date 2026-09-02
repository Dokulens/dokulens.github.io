/**
 * Multi-Select Magic Wand Tool with Undo & Color Tolerance
 * Flood fill color similarity accumulator for image masking.
 */

export function magicWandAppend({
  imgCtx,
  selCtx,
  width,
  height,
  startX,
  startY,
  tolerance = 32,
  maskColor = { r: 239, g: 68, b: 68, a: 216 }
}) {
  const originalImgData = imgCtx.getImageData(0, 0, width, height)
  const currentSelData = selCtx.getImageData(0, 0, width, height)

  const startIdx = (startY * width + startX) * 4
  const startR = originalImgData.data[startIdx]
  const startG = originalImgData.data[startIdx + 1]
  const startB = originalImgData.data[startIdx + 2]

  const visited = new Uint8Array(width * height)
  const queue = [startX, startY]
  visited[startY * width + startX] = 1

  while (queue.length > 0) {
    const currY = queue.pop()
    const currX = queue.pop()

    const selIdx = (currY * width + currX) * 4

    currentSelData.data[selIdx] = maskColor.r
    currentSelData.data[selIdx + 1] = maskColor.g
    currentSelData.data[selIdx + 2] = maskColor.b
    currentSelData.data[selIdx + 3] = maskColor.a

    const neighbors = [
      [currX + 1, currY], [currX - 1, currY],
      [currX, currY + 1], [currX, currY - 1]
    ]

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const vIdx = ny * width + nx

        if (!visited[vIdx]) {
          visited[vIdx] = 1

          const nIdx = vIdx * 4

          // Skip if pixel is already masked with high alpha
          if (currentSelData.data[nIdx + 3] > 100) continue

          const r = originalImgData.data[nIdx]
          const g = originalImgData.data[nIdx + 1]
          const b = originalImgData.data[nIdx + 2]

          const colorDiff = Math.sqrt(
            Math.pow(r - startR, 2) +
            Math.pow(g - startG, 2) +
            Math.pow(b - startB, 2)
          )

          if (colorDiff <= tolerance) {
            queue.push(nx, ny)
          }
        }
      }
    }
  }

  selCtx.putImageData(currentSelData, 0, 0)
}
