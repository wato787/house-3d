const geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models'

const planPrompt = `
この住宅の間取り画像を解析し、3Dプレビュー用のJSONだけを返してください。
説明文、Markdown、コードフェンスは不要です。

座標は画像左上を原点とし、xは右方向、yは下方向のピクセル座標にしてください。
scaleは「1シーン単位あたりの画像座標量」です。判断できない場合は1000にしてください。

必須のJSON形式:
{
  "scale": 1000,
  "spaces": [
    {
      "id": "ldk",
      "name": "LDK",
      "polygon": [[0, 0], [1000, 0], [1000, 1000], [0, 1000]],
      "color": "#f3dfae"
    }
  ],
  "walls": [
    {
      "id": "w1",
      "start": [0, 0],
      "end": [1000, 0]
    }
  ],
  "fixtures": [
    {
      "id": "kitchen",
      "kind": "kitchen",
      "position": [500, 500],
      "size": [2400, 650],
      "rotation": 0,
      "color": "#7d858a"
    }
  ]
}

抽出対象:
- spaces: LDK、玄関、洗面、浴室、トイレ、収納、階段などの床領域
- walls: 外壁と主要な間仕切り壁
- fixtures: キッチン、浴室、トイレ、洗面台、階段、家具、収納など

不確実でも、3D下書きとして使える程度に推定してください。
`.trim()

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

function getGeminiConfig() {
  return {
    apiKey: import.meta.env.VITE_GEMINI_API_KEY as string | undefined,
    model: (import.meta.env.VITE_GEMINI_MODEL as string | undefined) ?? 'gemini-3.6-flash',
  }
}

function stripDataUrlPrefix(dataUrl: string) {
  const [, base64 = dataUrl] = dataUrl.split(',')
  return base64
}

function extractJson(text: string) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const candidate = fencedMatch?.[1] ?? text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AIの返答からJSONを取り出せませんでした。')
  }

  return candidate.slice(start, end + 1)
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(new Error('画像の読み込みに失敗しました。')))
    reader.readAsDataURL(file)
  })
}

export async function generatePlanFromImage(file: File) {
  const { apiKey, model } = getGeminiConfig()

  if (!apiKey) {
    throw new Error('.envにVITE_GEMINI_API_KEYを設定してください。')
  }

  const dataUrl = await fileToDataUrl(file)
  const response = await fetch(`${geminiEndpoint}/${model}:generateContent`, {
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
                mime_type: file.type || 'image/jpeg',
                data: stripDataUrlPrefix(dataUrl),
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
    throw new Error(payload.error?.message ?? 'Gemini APIの呼び出しに失敗しました。')
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim()

  if (!text) {
    throw new Error('AIから空の返答が返りました。')
  }

  return extractJson(text)
}
