import { bbox, convexOverlap, minAreaAngle, polyArea, rotate, type Vec2 } from './geometry.ts'
import type { Unfolding } from './unfold.ts'

export type LineKind = 'cut' | 'mountain' | 'valley'
export interface Line { a: Vec2; b: Vec2; kind: LineKind }
export interface Label { at: Vec2; text: string; angle: number; size: number }
export interface Tab { edge: number; face: number; pts: Vec2[] }
export interface PlacedPiece {
  id: number
  faces: { face: number; pts: Vec2[] }[]
  tabs: Tab[]
  lines: Line[]
  labels: Label[]
  width: number
  height: number
}
export interface Page {
  width: number
  height: number
  pieces: PlacedPiece[]
}
export const PAPER = { A4: [210, 297], Letter: [215.9, 279.4] } as const
export type PaperId = keyof typeof PAPER

const sub2 = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]

/**
 * Puts a glue tab (trapezoid) on one side of every cut edge. The side is chosen so the tab does not
 * land on top of faces or tabs of its own piece when possible.
 */
export function placeTabs(u: Unfolding, tabMm: number): Tab[] {
  const tabs: Tab[] = []
  const placed: Vec2[][][] = u.pieces.map((faces) => faces.map((f) => u.tri2d[f]))
  u.topo.edges.forEach((e, ei) => {
    if (u.edgeKind[ei] !== 'cut' || tabMm <= 0) return
    const build = (face: number, h: number): Tab => {
      const tri = u.mesh.faces[face]
      const ia = tri.indexOf(e.a)
      const ib = tri.indexOf(e.b)
      const A = u.tri2d[face][ia]
      const B = u.tri2d[face][ib]
      const C = u.tri2d[face][3 - ia - ib]
      const L = Math.hypot(B[0] - A[0], B[1] - A[1])
      const d: Vec2 = [(B[0] - A[0]) / L, (B[1] - A[1]) / L]
      let n: Vec2 = [-d[1], d[0]]
      if ((C[0] - A[0]) * n[0] + (C[1] - A[1]) * n[1] > 0) n = [d[1], -d[0]]
      const inset = Math.min(h * 0.6, L * 0.3)
      const A2: Vec2 = [A[0] + d[0] * inset + n[0] * h, A[1] + d[1] * inset + n[1] * h]
      const B2: Vec2 = [B[0] - d[0] * inset + n[0] * h, B[1] - d[1] * inset + n[1] * h]
      return { edge: ei, face, pts: [A, B, B2, A2] }
    }
    const cands = [
      ...[tabMm, tabMm / 2].flatMap((h) => e.faces.map((f) => build(f, h))),
    ]
    const piece = (t: Tab) => u.pieceOf[t.face]
    const chosen = cands.find((t) => !placed[piece(t)].some((p) => convexOverlap(t.pts, p))) ?? cands[0]
    placed[piece(chosen)].push(chosen.pts)
    tabs.push(chosen)
  })
  return tabs
}

interface Local {
  faces: { face: number; pts: Vec2[] }[]
  tabs: Tab[]
  lines: Line[]
  labels: Label[]
}

function pieceGeometry(u: Unfolding, tabs: Tab[], p: number): Local {
  const { topo, tri2d } = u
  const faces = u.pieces[p].map((face) => ({ face, pts: tri2d[face] as Vec2[] }))
  const mine = tabs.filter((t) => u.pieceOf[t.face] === p)
  const tabOn = new Map(mine.map((t) => [`${t.edge}:${t.face}`, t]))
  const lines: Line[] = []
  const labels: Label[] = []
  for (const { face, pts } of faces) {
    const area = Math.abs(polyArea(pts))
    const perim = [0, 1, 2].reduce((s, i) => s + Math.hypot(...sub2(pts[(i + 1) % 3], pts[i])), 0)
    const inradius = (2 * area) / perim
    const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3
    const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3
    for (let i = 0; i < 3; i++) {
      const ei = topo.faceEdges[face][i]
      const kind = u.edgeKind[ei]
      const a = pts[i]
      const b = pts[(i + 1) % 3]
      if (kind === 'fold') {
        if (u.fold[ei] !== 0 && topo.edges[ei].faces[0] === face) lines.push({ a, b, kind: u.fold[ei] > 0 ? 'mountain' : 'valley' })
        continue
      }
      const tab = tabOn.get(`${ei}:${face}`)
      lines.push({ a, b, kind: tab ? 'valley' : 'cut' })
      if (tab) lines.push({ a: tab.pts[1], b: tab.pts[2], kind: 'cut' }, { a: tab.pts[2], b: tab.pts[3], kind: 'cut' }, { a: tab.pts[3], b: tab.pts[0], kind: 'cut' })
      if (kind === 'cut') {
        const L = Math.hypot(...sub2(b, a))
        const size = Math.max(1.2, Math.min(3, L * 0.3, inradius * 0.7))
        const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const inward = sub2([cx, cy], mid)
        const il = Math.hypot(...inward) || 1
        let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
        if (ang > 90) ang -= 180
        if (ang <= -90) ang += 180
        labels.push({
          at: [mid[0] + (inward[0] / il) * size * 0.9, mid[1] + (inward[1] / il) * size * 0.9],
          text: String(u.cutNumber[ei]),
          angle: ang,
          size,
        })
      }
    }
  }
  return { faces, tabs: mine, lines, labels }
}

