import { buildPattern, type PatternOptions } from './lib/pipeline.ts'
import type { Mesh } from './lib/mesh.ts'

export interface WorkerRequest { mesh: Mesh; options: PatternOptions }

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    const { unfolding: _unfolding, ...pattern } = buildPattern(e.data.mesh, e.data.options)
    // The unfolding holds big derived tables the view does not need, so it stays in the worker.
    self.postMessage({ ok: true, pattern })
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
