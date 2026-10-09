export type Vec3 = [number, number, number]
export type Tri = [number, number, number]
export interface Mesh {
  vertices: Vec3[]
  faces: Tri[]
}

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const dist = (a: Vec3, b: Vec3) => len(sub(a, b))
export const normalize = (a: Vec3): Vec3 => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

export function faceNormal(m: Mesh, f: number): Vec3 {
  const [a, b, c] = m.faces[f]
  return normalize(cross(sub(m.vertices[b], m.vertices[a]), sub(m.vertices[c], m.vertices[a])))
}

export function faceArea(m: Mesh, f: number): number {
  const [a, b, c] = m.faces[f]
  return len(cross(sub(m.vertices[b], m.vertices[a]), sub(m.vertices[c], m.vertices[a]))) / 2
}

export const meshArea = (m: Mesh) => m.faces.reduce((s, _, f) => s + faceArea(m, f), 0)

export function bounds(m: Mesh): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const v of m.vertices) {
    for (let k = 0; k < 3; k++) {
      if (v[k] < min[k]) min[k] = v[k]
      if (v[k] > max[k]) max[k] = v[k]
    }
  }
  return { min, max }
}

export interface Edge {
  a: number
  b: number
  /** Faces using this edge (two for an interior edge). */
  faces: number[]
}
export interface Topology {
  edges: Edge[]
  /** faceEdges[f][i] is the edge between vertices i and i+1 of face f. */
  faceEdges: [number, number, number][]
}

export function buildEdges(m: Mesh): Topology {
  const n = m.vertices.length
  const index = new Map<number, number>()
  const edges: Edge[] = []
  const faceEdges: [number, number, number][] = []
  m.faces.forEach((f, fi) => {
    const fe: number[] = []
    for (let i = 0; i < 3; i++) {
      const u = f[i]
      const v = f[(i + 1) % 3]
      const a = Math.min(u, v)
      const b = Math.max(u, v)
      const key = a * n + b
      let e = index.get(key)
      if (e === undefined) {
        e = edges.length
        index.set(key, e)
        edges.push({ a, b, faces: [] })
      }
      edges[e].faces.push(fi)
      fe.push(e)
    }
    faceEdges.push(fe as [number, number, number])
  })
  return { edges, faceEdges }
}

/** Makes triangle winding consistent across each connected surface and outward for closed ones. */
export function orientMesh(m: Mesh): Mesh {
  const faces: Tri[] = m.faces.map((f) => [...f])
  const n = m.vertices.length
  const byEdge = new Map<number, number[]>()
  const key = (u: number, v: number) => Math.min(u, v) * n + Math.max(u, v)
  faces.forEach((f, fi) => {
    for (let i = 0; i < 3; i++) {
      const k = key(f[i], f[(i + 1) % 3])
      const l = byEdge.get(k)
      if (l) l.push(fi)
      else byEdge.set(k, [fi])
    }
  })
  const seen = new Array<boolean>(faces.length).fill(false)
  for (let s = 0; s < faces.length; s++) {
    if (seen[s]) continue
    seen[s] = true
    const comp = [s]
    let closed = true
    for (let qi = 0; qi < comp.length; qi++) {
      const f = comp[qi]
      for (let i = 0; i < 3; i++) {
        const u = faces[f][i]
        const v = faces[f][(i + 1) % 3]
        const adj = byEdge.get(key(u, v))!
        if (adj.length !== 2) {
          closed = false
          continue
        }
        const g = adj[0] === f ? adj[1] : adj[0]
        if (seen[g]) continue
        const [p, q, r] = faces[g]
        const sameDir = (p === u && q === v) || (q === u && r === v) || (r === u && p === v)
        if (sameDir) faces[g] = [p, r, q]
        seen[g] = true
        comp.push(g)
      }
    }
    if (closed) {
      let vol = 0
      for (const f of comp) {
        const [a, b, c] = faces[f]
        vol += dot(m.vertices[a], cross(m.vertices[b], m.vertices[c]))
      }
      if (vol < 0) for (const f of comp) faces[f] = [faces[f][0], faces[f][2], faces[f][1]]
    }
  }
  return { vertices: m.vertices, faces }
}

/** Drops degenerate and duplicate faces and unused vertices, then orients the surface. */
export function cleanMesh(m: Mesh): Mesh {
  const { min, max } = bounds(m)
  const diag = len(sub(max, min)) || 1
  const seen = new Set<string>()
  const faces: Tri[] = []
  for (const f of m.faces) {
    if (f[0] === f[1] || f[1] === f[2] || f[0] === f[2]) continue
    const id = [...f].sort((x, y) => x - y).join(',')
    if (seen.has(id)) continue
    const a = m.vertices[f[0]]
    const area = len(cross(sub(m.vertices[f[1]], a), sub(m.vertices[f[2]], a))) / 2
    if (area < 1e-10 * diag * diag) continue
    seen.add(id)
    faces.push(f)
  }
  const remap = new Map<number, number>()
  const vertices: Vec3[] = []
  const out = faces.map((f) => f.map((v) => {
    let r = remap.get(v)
    if (r === undefined) {
      r = vertices.length
      remap.set(v, r)
      vertices.push(m.vertices[v])
    }
    return r
  }) as Tri)
  return orientMesh({ vertices, faces: out })
}

/** Merges vertices closer than a tiny fraction of the model size (STL stores every triangle on its own). */
export function weldTriangles(tris: Vec3[][]): Mesh {
  const all = tris.flat()
  const { min, max } = bounds({ vertices: all, faces: [] })
  const q = (len(sub(max, min)) || 1) * 1e-6
  const index = new Map<string, number>()
  const vertices: Vec3[] = []
  const faces: Tri[] = tris.map(
    (t) =>
      t.map((p) => {
        const k = `${Math.round(p[0] / q)},${Math.round(p[1] / q)},${Math.round(p[2] / q)}`
        let i = index.get(k)
        if (i === undefined) {
          i = vertices.length
          index.set(k, i)
          vertices.push(p)
        }
        return i
      }) as Tri,
  )
  return { vertices, faces }
}

/** Centres the mesh and scales it so the longest bounding-box side equals `size`. */
export function scaleToSize(m: Mesh, size: number): Mesh {
  const { min, max } = bounds(m)
  const s = size / (Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1)
  const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  return { vertices: m.vertices.map((v) => [(v[0] - c[0]) * s, (v[1] - c[1]) * s, (v[2] - c[2]) * s] as Vec3), faces: m.faces }
}
