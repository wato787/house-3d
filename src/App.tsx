import { useMemo, useReducer, useRef, useState } from 'react'
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
type UiState = {
  isDetailsOpen: boolean
  isGenerating: boolean
  hasPreview: boolean
  viewMode: ViewMode
  generationError: string | null
}
type UiAction =
  | { type: 'generationStarted' }
  | { type: 'generationSucceeded' }
  | { type: 'generationFailed'; error: string }
  | { type: 'resetPreview' }
  | { type: 'clearError' }
  | { type: 'setDetailsOpen'; isOpen: boolean }
  | { type: 'setViewMode'; viewMode: ViewMode }
type ImagePreview = {
  file: File
  name: string
  url: string
}

type DropzoneControls = Pick<
  ReturnType<typeof useDropzone>,
  'getRootProps' | 'getInputProps' | 'isDragActive'
>

type ParsedPlan = ReturnType<typeof normalizePlan>

const initialUiState: UiState = {
  isDetailsOpen: false,
  isGenerating: false,
  hasPreview: false,
  viewMode: '3d',
  generationError: null,
}

function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'generationStarted':
      return { ...state, isGenerating: true, generationError: null }
    case 'generationSucceeded':
      return {
        ...state,
        isDetailsOpen: false,
        isGenerating: false,
        hasPreview: true,
        viewMode: '3d',
      }
    case 'generationFailed':
      return { ...state, isGenerating: false, generationError: action.error }
    case 'resetPreview':
      return {
        ...state,
        isDetailsOpen: false,
        hasPreview: false,
        viewMode: '3d',
        generationError: null,
      }
    case 'clearError':
      return { ...state, generationError: null }
    case 'setDetailsOpen':
      return { ...state, isDetailsOpen: action.isOpen }
    case 'setViewMode':
      return { ...state, viewMode: action.viewMode }
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('画像プレビューの作成に失敗しました。'))
      }
    })
    reader.addEventListener('error', () => {
      reject(new Error('画像プレビューの作成に失敗しました。'))
    })
    reader.readAsDataURL(file)
  })
}

