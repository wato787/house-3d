import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import type { Fixture, HousePlan, Opening, OutdoorArea, Point, Space, Wall } from '../plan/types'
import {
  getOpeningProjection,
  getOpeningsByWall,
  getPlanBounds,
  getPlanCenter,
  getRenderScale,
  getSpaceWalls,
  getWallSegments,
  toScenePoint,
} from '../plan/geometry'

export type Viewpoint = {
  target: THREE.Vector3
  position: THREE.Vector3
}

const wallHeight = 1.2
const wallThickness = 0.12
const subtleTextureSize = 256
const outdoorFloorRotation: [number, number, number] = [-Math.PI / 2, 0, 0]
const outdoorFloorPosition: [number, number, number] = [0, -0.02, 0]
const indoorFloorRotation: [number, number, number] = [-Math.PI / 2, 0, 0]
const indoorFloorPosition: [number, number, number] = [0, 0.004, 0]

function createPatternTexture(kind: 'wood' | 'tile' | 'concrete' | 'grass' | 'plaster') {
  const canvas = document.createElement('canvas')
  canvas.width = subtleTextureSize
  canvas.height = subtleTextureSize
  const context = canvas.getContext('2d')

  if (!context) {
    return null
  }

  if (kind === 'wood') {
    context.fillStyle = '#d7bd88'
    context.fillRect(0, 0, canvas.width, canvas.height)
    for (let y = 0; y < canvas.height; y += 28) {
      context.fillStyle = y % 56 === 0 ? '#cba978' : '#e0c596'
      context.fillRect(0, y, canvas.width, 26)
      context.strokeStyle = 'rgba(92, 62, 30, 0.14)'
      context.lineWidth = 1.5
      context.beginPath()
      context.moveTo(0, y + 27)
      context.lineTo(canvas.width, y + 27)
      context.stroke()
    }
    for (let i = 0; i < 1800; i += 1) {
      const alpha = Math.random() * 0.055
      context.fillStyle = Math.random() > 0.5 ? `rgba(76, 45, 20, ${alpha})` : `rgba(255, 238, 194, ${alpha})`
      context.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1)
    }
    for (let x = 0; x < canvas.width; x += 86) {
      context.strokeStyle = 'rgba(92, 62, 30, 0.09)'
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
  } else if (kind === 'plaster') {
    context.fillStyle = '#f2eee5'
    context.fillRect(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < 1400; i += 1) {
      const alpha = Math.random() * 0.055
      context.fillStyle = Math.random() > 0.45 ? `rgba(130, 122, 106, ${alpha})` : `rgba(255, 255, 252, ${alpha})`
      context.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1)
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
  texture.repeat.set(
    kind === 'wood' ? 4.2 : kind === 'grass' ? 4.6 : kind === 'plaster' ? 1.8 : 2.4,
    kind === 'wood' ? 4.2 : kind === 'grass' ? 4.6 : kind === 'plaster' ? 1.8 : 2.4,
  )
  texture.anisotropy = 6
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

function useShapeFromPolygon(polygon: Point[], scale: number, center: THREE.Vector2) {
  return useMemo(() => {
    const shape = new THREE.Shape()

    polygon.forEach((point, index) => {
      const scenePoint = toScenePoint(point, scale, center)
      if (index === 0) {
        shape.moveTo(scenePoint.x, -scenePoint.z)
      } else {
        shape.lineTo(scenePoint.x, -scenePoint.z)
      }
    })
    shape.closePath()

    return shape
  }, [center, polygon, scale])
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
  const shape = useShapeFromPolygon(area.polygon, scale, center)
  const shapeArgs = useMemo(() => [shape] as [THREE.Shape], [shape])

  return (
    <mesh receiveShadow renderOrder={-20} rotation={outdoorFloorRotation} position={outdoorFloorPosition}>
      <shapeGeometry args={shapeArgs} />
      <meshStandardMaterial
        color="#ffffff"
        depthWrite={false}
        map={texture ?? undefined}
        roughness={0.86}
      />
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
  const shape = useShapeFromPolygon(space.polygon, scale, center)
  const shapeArgs = useMemo(() => [shape] as [THREE.Shape], [shape])

  return (
    <mesh receiveShadow renderOrder={-10} rotation={indoorFloorRotation} position={indoorFloorPosition}>
      <shapeGeometry args={shapeArgs} />
      <meshStandardMaterial
        color="#ffffff"
        depthWrite={false}
        map={texture ?? undefined}
        roughness={0.78}
      />
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
  const wallTexture = useMemo(() => createPatternTexture('plaster'), [])

  return (
    <>
      {segments.map((segment, index) => {
        const segmentLength = segment.end - segment.start
        const overlap = wallThickness * 0.65
        const renderedLength = segmentLength + overlap
        const midpoint = start
          .clone()
          .add(direction.clone().multiplyScalar(segment.start + segmentLength / 2))

        return (
          <RoundedBox
            castShadow
            receiveShadow
            key={`${wall.id}-${index}`}
            args={[renderedLength, wallHeight, wallThickness]}
            radius={0.025}
            smoothness={3}
            position={[midpoint.x, wallHeight / 2, midpoint.z]}
            rotation={[0, -angle, 0]}
          >
            <meshStandardMaterial color="#f5f0e7" map={wallTexture ?? undefined} roughness={0.9} />
          </RoundedBox>
        )
      })}
    </>
  )
}

function WindowMesh({
  opening,
  wall,
  scale,
  center,
}: {
  opening: Opening
  wall: Wall & { hasOpening?: boolean }
  scale: number
  center: THREE.Vector2
}) {
  const projection = getOpeningProjection(wall, opening, scale)

  if (!projection) {
    return null
  }

  const start = toScenePoint(wall.start, scale, center)
  const end = toScenePoint(wall.end, scale, center)
  const wallDirection = end.clone().sub(start).normalize()
  const wallAngle = Math.atan2(end.z - start.z, end.x - start.x)
  const position = start.clone().add(wallDirection.multiplyScalar(projection.center))
  const width = Math.max(projection.width - wallThickness * 0.2, 0.4)
  const glassHeight = wallHeight * 0.92
  const frameThickness = 0.035

  return (
    <group position={[position.x, glassHeight / 2, position.z]} rotation={[0, -wallAngle, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, glassHeight, wallThickness * 0.42]} />
        <meshPhysicalMaterial
          color="#b9d7df"
          transparent
          opacity={0.38}
          roughness={0.05}
          metalness={0}
          transmission={0.35}
          thickness={0.04}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[-width / 2, 0, 0]}>
        <boxGeometry args={[frameThickness, glassHeight, wallThickness * 0.5]} />
        <meshStandardMaterial color="#f5f2eb" roughness={0.78} />
      </mesh>
      <mesh castShadow receiveShadow position={[width / 2, 0, 0]}>
        <boxGeometry args={[frameThickness, glassHeight, wallThickness * 0.5]} />
        <meshStandardMaterial color="#f5f2eb" roughness={0.78} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, glassHeight / 2, 0]}>
        <boxGeometry args={[width, frameThickness, wallThickness * 0.5]} />
        <meshStandardMaterial color="#f5f2eb" roughness={0.78} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, -glassHeight / 2, 0]}>
        <boxGeometry args={[width, frameThickness, wallThickness * 0.5]} />
        <meshStandardMaterial color="#f5f2eb" roughness={0.78} />
      </mesh>
    </group>
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
      <group position={[position.x, 0.045, position.z]} rotation={[0, rotation, 0]}>
        <RoundedBox castShadow receiveShadow args={[width, 0.86, depth]} radius={0.035} smoothness={4} position={[0, 0.43, 0]}>
          <meshStandardMaterial color="#d7d1c5" roughness={0.7} />
        </RoundedBox>
        <RoundedBox castShadow receiveShadow args={[width * 0.94, 0.055, depth * 0.94]} radius={0.025} smoothness={3} position={[0, 0.89, 0]}>
          <meshStandardMaterial color="#f0eadf" roughness={0.46} />
        </RoundedBox>
        <RoundedBox castShadow receiveShadow args={[width * 0.18, 0.035, depth * 0.52]} radius={0.02} smoothness={3} position={[width * 0.18, 0.935, 0]}>
          <meshStandardMaterial color="#86a9af" roughness={0.25} metalness={0.15} />
        </RoundedBox>
        <RoundedBox castShadow receiveShadow args={[width * 0.22, 0.028, depth * 0.52]} radius={0.018} smoothness={3} position={[-width * 0.22, 0.94, 0]}>
          <meshStandardMaterial color="#262926" roughness={0.42} />
        </RoundedBox>
      </group>
    )
  }

  if (fixture.kind === 'bath' || fixture.kind === 'bathtub') {
    return (
      <group position={[position.x, 0.045, position.z]} rotation={[0, rotation, 0]}>
        <RoundedBox castShadow receiveShadow args={[width, 0.44, depth]} radius={0.08} smoothness={6} position={[0, 0.22, 0]}>
          <meshStandardMaterial color="#dcecef" roughness={0.42} />
        </RoundedBox>
        <RoundedBox castShadow receiveShadow args={[width * 0.72, 0.12, depth * 0.62]} radius={0.06} smoothness={6} position={[0, 0.48, 0]}>
          <meshStandardMaterial color="#fbfbf7" roughness={0.32} />
        </RoundedBox>
      </group>
    )
  }

  if (fixture.kind === 'toilet') {
    return (
      <group position={[position.x, 0.045, position.z]} rotation={[0, rotation, 0]}>
        <RoundedBox castShadow receiveShadow args={[width * 0.62, 0.4, depth * 0.64]} radius={0.08} smoothness={6} position={[0, 0.2, depth * 0.12]}>
          <meshStandardMaterial color="#fbfbf7" roughness={0.34} />
        </RoundedBox>
        <RoundedBox castShadow receiveShadow args={[width * 0.7, 0.72, depth * 0.18]} radius={0.045} smoothness={5} position={[0, 0.36, -depth * 0.26]}>
          <meshStandardMaterial color="#f1f0ea" roughness={0.42} />
        </RoundedBox>
      </group>
    )
  }

  if (fixture.kind === 'stairs') {
    const stepCount = 12
    const stepDepth = depth / stepCount
    const stepRise = 0.06

    return (
      <group position={[position.x, 0.045, position.z]} rotation={[0, rotation, 0]}>
        {Array.from({ length: stepCount }).map((_, index) => {
          const stepHeight = stepRise * (index + 1)
          const z = -depth / 2 + stepDepth * index + stepDepth / 2

          return (
            <RoundedBox
              castShadow
              receiveShadow
              key={`${fixture.id}-step-${index}`}
              args={[width, stepHeight, stepDepth * 0.96]}
              radius={0.018}
              smoothness={2}
              position={[0, stepHeight / 2, z]}
            >
              <meshStandardMaterial color="#d2b987" roughness={0.7} />
            </RoundedBox>
          )
        })}
      </group>
    )
  }

  if (/sofa/i.test(fixture.kind)) {
    const sofaWidth = Math.max(width, depth)
    const sofaDepth = Math.min(width, depth)

    return (
      <group position={[position.x, 0.045, position.z]} rotation={[0, rotation, 0]}>
        <RoundedBox castShadow receiveShadow args={[sofaWidth, 0.28, sofaDepth]} radius={0.09} smoothness={6} position={[0, 0.14, 0]}>
          <meshStandardMaterial color={fixture.color || '#cfc9bf'} roughness={0.86} />
        </RoundedBox>
        <RoundedBox castShadow receiveShadow args={[sofaWidth, 0.44, sofaDepth * 0.16]} radius={0.07} smoothness={6} position={[0, 0.34, -sofaDepth * 0.42]}>
          <meshStandardMaterial color="#bdb5aa" roughness={0.9} />
        </RoundedBox>
        <RoundedBox castShadow receiveShadow args={[sofaWidth * 0.11, 0.34, sofaDepth * 0.82]} radius={0.06} smoothness={5} position={[-sofaWidth * 0.46, 0.23, 0]}>
          <meshStandardMaterial color="#beb6ab" roughness={0.88} />
        </RoundedBox>
        <RoundedBox castShadow receiveShadow args={[sofaWidth * 0.11, 0.34, sofaDepth * 0.82]} radius={0.06} smoothness={5} position={[sofaWidth * 0.46, 0.23, 0]}>
          <meshStandardMaterial color="#beb6ab" roughness={0.88} />
        </RoundedBox>
      </group>
    )
  }

  if (/tv|television/i.test(fixture.kind)) {
    return (
      <group position={[position.x, 0.045, position.z]} rotation={[0, rotation, 0]}>
        <RoundedBox castShadow receiveShadow args={[width, 0.18, depth]} radius={0.025} smoothness={3} position={[0, 0.09, 0]}>
          <meshStandardMaterial color="#8d725d" roughness={0.62} />
        </RoundedBox>
        <RoundedBox castShadow args={[width * 0.82, 0.45, 0.035]} radius={0.018} smoothness={3} position={[0, 0.45, -depth * 0.25]}>
          <meshStandardMaterial color="#1f2223" roughness={0.38} />
        </RoundedBox>
      </group>
    )
  }

  if (/dining|table/i.test(fixture.kind)) {
    const tabletopHeight = 0.38
    const tabletopThickness = 0.065
    const legHeight = tabletopHeight - tabletopThickness / 2

    return (
      <group position={[position.x, 0.045, position.z]} rotation={[0, rotation, 0]}>
        <RoundedBox castShadow receiveShadow args={[width, tabletopThickness, depth]} radius={0.045} smoothness={5} position={[0, tabletopHeight, 0]}>
          <meshStandardMaterial color={fixture.color || '#9f6b48'} roughness={0.68} />
        </RoundedBox>
        {[
          [-width * 0.38, -depth * 0.35],
          [width * 0.38, -depth * 0.35],
          [-width * 0.38, depth * 0.35],
          [width * 0.38, depth * 0.35],
        ].map(([x, z], index) => (
          <RoundedBox key={`${fixture.id}-leg-${index}`} castShadow receiveShadow args={[0.045, legHeight, 0.045]} radius={0.014} smoothness={3} position={[x, legHeight / 2, z]}>
            <meshStandardMaterial color="#72513b" roughness={0.72} />
          </RoundedBox>
        ))}
      </group>
    )
  }

  return (
    <RoundedBox
      castShadow
      receiveShadow
      args={[width, height, depth]}
      radius={0.035}
      smoothness={4}
      position={[position.x, height / 2 + 0.045, position.z]}
      rotation={[0, rotation, 0]}
    >
      <meshStandardMaterial color={fixture.color} roughness={0.64} />
    </RoundedBox>
  )
}

