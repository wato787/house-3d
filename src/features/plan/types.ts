export type Point = [number, number]

export type Space = {
  id: string
  name: string
  polygon: Point[]
  color: string
}

export type OutdoorArea = {
  id: string
  kind: 'garden' | 'parking' | 'terrace' | 'path'
  polygon: Point[]
}

export type Wall = {
  id: string
  start: Point
  end: Point
}

export type Opening = {
  id: string
  kind: 'door' | 'window'
  position: Point
  width: number
}

export type Fixture = {
  id: string
  kind: string
  position: Point
  size: [number, number]
  rotation: number
  color: string
}

export type HousePlan = {
  scale: number
  spaces: Space[]
  outdoorAreas?: OutdoorArea[]
  walls?: Wall[]
  openings?: Opening[]
  fixtures?: Fixture[]
}
