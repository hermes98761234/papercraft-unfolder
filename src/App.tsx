import { useEffect, useMemo, useState } from 'react'
import SceneView from './components/SceneView.tsx'
import { PAPER, type PaperId } from './lib/layout.ts'
import type { Mesh } from './lib/mesh.ts'
import { parseModel } from './lib/parsers.ts'
import { PRESETS, makePreset, type PresetId } from './lib/presets.ts'
import { allPagesSvg, pageSvg, pieceColor } from './lib/svg.ts'
import { usePattern } from './usePattern.ts'

interface Settings {
  preset: PresetId
  res: number
  decimate: boolean
  targetFaces: number
  sizeMm: number
  paper: PaperId
  tabMm: number
  fill: boolean
  numbers: boolean
}
const DEFAULTS: Settings = { preset: 'rabbit', res: 16, decimate: true, targetFaces: 160, sizeMm: 120, paper: 'A4', tabMm: 6, fill: true, numbers: true }
const KEY = 'papercraft-unfolder:v1'

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

function download(name: string, data: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo))

export default function App() {
  const [s, setS] = useState<Settings>(load)
  const [file, setFile] = useState<{ name: string; mesh: Mesh } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((o) => ({ ...o, [k]: v }))

  useEffect(() => localStorage.setItem(KEY, JSON.stringify(s)), [s])

  const preset = PRESETS.find((p) => p.id === s.preset)!
  const mesh = useMemo(() => file?.mesh ?? makePreset(s.preset, s.res), [file, s.preset, s.res])
  const options = useMemo(
    () => ({ sizeMm: s.sizeMm, paper: s.paper, tabMm: s.tabMm, targetFaces: s.decimate ? s.targetFaces : 0 }),
    [s.sizeMm, s.paper, s.tabMm, s.decimate, s.targetFaces],
  )
  const { pattern, error, busy } = usePattern(mesh, options)
  const sourceKey = file ? `file:${file.name}` : `${s.preset}:${s.res}`
  useEffect(() => setSelected(null), [sourceKey, options.targetFaces, s.sizeMm, s.paper, s.tabMm])

  const svgOpts = { fill: s.fill, numbers: s.numbers, paper: s.paper, sizeMm: s.sizeMm }
  const pageSvgs = useMemo(
    () => pattern?.pages.map((p, i) => pageSvg(p, i, { ...svgOpts, selected, pageCount: pattern.pages.length })) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pattern, selected, s.fill, s.numbers, s.paper, s.sizeMm],
  )

  async function onFile(f: File | undefined) {
    if (!f) return
    try {
      const m = parseModel(f.name, await f.arrayBuffer())
      setFileError(null)
      setFile({ name: f.name, mesh: m })
      if (m.faces.length > 600) setS((o) => ({ ...o, decimate: true, targetFaces: Math.min(o.targetFaces, 400) }))
    } catch (e) {
      setFileError(e instanceof Error ? e.message : String(e))
    }
  }

  const pickPiece = (e: React.MouseEvent) => {
    const g = (e.target as Element).closest('[data-piece]')
    setSelected(g ? Number((g as HTMLElement).dataset.piece) : null)
  }
  const [pw, ph] = PAPER[s.paper]

  return (
    <div className="app">
      <style>{`@page{size:${pw}mm ${ph}mm;margin:0}`}</style>
      <header>
        <h1>Papercraft Unfolder</h1>
        <p>Turn a 3D model into a printable paper pattern with glue tabs, numbered edges and fold lines.</p>
      </header>

      <aside className="controls">
        <section>
          <h2>Model</h2>
          <label>
            Preset
            <select value={file ? '' : s.preset} onChange={(e) => { setFile(null); set('preset', e.target.value as PresetId) }}>
              {file && <option value="">{file.name}</option>}
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {!file && preset.resolution && (
            <label>
              Resolution: {s.res}
              <input type="range" min={preset.resolution[0]} max={preset.resolution[1]} value={clamp(s.res, preset.resolution[0], preset.resolution[1])} onChange={(e) => set('res', +e.target.value)} />
            </label>
          )}
          <label className="file">
            Or load an OBJ / STL file
            <input type="file" accept=".obj,.stl" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {fileError && <p className="error" role="alert">{fileError}</p>}
        </section>

        <section>
          <h2>Simplify</h2>
          <label className="check">
            <input type="checkbox" checked={s.decimate} onChange={(e) => set('decimate', e.target.checked)} />
            Reduce faces (quadric edge collapse)
          </label>
          {s.decimate && (
            <label>
              Target faces: {s.targetFaces}
              <input type="range" min={8} max={1500} step={2} value={s.targetFaces} onChange={(e) => set('targetFaces', +e.target.value)} />
            </label>
          )}
        </section>

        <section>
          <h2>Paper</h2>
          <div className="row">
            <label>
              Sheet
              <select value={s.paper} onChange={(e) => set('paper', e.target.value as PaperId)}>
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </label>
            <label>
              Model size, mm
              <input type="number" min={10} max={1000} value={s.sizeMm} onChange={(e) => set('sizeMm', clamp(+e.target.value, 10, 1000))} />
            </label>
            <label>
              Tab, mm
              <input type="number" min={3} max={15} step={0.5} value={s.tabMm} onChange={(e) => set('tabMm', clamp(+e.target.value, 3, 15))} />
            </label>
          </div>
          <label className="check"><input type="checkbox" checked={s.fill} onChange={(e) => set('fill', e.target.checked)} /> Colour pieces</label>
          <label className="check"><input type="checkbox" checked={s.numbers} onChange={(e) => set('numbers', e.target.checked)} /> Edge numbers and piece names</label>
        </section>

        {pattern && (
          <section>
            <h2>Result</h2>
            <dl className="stats">
              <dt>Faces</dt><dd>{pattern.stats.faces}{pattern.stats.faces !== pattern.stats.inputFaces && ` (from ${pattern.stats.inputFaces})`}</dd>
              <dt>Pieces</dt><dd>{pattern.stats.pieces}</dd>
              <dt>Glued edges</dt><dd>{pattern.stats.cutEdges}</dd>
              <dt>Folds</dt><dd>{pattern.stats.foldEdges}</dd>
              <dt>Sheets</dt><dd>{pattern.stats.pages}</dd>
              <dt>Size, mm</dt><dd>{pattern.stats.sizeMm.map((x) => Math.round(x * 10) / 10).join(' × ')}</dd>
            </dl>
            {pattern.stats.oversize > 0 && <p className="error">{pattern.stats.oversize} piece(s) are larger than the sheet. Reduce the model size or simplify the mesh.</p>}
          </section>
        )}
      </aside>

      <main>
        <section className="view">
          <div className="viewhead">
            <h2>3D model</h2>
            <span className="hint">{busy ? 'Working…' : 'Drag to rotate. Click a piece to highlight it.'}</span>
          </div>
          {pattern ? <SceneView pattern={pattern} selected={selected} onSelect={setSelected} resetKey={sourceKey} /> : <div className="scene" />}
          {error && <p className="error" role="alert">{error}</p>}
          {pattern && (
            <ul className="chips" aria-label="Pieces">
              {Array.from({ length: pattern.stats.pieces }, (_, i) => (
                <li key={i}>
                  <button className={selected === i ? 'on' : ''} onClick={() => setSelected(selected === i ? null : i)} aria-pressed={selected === i}>
                    <i style={{ background: pieceColor(i) }} />P{i + 1}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="sheets">
          <div className="viewhead noprint">
            <h2>Pattern {pattern && `· ${pattern.pages.length} sheet${pattern.pages.length === 1 ? '' : 's'}`}</h2>
            <div className="actions">
              <button disabled={!pattern} onClick={() => pattern && download('papercraft-all-sheets.svg', allPagesSvg(pattern.pages, svgOpts), 'image/svg+xml')}>Export SVG</button>
              <button className="primary" disabled={!pattern} onClick={() => window.print()}>Print / PDF</button>
            </div>
          </div>
          <div className="pages" onClick={pickPiece}>
            {pageSvgs.map((svg, i) => (
              <figure key={i} className="page" style={{ aspectRatio: `${pw} / ${ph}`, ["--pw" as string]: `${pw}mm` }}>
                <div className="svg" dangerouslySetInnerHTML={{ __html: svg }} />
                <figcaption className="noprint">
                  Sheet {i + 1}
                  <button onClick={(e) => { e.stopPropagation(); download(`papercraft-sheet-${i + 1}.svg`, svg.replace(/class="piece selected"/g, 'class="piece"'), 'image/svg+xml') }}>SVG</button>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="note noprint">
            Print at 100% scale (no "fit to page"). Score the dashed lines, fold mountain folds away from you and valley folds toward you, then glue each tab under the edge with the same number.
          </p>
        </section>
      </main>
      <footer className="noprint">MIT licensed. Everything runs in your browser; your model never leaves it.</footer>
    </div>
  )
}