function transform(l: Local, id: number, theta: number, dx: number, dy: number): PlacedPiece {
  const m = (q: Vec2): Vec2 => {
    const r = rotate(q, theta)
    return [r[0] + dx, r[1] + dy]
  }
  const deg = (theta * 180) / Math.PI
  const norm = (a: number) => {
    let x = a
    if (x > 90) x -= 180
    if (x <= -90) x += 180
    return x
  }
  return {
    id,
    faces: l.faces.map((f) => ({ face: f.face, pts: f.pts.map(m) })),
    tabs: l.tabs.map((t) => ({ ...t, pts: t.pts.map(m) })),
    lines: l.lines.map((s) => ({ ...s, a: m(s.a), b: m(s.b) })),
    labels: l.labels.map((t) => ({ ...t, at: m(t.at), angle: norm(t.angle + deg) })),
    width: 0,
    height: 0,
  }
}

export interface LayoutOptions {
  paper: PaperId
  margin: number
  gap: number
}

/** Rotates every piece to a tight bounding box and packs them onto pages with a shelf algorithm. */
export function layoutPages(u: Unfolding, tabs: Tab[], opt: LayoutOptions): { pages: Page[]; oversize: number } {
  const [PW, PH] = PAPER[opt.paper]
  const W = PW - 2 * opt.margin
  const H = PH - 2 * opt.margin
  const items = u.pieces.map((_, p) => {
    const local = pieceGeometry(u, tabs, p)
    const pts = [...local.faces.flatMap((f) => f.pts), ...local.tabs.flatMap((t) => t.pts)]
    const fits = (th: number) => {
      const [a, b, c, d] = bbox(pts.map((q) => rotate(q, th)))
      return c - a <= W && d - b <= H
    }
    // Tightest box first (wide side along the paper's width), then the unfolded frame as fallback.
    const best = minAreaAngle(pts)
    const [bx0, by0, bx1, by1] = bbox(pts.map((q) => rotate(q, best)))
    const wide = best + (bx1 - bx0 < by1 - by0 ? Math.PI / 2 : 0)
    const theta = [wide, wide + Math.PI / 2, 0, Math.PI / 2].find(fits) ?? wide
    const [x0, y0, x1, y1] = bbox(pts.map((q) => rotate(q, theta)))
    return { local, theta, x0, y0, w: x1 - x0, h: y1 - y0, id: p }
  })
  items.sort((a, b) => b.h - a.h)
  const pages: Page[] = []
  let oversize = 0
  let page: Page | null = null
  let x = 0
  let y = 0
  let shelf = 0
  const fresh = () => {
    page = { width: PW, height: PH, pieces: [] }
    pages.push(page)
    x = y = shelf = 0
  }
  for (const it of items) {
    if (it.w > W || it.h > H) {
      oversize++
      fresh()
      x = y = 0
      shelf = H
    } else {
      if (!page) fresh()
      if (x > 0 && x + it.w > W) {
        x = 0
        y += shelf + opt.gap
        shelf = 0
      }
      if (y + it.h > H) {
        fresh()
      }
    }
    const piece = transform(it.local, it.id, it.theta, opt.margin + x - it.x0, opt.margin + y - it.y0)
    piece.width = it.w
    piece.height = it.h
    page!.pieces.push(piece)
    x += it.w + opt.gap
    shelf = Math.max(shelf, it.h)
  }
  return { pages, oversize }
}
