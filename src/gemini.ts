export async function generatePlanFromImage(file: File) {
  const formData = new FormData()
  formData.append('image', file)

  const response = await fetch('/api/generate-plan', {
    method: 'POST',
    body: formData,
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error(text || '3Dプレビューの作成に失敗しました。')
  }

  return text
}
