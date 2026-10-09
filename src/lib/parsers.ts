import { cleanMesh, weldTriangles, type Mesh, type Tri, type Vec3 } from './mesh.ts'

export function parseOBJ(text: string): Mesh {
  const vertices: Vec3[] = []
  const faces: Tri[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim()
    if (!line) continue
    const t = line.split(/\s+/)
    if (t[0] === 'v') {
      const p = [Number(t[1]), Number(t[2]), Number(t[3])]
      if (p.some((x) => !Number.isFinite(x))) throw new Error(`Bad vertex: ${line}`)
      vertices.push(p as Vec3)
    } else if (t[0] === 'f') {
      const idx = t.slice(1).map((tok) => {
        const i = parseInt(tok.split('/')[0], 10)
        const r = i < 0 ? vertices.length + i : i - 1
        if (!Number.isInteger(r) || r < 0 || r >= vertices.length) throw new Error(`Bad face index: ${line}`)
        return r
      })
      if (idx.length < 3) throw new Error(`Face with fewer than 3 vertices: ${line}`)
      for (let i = 1; i + 1 < idx.length; i++) faces.push([idx[0], idx[i], idx[i + 1]])
    }
  }
  if (!faces.length) throw new Error('No faces found in OBJ file')
  return cleanMesh({ vertices, faces })
}

export function parseSTL(buf: ArrayBuffer): Mesh {
  const view = new DataView(buf)
  const tris: Vec3[][] = []
  const count = buf.byteLength >= 84 ? view.getUint32(80, true) : -1
  if (buf.byteLength === 84 + 50 * count) {
    for (let i = 0; i < count; i++) {
      const o = 84 + 50 * i + 12
      const t: Vec3[] = []
      for (let k = 0; k < 3; k++) {
        t.push([view.getFloat32(o + 12 * k, true), view.getFloat32(o + 12 * k + 4, true), view.getFloat32(o + 12 * k + 8, true)])
      }
      tris.push(t)
    }
  } else {
    const text = new TextDecoder().decode(buf)
    if (!/facet/i.test(text)) throw new Error('Not a valid STL file')
    const pts = [...text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])] as Vec3)
    if (pts.length % 3 || pts.some((p) => p.some((x) => !Number.isFinite(x)))) throw new Error('Malformed ASCII STL')
    for (let i = 0; i < pts.length; i += 3) tris.push(pts.slice(i, i + 3))
  }
  if (!tris.length) throw new Error('No triangles found in STL file')
  return cleanMesh(weldTriangles(tris))
}

/** Parses by file extension, falling back to sniffing the content. */
export function parseModel(name: string, buf: ArrayBuffer): Mesh {
  if (/\.obj$/i.test(name)) return parseOBJ(new TextDecoder().decode(buf))
  if (/\.stl$/i.test(name)) return parseSTL(buf)
  const head = new TextDecoder().decode(buf.slice(0, 2000))
  return /^\s*(v|f|#|o|g)\s/m.test(head) && !/facet/i.test(head) ? parseOBJ(new TextDecoder().decode(buf)) : parseSTL(buf)
}
