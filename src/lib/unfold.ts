import { convexOverlap, bbox, type Vec2 } from './geometry.ts'
import { buildEdges, cross, dist, dot, normalize, sub, type Mesh, type Topology } from './mesh.ts'

export type EdgeKind = 'boundary' | 'fold' | 'cut'
export type Tri2 = [Vec2, Vec2, Vec2]

export interface Unfolding {
  mesh: Mesh
  topo: Topology
  /** 2D position of each face corner, in the face's own piece frame. */
  tri2d: Tri2[]
  pieceOf: number[]
  /** Faces of each piece in placement order. */
  pieces: number[][]
  edgeKind: EdgeKind[]
  /** Dihedral deflection per interior edge, radians (0 = flat). */
  angle: number[]
  /** +1 mountain (convex), -1 valley (concave), 0 flat/not interior. */
  fold: number[]
  /** 1-based number of every cut edge, 0 otherwise. */
  cutNumber: number[]
  cutCount: number
}

function third(tri: [number, number, number], u: number, v: number) {
  return tri.find((w) => w !== u && w !== v)!
}

/**
 * Unfolds a triangle mesh into the plane. A maximum spanning tree of the dual graph, weighted by
 * cos(fold angle), decides which edges stay folded: flat edges are kept, sharp ones are cut.
 * Faces are laid out along the tree; whenever a face would overlap one already placed in its
 * piece (or would make the piece too big for `maxSize`, the paper), that tree edge is cut and
 * the face starts a new piece.
 */
export function unfold(mesh: Mesh, maxSize?: [number, number]): Unfolding {
  const topo = buildEdges(mesh)
  const { edges } = topo
  const F = mesh.faces.length
  const P = mesh.vertices
  const normals = mesh.faces.map((f) => normalize(cross(sub(P[f[1]], P[f[0]]), sub(P[f[2]], P[f[0]]))))

  const angle = edges.map(() => 0)
  const fold = edges.map(() => 0)
  edges.forEach((e, i) => {
    if (e.faces.length !== 2) return
    const [f, g] = e.faces
    angle[i] = Math.acos(Math.max(-1, Math.min(1, dot(normals[f], normals[g]))))
    const opp = third(mesh.faces[g], e.a, e.b)
    const side = dot(sub(P[opp], P[e.a]), normals[f])
    fold[i] = angle[i] < 1e-3 ? 0 : side < 0 ? 1 : -1
  })

  // Kruskal, flattest edges first.
  const parent = Array.from({ length: F }, (_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const treeAdj: { edge: number; to: number }[][] = Array.from({ length: F }, () => [])
  edges
    .map((_, i) => i)
    .filter((i) => edges[i].faces.length === 2)
    .sort((x, y) => angle[x] - angle[y] || x - y)
    .forEach((i) => {
      const [f, g] = edges[i].faces
      const rf = find(f)
      const rg = find(g)
      if (rf === rg) return
      parent[rf] = rg
      treeAdj[f].push({ edge: i, to: g })
      treeAdj[g].push({ edge: i, to: f })
    })

  const tri2d: Tri2[] = new Array(F)
  const pieceOf = new Array<number>(F).fill(-1)
  const pieces: number[][] = []
  const joined = new Set<number>()

  const placeFirst = (f: number): Tri2 => {
    const [a, b, c] = mesh.faces[f]
    const ab = dist(P[a], P[b])
    const ac = dist(P[a], P[c])
    const bc = dist(P[b], P[c])
    const x = (ab * ab + ac * ac - bc * bc) / (2 * ab)
    return [[0, 0], [ab, 0], [x, Math.sqrt(Math.max(0, ac * ac - x * x))]]
  }

  /** Lays out face g across edge (u,v) of the already placed face f. */
  const placeAcross = (f: number, g: number, u: number, v: number): Tri2 => {
    const pos2 = (face: number, w: number) => tri2d[face][mesh.faces[face].indexOf(w)]
    const pu = pos2(f, u)
    const pv = pos2(f, v)
    const pf = pos2(f, third(mesh.faces[f], u, v))
    const L = dist(P[u], P[v])
    const w = third(mesh.faces[g], u, v)
    const du = dist(P[w], P[u])
    const dv = dist(P[w], P[v])
    const x = (L * L + du * du - dv * dv) / (2 * L)
    const y = Math.sqrt(Math.max(0, du * du - x * x))
    const ex = (pv[0] - pu[0]) / L
    const ey = (pv[1] - pu[1]) / L
    const s = (pf[0] - pu[0]) * -ey + (pf[1] - pu[1]) * ex > 0 ? -1 : 1
    const pw: Vec2 = [pu[0] + ex * x + -ey * s * y, pu[1] + ey * x + ex * s * y]
    return mesh.faces[g].map((q) => (q === u ? pu : q === v ? pv : pw)) as Tri2
  }

  const roots: number[] = []
  const grow = (root: number) => {
    const id = pieces.length
    const members = [root]
    const boxes: [number, number, number, number][] = []
    tri2d[root] = placeFirst(root)
    pieceOf[root] = id
    boxes.push(bbox(tri2d[root]))
    pieces.push(members)
    let extent = [...boxes[0]]
    for (let qi = 0; qi < members.length; qi++) {
      const f = members[qi]
      for (const { edge, to: g } of treeAdj[f]) {
        if (pieceOf[g] !== -1) continue
        const t = placeAcross(f, g, edges[edge].a, edges[edge].b)
        const bb = bbox(t)
        const clash = members.some((m, k) => {
          const o = boxes[k]
          return bb[0] < o[2] && o[0] < bb[2] && bb[1] < o[3] && o[1] < bb[3] && convexOverlap(t, tri2d[m])
        })
        const grown = [Math.min(extent[0], bb[0]), Math.min(extent[1], bb[1]), Math.max(extent[2], bb[2]), Math.max(extent[3], bb[3])]
        const w = grown[2] - grown[0]
        const h = grown[3] - grown[1]
        const tooBig = maxSize && !((w <= maxSize[0] && h <= maxSize[1]) || (w <= maxSize[1] && h <= maxSize[0]))
        if (clash || tooBig) {
          roots.push(g)
          continue
        }
        tri2d[g] = t
        pieceOf[g] = id
        members.push(g)
        boxes.push(bb)
        extent = grown
        joined.add(edge)
      }
    }
  }
  for (let s = 0; s < F; s++) {
    if (pieceOf[s] !== -1) continue
    roots.push(s)
    while (roots.length) {
      const r = roots.pop()!
      if (pieceOf[r] === -1) grow(r)
    }
  }

  const edgeKind: EdgeKind[] = edges.map((e, i) => (e.faces.length !== 2 ? 'boundary' : joined.has(i) ? 'fold' : 'cut'))
  let cutCount = 0
  const cutNumber = edgeKind.map((k) => (k === 'cut' ? ++cutCount : 0))
  return { mesh, topo, tri2d, pieceOf, pieces, edgeKind, angle, fold, cutNumber, cutCount }
}
