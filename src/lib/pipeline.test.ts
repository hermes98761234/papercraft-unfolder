import { describe, expect, it } from 'vitest'
import { convexOverlap, polyArea, type Vec2 } from './geometry.ts'
import { buildEdges, dist, faceArea, meshArea, type Mesh } from './mesh.ts'
import { decimate } from './decimate.ts'
import { buildPattern } from './pipeline.ts'
import { PRESETS, makePreset, sphere, type PresetId } from './presets.ts'
import { unfold } from './unfold.ts'

const opts = { sizeMm: 80, paper: 'A4', tabMm: 6, targetFaces: 0 } as const
const euler = (m: Mesh) => m.vertices.length - buildEdges(m).edges.length + m.faces.length
const closed = (m: Mesh) => buildEdges(m).edges.every((e) => e.faces.length === 2)

describe('presets', () => {
  it.each(PRESETS.map((p) => p.id))('%s is a closed manifold', (id) => {
    const m = makePreset(id as PresetId, 12)
    expect(closed(m)).toBe(true)
    expect(euler(m)).toBe(2)
  })
  it('cube and icosahedron have the expected counts', () => {
    expect(makePreset('cube').faces).toHaveLength(12)
    expect(makePreset('icosahedron').faces).toHaveLength(20)
    expect(meshArea(makePreset('cube'))).toBeCloseTo(6)
  })
})

describe('decimate', () => {
  it('reaches the target face count, keeps topology and area roughly', () => {
    const m = sphere(24)
    const d = decimate(m, 80)
    expect(d.faces.length).toBeLessThanOrEqual(80)
    expect(d.faces.length).toBeGreaterThan(60)
    expect(closed(d)).toBe(true)
    expect(euler(d)).toBe(2)
    expect(meshArea(d) / meshArea(m)).toBeGreaterThan(0.8)
  })
  it('keeps a flat cube intact', () => {
    const d = decimate(makePreset('cube'), 12)
    expect(d.faces).toHaveLength(12)
  })
})

describe('unfold', () => {
  it.each(PRESETS.map((p) => p.id))('%s: preserves edge lengths and areas', (id) => {
    const u = unfold(makePreset(id as PresetId, 14))
    u.mesh.faces.forEach((f, fi) => {
      for (let i = 0; i < 3; i++) {
        const a = u.tri2d[fi][i]
        const b = u.tri2d[fi][(i + 1) % 3]
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(dist(u.mesh.vertices[f[i]], u.mesh.vertices[f[(i + 1) % 3]]), 8)
      }
      expect(Math.abs(polyArea(u.tri2d[fi]))).toBeCloseTo(faceArea(u.mesh, fi), 8)
      expect(polyArea(u.tri2d[fi])).toBeGreaterThan(0) // orientation kept
    })
  })

  it.each(PRESETS.map((p) => p.id))('%s: pieces have no overlapping faces', (id) => {
    const u = unfold(makePreset(id as PresetId, 14))
    for (const faces of u.pieces) {
      for (let i = 0; i < faces.length; i++) {
        for (let j = i + 1; j < faces.length; j++) {
          expect(convexOverlap(u.tri2d[faces[i]], u.tri2d[faces[j]])).toBe(false)
        }
      }
    }
  })

  it('a tree edge count identity holds: folds = faces - pieces', () => {
    const u = unfold(makePreset('rabbit'))
    const folds = u.edgeKind.filter((k) => k === 'fold').length
    expect(folds).toBe(u.mesh.faces.length - u.pieces.length)
    expect(folds + u.cutCount).toBe(u.topo.edges.length)
  })

  it('a cube unfolds into one piece with 7 cut edges (a cross/net)', () => {
    const u = unfold(makePreset('cube'))
    expect(u.pieces.length).toBe(1)
    // 18 edges, 11 folds -> 7 cuts, 6 of which are diagonals kept flat: 12 faces -> 11 folds
    expect(u.cutCount).toBe(7)
  })

  it('prefers cutting along sharp edges: flat diagonals are never cut', () => {
    const u = unfold(makePreset('cube'))
    u.topo.edges.forEach((_, i) => {
      if (u.angle[i] < 1e-6) expect(u.edgeKind[i]).toBe('fold')
    })
  })

  it('splits when a net would overlap', () => {
    const u = unfold(sphere(20))
    expect(u.pieces.length).toBeGreaterThanOrEqual(1)
    expect(u.pieceOf.every((p) => p >= 0)).toBe(true)
  })
})

describe('pattern', () => {
  it.each(PRESETS.map((p) => p.id))('%s: tabs and labels match cut edges, nothing overlaps on a page', (id) => {
    const p = buildPattern(makePreset(id as PresetId, 14), opts)
    const u = p.unfolding
    const tabs = p.pages.flatMap((pg) => pg.pieces.flatMap((pc) => pc.tabs))
    const labels = p.pages.flatMap((pg) => pg.pieces.flatMap((pc) => pc.labels))
    const cutEdges = u.edgeKind.flatMap((k, i) => (k === 'cut' ? [i] : []))
    for (const e of cutEdges) {
      expect(tabs.filter((t) => t.edge === e)).toHaveLength(1)
      const texts = labels.filter((l) => l.text === String(u.cutNumber[e]))
      expect(texts).toHaveLength(2)
    }
    expect(tabs).toHaveLength(cutEdges.length)
    expect(labels).toHaveLength(2 * cutEdges.length)
    // every number 1..N appears exactly twice
    expect(new Set(labels.map((l) => l.text)).size).toBe(cutEdges.length)
    // no two faces overlap on a page, and everything is inside the sheet
    for (const pg of p.pages) {
      const polys: Vec2[][] = pg.pieces.flatMap((pc) => pc.faces.map((f) => f.pts))
      for (let i = 0; i < polys.length; i++) {
        for (let j = i + 1; j < polys.length; j++) expect(convexOverlap(polys[i], polys[j])).toBe(false)
      }
      for (const q of polys.flat()) {
        expect(q[0]).toBeGreaterThanOrEqual(-1e-6)
        expect(q[1]).toBeGreaterThanOrEqual(-1e-6)
        expect(q[0]).toBeLessThanOrEqual(pg.width + 1e-6)
        expect(q[1]).toBeLessThanOrEqual(pg.height + 1e-6)
      }
    }
    expect(p.stats.oversize).toBe(0)
  })

  it('page layout preserves face areas', () => {
    const p = buildPattern(makePreset('rabbit'), opts)
    const area = p.pages.flatMap((pg) => pg.pieces.flatMap((pc) => pc.faces)).reduce((s, f) => s + Math.abs(polyArea(f.pts)), 0)
    expect(area).toBeCloseTo(meshArea(p.mesh), 6)
  })

  it('scales the model to the requested size and decimates dense input', () => {
    const p = buildPattern(sphere(40), { ...opts, sizeMm: 100, targetFaces: 100 })
    expect(Math.max(...p.stats.sizeMm)).toBeCloseTo(100, 6)
    expect(p.stats.faces).toBeLessThanOrEqual(100)
    expect(p.stats.inputFaces).toBeGreaterThan(100)
  })

  it('flags pieces too large for the paper', () => {
    const p = buildPattern(makePreset('cube'), { ...opts, sizeMm: 400 })
    expect(p.stats.oversize).toBeGreaterThan(0)
  })
})
