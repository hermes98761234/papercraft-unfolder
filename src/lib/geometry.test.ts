import { expect, it } from 'vitest'
import { convexHull, convexOverlap, minAreaAngle, polyArea, rotate, bbox, type Vec2 } from './geometry.ts'

const tri = (x: number, y: number, s = 1): Vec2[] => [[x, y], [x + s, y], [x, y + s]]

it('polyArea is signed', () => {
  expect(polyArea([[0, 0], [2, 0], [0, 2]])).toBeCloseTo(2)
  expect(polyArea([[0, 0], [0, 2], [2, 0]])).toBeCloseTo(-2)
})

it('detects overlapping triangles', () => {
  expect(convexOverlap(tri(0, 0), tri(0.2, 0.2))).toBe(true)
  expect(convexOverlap(tri(0, 0, 2), [[0.5, 0.5], [0.7, 0.5], [0.5, 0.7]])).toBe(true) // containment
  expect(convexOverlap(tri(0, 0), tri(3, 3))).toBe(false)
})

it('treats touching shapes as non-overlapping', () => {
  // share an edge (mirror image across the hypotenuse)
  expect(convexOverlap(tri(0, 0), [[1, 0], [1, 1], [0, 1]])).toBe(false)
  // share one vertex only
  expect(convexOverlap(tri(0, 0), [[1, 0], [2, 0], [1, -1]])).toBe(false)
  // edge-adjacent squares
  expect(convexOverlap([[0, 0], [1, 0], [1, 1], [0, 1]], [[1, 0], [2, 0], [2, 1], [1, 1]])).toBe(false)
})

it('convex hull drops interior points', () => {
  const h = convexHull([[0, 0], [4, 0], [4, 4], [0, 4], [2, 2], [1, 3]])
  expect(h).toHaveLength(4)
  expect(polyArea(h)).toBeCloseTo(16)
})

it('minAreaAngle straightens a rotated rectangle', () => {
  const rect: Vec2[] = [[0, 0], [10, 0], [10, 2], [0, 2]]
  const turned = rect.map((p) => rotate(p, 0.6))
  const [x0, y0, x1, y1] = bbox(turned.map((p) => rotate(p, minAreaAngle(turned))))
  expect((x1 - x0) * (y1 - y0)).toBeCloseTo(20, 6)
})
