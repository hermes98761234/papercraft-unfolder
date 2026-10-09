import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ViewPattern } from '../usePattern.ts'
import { pieceColor } from '../lib/svg.ts'

interface Props {
  pattern: ViewPattern
  selected: number | null
  onSelect: (piece: number | null) => void
  /** Changes when the source model changes, to re-frame the camera. */
  resetKey: string
}

interface Handle {
  render: () => void
  setPattern: (p: ViewPattern, fit: boolean) => void
  setSelected: (s: number | null) => void
}

export default function SceneView({ pattern, selected, onSelect, resetKey }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<Handle | null>(null)
  const pick = useRef(onSelect)
  const last = useRef({ pattern, selected, resetKey })
  useEffect(() => {
    pick.current = onSelect
    last.current.pattern = pattern
    last.current.selected = selected
  })

  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 0.8))
    const sun = new THREE.DirectionalLight(0xffffff, 1.0)
    sun.position.set(2, 3, 4)
    camera.add(sun)
    scene.add(camera)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    const group = new THREE.Group()
    scene.add(group)
    let current: ViewPattern | null = null
    let faceColors: THREE.Color[] = []
    let colorAttr: THREE.BufferAttribute | null = null
    let meshObj: THREE.Mesh | null = null

    const render = () => renderer.render(scene, camera)
    controls.addEventListener('change', render)

    const paint = (sel: number | null) => {
      if (!current || !colorAttr) return
      const grey = new THREE.Color(0xb8bec8)
      current.pieceOfFace.forEach((p, f) => {
        const c = sel === null || sel === p ? faceColors[p].clone().multiplyScalar(sel === p ? 1.15 : 1) : faceColors[p].clone().lerp(grey, 0.75)
        for (let k = 0; k < 3; k++) colorAttr!.setXYZ(f * 3 + k, c.r, c.g, c.b)
      })
      colorAttr.needsUpdate = true
      render()
    }

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    const setPattern = (p: ViewPattern, fit: boolean) => {
      current = p
      for (const o of [...group.children]) {
        group.remove(o)
        ;(o as THREE.Mesh).geometry?.dispose()
      }
      const pos = new Float32Array(p.mesh.faces.length * 9)
      p.mesh.faces.forEach((t, f) => t.forEach((v, k) => pos.set(p.mesh.vertices[v], f * 9 + k * 3)))
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      colorAttr = new THREE.BufferAttribute(new Float32Array(pos.length), 3)
      geo.setAttribute('color', colorAttr)
      geo.computeVertexNormals()
      faceColors = Array.from({ length: p.stats.pieces }, (_, i) => new THREE.Color(pieceColor(i)))
      meshObj = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true }))
      group.add(meshObj)
      const seg = new Float32Array(p.cuts.length * 6)
      p.cuts.forEach((c, i) => seg.set([...c.a, ...c.b], i * 6))
      const lg = new THREE.BufferGeometry()
      lg.setAttribute('position', new THREE.BufferAttribute(seg, 3))
      group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x111111 })))
      if (fit) {
        const r = p.stats.sizeMm.reduce((a, b) => Math.max(a, b), 0) || 1
        camera.position.set(r * 1.0, r * 0.7, r * 1.45)
        controls.target.set(0, 0, 0)
        camera.far = r * 40
        camera.updateProjectionMatrix()
        controls.update()
      }
      paint(last.current.selected)
    }

    // A click selects the piece under the cursor; a drag orbits and must not select.
    const ray = new THREE.Raycaster()
    let down: [number, number] | null = null
    const dom = renderer.domElement
    dom.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]))
    dom.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || !meshObj || !current) return
      const r = dom.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = ray.intersectObject(meshObj)[0]
      pick.current(hit?.faceIndex != null ? current.pieceOfFace[hit.faceIndex] : null)
    })

    handle.current = { render, setPattern, setSelected: paint }
    setPattern(last.current.pattern, true)
    resize()
    return () => {
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      handle.current = null
    }
  }, [])

  useEffect(() => {
    const fit = last.current.resetKey !== resetKey
    last.current.resetKey = resetKey
    handle.current?.setPattern(pattern, fit)
  }, [pattern, resetKey])

  useEffect(() => handle.current?.setSelected(selected), [selected])

  return <div className="scene" ref={host} role="img" aria-label="3D view of the model, coloured by piece. Drag to rotate, click a piece to select it." />
}
