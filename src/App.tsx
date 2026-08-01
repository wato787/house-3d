import { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useDropzone } from 'react-dropzone'
import * as THREE from 'three'
import { generatePlanFromImage } from './gemini'
import './App.css'

type Point = [number, number]

type Space = {
  id: string
  name: string
  polygon: Point[]
  color: string
}

type Wall = {
  id: string
  start: Point
  end: Point
}

type Fixture = {
  id: string
  kind: string
  position: Point
  size: [number, number]
  rotation: number
  color: string
}

type HousePlan = {
  scale: number
  spaces: Space[]
  walls: Wall[]
  fixtures: Fixture[]
}

const samplePlan: HousePlan = {
  scale: 1000,
  spaces: [
    {
      id: 'ldk',
      name: 'LDK',
      polygon: [
        [0, 0],
        [7300, 0],
        [7300, 3900],
        [5200, 3900],
        [5200, 6500],
        [0, 6500],
      ],
      color: '#f3dfae',
    },
    {
      id: 'pantry',
      name: 'Pantry',
      polygon: [
        [7300, 0],
        [9000, 0],
        [9000, 2300],
        [7300, 2300],
      ],
      color: '#ead7cf',
    },
    {
      id: 'bath-zone',
      name: 'Bath zone',
      polygon: [
        [9000, 0],
        [13200, 0],
        [13200, 2700],
        [9000, 2700],
      ],
      color: '#cfe4e6',
    },
    {
      id: 'entry',
      name: 'Entry',
      polygon: [
        [10800, 2700],
        [13200, 2700],
        [13200, 5000],
        [10800, 5000],
      ],
      color: '#d5d9dd',
    },
    {
      id: 'stairs',
      name: 'Stairs',
      polygon: [
        [8700, 3900],
        [10800, 3900],
        [10800, 6500],
        [8700, 6500],
      ],
      color: '#e5e1d7',
    },
  ],
  walls: [
    { id: 'w1', start: [0, 0], end: [9000, 0] },
    { id: 'w2', start: [9000, 0], end: [13200, 0] },
    { id: 'w3', start: [13200, 0], end: [13200, 5000] },
    { id: 'w4', start: [13200, 5000], end: [10800, 5000] },
    { id: 'w5', start: [10800, 5000], end: [10800, 6500] },
    { id: 'w6', start: [10800, 6500], end: [0, 6500] },
    { id: 'w7', start: [0, 6500], end: [0, 0] },
    { id: 'w8', start: [7300, 0], end: [7300, 3900] },
    { id: 'w9', start: [9000, 0], end: [9000, 2700] },
    { id: 'w10', start: [10800, 2700], end: [10800, 6500] },
    { id: 'w11', start: [5200, 3900], end: [8700, 3900] },
    { id: 'w12', start: [5200, 3900], end: [5200, 6500] },
    { id: 'w13', start: [9000, 2700], end: [13200, 2700] },
  ],
  fixtures: [
    {
      id: 'kitchen',
      kind: 'kitchen',
      position: [2800, 1450],
      size: [3200, 700],
      rotation: 0,
      color: '#7d858a',
    },
    {
      id: 'bath',
      kind: 'bath',
      position: [11900, 1050],
      size: [1600, 1600],
      rotation: 0,
      color: '#96b9c0',
    },
    {
      id: 'toilet',
      kind: 'toilet',
      position: [9700, 850],
      size: [900, 1300],
      rotation: 0,
      color: '#f4f7f5',
    },
    {
      id: 'sofa',
      kind: 'sofa',
      position: [5400, 5200],
      size: [1600, 900],
      rotation: 90,
      color: '#d6d1c9',
    },
    {
      id: 'table',
      kind: 'table',
      position: [6200, 5400],
      size: [1400, 900],
      rotation: 0,
      color: '#a8503c',
    },
  ],
}

const wallHeight = 2.4
const wallThickness = 0.12

function isPoint(value: unknown): value is Point {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((coordinate) => typeof coordinate === 'number')
  )
}

function isPlan(value: unknown): value is HousePlan {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as HousePlan
  return (
    typeof candidate.scale === 'number' &&
    candidate.scale > 0 &&
    Array.isArray(candidate.spaces) &&
    Array.isArray(candidate.walls) &&
    Array.isArray(candidate.fixtures) &&
    candidate.spaces.every(
      (space) =>
        typeof space.id === 'string' &&
        typeof space.name === 'string' &&
        typeof space.color === 'string' &&
        Array.isArray(space.polygon) &&
        space.polygon.length >= 3 &&
        space.polygon.every(isPoint),
    ) &&
    candidate.walls.every(
      (wall) => typeof wall.id === 'string' && isPoint(wall.start) && isPoint(wall.end),
    ) &&
    candidate.fixtures.every(
      (fixture) =>
        typeof fixture.id === 'string' &&
        typeof fixture.kind === 'string' &&
        typeof fixture.color === 'string' &&
        isPoint(fixture.position) &&
        Array.isArray(fixture.size) &&
        fixture.size.length === 2 &&
        fixture.size.every((value) => typeof value === 'number') &&
        typeof fixture.rotation === 'number',
    )
  )
}

