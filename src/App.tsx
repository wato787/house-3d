import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, RoundedBox } from '@react-three/drei'
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

type ViewMode = '3d' | '2d'

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
      id: 'stairs',
      kind: 'stairs',
      position: [9750, 5200],
      size: [1500, 2200],
      rotation: 0,
      color: '#d7c3a0',
    },
    {
      id: 'sofa',
      kind: 'sofa',
      position: [1700, 5200],
      size: [1600, 900],
      rotation: 0,
      color: '#d6d1c9',
    },
    {
      id: 'table',
      kind: 'table',
      position: [3400, 5200],
      size: [1400, 900],
      rotation: 0,
      color: '#a8503c',
    },
  ],
}

const wallHeight = 1.2
const wallThickness = 0.12
const fallbackBuildingWidthMeters = 13.2
const openingSnapDistanceMeters = 0.55
const minimumWallSegmentMeters = 0.42
const minimumOpeningCornerMarginMeters = 0.38
const fixtureWallMarginMeters = 0.22
const subtleTextureSize = 256

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

function isPointInPolygon(point: Point, polygon: Point[]) {
  const [px, py] = point
  let isInside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi

    if (intersects) {
      isInside = !isInside
    }
  }

  return isInside
}

function getPolygonCenter(polygon: Point[]): Point {
  const total = polygon.reduce(
    ([sumX, sumY], [x, y]) => [sumX + x, sumY + y],
    [0, 0] as Point,
  )
  return [total[0] / polygon.length, total[1] / polygon.length]
}

