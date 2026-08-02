import { useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { generatePlanFromImage } from './features/generation/client'
import { samplePlan } from './features/plan/samplePlan'
import { isPlan } from './features/plan/schema'
import {
  getOverallViewpoint,
  getRenderScale,
  normalizePlan,
} from './features/plan/geometry'
import { Plan2DView, Plan3DView } from './features/preview/Preview'
import './App.css'

type ViewMode = '3d' | '2d'

function App() {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(samplePlan, null, 2))
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [hasPreview, setHasPreview] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('3d')
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<{
    file: File
    name: string
    url: string
  } | null>(null)
  const drawerRef = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview.url)
      }
    }
  }, [imagePreview])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
    },
    maxFiles: 1,
    onDrop: ([file]) => {
      if (!file) {
        return
      }

      setImagePreview((currentPreview) => {
        if (currentPreview) {
          URL.revokeObjectURL(currentPreview.url)
        }

        return {
          file,
          name: file.name,
          url: URL.createObjectURL(file),
        }
      })
    },
  })

  const parsed = useMemo(() => {
    try {
      const parsedJson: unknown = JSON.parse(jsonText)
      if (!isPlan(parsedJson)) {
        return {
          error: 'JSON shape is invalid. Required: scale and spaces with numeric coordinates.',
          plan: null,
        }
      }

      return { error: null, plan: normalizePlan(parsedJson) }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Invalid JSON', plan: null }
    }
  }, [jsonText])

  const activePlan = parsed.plan ?? samplePlan
  const activeScale = useMemo(() => getRenderScale(activePlan), [activePlan])
  const selectedViewpoint = useMemo(
    () => getOverallViewpoint(activePlan, activeScale),
    [activePlan, activeScale],
  )
  const canGenerate = Boolean(imagePreview) && !isGenerating

  async function handleCreatePreview() {
    if (!imagePreview) {
      return
    }

    setIsGenerating(true)
    setGenerationError(null)

    try {
      const generatedJson = await generatePlanFromImage(imagePreview.file)
      const parsedJson: unknown = JSON.parse(generatedJson)

      if (!isPlan(parsedJson)) {
        throw new Error('AIの返答形式を3Dプレビューに変換できませんでした。')
      }

      setJsonText(JSON.stringify(normalizePlan(parsedJson), null, 2))
      setIsDetailsOpen(false)
      setHasPreview(true)
      setViewMode('3d')
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : '3Dプレビューの作成に失敗しました。',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  function openDrawer() {
    drawerRef.current?.showModal()
  }

  function closeDrawer() {
    drawerRef.current?.close()
  }

  function resetPreview() {
    setHasPreview(false)
    setIsDetailsOpen(false)
    setViewMode('3d')
    setGenerationError(null)
    setImagePreview((currentPreview) => {
      if (currentPreview) {
        URL.revokeObjectURL(currentPreview.url)
      }

      return null
    })
  }

  return (
    <main className={hasPreview ? 'app-shell app-shell-preview' : 'app-shell app-shell-start'}>
      {!hasPreview ? (
        <section className="start-screen">
          <div className="start-copy">
          <p className="eyebrow">House 3D</p>
          <h1>間取りを3Dで確認</h1>
          <p className="lead">間取り画像を入れて、立体プレビューを作成します。</p>
          </div>

          <section className="image-panel start-panel">
          <div
            {...getRootProps({
              className: `dropzone${isDragActive ? ' dropzone-active' : ''}`,
            })}
          >
            <input {...getInputProps()} />
            {imagePreview ? (
              <img src={imagePreview.url} alt={imagePreview.name} />
            ) : (
              <div className="dropzone-empty">
                <strong>間取り画像を追加</strong>
                <span>ドラッグ&ドロップ、またはクリックして選択</span>
              </div>
            )}
          </div>
          {imagePreview ? (
            <div className="image-meta">
              <span>{imagePreview.name}</span>
              <button
                type="button"
                onClick={() => {
                  setImagePreview(null)
                  setGenerationError(null)
                }}
              >
              クリア
              </button>
            </div>
          ) : null}
          </section>

        <button
          type="button"
          className="primary-action"
          disabled={!canGenerate}
          onClick={handleCreatePreview}
        >
          {isGenerating ? (
            <span className="action-loading">
              <span className="spinner" />
              画像を解析中
            </span>
          ) : (
            '3Dプレビューを作成'
          )}
        </button>
        {isGenerating ? (
          <div className="generation-progress">
            <span />
          </div>
        ) : null}
        {generationError ? <p className="generation-error">{generationError}</p> : null}
        </section>
      ) : null}

      {hasPreview ? (
        <section className="viewer" aria-label="3D plan preview">
          <div className="viewer-toolbar">
            <div className="view-mode-toggle" role="group" aria-label="表示モード">
              <button
                type="button"
                className={viewMode === '2d' ? 'view-mode-active' : ''}
                onClick={() => setViewMode('2d')}
              >
                2D
              </button>
              <button
                type="button"
                className={viewMode === '3d' ? 'view-mode-active' : ''}
                onClick={() => setViewMode('3d')}
              >
                3D
              </button>
            </div>
            <button type="button" onClick={openDrawer}>
              編集
            </button>
          </div>
        {isGenerating ? (
          <div className="viewer-loading" role="status" aria-live="polite">
            <span className="spinner" />
            <strong>間取りを立体化しています</strong>
            <span>画像から部屋・庭・窓を読み取っています</span>
          </div>
        ) : null}
        {viewMode === '3d' ? (
          <Plan3DView plan={activePlan} viewpoint={selectedViewpoint} />
        ) : (
          <Plan2DView plan={activePlan} />
        )}
      </section>
      ) : null}

      <dialog ref={drawerRef} className="drawer" onClick={(event) => {
        if (event.target === drawerRef.current) {
          closeDrawer()
        }
      }}>
        <div className="drawer-panel">
          <div className="drawer-header">
            <div>
              <p className="eyebrow">Controls</p>
              <h2>編集</h2>
            </div>
            <button type="button" className="icon-button" onClick={closeDrawer} aria-label="閉じる">
              ×
            </button>
          </div>

          <section className="image-panel">
            <div
              {...getRootProps({
                className: `dropzone drawer-dropzone${isDragActive ? ' dropzone-active' : ''}`,
              })}
            >
              <input {...getInputProps()} />
              {imagePreview ? (
                <img src={imagePreview.url} alt={imagePreview.name} />
              ) : (
                <div className="dropzone-empty">
                  <strong>間取り画像を追加</strong>
                  <span>ドラッグ&ドロップ、またはクリックして選択</span>
                </div>
              )}
            </div>
            {imagePreview ? (
              <div className="image-meta">
                <span>{imagePreview.name}</span>
                <button type="button" onClick={resetPreview}>
                  最初から
                </button>
              </div>
            ) : null}
          </section>

          <button
            type="button"
            className="primary-action"
            disabled={!canGenerate}
            onClick={handleCreatePreview}
          >
            {isGenerating ? (
              <span className="action-loading">
                <span className="spinner" />
                画像を解析中
              </span>
            ) : (
              '再生成'
            )}
          </button>
          {isGenerating ? (
            <div className="generation-progress">
              <span />
            </div>
          ) : null}
          {generationError ? <p className="generation-error">{generationError}</p> : null}

          <section className="panel drawer-editor">
            <button
              type="button"
              className="panel-header panel-toggle"
              onClick={() => setIsDetailsOpen((isOpen) => !isOpen)}
              aria-expanded={isDetailsOpen}
            >
              <h2>詳細編集</h2>
              <span className={parsed.error ? 'status status-error' : 'status status-ok'}>
                {parsed.error ? '要確認' : '反映中'}
              </span>
            </button>
            {isDetailsOpen ? (
              <>
                <textarea
                  aria-label="Plan data"
                  spellCheck={false}
                  value={jsonText}
                  onChange={(event) => setJsonText(event.target.value)}
                />
                {parsed.error ? <p className="error-message">{parsed.error}</p> : null}
              </>
            ) : (
              <p className="details-summary">
                生成後の内部データを直接調整できます。
              </p>
            )}
          </section>
        </div>
      </dialog>
    </main>
  )
}

export default App
