import { decimate } from './decimate.ts'
import { PAPER, layoutPages, placeTabs, type Page, type PaperId } from './layout.ts'
import { bounds, cleanMesh, scaleToSize, type Mesh, type Vec3 } from './mesh.ts'
import { unfold, type Unfolding } from './unfold.ts'

export interface PatternOptions {
  /** Longest side of the finished model, mm. */
  sizeMm: number
  paper: PaperId
  tabMm: number
  /** Decimate to at most this many faces; 0 keeps the mesh as is. */
  targetFaces: number
}

export interface Pattern {
  mesh: Mesh
  unfolding: Unfolding
  pages: Page[]
  pieceOfFace: number[]
  cuts: { a: Vec3; b: Vec3; n: number }[]
  stats: {
    inputFaces: number
    faces: number
    pieces: number
    cutEdges: number
    foldEdges: number
    pages: number
    oversize: number
    sizeMm: [number, number, number]
  }
}

export const MARGIN = 10
export const GAP = 3

export function buildPattern(input: Mesh, opt: PatternOptions): Pattern {
  let mesh = cleanMesh(input)
  const inputFaces = mesh.faces.length
  if (opt.targetFaces > 0 && inputFaces > opt.targetFaces) mesh = decimate(mesh, opt.targetFaces)
  mesh = scaleToSize(mesh, opt.sizeMm)
  // Leave room for glue tabs on every side so a whole piece always fits on a sheet.
  const [pw, ph] = PAPER[opt.paper]
  const unfolding = unfold(mesh, [pw - 2 * MARGIN - 2 * opt.tabMm, ph - 2 * MARGIN - 2 * opt.tabMm])
  const tabs = placeTabs(unfolding, opt.tabMm)
  const { pages, oversize } = layoutPages(unfolding, tabs, { paper: opt.paper, margin: MARGIN, gap: GAP })
  const { min, max } = bounds(mesh)
  const cuts = unfolding.topo.edges.flatMap((e, i) =>
    unfolding.edgeKind[i] === 'cut' ? [{ a: mesh.vertices[e.a], b: mesh.vertices[e.b], n: unfolding.cutNumber[i] }] : [],
  )
  return {
    mesh,
    unfolding,
    pages,
    pieceOfFace: unfolding.pieceOf,
    cuts,
    stats: {
      inputFaces,
      faces: mesh.faces.length,
      pieces: unfolding.pieces.length,
      cutEdges: unfolding.cutCount,
      foldEdges: unfolding.edgeKind.filter((k) => k === 'fold').length,
      pages: pages.length,
      oversize,
      sizeMm: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    },
  }
}
