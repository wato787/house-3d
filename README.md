# House 3D

間取り画像から3Dプレビューを生成するVite + Reactアプリです。

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Vercel API Route経由でGeminiを呼びます。ローカルでAPI Route込みの挙動を見る場合はVercel CLIを使ってください。

```bash
vercel dev
```

## Environment variables

```bash
GEMINI_API_KEY=
```

`GEMINI_API_KEY` はVercelのProject Environment Variablesに設定します。ブラウザに露出する `VITE_` 変数は使いません。

## Deploy

VercelでGitHub repositoryを接続すればデプロイできます。

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

`vercel.json` でnoindexヘッダーも設定しています。
