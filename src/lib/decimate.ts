import { cleanMesh, cross, dot, sub, type Mesh, type Tri, type Vec3 } from './mesh.ts'

// Quadric edge-collapse decimation (Garland & Heckbert, SIGGRAPH 1997).
// Each vertex carries the sum of squared distances to the planes of its faces; an edge
// collapses to whichever of its endpoints or midpoint has the smallest error.

type Q = number[] // symmetric 4x4 as [a2, ab, ac, ad, b2, bc, bd, c2, cd, d2]

function planeQuadric(n: Vec3, d: number, w: number): Q {
  const [a, b, c] = n
  return [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d].map((x) => x * w)
}

function evalQ(q: Q, p: Vec3): number {
  const [x, y, z] = p
  return (
    q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x +
    q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y +
    q[7] * z * z + 2 * q[8] * z + q[9]
  )
}

interface Entry {
  cost: number
  a: number
  b: number
  va: number
  vb: number
  pos: Vec3
}

class Heap {
  private h: Entry[] = []
  get size() { return this.h.length }
  push(e: Entry) {
    const h = this.h
    h.push(e)
    let i = h.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (h[p].cost <= h[i].cost) break
      ;[h[p], h[i]] = [h[i], h[p]]
      i = p
    }
  }
  pop(): Entry | undefined {
    const h = this.h
    if (!h.length) return undefined
    const top = h[0]
    const last = h.pop()!
    if (h.length) {
      h[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < h.length && h[l].cost < h[m].cost) m = l
        if (r < h.length && h[r].cost < h[m].cost) m = r
        if (m === i) break
        ;[h[m], h[i]] = [h[i], h[m]]
        i = m
      }
    }
    return top
  }
}

export function decimate(mesh: Mesh, target: number): Mesh {
  const pos: Vec3[] = mesh.vertices.map((v) => [...v])
  const faces: Tri[] = mesh.faces.map((f) => [...f])
  const alive = faces.map(() => true)
  const vf: Set<number>[] = pos.map(() => new Set())
  faces.forEach((f, i) => f.forEach((v) => vf[v].add(i)))
  const quad: Q[] = pos.map(() => new Array(10).fill(0))
  faces.forEach((f) => {
    const n = cross(sub(pos[f[1]], pos[f[0]]), sub(pos[f[2]], pos[f[0]]))
    const area2 = Math.hypot(...n)
    if (area2 < 1e-300) return
    const u: Vec3 = [n[0] / area2, n[1] / area2, n[2] / area2]
    const qd = planeQuadric(u, -dot(u, pos[f[0]]), area2 / 2)
    for (const v of f) for (let k = 0; k < 10; k++) quad[v][k] += qd[k]
  })
  const ver = pos.map(() => 0)
  const vAlive = pos.map(() => true)
  let count = faces.length

  const neighbours = (v: number) => {
    const s = new Set<number>()
    for (const f of vf[v]) for (const w of faces[f]) if (w !== v) s.add(w)
    return s
  }
  const isBoundary = (v: number) => {
    const c = new Map<number, number>()
    for (const f of vf[v]) for (const w of faces[f]) if (w !== v) c.set(w, (c.get(w) ?? 0) + 1)
    return [...c.values()].some((n) => n === 1)
  }
  const shared = (a: number, b: number) => [...vf[a]].filter((f) => vf[b].has(f))

  /** Best position for collapsing a-b, or null when the collapse is not allowed. */
  function candidate(a: number, b: number): { cost: number; pos: Vec3 } | null {
    const sh = shared(a, b)
    if (sh.length < 1 || sh.length > 2) return null
    const ba = isBoundary(a)
    const bb = isBoundary(b)
    if (sh.length === 1 ? !(ba && bb) : ba && bb) return null
    const q = quad[a].map((x, k) => x + quad[b][k])
    const mid: Vec3 = [(pos[a][0] + pos[b][0]) / 2, (pos[a][1] + pos[b][1]) / 2, (pos[a][2] + pos[b][2]) / 2]
    let cands: Vec3[] = [pos[a], pos[b], mid]
    if (ba && !bb) cands = [pos[a]]
    else if (bb && !ba) cands = [pos[b]]
    let best: { cost: number; pos: Vec3 } | null = null
    for (const p of cands) {
      if (!safe(a, b, p)) continue
      const cost = evalQ(q, p)
      if (!best || cost < best.cost) best = { cost, pos: p }
    }
    return best
  }

  /** Link condition plus a no-flip check, so the surface stays a manifold without fold-overs. */
  function safe(a: number, b: number, p: Vec3): boolean {
    const na = neighbours(a)
    const nb = neighbours(b)
    let common = 0
    for (const w of na) if (nb.has(w)) common++
    if (common !== shared(a, b).length) return false
    for (const v of [a, b]) {
      for (const f of vf[v]) {
        if (vf[a].has(f) && vf[b].has(f)) continue
        const t = faces[f]
        const pts = t.map((w) => (w === a || w === b ? p : pos[w]))
        const before = cross(sub(pos[t[1]], pos[t[0]]), sub(pos[t[2]], pos[t[0]]))
        const after = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]))
        const lb = Math.hypot(...before)
        const la = Math.hypot(...after)
        if (la < 1e-9 * lb || dot(before, after) < 0.2 * lb * la) return false
      }
    }
    return true
  }

  const heap = new Heap()
  const push = (a: number, b: number) => {
    const c = candidate(a, b)
    if (c) heap.push({ cost: c.cost, a, b, va: ver[a], vb: ver[b], pos: c.pos })
  }
  for (let v = 0; v < pos.length; v++) for (const w of neighbours(v)) if (v < w) push(v, w)

  while (count > target) {
    const e = heap.pop()
    if (!e) break
    const { a, b } = e
    if (!vAlive[a] || !vAlive[b] || ver[a] !== e.va || ver[b] !== e.vb) continue
    const c = candidate(a, b) // neighbourhood may have changed without touching a or b
    if (!c) continue
    for (const f of shared(a, b)) {
      alive[f] = false
      count--
      for (const w of faces[f]) vf[w].delete(f)
    }
    for (const f of [...vf[b]]) {
      faces[f] = faces[f].map((w) => (w === b ? a : w)) as Tri
      vf[a].add(f)
    }
    vf[b].clear()
    vAlive[b] = false
    pos[a] = c.pos
    for (let k = 0; k < 10; k++) quad[a][k] += quad[b][k]
    ver[a]++
    for (const w of neighbours(a)) {
      ver[w]++
      for (const x of neighbours(w)) if (x !== w) push(Math.min(w, x), Math.max(w, x))
    }
  }
  return cleanMesh({ vertices: pos, faces: faces.filter((_, i) => alive[i]) })
}
