/** Tensor.Art, found in a real picture though not in SPEC.md's first table: its own `generation_data` text
 * chunk (JSON) beside the ComfyUI `prompt` graph it ran. Its JSON names the model as the site lists it; the
 * graph holds the seed that ran when the JSON says -1 (random). */
import { fromGraph, type Graph } from './comfyui'
import { finding, json, rows, size, text, type Parser } from './finding'

type Model = { modelFileName?: string; hash?: string; weight?: unknown; type?: string }

export const tensorart: Parser = (t) => {
  const d = json(t['png:generation_data'])
  if (!d) return null
  const graph = json(t['png:prompt']) as Graph | null
  const where = `the PNG text chunks “generation_data”${graph ? ' and “prompt”' : ''}`
  const ran = graph ? fromGraph(graph, 'Tensor.Art', where) : finding('Tensor.Art', where)
  const base = (d.baseModel ?? {}) as Model
  const models = Array.isArray(d.models) ? (d.models as Model[]) : []
  const seed = text(d.seed)
  return {
    ...ran,
    prompt: text(d.prompt) ?? ran.prompt,
    negative: text(d.negativePrompt) ?? ran.negative,
    model: text(base.modelFileName) ?? ran.model,
    modelHash: text(base.hash),
    seed: seed && seed !== '-1' ? seed : ran.seed,
    sampler: text(d.ksamplerName) ?? ran.sampler,
    steps: text(d.steps) ?? ran.steps,
    cfg: text(d.cfgScale) ?? ran.cfg,
    size: size(d.width, d.height) ?? ran.size,
    loras: models
      .filter((m) => /lora/i.test(m.type ?? ''))
      .flatMap((m) => (text(m.modelFileName) ? [{ name: text(m.modelFileName)!, weight: text(m.weight) }] : [])),
    rest: rows([
      ['Scheduler', d.schedule],
      ['Clip skip', d.clipSkip],
      ['VAE', d.sdVae],
    ]),
    workflow: graph ? { json: t['png:prompt'], nodes: Object.keys(graph).length } : null,
  }
}
