import { useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei'
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

type OutdoorArea = {
  id: string
  kind: 'garden' | 'parking' | 'terrace' | 'path'
  polygon: Point[]
}

type Wall = {
  id: string
  start: Point
  end: Point
}

type Opening = {
  id: string
  kind: 'door' | 'window'
  position: Point
  width: number
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
  outdoorAreas?: OutdoorArea[]
  walls?: Wall[]
  openings?: Opening[]
  fixtures?: Fixture[]
}

type Viewpoint = {
  target: THREE.Vector3
  position: THREE.Vector3
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
  outdoorAreas: [
    {
      id: 'south-garden',
      kind: 'garden',
      polygon: [
        [-400, 6500],
        [5200, 6500],
        [5200, 9500],
        [-400, 9500],
      ],
    },
    {
      id: 'east-parking',
      kind: 'parking',
      polygon: [
        [13200, 600],
        [16600, 600],
        [16600, 5200],
        [13200, 5200],
      ],
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
  openings: [
    { id: 'door-living-pantry', kind: 'door', position: [7300, 3100], width: 900 },
    { id: 'window-living-south', kind: 'window', position: [3000, 6500], width: 1800 },
    { id: 'window-dining-west', kind: 'window', position: [0, 2100], width: 1800 },
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
const doorwayWidthMeters = 0.9
const fallbackBuildingWidthMeters = 13.2
const openingSnapDistanceMeters = 0.55

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
    (candidate.outdoorAreas === undefined || Array.isArray(candidate.outdoorAreas)) &&
    (candidate.walls === undefined || Array.isArray(candidate.walls)) &&
    (candidate.openings === undefined || Array.isArray(candidate.openings)) &&
    (candidate.fixtures === undefined || Array.isArray(candidate.fixtures)) &&
    candidate.spaces.every(
      (space) =>
        typeof space.id === 'string' &&
        typeof space.name === 'string' &&
        typeof space.color === 'string' &&
        Array.isArray(space.polygon) &&
        space.polygon.length >= 3 &&
        space.polygon.every(isPoint),
    ) &&
    (candidate.outdoorAreas ?? []).every(
      (area) =>
        typeof area.id === 'string' &&
        (area.kind === 'garden' ||
          area.kind === 'parking' ||
          area.kind === 'terrace' ||
          area.kind === 'path') &&
        Array.isArray(area.polygon) &&
        area.polygon.length >= 3 &&
        area.polygon.every(isPoint),
    ) &&
    (candidate.walls ?? []).every(
      (wall) => typeof wall.id === 'string' && isPoint(wall.start) && isPoint(wall.end),
    ) &&
    (candidate.openings ?? []).every(
      (opening) =>
        typeof opening.id === 'string' &&
        (opening.kind === 'door' || opening.kind === 'window') &&
        isPoint(opening.position) &&
        typeof opening.width === 'number',
    ) &&
    (candidate.fixtures ?? []).every(
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

function normalizePlan(plan: HousePlan): HousePlan {
  return {
    ...plan,
    outdoorAreas: plan.outdoorAreas ?? [],
    walls: plan.walls ?? [],
    openings: plan.openings ?? [],
    fixtures: plan.fixtures ?? [],
  }
}

function getStructuralPoints(plan: HousePlan) {
  return [
    ...plan.spaces.flatMap((space) => space.polygon),
    ...(plan.outdoorAreas ?? []).flatMap((area) => area.polygon),
  ]
}

function getPlanBounds(plan: HousePlan) {
  const points = getStructuralPoints(plan)
  if (points.length === 0) {
    return null
  }

  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

function getPlanCenter(plan: HousePlan) {
  const bounds = getPlanBounds(plan)
  if (!bounds) {
    return new THREE.Vector2(0, 0)
  }

  return new THREE.Vector2(
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
  )
}

function getRenderScale(plan: HousePlan) {
  const bounds = getPlanBounds(plan)
  if (!bounds) {
    return plan.scale
  }

  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  const largestSideMeters = Math.max(width, height) / plan.scale

  if (largestSideMeters >= 5 && largestSideMeters <= 25) {
    return plan.scale
  }

  return Math.max(width, height) / fallbackBuildingWidthMeters
}

function toScenePoint([x, y]: Point, scale: number, center: THREE.Vector2) {
  return new THREE.Vector3((x - center.x) / scale, 0, (y - center.y) / scale)
}

function getOverallViewpoint(plan: HousePlan, scale: number) {
  const bounds = getPlanBounds(plan)
  const overallTarget = new THREE.Vector3(0, 1.1, 0)
  const overallDistance = bounds
    ? Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / scale
    : 9

  return {
    target: overallTarget,
    position: new THREE.Vector3(
      overallDistance * 0.42,
      Math.max(overallDistance * 0.42, 4.2),
      overallDistance * 0.58,
    ),
  }
}

function edgeKey(start: Point, end: Point) {
  const a = `${Math.round(start[0])},${Math.round(start[1])}`
  const b = `${Math.round(end[0])},${Math.round(end[1])}`
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function getSpaceWalls(spaces: Space[]) {
  const edgeMap = new Map<
    string,
    {
      start: Point
      end: Point
      count: number
    }
  >()

  spaces.forEach((space) => {
    space.polygon.forEach((start, index) => {
      const end = space.polygon[(index + 1) % space.polygon.length]
      const key = edgeKey(start, end)
      const existing = edgeMap.get(key)

      if (existing) {
        existing.count += 1
      } else {
        edgeMap.set(key, { start, end, count: 1 })
      }
    })
  })

  return Array.from(edgeMap.values()).map((edge, index) => ({
    id: `space-wall-${index}`,
    start: edge.start,
    end: edge.end,
    hasOpening: edge.count > 1,
  }))
}

function getOpeningProjection(wall: Wall, opening: Opening, scale: number) {
  const start = new THREE.Vector2(wall.start[0], wall.start[1])
  const end = new THREE.Vector2(wall.end[0], wall.end[1])
  const point = new THREE.Vector2(opening.position[0], opening.position[1])
  const wallVector = end.clone().sub(start)
  const wallLength = wallVector.length()

  if (wallLength === 0) {
    return null
  }

  const direction = wallVector.clone().normalize()
  const projectedDistance = point.clone().sub(start).dot(direction)
  const clampedDistance = THREE.MathUtils.clamp(projectedDistance, 0, wallLength)
  const closestPoint = start.clone().add(direction.multiplyScalar(clampedDistance))
  const distanceFromWallMeters = closestPoint.distanceTo(point) / scale

  if (distanceFromWallMeters > openingSnapDistanceMeters) {
    return null
  }

  return {
    opening,
    center: clampedDistance / scale,
    width: Math.max(opening.width / scale, opening.kind === 'door' ? 0.75 : 0.9),
  }
}

function getWallSegments(wall: Wall & { hasOpening?: boolean }, openings: Opening[], scale: number) {
  const start = new THREE.Vector2(wall.start[0], wall.start[1])
  const end = new THREE.Vector2(wall.end[0], wall.end[1])
  const wallLength = start.distanceTo(end) / scale
  const explicitOpenings = openings
    .map((opening) => getOpeningProjection(wall, opening, scale))
    .filter((opening): opening is NonNullable<typeof opening> => Boolean(opening))

  const fallbackOpenings =
    explicitOpenings.length === 0 && wall.hasOpening
      ? [{ center: wallLength / 2, width: doorwayWidthMeters, opening: null }]
      : []

  const sortedOpenings = [...explicitOpenings, ...fallbackOpenings]
    .map((projection) => ({
      ...projection,
      start: Math.max(0, projection.center - projection.width / 2),
      end: Math.min(wallLength, projection.center + projection.width / 2),
    }))
    .sort((a, b) => a.start - b.start)

  const segments: Array<{ start: number; end: number }> = []
  let cursor = 0

  sortedOpenings.forEach((opening) => {
    if (opening.start > cursor) {
      segments.push({ start: cursor, end: opening.start })
    }
    cursor = Math.max(cursor, opening.end)
  })

  if (cursor < wallLength) {
    segments.push({ start: cursor, end: wallLength })
  }

  return segments.filter((segment) => segment.end - segment.start > 0.08)
}

function createPatternTexture(kind: 'wood' | 'tile' | 'concrete' | 'grass') {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')

  if (!context) {
    return null
  }

  if (kind === 'wood') {
    context.fillStyle = '#d8bd8c'
    context.fillRect(0, 0, canvas.width, canvas.height)
    for (let y = 0; y < canvas.height; y += 32) {
      context.fillStyle = y % 64 === 0 ? '#caa978' : '#e0c698'
      context.fillRect(0, y, canvas.width, 30)
      context.strokeStyle = 'rgba(104, 72, 38, 0.16)'
      context.lineWidth = 2
      context.beginPath()
      context.moveTo(0, y + 31)
      context.lineTo(canvas.width, y + 31)
      context.stroke()
    }
    for (let x = 0; x < canvas.width; x += 92) {
      context.strokeStyle = 'rgba(104, 72, 38, 0.11)'
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x + 36, canvas.height)
      context.stroke()
    }
  } else if (kind === 'tile') {
    context.fillStyle = '#dfe9ea'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = 'rgba(107, 136, 141, 0.32)'
    context.lineWidth = 3
    for (let x = 0; x <= canvas.width; x += 64) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, canvas.height)
      context.stroke()
    }
    for (let y = 0; y <= canvas.height; y += 64) {
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(canvas.width, y)
      context.stroke()
    }
  } else if (kind === 'grass') {
    context.fillStyle = '#74a85b'
    context.fillRect(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < 900; i += 1) {
      const alpha = Math.random() * 0.18
      context.fillStyle = Math.random() > 0.5 ? `rgba(35, 91, 38, ${alpha})` : `rgba(175, 214, 121, ${alpha})`
      context.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2)
    }
  } else {
    context.fillStyle = '#cfd4cf'
    context.fillRect(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < 600; i += 1) {
      const alpha = Math.random() * 0.08
      context.fillStyle = `rgba(70, 78, 70, ${alpha})`
      context.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1)
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(kind === 'wood' ? 2.8 : kind === 'grass' ? 3.8 : 2, kind === 'wood' ? 2.8 : kind === 'grass' ? 3.8 : 2)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function getFloorKind(space: Space) {
  if (/玄関|entry/i.test(space.name)) {
    return 'concrete'
  }
  if (/浴室|洗面|脱衣|ub|bath|toilet|トイレ/i.test(space.name)) {
    return 'tile'
  }
  return 'wood'
}

function getOutdoorTextureKind(kind: OutdoorArea['kind']) {
  if (kind === 'garden') {
    return 'grass'
  }
  if (kind === 'terrace') {
    return 'tile'
  }
  return 'concrete'
}

function OutdoorAreaMesh({
  area,
  scale,
  center,
}: {
  area: OutdoorArea
  scale: number
  center: THREE.Vector2
}) {
  const texture = useMemo(() => createPatternTexture(getOutdoorTextureKind(area.kind)), [area])
  const shape = new THREE.Shape()
  area.polygon.forEach((point, index) => {
    const scenePoint = toScenePoint(point, scale, center)
    if (index === 0) {
      shape.moveTo(scenePoint.x, -scenePoint.z)
    } else {
      shape.lineTo(scenePoint.x, -scenePoint.z)
    }
  })
  shape.closePath()

  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#ffffff" map={texture ?? undefined} roughness={0.86} />
    </mesh>
  )
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
  const texture = useMemo(() => createPatternTexture(getFloorKind(space)), [space])
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
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#ffffff" map={texture ?? undefined} roughness={0.78} />
    </mesh>
  )
}

function WallMesh({
  wall,
  scale,
  center,
  openings,
}: {
  wall: Wall & { hasOpening?: boolean }
  scale: number
  center: THREE.Vector2
  openings: Opening[]
}) {
  const start = toScenePoint(wall.start, scale, center)
  const end = toScenePoint(wall.end, scale, center)
  const angle = Math.atan2(end.z - start.z, end.x - start.x)
  const direction = end.clone().sub(start).normalize()
  const segments = getWallSegments(wall, openings, scale)

  return (
    <>
      {segments.map((segment, index) => {
        const segmentLength = segment.end - segment.start
        const midpoint = start
          .clone()
          .add(direction.clone().multiplyScalar(segment.start + segmentLength / 2))

        return (
          <mesh
            castShadow
            receiveShadow
            key={`${wall.id}-${index}`}
            position={[midpoint.x, wallHeight / 2, midpoint.z]}
            rotation={[0, -angle, 0]}
          >
            <boxGeometry args={[segmentLength, wallHeight, wallThickness]} />
            <meshStandardMaterial color="#f7f4ec" roughness={0.82} />
          </mesh>
        )
      })}
    </>
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
  const rotation = THREE.MathUtils.degToRad(fixture.rotation)

  if (fixture.kind === 'kitchen') {
    return (
      <group position={[position.x, 0.02, position.z]} rotation={[0, rotation, 0]}>
        <mesh castShadow receiveShadow position={[0, 0.43, 0]}>
          <boxGeometry args={[width, 0.86, depth]} />
          <meshStandardMaterial color="#d8d2c6" roughness={0.62} />
        </mesh>
        <mesh castShadow receiveShadow position={[width * 0.18, 0.9, 0]}>
          <boxGeometry args={[width * 0.18, 0.04, depth * 0.55]} />
          <meshStandardMaterial color="#8fb0b6" roughness={0.3} metalness={0.2} />
        </mesh>
        <mesh castShadow receiveShadow position={[-width * 0.2, 0.91, 0]}>
          <boxGeometry args={[width * 0.22, 0.03, depth * 0.55]} />
          <meshStandardMaterial color="#303330" roughness={0.5} />
        </mesh>
      </group>
    )
  }

  if (fixture.kind === 'bath' || fixture.kind === 'bathtub') {
    return (
      <group position={[position.x, 0.02, position.z]} rotation={[0, rotation, 0]}>
        <mesh castShadow receiveShadow position={[0, 0.22, 0]}>
          <boxGeometry args={[width, 0.44, depth]} />
          <meshStandardMaterial color="#dcecef" roughness={0.45} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.48, 0]}>
          <boxGeometry args={[width * 0.72, 0.12, depth * 0.62]} />
          <meshStandardMaterial color="#ffffff" roughness={0.38} />
        </mesh>
      </group>
    )
  }

  if (fixture.kind === 'toilet') {
    return (
      <group position={[position.x, 0.02, position.z]} rotation={[0, rotation, 0]}>
        <mesh castShadow receiveShadow position={[0, 0.2, depth * 0.12]}>
          <boxGeometry args={[width * 0.62, 0.4, depth * 0.64]} />
          <meshStandardMaterial color="#ffffff" roughness={0.34} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.36, -depth * 0.26]}>
          <boxGeometry args={[width * 0.7, 0.72, depth * 0.18]} />
          <meshStandardMaterial color="#f4f4f1" roughness={0.4} />
        </mesh>
      </group>
    )
  }

  return (
    <mesh
      castShadow
      receiveShadow
      position={[position.x, height / 2 + 0.02, position.z]}
      rotation={[0, rotation, 0]}
    >
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial color={fixture.color} roughness={0.64} />
    </mesh>
  )
}

function OpeningMesh({
  opening,
  walls,
  scale,
  center,
}: {
  opening: Opening
  walls: Array<Wall & { hasOpening?: boolean }>
  scale: number
  center: THREE.Vector2
}) {
  const matchedWall = walls
    .map((wall) => ({
      wall,
      projection: getOpeningProjection(wall, opening, scale),
    }))
    .filter((match): match is { wall: Wall & { hasOpening?: boolean }; projection: NonNullable<ReturnType<typeof getOpeningProjection>> } =>
      Boolean(match.projection),
    )
    .sort((a, b) => a.projection.center - b.projection.center)[0]

  if (!matchedWall) {
    return null
  }

  const start = toScenePoint(matchedWall.wall.start, scale, center)
  const end = toScenePoint(matchedWall.wall.end, scale, center)
  const wallDirection = end.clone().sub(start).normalize()
  const wallAngle = Math.atan2(end.z - start.z, end.x - start.x)
  const position = start.clone().add(wallDirection.multiplyScalar(matchedWall.projection.center))
  const width = matchedWall.projection.width

  if (opening.kind === 'window') {
    return (
      <mesh castShadow position={[position.x, 1.28, position.z]} rotation={[0, -wallAngle, 0]}>
        <boxGeometry args={[width, 0.82, 0.035]} />
        <meshStandardMaterial color="#9fc8d4" transparent opacity={0.55} roughness={0.2} />
      </mesh>
    )
  }

  return null
}

function CameraViewpoint({ viewpoint }: { viewpoint: Viewpoint }) {
  const { camera } = useThree()

  useEffect(() => {
    camera.position.copy(viewpoint.position)
    camera.lookAt(viewpoint.target)
  }, [camera, viewpoint])

  return null
}

function PlanScene({ plan, viewpoint }: { plan: HousePlan; viewpoint: Viewpoint }) {
  const center = useMemo(() => getPlanCenter(plan), [plan])
  const renderScale = useMemo(() => getRenderScale(plan), [plan])
  const generatedWalls = useMemo(() => getSpaceWalls(plan.spaces), [plan.spaces])
  const openings = plan.openings ?? []

  return (
    <>
      <color attach="background" args={['#eef2ec']} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#ffffff', '#c7bca8', 0.85]} />
      <directionalLight
        castShadow
        position={[4, 8, 6]}
        intensity={2.1}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={28}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <Environment preset="apartment" environmentIntensity={0.45} />
      <group>
        {(plan.outdoorAreas ?? []).map((area) => (
          <OutdoorAreaMesh key={area.id} area={area} scale={renderScale} center={center} />
        ))}
        {plan.spaces.map((space) => (
          <SpaceMesh key={space.id} space={space} scale={renderScale} center={center} />
        ))}
        {generatedWalls.map((wall) => (
          <WallMesh
            key={wall.id}
            wall={wall}
            scale={renderScale}
            center={center}
            openings={openings}
          />
        ))}
        {openings.map((opening) => (
          <OpeningMesh
            key={opening.id}
            opening={opening}
            walls={generatedWalls}
            scale={renderScale}
            center={center}
          />
        ))}
        {(plan.fixtures ?? []).map((fixture) => (
          <FixtureMesh key={fixture.id} fixture={fixture} scale={renderScale} center={center} />
        ))}
      </group>
      <ContactShadows
        position={[0, -0.055, 0]}
        opacity={0.32}
        scale={18}
        blur={2.6}
        far={4.2}
        resolution={512}
      />
      <CameraViewpoint viewpoint={viewpoint} />
      <OrbitControls makeDefault target={viewpoint.target} maxPolarAngle={Math.PI * 0.48} />
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
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          camera={{ position: [5.5, 3.2, 7], fov: 52 }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.08
          }}
        >
          <PlanScene plan={activePlan} viewpoint={selectedViewpoint} />
        </Canvas>
      </section>
    </main>
  )
}

export default App