function getPolygonBounds(polygon: Point[]) {
  const xs = polygon.map(([x]) => x)
  const ys = polygon.map(([, y]) => y)

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

function distanceBetweenPoints(start: Point, end: Point) {
  return Math.hypot(end[0] - start[0], end[1] - start[1])
}

function simplifyPolygon(polygon: Point[], scale: number) {
  const minimumEdgeLength = minimumWallSegmentMeters * scale
  let simplified = polygon

  for (let pass = 0; pass < 2; pass += 1) {
    if (simplified.length <= 4) {
      break
    }

    simplified = simplified.filter((point, index) => {
      const previous = simplified[(index - 1 + simplified.length) % simplified.length]
      const next = simplified[(index + 1) % simplified.length]
      const previousDistance = distanceBetweenPoints(previous, point)
      const nextDistance = distanceBetweenPoints(point, next)

      return previousDistance >= minimumEdgeLength || nextDistance >= minimumEdgeLength
    })
  }

  return simplified.length >= 3 ? simplified : polygon
}

function normalizeSpaces(spaces: Space[], scale: number) {
  return spaces.map((space) => ({
    ...space,
    polygon: simplifyPolygon(space.polygon, scale),
  }))
}

function doesOutdoorAreaOverlapSpaces(area: OutdoorArea, spaces: Space[]) {
  return spaces.some((space) => {
    const center = getPolygonCenter(area.polygon)
    return (
      isPointInPolygon(center, space.polygon) ||
      area.polygon.some((point) => isPointInPolygon(point, space.polygon))
    )
  })
}

function isSupportedFixture(fixture: Fixture) {
  return /kitchen|bath|bathtub|toilet|sink|washbasin|basin|stairs|sofa|dining|table|tv|television/i.test(fixture.kind)
}

function isLivingFurniture(fixture: Fixture) {
  return /sofa|dining|table|tv|television/i.test(fixture.kind)
}

function isLivingSpace(space: Space) {
  return /ldk|living|dining|リビング|ダイニング/i.test(space.name)
}

function isFixtureAllowedInPlan(fixture: Fixture, spaces: Space[]) {
  if (!isSupportedFixture(fixture)) {
    return false
  }

  if (!isLivingFurniture(fixture)) {
    return true
  }

  return spaces
    .filter(isLivingSpace)
    .some((space) => isPointInPolygon(fixture.position, space.polygon))
}

function clampFixtureToRoom(fixture: Fixture, spaces: Space[], scale: number): Fixture {
  const room = spaces.find((space) => isPointInPolygon(fixture.position, space.polygon))

  if (!room) {
    return fixture
  }

  const bounds = getPolygonBounds(room.polygon)
  const margin = fixtureWallMarginMeters * scale
  const clampedPosition: Point = [
    THREE.MathUtils.clamp(fixture.position[0], bounds.minX + margin, bounds.maxX - margin),
    THREE.MathUtils.clamp(fixture.position[1], bounds.minY + margin, bounds.maxY - margin),
  ]

  return {
    ...fixture,
    position: isPointInPolygon(clampedPosition, room.polygon) ? clampedPosition : fixture.position,
  }
}

function normalizeOpenings(plan: HousePlan) {
  const walls = getSpaceWalls(plan.spaces)
  const scale = getRenderScale(plan)
  const assigned = getOpeningsByWall(walls, plan.openings ?? [], scale)

  return Array.from(assigned.entries()).flatMap(([wallId, openings]) => {
    const wall = walls.find((candidate) => candidate.id === wallId)

    if (!wall) {
      return []
    }

    const accepted: Opening[] = []

    openings
      .map((opening) => ({
        opening,
        projection: getOpeningProjection(wall, opening, scale),
      }))
      .filter((match): match is { opening: Opening; projection: NonNullable<ReturnType<typeof getOpeningProjection>> } =>
        Boolean(match.projection),
      )
      .filter(({ projection }) => {
        const wallLength = distanceBetweenPoints(wall.start, wall.end) / scale
        const halfWidth = projection.width / 2
        return (
          projection.center - halfWidth >= minimumOpeningCornerMarginMeters &&
          wallLength - (projection.center + halfWidth) >= minimumOpeningCornerMarginMeters
        )
      })
      .sort((a, b) => a.projection.center - b.projection.center)
      .forEach(({ opening, projection }) => {
        const hasNearbyOpening = accepted.some((acceptedOpening) => {
          const acceptedProjection = getOpeningProjection(wall, acceptedOpening, scale)
          return (
            acceptedProjection &&
            acceptedOpening.kind === opening.kind &&
            Math.abs(acceptedProjection.center - projection.center) < 0.35
          )
        })

        if (!hasNearbyOpening) {
          accepted.push(opening)
        }
      })

    return accepted
  })
}

function normalizePlan(plan: HousePlan): HousePlan {
  const initialScale = getRenderScale(plan)
  const spaces = normalizeSpaces(plan.spaces, initialScale)
  const normalizedBasePlan = { ...plan, spaces }

  return {
    ...plan,
    spaces,
    outdoorAreas: (plan.outdoorAreas ?? []).filter(
      (area) => !doesOutdoorAreaOverlapSpaces(area, spaces),
    ),
    walls: plan.walls ?? [],
    openings: normalizeOpenings(normalizedBasePlan),
    fixtures: (plan.fixtures ?? [])
      .filter((fixture) => isFixtureAllowedInPlan(fixture, spaces))
      .map((fixture) => clampFixtureToRoom(fixture, spaces, initialScale)),
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
    distanceFromWallMeters,
  }
}

function getWallSegments(wall: Wall & { hasOpening?: boolean }, openings: Opening[], scale: number) {
  const start = new THREE.Vector2(wall.start[0], wall.start[1])
  const end = new THREE.Vector2(wall.end[0], wall.end[1])
  const wallLength = start.distanceTo(end) / scale
  const explicitOpenings = openings
    .map((opening) => getOpeningProjection(wall, opening, scale))
    .filter((opening): opening is NonNullable<typeof opening> => Boolean(opening))

  const sortedOpenings = explicitOpenings
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

  return segments.filter((segment) => segment.end - segment.start > minimumWallSegmentMeters)
}

function getOpeningsByWall(
  walls: Array<Wall & { hasOpening?: boolean }>,
  openings: Opening[],
  scale: number,
) {
  const openingsByWall = new Map<string, Opening[]>()

  openings.forEach((opening) => {
    const matchedWall = walls
      .map((wall) => ({
        wall,
        projection: getOpeningProjection(wall, opening, scale),
      }))
      .filter((match): match is { wall: Wall & { hasOpening?: boolean }; projection: NonNullable<ReturnType<typeof getOpeningProjection>> } =>
        Boolean(match.projection),
      )
      .sort((a, b) => a.projection.distanceFromWallMeters - b.projection.distanceFromWallMeters)[0]

    if (!matchedWall) {
      return
    }

    const assignedOpenings = openingsByWall.get(matchedWall.wall.id) ?? []
    assignedOpenings.push(opening)
    openingsByWall.set(matchedWall.wall.id, assignedOpenings)
  })

  return openingsByWall
}

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
    <mesh receiveShadow renderOrder={-20} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <shapeGeometry args={[shape]} />
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
    <mesh receiveShadow renderOrder={-10} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
      <shapeGeometry args={[shape]} />
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

function PlanScene({ plan, viewpoint }: { plan: HousePlan; viewpoint: Viewpoint }) {
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
        {generatedWalls.flatMap((wall) =>
          (openingsByWall.get(wall.id) ?? [])
            .filter((opening) => opening.kind === 'window')
            .map((opening) => (
              <WindowMesh
                key={opening.id}
                opening={opening}
                wall={wall}
                scale={renderScale}
                center={center}
              />
            )),
        )}
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

function pointsToSvgPolygon(points: Point[]) {
  return points.map(([x, y]) => `${x},${y}`).join(' ')
}

function getFixtureColor(fixture: Fixture) {
  if (/sofa/i.test(fixture.kind)) {
    return '#c7c0b6'
  }
  if (/tv|television/i.test(fixture.kind)) {
    return '#2f3334'
  }
  if (/dining|table/i.test(fixture.kind)) {
    return '#9f6b48'
  }
  if (/stairs/i.test(fixture.kind)) {
    return '#c7a66b'
  }
  return fixture.color || '#7d858a'
}

function Plan2DView({ plan }: { plan: HousePlan }) {
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
        {plan.spaces.map((space) => (
          <polygon
            key={`${space.id}-outline`}
            className="plan-2d-wall"
            points={pointsToSvgPolygon(space.polygon)}
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
                <line x1={-width / 2} x2={width / 2} y1="0" y2="0" />
              </g>
            )
          }),
        )}
        {(plan.fixtures ?? []).map((fixture) => (
          <rect
            key={fixture.id}
            className="plan-2d-fixture"
            fill={getFixtureColor(fixture)}
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
