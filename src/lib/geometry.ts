export type Vec2 = [number, number]

/** Signed area of a simple polygon (positive when counter-clockwise). */
export function polyArea(p: Vec2[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]
    const [x2, y2] = p[(i + 1) % p.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

function project(p: Vec2[], nx: number, ny: number): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const [x, y] of p) {
    const d = x * nx + y * ny
    if (d < lo) lo = d
    if (d > hi) hi = d
  }
  return [lo, hi]
}

/**
 * True when the interiors of two convex polygons overlap by more than `eps`.
 * Separating-axis test over the edge normals of both polygons. Shapes that only
 * touch along an edge or at a vertex do not count as overlapping.
 */
export function convexOverlap(a: Vec2[], b: Vec2[], eps = 1e-4): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i]
      const [x2, y2] = poly[(i + 1) % poly.length]
      const ex = x2 - x1
      const ey = y2 - y1
      const l = Math.hypot(ex, ey)
      if (l < 1e-12) continue
      const nx = ey / l
      const ny = -ex / l
      const [alo, ahi] = project(a, nx, ny)
      const [blo, bhi] = project(b, nx, ny)
      if (ahi <= blo + eps || bhi <= alo + eps) return false
    }
  }
  return true
}

export function bbox(p: Vec2[]): [number, number, number, number] {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of p) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

/** Convex hull (Andrew's monotone chain), counter-clockwise. */
export function convexHull(pts: Vec2[]): Vec2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: Vec2[]) => {
    const h: Vec2[] = []
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop()
      h.push(q)
    }
    h.pop()
    return h
  }
  return [...half(p), ...half([...p].reverse())]
}

export function rotate(p: Vec2, theta: number): Vec2 {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]
}

/** Rotation angle that gives the smallest axis-aligned bounding box (rotating-calipers idea: one hull edge is flush). */
export function minAreaAngle(pts: Vec2[]): number {
  const hull = convexHull(pts)
  let best = 0
  let bestArea = Infinity
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    const theta = -Math.atan2(b[1] - a[1], b[0] - a[0])
    const [x0, y0, x1, y1] = bbox(hull.map((q) => rotate(q, theta)))
    const area = (x1 - x0) * (y1 - y0)
    if (area < bestArea - 1e-9) {
      bestArea = area
      best = theta
    }
  }
  return best
}
