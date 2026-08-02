import type { HousePlan, Point } from './types'

export function isPoint(value: unknown): value is Point {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((coordinate) => typeof coordinate === 'number')
  )
}

export function isPlan(value: unknown): value is HousePlan {
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
