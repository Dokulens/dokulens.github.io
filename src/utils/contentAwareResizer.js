/**
 * Exact implementation of js-image-carver algorithm (by Oleksii Trekhleb).
 * Based on Seam Carving for Content-Aware Image Resizing by Shai Avidan & Ariel Shamir.
 */

export const ALPHA_DELETE_THRESHOLD = 244
export const MAX_WIDTH_LIMIT = 1200
export const MAX_HEIGHT_LIMIT = 1200

export const getPixel = (img, { x, y }) => {
  const i = y * img.width + x
  return img.data.subarray(i * 4, i * 4 + 4)
}

export const setPixel = (img, { x, y }, color) => {
  const i = y * img.width + x
  img.data.set(color, i * 4)
}

const getPixelDeleteEnergy = () => {
  const numColors = 3
  const maxColorDistance = 255
  const numNeighbors = 2
  const multiplier = 2
  const maxSeamSize = Math.max(MAX_WIDTH_LIMIT, MAX_HEIGHT_LIMIT)
  return -1 * multiplier * numNeighbors * maxSeamSize * numColors * (maxColorDistance ** 2)
}

const matrix = (w, h, filler) => {
  return new Array(h).fill(null).map(() => new Array(w).fill(filler))
}

const getPixelEnergy = (left, middle, right) => {
  const [mR, mG, mB, mA] = middle

  let lEnergy = 0
  if (left) {
    const [lR, lG, lB] = left
    lEnergy = (lR - mR) ** 2 + (lG - mG) ** 2 + (lB - mB) ** 2
  }

  let rEnergy = 0
  if (right) {
    const [rR, rG, rB] = right
    rEnergy = (rR - mR) ** 2 + (rG - mG) ** 2 + (rB - mB) ** 2
  }

  return mA > ALPHA_DELETE_THRESHOLD ? lEnergy + rEnergy : getPixelDeleteEnergy()
}

const getPixelEnergyH = (img, { w }, { x, y }) => {
  const left = x - 1 >= 0 ? getPixel(img, { x: x - 1, y }) : null
  const middle = getPixel(img, { x, y })
  const right = x + 1 < w ? getPixel(img, { x: x + 1, y }) : null
  return getPixelEnergy(left, middle, right)
}

const getPixelEnergyV = (img, { h }, { x, y }) => {
  const top = y - 1 >= 0 ? getPixel(img, { x, y: y - 1 }) : null
  const middle = getPixel(img, { x, y })
  const bottom = y + 1 < h ? getPixel(img, { x, y: y + 1 }) : null
  return getPixelEnergy(top, middle, bottom)
}

export const calculateEnergyMapH = (img, { w, h }) => {
  const energyMap = matrix(w, h, Infinity)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      energyMap[y][x] = getPixelEnergyH(img, { w, h }, { x, y })
    }
  }
  return energyMap
}

export const calculateEnergyMapV = (img, { w, h }) => {
  const energyMap = matrix(w, h, Infinity)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      energyMap[y][x] = getPixelEnergyV(img, { w, h }, { x, y })
    }
  }
  return energyMap
}

const reCalculateEnergyMapH = (img, { w, h }, energyMap, seam) => {
  seam.forEach(({ x: seamX, y: seamY }) => {
    for (let x = seamX; x < w - 1; x += 1) {
      energyMap[seamY][x] = energyMap[seamY][x + 1]
    }
    energyMap[seamY][seamX] = getPixelEnergyH(img, { w, h }, { x: seamX, y: seamY })
  })
  return energyMap
}

const reCalculateEnergyMapV = (img, { w, h }, energyMap, seam) => {
  seam.forEach(({ x: seamX, y: seamY }) => {
    for (let y = seamY; y < h - 1; y += 1) {
      energyMap[y][seamX] = energyMap[y + 1][seamX]
    }
    energyMap[seamY][seamX] = getPixelEnergyV(img, { w, h }, { x: seamX, y: seamY })
  })
  return energyMap
}

export const findLowEnergySeamH = (energyMap, { w, h }) => {
  const seamsMap = matrix(w, h, null)

  for (let x = 0; x < w; x += 1) {
    const y = 0
    seamsMap[y][x] = {
      energy: energyMap[y][x],
      coordinate: { x, y },
      previous: null,
    }
  }

  for (let y = 1; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let minPrevEnergy = Infinity
      let minPrevX = x
      for (let i = x - 1; i <= x + 1; i += 1) {
        if (i >= 0 && i < w && seamsMap[y - 1][i].energy < minPrevEnergy) {
          minPrevEnergy = seamsMap[y - 1][i].energy
          minPrevX = i
        }
      }

      seamsMap[y][x] = {
        energy: minPrevEnergy + energyMap[y][x],
        coordinate: { x, y },
        previous: { x: minPrevX, y: y - 1 },
      }
    }
  }

  let lastMinCoordinate = null
  let minSeamEnergy = Infinity
  for (let x = 0; x < w; x += 1) {
    const y = h - 1
    if (seamsMap[y][x].energy < minSeamEnergy) {
      minSeamEnergy = seamsMap[y][x].energy
      lastMinCoordinate = { x, y }
    }
  }

  const seam = []
  if (!lastMinCoordinate) return seam

  const { x: lastMinX, y: lastMinY } = lastMinCoordinate
  let currentSeam = seamsMap[lastMinY][lastMinX]
  while (currentSeam) {
    seam.push(currentSeam.coordinate)
    const prevMinCoordinates = currentSeam.previous
    if (!prevMinCoordinates) {
      currentSeam = null
    } else {
      const { x: prevMinX, y: prevMinY } = prevMinCoordinates
      currentSeam = seamsMap[prevMinY][prevMinX]
    }
  }

  return seam
}