function getPlanCenter(plan: HousePlan) {
  const points = [
    ...plan.spaces.flatMap((space) => space.polygon),
    ...plan.walls.flatMap((wall) => [wall.start, wall.end]),
    ...plan.fixtures.map((fixture) => fixture.position),
  ]

  if (points.length === 0) {
    return new THREE.Vector2(0, 0)
  }

  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return new THREE.Vector2(
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  )
}

function toScenePoint([x, y]: Point, scale: number, center: THREE.Vector2) {
  return new THREE.Vector3((x - center.x) / scale, 0, (y - center.y) / scale)
}

function SpaceMesh({
  space,
  scale,
  center,
}: {
  space: Space
  scale: number
  center: THREE.Vector2
}) {
  const shape = new THREE.Shape()
  space.polygon.forEach((point, index) => {
    const scenePoint = toScenePoint(point, scale, center)
    if (index === 0) {
      shape.moveTo(scenePoint.x, -scenePoint.z)
    } else {
      shape.lineTo(scenePoint.x, -scenePoint.z)
    }
  })
  shape.closePath()

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={space.color} roughness={0.86} />
    </mesh>
  )
}

function WallMesh({
  wall,
  scale,
  center,
}: {
  wall: Wall
  scale: number
  center: THREE.Vector2
}) {
  const start = toScenePoint(wall.start, scale, center)
  const end = toScenePoint(wall.end, scale, center)
  const midpoint = start.clone().add(end).multiplyScalar(0.5)
  const length = start.distanceTo(end)
  const angle = Math.atan2(end.z - start.z, end.x - start.x)

  return (
    <mesh position={[midpoint.x, wallHeight / 2, midpoint.z]} rotation={[0, -angle, 0]}>
      <boxGeometry args={[length, wallHeight, wallThickness]} />
      <meshStandardMaterial color="#35302a" roughness={0.72} />
    </mesh>
  )
}

function FixtureMesh({
  fixture,
  scale,
  center,
}: {
  fixture: Fixture
  scale: number
  center: THREE.Vector2
}) {
  const position = toScenePoint(fixture.position, scale, center)
  const width = fixture.size[0] / scale
  const depth = fixture.size[1] / scale
  const height = fixture.kind === 'bath' ? 0.58 : fixture.kind === 'kitchen' ? 0.88 : 0.42

  return (
    <mesh
      position={[position.x, height / 2 + 0.02, position.z]}
      rotation={[0, THREE.MathUtils.degToRad(fixture.rotation), 0]}
    >
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial color={fixture.color} roughness={0.64} />
    </mesh>
  )
}

function PlanScene({ plan }: { plan: HousePlan }) {
  const center = useMemo(() => getPlanCenter(plan), [plan])

  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[4, 8, 6]} intensity={1.8} />
      <group>
        {plan.spaces.map((space) => (
          <SpaceMesh key={space.id} space={space} scale={plan.scale} center={center} />
        ))}
        {plan.walls.map((wall) => (
          <WallMesh key={wall.id} wall={wall} scale={plan.scale} center={center} />
        ))}
        {plan.fixtures.map((fixture) => (
          <FixtureMesh key={fixture.id} fixture={fixture} scale={plan.scale} center={center} />
        ))}
      </group>
      <gridHelper args={[16, 16, '#b9c0c6', '#e1e5e8']} position={[0, 0, 0]} />
      <OrbitControls makeDefault target={[0, 0.7, 0]} />
    </>
  )
}

function App() {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(samplePlan, null, 2))
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<{
    file: File
    name: string
    url: string
  } | null>(null)

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
          error:
            'JSON shape is invalid. Required: scale, spaces, walls, fixtures with numeric coordinates.',
          plan: null,
        }
      }

      return { error: null, plan: parsedJson }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Invalid JSON', plan: null }
    }
  }, [jsonText])

  const activePlan = parsed.plan ?? samplePlan
  const canGenerate = Boolean(imagePreview) && !isGenerating

  async function handleCreatePreview() {
    if (!imagePreview) {
      return
    }

    setIsGenerating(true)
    setGenerationError(null)

    try {
      const generatedJson = await generatePlanFromImage(imagePreview.file)
      JSON.parse(generatedJson)
      setJsonText(generatedJson)
      setIsDetailsOpen(false)
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : '3Dプレビューの作成に失敗しました。',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">House 3D</p>
          <h1>間取りを3Dで確認</h1>
          <p className="lead">間取り画像を入れて、立体プレビューを作成します。</p>
        </div>

        <section className="image-panel">
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
          {isGenerating ? '作成中...' : '3Dプレビューを作成'}
        </button>
        {generationError ? <p className="generation-error">{generationError}</p> : null}

        <section className="panel">
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
              立体化に使う内部データを直接調整できます。通常は閉じたままで大丈夫です。
            </p>
          )}
        </section>
      </aside>

      <section className="viewer" aria-label="3D plan preview">
        <Canvas camera={{ position: [6, 7, 8], fov: 45 }}>
          <PlanScene plan={activePlan} />
        </Canvas>
      </section>
    </main>
  )
}

export default App
