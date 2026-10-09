import { expect, it } from 'vitest'
import { buildPattern } from './pipeline.ts'
import { makePreset } from './presets.ts'
import { allPagesSvg, pageSvg } from './svg.ts'

const p = buildPattern(makePreset('icosahedron'), { sizeMm: 60, paper: 'Letter', tabMm: 6, targetFaces: 0 })
const o = { fill: true, numbers: true, paper: 'Letter' as const, sizeMm: 60 }

it('renders one SVG per sheet in paper millimetres, with every piece and fold style', () => {
  const svg = pageSvg(p.pages[0], 0, { ...o, selected: 0, pageCount: p.pages.length })
  expect(svg).toContain('width="215.9mm"')
  expect(svg.match(/data-piece=/g)).toHaveLength(p.pages[0].pieces.length)
  expect(svg).toContain('class="piece selected"')
  expect(svg).toContain('stroke-dasharray')
})

it('stacks all sheets into one document', () => {
  const all = allPagesSvg(p.pages, o)
  expect(all.match(/<svg /g)).toHaveLength(p.pages.length + 1)
})
