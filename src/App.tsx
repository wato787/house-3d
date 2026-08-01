import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
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

const plan: HousePlan = {
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

const center = new THREE.Vector2(6600, 3250)
const wallHeight = 2.4
const wallThickness = 0.12

function toScenePoint([x, y]: Point) {
  return new THREE.Vector3((x - center.x) / plan.scale, 0, (y - center.y) / plan.scale)
}

function SpaceMesh({ space }: { space: Space }) {
  const shape = new THREE.Shape()
  space.polygon.forEach((point, index) => {
    const scenePoint = toScenePoint(point)
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

function WallMesh({ wall }: { wall: Wall }) {
  const start = toScenePoint(wall.start)
  const end = toScenePoint(wall.end)
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

function FixtureMesh({ fixture }: { fixture: Fixture }) {
  const position = toScenePoint(fixture.position)
  const width = fixture.size[0] / plan.scale
  const depth = fixture.size[1] / plan.scale
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

function PlanScene() {
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[4, 8, 6]} intensity={1.8} />
      <group>
        {plan.spaces.map((space) => (
          <SpaceMesh key={space.id} space={space} />
        ))}
        {plan.walls.map((wall) => (
          <WallMesh key={wall.id} wall={wall} />
        ))}
        {plan.fixtures.map((fixture) => (
          <FixtureMesh key={fixture.id} fixture={fixture} />
        ))}
      </group>
      <gridHelper args={[16, 16, '#b9c0c6', '#e1e5e8']} position={[0, 0, 0]} />
      <OrbitControls makeDefault target={[0, 0.7, 0]} />
    </>
  )
}

function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">House 3D</p>
          <h1>Plan Preview</h1>
          <p className="lead">間取りJSONから、床・壁・設備の3D下書きを表示します。</p>
        </div>

        <section className="panel">
          <h2>Sample JSON</h2>
          <pre>{JSON.stringify(plan, null, 2)}</pre>
        </section>
      </aside>

      <section className="viewer" aria-label="3D plan preview">
        <Canvas camera={{ position: [6, 7, 8], fov: 45 }}>
          <PlanScene />
        </Canvas>
      </section>
    </main>
  )
}

export default App
