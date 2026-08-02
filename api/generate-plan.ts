import { generatePlanJson } from './_lib/gemini'

export const config = {
  runtime: 'edge',
  maxDuration: 60,
}

declare const process: {
  env: {
    GEMINI_API_KEY?: string
  }
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    return new Response('GEMINI_API_KEYが設定されていません。', { status: 500 })
  }

  try {
    const formData = await request.formData()
    const image = formData.get('image')

    if (!(image instanceof File)) {
      return new Response('画像ファイルが見つかりません。', { status: 400 })
    }

    const result = await generatePlanJson(apiKey, image)

    if (!result.ok) {
      return new Response(result.message, { status: result.status })
    }

    return new Response(result.json, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : '3Dプレビューの作成に失敗しました。',
      { status: 500 },
    )
  }
}