function CameraViewpoint({ viewpoint }: { viewpoint: Viewpoint }) {
  const { camera } = useThree()

  useEffect(() => {
    camera.position.copy(viewpoint.position)
    camera.lookAt(viewpoint.target)
  }, [camera, viewpoint])

  return null
}

function Plan3DScene({ plan, viewpoint }: { plan: HousePlan; viewpoint: Viewpoint }) {
  const center = useMemo(() => getPlanCenter(plan), [plan])
  const renderScale = useMemo(() => getRenderScale(plan), [plan])
  const generatedWalls = useMemo(() => getSpaceWalls(plan.spaces), [plan.spaces])
  const openings = useMemo(() => plan.openings ?? [], [plan.openings])
  const openingsByWall = useMemo(
    () => getOpeningsByWall(generatedWalls, openings, renderScale),
    [generatedWalls, openings, renderScale],
  )

  return (
    <>
      <color attach="background" args={['#eef2ec']} />
      <ambientLight intensity={0.58} />
      <hemisphereLight args={['#fffaf0', '#b9c8bb', 1.05]} />
      <directionalLight
        castShadow
        position={[4.8, 9, 5.2]}
        intensity={1.65}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={28}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <Environment preset="city" environmentIntensity={0.36} />
      <group>
        {(plan.outdoorAreas ?? []).map((area) => (
          <OutdoorAreaMesh key={area.id} area={area} scale={renderScale} center={center} />
        ))}
        {plan.spaces.map((space) => (
          <SpaceMesh
            key={space.id}
            space={space}
            scale={renderScale}
            center={center}
          />
        ))}
        {generatedWalls.map((wall) => (
          <WallMesh
            key={wall.id}
            wall={wall}
            scale={renderScale}
            center={center}
            openings={openingsByWall.get(wall.id) ?? []}
          />
        ))}
        {generatedWalls.flatMap((wall) => {
          const windowMeshes = []

          for (const opening of openingsByWall.get(wall.id) ?? []) {
            if (opening.kind !== 'window') {
              continue
            }

            windowMeshes.push(
              <WindowMesh
                key={opening.id}
                opening={opening}
                wall={wall}
                scale={renderScale}
                center={center}
              />,
            )
          }

          return windowMeshes
        })}
        {(plan.fixtures ?? []).map((fixture) => (
          <FixtureMesh key={fixture.id} fixture={fixture} scale={renderScale} center={center} />
        ))}
      </group>
      <ContactShadows
        position={[0, -0.025, 0]}
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

export function Plan3DView({ plan, viewpoint }: { plan: HousePlan; viewpoint: Viewpoint }) {
  return (
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
      <Plan3DScene plan={plan} viewpoint={viewpoint} />
    </Canvas>
  )
}

function pointsToSvgPolygon(points: Point[]) {
  return points.map(([x, y]) => `${x},${y}`).join(' ')
}

function getPlanLineWidth(plan: HousePlan, meters: number, minimum: number) {
  return Math.max(plan.scale * meters, minimum)
}

export function Plan2DView({ plan }: { plan: HousePlan }) {
  const bounds = getPlanBounds(plan)
  const walls = useMemo(() => getSpaceWalls(plan.spaces), [plan.spaces])
  const openings = useMemo(() => plan.openings ?? [], [plan.openings])
  const openingsByWall = useMemo(
    () => getOpeningsByWall(walls, openings, getRenderScale(plan)),
    [plan, walls, openings],
  )

  if (!bounds) {
    return null
  }

  const padding = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.08
  const viewBox = [
    bounds.minX - padding,
    bounds.minY - padding,
    bounds.maxX - bounds.minX + padding * 2,
    bounds.maxY - bounds.minY + padding * 2,
  ].join(' ')
  const wallWidth = getPlanLineWidth(plan, 0.11, 8)
  const openingWidth = getPlanLineWidth(plan, 0.075, 6)

  return (
    <div className="plan-2d">
      <svg viewBox={viewBox} role="img" aria-label="2D plan preview">
        {(plan.outdoorAreas ?? []).map((area) => (
          <polygon
            key={area.id}
            className={`plan-2d-outdoor plan-2d-outdoor-${area.kind}`}
            points={pointsToSvgPolygon(area.polygon)}
          />
        ))}
        {plan.spaces.map((space) => (
          <polygon
            key={space.id}
            className="plan-2d-space"
            fill={space.color}
            points={pointsToSvgPolygon(space.polygon)}
          />
        ))}
        {walls.map((wall) => (
          <line
            key={wall.id}
            className="plan-2d-wall"
            strokeWidth={wallWidth}
            x1={wall.start[0]}
            x2={wall.end[0]}
            y1={wall.start[1]}
            y2={wall.end[1]}
          />
        ))}
        {walls.flatMap((wall) =>
          (openingsByWall.get(wall.id) ?? []).map((opening) => {
            const width = Math.max(opening.width, plan.scale * 0.45)
            const isWindow = opening.kind === 'window'
            const angle = Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]) * (180 / Math.PI)

            return (
              <g
                key={opening.id}
                className={isWindow ? 'plan-2d-window' : 'plan-2d-door'}
                transform={`translate(${opening.position[0]} ${opening.position[1]}) rotate(${angle})`}
              >
                <line strokeWidth={openingWidth} x1={-width / 2} x2={width / 2} y1="0" y2="0" />
              </g>
            )
          }),
        )}
        {(plan.fixtures ?? []).map((fixture) => (
          <rect
            key={fixture.id}
            className="plan-2d-fixture"
            fill="none"
            width={fixture.size[0]}
            height={fixture.size[1]}
            x={fixture.position[0] - fixture.size[0] / 2}
            y={fixture.position[1] - fixture.size[1] / 2}
            transform={`rotate(${fixture.rotation} ${fixture.position[0]} ${fixture.position[1]})`}
          />
        ))}
      </svg>
    </div>
  )
}
