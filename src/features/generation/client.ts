import { resizeImageForUpload } from './imageResize'

export async function generatePlanFromImage(file: File) {
  const resizedFile = await resizeImageForUpload(file)
  const formData = new FormData()
  formData.append('image', resizedFile)

  const response = await fetch('/api/generate-plan', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || '3Dプレビューの作成に失敗しました。')
  }

  return response.text()
}
