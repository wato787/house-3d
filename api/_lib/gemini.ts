import { extractJson } from './json'
import { planPrompt } from './prompt'

const geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models'
const geminiModel = 'gemini-3.6-flash'

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
  error?: {
    message?: string
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

export async function generatePlanJson(apiKey: string, image: File) {
  const imageBase64 = arrayBufferToBase64(await image.arrayBuffer())
  const response = await fetch(`${geminiEndpoint}/${geminiModel}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              inline_data: {
                mime_type: image.type || 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              text: planPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
      },
    }),
  })

  const payload = (await response.json()) as GeminiResponse

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      message: payload.error?.message ?? 'Gemini APIの呼び出しに失敗しました。',
    }
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim()

  if (!text) {
    return {
      ok: false as const,
      status: 502,
      message: 'AIから空の返答が返りました。',
    }
  }

  return {
    ok: true as const,
    json: extractJson(text),
  }
}
