import { expect, it } from 'vitest'
import { meshArea } from './mesh.ts'
import { parseModel, parseOBJ, parseSTL } from './parsers.ts'

const CUBE_OBJ = `# unit cube with quads, comments and v/vt/vn indices
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 0 0 1
v 1 0 1
v 1 1 1
v 0 1 1
f 1/1/1 4/2/1 3/3/1 2/4/1
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`

it('parses OBJ with quads and fan-triangulates them', () => {
  const m = parseOBJ(CUBE_OBJ)
  expect(m.vertices).toHaveLength(8)
  expect(m.faces).toHaveLength(12)
  expect(meshArea(m)).toBeCloseTo(6)
})

it('supports negative OBJ indices', () => {
  const m = parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n')
  expect(m.faces).toEqual([[0, 1, 2]])
})

it('rejects bad OBJ input', () => {
  expect(() => parseOBJ('v 0 0 0\nf 1 2 3')).toThrow()
  expect(() => parseOBJ('v 0 0 0')).toThrow(/No faces/)
})

const ASCII_STL = `solid tet
facet normal 0 0 -1
 outer loop
  vertex 0 0 0
  vertex 0 1 0
  vertex 1 0 0
 endloop
endfacet
facet normal 0 -1 0
 outer loop
  vertex 0 0 0
  vertex 1 0 0
  vertex 0 0 1
 endloop
endfacet
facet normal -1 0 0
 outer loop
  vertex 0 0 0
  vertex 0 0 1
  vertex 0 1 0
 endloop
endfacet
facet normal 1 1 1
 outer loop
  vertex 1 0 0
  vertex 0 1 0
  vertex 0 0 1
 endloop
endfacet
endsolid tet
`

it('parses ASCII STL and welds shared vertices', () => {
  const m = parseSTL(new TextEncoder().encode(ASCII_STL).buffer as ArrayBuffer)
  expect(m.faces).toHaveLength(4)
  expect(m.vertices).toHaveLength(4)
  expect(meshArea(m)).toBeCloseTo(1.5 + Math.sqrt(3) / 2)
})

function binarySTL(tris: number[][]): ArrayBuffer {
  const buf = new ArrayBuffer(84 + 50 * tris.length)
  const v = new DataView(buf)
  new TextEncoder().encodeInto('solid fake header that looks like ascii', new Uint8Array(buf, 0, 80))
  v.setUint32(80, tris.length, true)
  tris.forEach((t, i) => t.forEach((x, k) => v.setFloat32(84 + 50 * i + 12 + 4 * k, x, true)))
  return buf
}

it('parses binary STL even when the header starts with "solid"', () => {
  const m = parseSTL(binarySTL([[0, 0, 0, 2, 0, 0, 0, 2, 0], [2, 0, 0, 2, 2, 0, 0, 2, 0]]))
  expect(m.faces).toHaveLength(2)
  expect(m.vertices).toHaveLength(4)
  expect(meshArea(m)).toBeCloseTo(4)
})

it('rejects garbage STL and sniffs formats', () => {
  expect(() => parseSTL(new TextEncoder().encode('hello').buffer as ArrayBuffer)).toThrow()
  expect(parseModel('x.txt', new TextEncoder().encode(CUBE_OBJ).buffer as ArrayBuffer).faces).toHaveLength(12)
  expect(parseModel('x.stl', new TextEncoder().encode(ASCII_STL).buffer as ArrayBuffer).faces).toHaveLength(4)
})
