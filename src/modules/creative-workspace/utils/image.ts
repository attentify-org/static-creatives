export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

export function getImageEditSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1024, height: 1024 }
  }

  const aspectRatio = width / height
  let outputWidth = width
  let outputHeight = height

  if (aspectRatio > 3) {
    outputWidth = height * 3
  } else if (aspectRatio < 1 / 3) {
    outputHeight = width * 3
  }

  const maxPixels = 3840 * 2160
  if (outputWidth * outputHeight > maxPixels) {
    const scale = Math.sqrt(maxPixels / (outputWidth * outputHeight))
    outputWidth *= scale
    outputHeight *= scale
  }

  return {
    width: roundToMultiple(outputWidth, 16),
    height: roundToMultiple(outputHeight, 16),
  }
}

function roundToMultiple(value: number, multiple: number) {
  return Math.max(multiple, Math.round(value / multiple) * multiple)
}