export const findLowEnergySeamV = (energyMap, { w, h }) => {
  const seamsMap = matrix(w, h, null)

  for (let y = 0; y < h; y += 1) {
    const x = 0
    seamsMap[y][x] = {
      energy: energyMap[y][x],
      coordinate: { x, y },
      previous: null,
    }
  }

  for (let x = 1; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) {
      let minPrevEnergy = Infinity
      let minPrevY = y
      for (let i = y - 1; i <= y + 1; i += 1) {
        if (i >= 0 && i < h && seamsMap[i][x - 1].energy < minPrevEnergy) {
          minPrevEnergy = seamsMap[i][x - 1].energy
          minPrevY = i
        }
      }

      seamsMap[y][x] = {
        energy: minPrevEnergy + energyMap[y][x],
        coordinate: { x, y },
        previous: { x: x - 1, y: minPrevY },
      }
    }
  }

  let lastMinCoordinate = null
  let minSeamEnergy = Infinity
  for (let y = 0; y < h; y += 1) {
    const x = w - 1
    if (seamsMap[y][x].energy < minSeamEnergy) {
      minSeamEnergy = seamsMap[y][x].energy
      lastMinCoordinate = { x, y }
    }
  }

  const seam = []
  if (!lastMinCoordinate) return seam

  const { x: lastMinX, y: lastMinY } = lastMinCoordinate
  let currentSeam = seamsMap[lastMinY][lastMinX]
  while (currentSeam) {
    seam.push(currentSeam.coordinate)
    const prevMinCoordinates = currentSeam.previous
    if (!prevMinCoordinates) {
      currentSeam = null
    } else {
      const { x: prevMinX, y: prevMinY } = prevMinCoordinates
      currentSeam = seamsMap[prevMinY][prevMinX]
    }
  }

  return seam
}

const deleteSeamH = (img, seam, { w }) => {
  seam.forEach(({ x: seamX, y: seamY }) => {
    for (let x = seamX; x < w - 1; x += 1) {
      const nextPixel = getPixel(img, { x: x + 1, y: seamY })
      setPixel(img, { x, y: seamY }, nextPixel)
    }
  })
}

const deleteSeamV = (img, seam, { h }) => {
  seam.forEach(({ x: seamX, y: seamY }) => {
    for (let y = seamY; y < h - 1; y += 1) {
      const nextPixel = getPixel(img, { x: seamX, y: y + 1 })
      setPixel(img, { x, y: seamY }, nextPixel)
    }
  })
}

const wait = (time = 0) => new Promise((resolve) => setTimeout(resolve, time))

export const resizeImage = async ({ img, toWidth, toHeight, onIteration, isCancelled }) => {
  const pxToRemoveH = img.width - toWidth
  const pxToRemoveV = img.height - toHeight

  const size = { w: img.width, h: img.height }
  const globalSteps = Math.max(0, pxToRemoveH) + Math.max(0, pxToRemoveV)
  let globalStep = 0

  let energyMap = null
  let seam = null

  // 1. Horizontal Reduction (Width)
  for (let i = 0; i < pxToRemoveH; i += 1) {
    if (isCancelled && isCancelled()) break

    energyMap = energyMap && seam
      ? reCalculateEnergyMapH(img, size, energyMap, seam)
      : calculateEnergyMapH(img, size)

    seam = findLowEnergySeamH(energyMap, size)
    deleteSeamH(img, seam, size)

    globalStep += 1
    if (onIteration) {
      await onIteration({
        seam,
        img,
        size: { ...size },
        energyMap,
        step: globalStep,
        steps: globalSteps,
      })
    }

    size.w -= 1
    await wait(0)
  }

  // 2. Vertical Reduction (Height)
  energyMap = null
  seam = null
  for (let i = 0; i < pxToRemoveV; i += 1) {
    if (isCancelled && isCancelled()) break

    energyMap = energyMap && seam
      ? reCalculateEnergyMapV(img, size, energyMap, seam)
      : calculateEnergyMapV(img, size)

    seam = findLowEnergySeamV(energyMap, size)
    deleteSeamV(img, seam, size)

    globalStep += 1
    if (onIteration) {
      await onIteration({
        seam,
        img,
        size: { ...size },
        energyMap,
        step: globalStep,
        steps: globalSteps,
      })
    }

    size.h -= 1
    await wait(0)
  }

  return { img, size }
}

/** Normalize 2D Energy Map for visualization canvas rendering */
export const normalizeEnergyMap = (energyMap, width, height, maxNormalizedEnergy = 255) => {
  let maxEnergy = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (energyMap[y][x] !== Infinity && energyMap[y][x] > maxEnergy) {
        maxEnergy = energyMap[y][x]
      }
    }
  }

  const normalized = matrix(width, height, 0)
  if (maxEnergy === 0) return normalized

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const e = energyMap[y][x]
      normalized[y][x] = e === Infinity || e < 0 ? 0 : Math.floor((e / maxEnergy) * maxNormalizedEnergy)
    }
  }

  return normalized
}
