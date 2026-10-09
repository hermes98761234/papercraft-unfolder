import type { Page, LineKind, PaperId } from './layout.ts'
import type { Vec2 } from './geometry.ts'

export const pieceColor = (i: number) => `hsl(${Math.round((i * 137.508) % 360)}, 65%, 55%)`

export interface SvgOptions {
  fill: boolean
  numbers: boolean
  selected: number | null
  paper: PaperId
  sizeMm: number
  pageCount: number
}

const STYLE: Record<LineKind, string> = {
  cut: 'stroke="#111" stroke-width="0.3"',
  mountain: 'stroke="#d62828" stroke-width="0.25" stroke-dasharray="2.4 0.8 0.6 0.8"',
  valley: 'stroke="#1d4ed8" stroke-width="0.25" stroke-dasharray="1.6 1"',
}

const f = (n: number) => String(Math.round(n * 100) / 100)
const pts = (p: Vec2[]) => p.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')

/** One sheet as a standalone SVG sized in millimetres. `index` is zero-based. */
export function pageSvg(page: Page, index: number, o: SvgOptions): string {
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${page.width} ${page.height}" font-family="Helvetica, Arial, sans-serif">`,
    `<rect width="${page.width}" height="${page.height}" fill="#fff"/>`,
  ]
  for (const pc of page.pieces) {
    const sel = o.selected === pc.id
    out.push(`<g class="piece${sel ? ' selected' : ''}" data-piece="${pc.id}">`)
    for (const fc of pc.faces) {
      const fill = o.fill ? pieceColor(pc.id) : '#fff'
      out.push(`<polygon points="${pts(fc.pts)}" fill="${fill}" fill-opacity="${sel ? 0.6 : o.fill ? 0.25 : 0.01}" stroke="none"/>`)
    }
    for (const t of pc.tabs) out.push(`<polygon points="${pts(t.pts)}" fill="#999" fill-opacity="0.18" stroke="none"/>`)
    for (const l of pc.lines) out.push(`<line x1="${f(l.a[0])}" y1="${f(l.a[1])}" x2="${f(l.b[0])}" y2="${f(l.b[1])}" ${STYLE[l.kind]} stroke-linecap="round"/>`)
    if (o.numbers) {
      for (const t of pc.labels) {
        out.push(`<text x="${f(t.at[0])}" y="${f(t.at[1])}" font-size="${f(t.size)}" text-anchor="middle" dominant-baseline="central" transform="rotate(${f(t.angle)} ${f(t.at[0])} ${f(t.at[1])})" fill="#111">${t.text}</text>`)
      }
      const big = pc.faces.reduce((a, b) => (Math.abs(area(b.pts)) > Math.abs(area(a.pts)) ? b : a))
      const cx = (big.pts[0][0] + big.pts[1][0] + big.pts[2][0]) / 3
      const cy = (big.pts[0][1] + big.pts[1][1] + big.pts[2][1]) / 3
      out.push(`<text x="${f(cx)}" y="${f(cy)}" font-size="4" font-weight="bold" text-anchor="middle" dominant-baseline="central" fill="#555" fill-opacity="0.7">P${pc.id + 1}</text>`)
    }
    out.push('</g>')
  }
  // Footer: legend and page number, inside the bottom margin.
  const y = page.height - 5
  const leg = (x: number, kind: LineKind, label: string) =>
    `<line x1="${x}" y1="${y}" x2="${x + 10}" y2="${y}" ${STYLE[kind]}/><text x="${x + 12}" y="${y}" font-size="2.6" dominant-baseline="central" fill="#333">${label}</text>`
  out.push(
    leg(10, 'cut', 'cut'),
    leg(32, 'mountain', 'mountain fold'),
    leg(68, 'valley', 'valley fold / tab'),
    `<text x="${page.width - 10}" y="${y}" font-size="2.6" text-anchor="end" dominant-baseline="central" fill="#333">Page ${index + 1}/${o.pageCount} · ${o.paper} · model ${o.sizeMm} mm · glue tab to the matching number</text>`,
    '</svg>',
  )
  return out.join('')
}

function area(p: Vec2[]) {
  return ((p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1])) / 2
}

/** All sheets stacked vertically in one SVG file. */
export function allPagesSvg(pages: Page[], o: Omit<SvgOptions, 'selected' | 'pageCount'>): string {
  const gap = 10
  const w = Math.max(...pages.map((p) => p.width))
  const h = pages.reduce((s, p) => s + p.height + gap, -gap)
  let y = 0
  const body = pages.map((p, i) => {
    const inner = pageSvg(p, i, { ...o, selected: null, pageCount: pages.length }).replace('<svg ', `<svg x="0" y="${y}" `)
    y += p.height + gap
    return inner
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#bbb"/>${body.join('')}</svg>`
}
