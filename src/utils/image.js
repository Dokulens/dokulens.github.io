export const getPixel = (img, { x, y }) => {
  const i = y * img.width + x
  return img.data.subarray(i * 4, i * 4 + 4)
}

export const setPixel = (img, { x, y }, color) => {
  const i = y * img.width + x
  img.data.set(color, i * 4)
}
