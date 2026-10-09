import { useEffect, useState } from 'react'
import type { Mesh } from './lib/mesh.ts'
import type { Pattern, PatternOptions } from './lib/pipeline.ts'
import type { WorkerRequest } from './pattern.worker.ts'

export type ViewPattern = Omit<Pattern, 'unfolding'>
type Reply = { ok: true; pattern: ViewPattern } | { ok: false; error: string }

/** Builds the pattern in a Web Worker; a newer request terminates the older one. */
export function usePattern(mesh: Mesh, options: PatternOptions) {
  const [state, setState] = useState<{ pattern: ViewPattern | null; error: string | null; done: unknown }>({ pattern: null, error: null, done: null })
  const key = JSON.stringify(options)
  useEffect(() => {
    let worker: Worker | null = null
    const timer = setTimeout(() => {
      worker = new Worker(new URL('./pattern.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<Reply>) => {
        setState(e.data.ok ? { pattern: e.data.pattern, error: null, done: [mesh, key] } : (s) => ({ ...s, error: e.data.ok ? null : e.data.error, done: [mesh, key] }))
        worker?.terminate()
      }
      worker.onerror = () => setState((s) => ({ ...s, error: 'The worker failed.', done: [mesh, key] }))
      worker.postMessage({ mesh, options: JSON.parse(key) } satisfies WorkerRequest)
    }, 120)
    return () => {
      clearTimeout(timer)
      worker?.terminate()
    }
  }, [mesh, key])
  const d = state.done as [Mesh, string] | null
  return { pattern: state.pattern, error: state.error, busy: !d || d[0] !== mesh || d[1] !== key }
}
