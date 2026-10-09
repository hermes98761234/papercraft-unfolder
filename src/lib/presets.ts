import { cleanMesh, normalize, type Mesh, type Tri, type Vec3 } from './mesh.ts'

export type PresetId = 'cube' | 'icosahedron' | 'cylinder' | 'cone' | 'sphere' | 'rabbit'
export const PRESETS: { id: PresetId; label: string; resolution?: [number, number, number] }[] = [
  { id: 'rabbit', label: 'Low-poly rabbit' },
  { id: 'cube', label: 'Cube' },
  { id: 'icosahedron', label: 'Icosahedron' },
  { id: 'cylinder', label: 'Cylinder', resolution: [3, 48, 12] },
  { id: 'cone', label: 'Cone', resolution: [3, 48, 12] },
  { id: 'sphere', label: 'Sphere', resolution: [4, 32, 10] },
]

export function cube(): Mesh {
  const vertices: Vec3[] = []
  for (let i = 0; i < 8; i++) vertices.push([i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5])
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]
  const faces: Tri[] = quads.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]] as Tri[])
  return cleanMesh({ vertices, faces })
}

const ICO_FACES: Tri[] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
]

export function icosahedron(): Mesh {
  const t = (1 + Math.sqrt(5)) / 2
  const raw: Vec3[] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
  return cleanMesh({ vertices: raw.map(normalize), faces: ICO_FACES })
}

export function icosphere(levels: number): Mesh {
  let { vertices, faces } = icosahedron()
  for (let l = 0; l < levels; l++) {
    const cache = new Map<string, number>()
    const mid = (a: number, b: number) => {
      const k = a < b ? `${a},${b}` : `${b},${a}`
      let i = cache.get(k)
      if (i === undefined) {
        i = vertices.length
        cache.set(k, i)
        const p = vertices[a]
        const q = vertices[b]
        vertices = [...vertices, normalize([p[0] + q[0], p[1] + q[1], p[2] + q[2]])]
      }
      return i
    }
    const next: Tri[] = []
    for (const [a, b, c] of faces) {
      const ab = mid(a, b)
      const bc = mid(b, c)
      const ca = mid(c, a)
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
    }
    faces = next
  }
  return { vertices, faces }
}

/** A star-shaped blob with ears, a tail and a nose: an icosphere pushed out along a few directions. */
export function rabbit(): Mesh {
  const bumps: { dir: Vec3; amp: number; sigma: number }[] = [
    { dir: normalize([0.5, 1, 0.2]), amp: 1.1, sigma: 0.3 },
    { dir: normalize([-0.5, 1, 0.2]), amp: 1.1, sigma: 0.3 },
    { dir: normalize([0, 0.3, -1]), amp: 0.35, sigma: 0.5 },
    { dir: normalize([0, 0.15, 1]), amp: 0.22, sigma: 0.5 },
    { dir: normalize([0.35, -0.9, 0.5]), amp: 0.25, sigma: 0.5 },
    { dir: normalize([-0.35, -0.9, 0.5]), amp: 0.25, sigma: 0.5 },
  ]
  const m = icosphere(2)
  const vertices = m.vertices.map((d) => {
    let r = 1
    for (const b of bumps) {
      const ang = Math.acos(Math.max(-1, Math.min(1, d[0] * b.dir[0] + d[1] * b.dir[1] + d[2] * b.dir[2])))
      r += b.amp * Math.exp(-((ang / b.sigma) ** 2))
    }
    return [d[0] * r * 0.85, d[1] * r, d[2] * r] as Vec3
  })
  return cleanMesh({ vertices, faces: m.faces })
}

export function cylinder(res: number): Mesh {
  const vertices: Vec3[] = [[0, -0.5, 0], [0, 0.5, 0]]
  for (let i = 0; i < res; i++) {
    const a = (2 * Math.PI * i) / res
    vertices.push([0.5 * Math.cos(a), -0.5, 0.5 * Math.sin(a)], [0.5 * Math.cos(a), 0.5, 0.5 * Math.sin(a)])
  }
  const faces: Tri[] = []
  for (let i = 0; i < res; i++) {
    const j = (i + 1) % res
    const b0 = 2 + 2 * i, t0 = b0 + 1, b1 = 2 + 2 * j, t1 = b1 + 1
    faces.push([0, b1, b0], [1, t0, t1], [b0, b1, t1], [b0, t1, t0])
  }
  return cleanMesh({ vertices, faces })
}

export function cone(res: number): Mesh {
  const vertices: Vec3[] = [[0, -0.5, 0], [0, 0.5, 0]]
  for (let i = 0; i < res; i++) {
    const a = (2 * Math.PI * i) / res
    vertices.push([0.5 * Math.cos(a), -0.5, 0.5 * Math.sin(a)])
  }
  const faces: Tri[] = []
  for (let i = 0; i < res; i++) {
    const j = (i + 1) % res
    faces.push([0, 2 + j, 2 + i], [1, 2 + i, 2 + j])
  }
  return cleanMesh({ vertices, faces })
}

/** UV sphere with `res` segments around and res/2 bands pole to pole. */
export function sphere(res: number): Mesh {
  const bands = Math.max(2, Math.round(res / 2))
  const vertices: Vec3[] = [[0, 1, 0]]
  for (let b = 1; b < bands; b++) {
    const phi = (Math.PI * b) / bands
    for (let i = 0; i < res; i++) {
      const th = (2 * Math.PI * i) / res
      vertices.push([Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)])
    }
  }
  vertices.push([0, -1, 0])
  const south = vertices.length - 1
  const ring = (b: number, i: number) => 1 + (b - 1) * res + (i % res)
  const faces: Tri[] = []
  for (let i = 0; i < res; i++) {
    faces.push([0, ring(1, i + 1), ring(1, i)])
    faces.push([south, ring(bands - 1, i), ring(bands - 1, i + 1)])
    for (let b = 1; b < bands - 1; b++) {
      faces.push([ring(b, i), ring(b, i + 1), ring(b + 1, i + 1)], [ring(b, i), ring(b + 1, i + 1), ring(b + 1, i)])
    }
  }
  return cleanMesh({ vertices, faces })
}

export function makePreset(id: PresetId, res = 16): Mesh {
  switch (id) {
    case 'cube': return cube()
    case 'icosahedron': return icosahedron()
    case 'cylinder': return cylinder(res)
    case 'cone': return cone(res)
    case 'sphere': return sphere(res)
    case 'rabbit': return rabbit()
  }
}
