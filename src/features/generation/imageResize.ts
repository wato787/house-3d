const maxImageSide = 1800
const resizedImageQuality = 0.86

export async function resizeImageForUpload(file: File) {
  const image = await createImageBitmap(file)
  const scale = Math.min(1, maxImageSide / Math.max(image.width, image.height))

  if (scale === 1 && file.type === 'image/jpeg') {
    image.close()
    return file
  }

  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')

  if (!context) {
    image.close()
    throw new Error('画像の縮小に失敗しました。')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  image.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result)
        } else {
          reject(new Error('画像の変換に失敗しました。'))
        }
      },
      'image/jpeg',
      resizedImageQuality,
    )
  })

  const fileName = file.name.replace(/\.[^.]+$/, '') || 'floor-plan'

  return new File([blob], `${fileName}.jpg`, {
    type: 'image/jpeg',
  })
}