function ImageDropzone({
  controls,
  imagePreview,
  className = '',
}: {
  controls: DropzoneControls
  imagePreview: ImagePreview | null
  className?: string
}) {
  const { getRootProps, getInputProps, isDragActive } = controls

  return (
    <div
      {...getRootProps({
        className: `dropzone${className}${isDragActive ? ' dropzone-active' : ''}`,
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
  )
}

function StartScreen({
  canGenerate,
  controls,
  generationError,
  imagePreview,
  isGenerating,
  onClearImage,
  onCreatePreview,
}: {
  canGenerate: boolean
  controls: DropzoneControls
  generationError: string | null
  imagePreview: ImagePreview | null
  isGenerating: boolean
  onClearImage: () => void
  onCreatePreview: () => void
}) {
  return (
    <section className="start-screen">
      <div className="start-copy">
        <p className="eyebrow">House 3D</p>
        <h1>間取りを3Dで確認</h1>
        <p className="lead">間取り画像を入れて、立体プレビューを作成します。</p>
      </div>

      <section className="image-panel start-panel">
        <ImageDropzone controls={controls} imagePreview={imagePreview} />
        {imagePreview ? (
          <div className="image-meta">
            <span>{imagePreview.name}</span>
            <button type="button" onClick={onClearImage}>
              クリア
            </button>
          </div>
        ) : null}
      </section>

      <button
        type="button"
        className="primary-action"
        disabled={!canGenerate}
        onClick={onCreatePreview}
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
  )
}

function ViewerScreen({
  activePlan,
  isGenerating,
  onOpenDrawer,
  onSetViewMode,
  selectedViewpoint,
  viewMode,
}: {
  activePlan: ParsedPlan
  isGenerating: boolean
  onOpenDrawer: () => void
  onSetViewMode: (viewMode: ViewMode) => void
  selectedViewpoint: ReturnType<typeof getOverallViewpoint>
  viewMode: ViewMode
}) {
  return (
    <section className="viewer" aria-label="3D plan preview">
      <div className="viewer-toolbar">
        <div className="view-mode-toggle" role="group" aria-label="表示モード">
          <button
            type="button"
            className={viewMode === '2d' ? 'view-mode-active' : ''}
            onClick={() => onSetViewMode('2d')}
          >
            2D
          </button>
          <button
            type="button"
            className={viewMode === '3d' ? 'view-mode-active' : ''}
            onClick={() => onSetViewMode('3d')}
          >
            3D
          </button>
        </div>
        <button type="button" onClick={onOpenDrawer}>
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
  )
}

function EditorDrawer({
  canGenerate,
  controls,
  drawerRef,
  generationError,
  imagePreview,
  isDetailsOpen,
  isGenerating,
  jsonText,
  parsedError,
  onClose,
  onCreatePreview,
  onResetPreview,
  onSetDetailsOpen,
  onSetJsonText,
}: {
  canGenerate: boolean
  controls: DropzoneControls
  drawerRef: React.RefObject<HTMLDialogElement | null>
  generationError: string | null
  imagePreview: ImagePreview | null
  isDetailsOpen: boolean
  isGenerating: boolean
  jsonText: string
  parsedError: string | null
  onClose: () => void
  onCreatePreview: () => void
  onResetPreview: () => void
  onSetDetailsOpen: (isOpen: boolean) => void
  onSetJsonText: (jsonText: string) => void
}) {
  return (
    <dialog ref={drawerRef} className="drawer" aria-labelledby="editor-drawer-title">
      <div className="drawer-panel">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Controls</p>
            <h2 id="editor-drawer-title">編集</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        <section className="image-panel">
          <ImageDropzone
            controls={controls}
            imagePreview={imagePreview}
            className=" drawer-dropzone"
          />
          {imagePreview ? (
            <div className="image-meta">
              <span>{imagePreview.name}</span>
              <button type="button" onClick={onResetPreview}>
                最初から
              </button>
            </div>
          ) : null}
        </section>

        <button
          type="button"
          className="primary-action"
          disabled={!canGenerate}
          onClick={onCreatePreview}
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
            onClick={() => onSetDetailsOpen(!isDetailsOpen)}
            aria-expanded={isDetailsOpen}
          >
            <h2>詳細編集</h2>
            <span className={parsedError ? 'status status-error' : 'status status-ok'}>
              {parsedError ? '要確認' : '反映中'}
            </span>
          </button>
          {isDetailsOpen ? (
            <>
              <textarea
                aria-label="Plan data"
                spellCheck={false}
                value={jsonText}
                onChange={(event) => onSetJsonText(event.target.value)}
              />
              {parsedError ? <p className="error-message">{parsedError}</p> : null}
            </>
          ) : (
            <p className="details-summary">生成後の内部データを直接調整できます。</p>
          )}
        </section>
      </div>
    </dialog>
  )
}

function App() {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(samplePlan, null, 2))
  const [uiState, dispatchUi] = useReducer(uiReducer, initialUiState)
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null)
  const drawerRef = useRef<HTMLDialogElement | null>(null)

  const dropzoneControls = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
    },
    maxFiles: 1,
    onDrop: async ([file]) => {
      if (!file) {
        return
      }

      try {
        setImagePreview({
          file,
          name: file.name,
          url: await readFileAsDataUrl(file),
        })
      } catch (error) {
        dispatchUi({
          type: 'generationFailed',
          error: error instanceof Error ? error.message : '画像プレビューの作成に失敗しました。',
        })
      }
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
  const canGenerate = Boolean(imagePreview) && !uiState.isGenerating

  async function handleCreatePreview() {
    if (!imagePreview) {
      return
    }

    dispatchUi({ type: 'generationStarted' })

    try {
      const generatedJson = await generatePlanFromImage(imagePreview.file)
      const parsedJson: unknown = JSON.parse(generatedJson)

      if (!isPlan(parsedJson)) {
        throw new Error('AIの返答形式を3Dプレビューに変換できませんでした。')
      }

      setJsonText(JSON.stringify(normalizePlan(parsedJson), null, 2))
      dispatchUi({ type: 'generationSucceeded' })
    } catch (error) {
      dispatchUi({
        type: 'generationFailed',
        error: error instanceof Error ? error.message : '3Dプレビューの作成に失敗しました。',
      })
    }
  }

  function openDrawer() {
    drawerRef.current?.showModal()
  }

  function closeDrawer() {
    drawerRef.current?.close()
  }

  function resetPreview() {
    dispatchUi({ type: 'resetPreview' })
    setImagePreview(null)
  }

  function clearImagePreview() {
    dispatchUi({ type: 'clearError' })
    setImagePreview(null)
  }

  return (
    <main className={uiState.hasPreview ? 'app-shell app-shell-preview' : 'app-shell app-shell-start'}>
      {!uiState.hasPreview ? (
        <StartScreen
          canGenerate={canGenerate}
          controls={dropzoneControls}
          generationError={uiState.generationError}
          imagePreview={imagePreview}
          isGenerating={uiState.isGenerating}
          onClearImage={clearImagePreview}
          onCreatePreview={handleCreatePreview}
        />
      ) : null}

      {uiState.hasPreview ? (
        <ViewerScreen
          activePlan={activePlan}
          isGenerating={uiState.isGenerating}
          onOpenDrawer={openDrawer}
          onSetViewMode={(viewMode) => dispatchUi({ type: 'setViewMode', viewMode })}
          selectedViewpoint={selectedViewpoint}
          viewMode={uiState.viewMode}
        />
      ) : null}

      <EditorDrawer
        canGenerate={canGenerate}
        controls={dropzoneControls}
        drawerRef={drawerRef}
        generationError={uiState.generationError}
        imagePreview={imagePreview}
        isDetailsOpen={uiState.isDetailsOpen}
        isGenerating={uiState.isGenerating}
        jsonText={jsonText}
        parsedError={parsed.error}
        onClose={closeDrawer}
        onCreatePreview={handleCreatePreview}
        onResetPreview={resetPreview}
        onSetDetailsOpen={(isOpen) => dispatchUi({ type: 'setDetailsOpen', isOpen })}
        onSetJsonText={setJsonText}
      />
    </main>
  )
}

export default App
