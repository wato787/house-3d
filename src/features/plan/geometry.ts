import * as THREE from 'three'
import type { Fixture, HousePlan, Opening, OutdoorArea, Point, Space, Wall } from './types'

const fallbackBuildingWidthMeters = 13.2
const openingSnapDistanceMeters = 0.55
const minimumWallSegmentMeters = 0.42
const minimumOpeningCornerMarginMeters = 0.38
const fixtureWallMarginMeters = 0.22

export function isPointInPolygon(point: Point, polygon: Point[]) {
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

export function getPolygonCenter(polygon: Point[]): Point {
  const total = polygon.reduce(
    ([sumX, sumY], [x, y]) => [sumX + x, sumY + y],
    [0, 0] as Point,
  )
  return [total[0] / polygon.length, total[1] / polygon.length]
}

export function getPolygonBounds(polygon: Point[]) {
  const xs = polygon.map(([x]) => x)
  const ys = polygon.map(([, y]) => y)

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

export function distanceBetweenPoints(start: Point, end: Point) {
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

export function normalizePlan(plan: HousePlan): HousePlan {
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

export function getStructuralPoints(plan: HousePlan) {
  return [
    ...plan.spaces.flatMap((space) => space.polygon),
    ...(plan.outdoorAreas ?? []).flatMap((area) => area.polygon),
  ]
}

export function getPlanBounds(plan: HousePlan) {
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

export function getPlanCenter(plan: HousePlan) {
  const bounds = getPlanBounds(plan)
  if (!bounds) {
    return new THREE.Vector2(0, 0)
  }

  return new THREE.Vector2(
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
  )
}

export function getRenderScale(plan: HousePlan) {
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

export function toScenePoint([x, y]: Point, scale: number, center: THREE.Vector2) {
  return new THREE.Vector3((x - center.x) / scale, 0, (y - center.y) / scale)
}

export function getOverallViewpoint(plan: HousePlan, scale: number) {
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

export function getSpaceWalls(spaces: Space[]) {
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

export function getOpeningProjection(wall: Wall, opening: Opening, scale: number) {
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

export function getWallSegments(wall: Wall & { hasOpening?: boolean }, openings: Opening[], scale: number) {
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

export function getOpeningsByWall(
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
