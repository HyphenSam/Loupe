/** ComfyUI (SPEC.md 6.3): the graph that ran, as `prompt` JSON (API format: node id → class_type and
 * inputs, where a link is `[node id, output]`), and the editor's `workflow` JSON. PNG keeps them in text
 * chunks of those names; WebP in EXIF Model (`prompt:{…}`) and Make (`workflow:{…}`), as ComfyUI's
 * `_create_webp_metadata` writes them.
 *
 * The settings are found by walking the graph back from the sampler: its prompts through the conditioning,
 * its model through LoRA loaders to the checkpoint, its latent to the empty latent's size. Custom samplers
 * take their settings from the nodes feeding them (noise, guider, sampler, sigmas). */
import { fromParameters } from './a1111'
import { chunk, finding, json, rows, size, text, type Lora, type Parser, type Texts } from './finding'

type Node = { class_type?: string; inputs?: Record<string, unknown> }
export type Graph = Record<string, Node>

const linkOf = (value: unknown): string | null =>
  Array.isArray(value) && value.length === 2 && typeof value[1] === 'number' ? String(value[0]) : null

/** Inputs whose strings are prompts, and inputs of primitive nodes that hold a value. */
const TEXT_INPUTS = ['text', 'text_g', 'prompt', 'string', 'value']
const PRIMITIVE_INPUTS = ['value', 'seed', 'noise_seed', 'int', 'float', 'number', 'string', 'text']
/** A custom sampler's inputs whose nodes hold its settings. */
const SETTING_INPUTS = ['noise', 'guider', 'sampler', 'sigmas']

function walker(graph: Graph) {
  const node = (id: string | null) => (id ? graph[id] : undefined)

  /** An input's value, following a link to a primitive node. */
  function value(n: Node | undefined, key: string): unknown {
    const v = n?.inputs?.[key]
    const link = linkOf(v)
    if (!link) return v
    const source = node(link)?.inputs ?? {}
    return PRIMITIVE_INPUTS.map((k) => source[k]).find((s) => s !== undefined && !linkOf(s))
  }

  /** The nearest node upstream of `start` (itself included) that `found` accepts, breadth first. */
  function upstream<T>(start: string | null, found: (n: Node) => T | null | undefined): T | null {
    const queue = start ? [start] : []
    const seen = new Set(queue)
    while (queue.length) {
      const n = node(queue.shift()!)
      if (!n) continue
      const result = found(n)
      if (result !== null && result !== undefined) return result
      for (const input of Object.values(n.inputs ?? {})) {
        const link = linkOf(input)
        if (link && !seen.has(link)) seen.add(link) && queue.push(link)
      }
    }
    return null
  }

  /** A setting from the sampler, or from the nodes feeding a custom sampler. */
  function setting(sampler: Node, ...keys: string[]): unknown {
    const feeding = SETTING_INPUTS.map((input) => node(linkOf(sampler.inputs?.[input])))
    for (const n of [sampler, ...feeding])
      for (const key of keys) if (n?.inputs?.[key] !== undefined) return value(n, key)
    return undefined
  }

  /** The prompt text behind a conditioning input, directly or through a guider. */
  function prompt(sampler: Node, side: 'positive' | 'negative'): string | null {
    // An empty prompt still ends the search, so it isn't taken from further up.
    const guider = node(linkOf(sampler.inputs?.guider))
    const start =
      linkOf(sampler.inputs?.[side]) ??
      linkOf(guider?.inputs?.[side]) ??
      (side === 'positive' ? linkOf(guider?.inputs?.conditioning) : null)
    return upstream(start, (n) => {
      for (const key of TEXT_INPUTS) {
        const v = value(n, key)
        if (typeof v === 'string' && n.inputs?.[key] !== undefined && /encode|prompt/i.test(n.class_type ?? ''))
          return text(v) ?? ''
      }
      return null
    })
  }

  /** The checkpoint behind the sampler's model, and the LoRAs on the way. */
  function model(sampler: Node): { name: string | null; loras: Lora[] } {
    const guider = node(linkOf(sampler.inputs?.guider))
    let id = linkOf(sampler.inputs?.model) ?? linkOf(guider?.inputs?.model)
    const loras: Lora[] = []
    for (let hops = 0; id && hops < 50; hops++) {
      const n = node(id)
      const inputs = n?.inputs ?? {}
      const name = text(inputs.ckpt_name) ?? text(inputs.unet_name)
      if (name) return { name, loras: loras.reverse() }
      const lora = text(inputs.lora_name)
      if (lora) loras.push({ name: lora, weight: text(inputs.strength_model ?? inputs.strength) })
      id = linkOf(inputs.model) ?? Object.values(inputs).map(linkOf).find(Boolean) ?? null
    }
    return { name: null, loras: loras.reverse() }
  }

  return { node, value, upstream, setting, prompt, model }
}

/** Sampler nodes: ones that take steps, prompts or a guider (not KSamplerSelect). */
const isSampler = (n: Node) =>
  /sampler/i.test(n.class_type ?? '') &&
  ['steps', 'positive', 'guider', 'sigmas'].some((input) => n.inputs?.[input] !== undefined)

/** How many nodes a workflow holds, counting the ones inside each subgraph where it's used. */
export function nodeCount(workflow: Record<string, unknown>): number {
  type Nodes = { type?: string }[]
  const definitions = (workflow.definitions as { subgraphs?: { id: string; nodes?: Nodes }[] } | undefined)?.subgraphs
  const subgraphs = new Map((definitions ?? []).map((s) => [s.id, s.nodes ?? []]))
  const count = (nodes: Nodes, depth: number): number =>
    nodes.reduce((sum, n) => {
      const inner = n.type && subgraphs.get(n.type)
      return sum + (inner && depth < 10 ? count(inner, depth + 1) : 1)
    }, 0)
  return count((workflow.nodes as Nodes | undefined) ?? [], 0)
}

/** The stored graph and workflow, and where they were. */
function stored(t: Texts): { prompt: string | null; workflow: string | null; where: string } | null {
  if (t['png:prompt'] || t['png:workflow']) {
    const names = ['prompt', 'workflow'].filter((k) => t[`png:${k}`])
    const where = names.length === 2 ? 'the PNG text chunks “prompt” and “workflow”' : chunk(names[0])
    return { prompt: t['png:prompt'] ?? null, workflow: t['png:workflow'] ?? null, where }
  }
  const exif = Object.entries(t).filter(([key]) => key.startsWith('exif:'))
  const prefixed = (name: string) =>
    exif.map(([, v]) => v.match(new RegExp(`^${name}:\\s*(\\{[\\s\\S]*)$`, 'i'))?.[1]).find(Boolean) ?? null
  const prompt = prefixed('prompt')
  const workflow = prefixed('workflow')
  return prompt || workflow ? { prompt, workflow, where: 'EXIF Model and Make (“prompt:” and “workflow:”)' } : null
}

/** The settings of one graph, as a finding named `name`. */
export function fromGraph(graph: Graph, name: string, where: string) {
  const w = walker(graph)
  // The first pass: full denoise before partial, then the most steps.
  const samplers = Object.values(graph)
    .filter(isSampler)
    .map((n) => ({ n, denoise: Number(w.setting(n, 'denoise') ?? 1), steps: Number(w.setting(n, 'steps') ?? 0) }))
    .sort((a, b) => b.denoise - a.denoise || b.steps - a.steps)
  const first = samplers[0]?.n
  if (!first) return finding(name, where)
  const { name: model, loras } = w.model(first)
  const latent = linkOf(first.inputs?.latent_image) ?? linkOf(first.inputs?.latent)
  const sized = w.upstream(latent, (n) => size(w.value(n, 'width'), w.value(n, 'height')))
  const guidance = w.upstream(linkOf(w.node(linkOf(first.inputs?.guider))?.inputs?.conditioning), (n) =>
    text(n.inputs?.guidance),
  )
  const vae = Object.values(graph)
    .map((n) => text(n.inputs?.vae_name))
    .find(Boolean)
  const denoise = text(w.setting(first, 'denoise'))
  const passes = samplers.slice(1).map(({ n }) => {
    const words = [
      text(w.setting(n, 'steps')) && `${text(w.setting(n, 'steps'))} steps`,
      text(w.setting(n, 'sampler_name')),
      text(w.setting(n, 'cfg')) && `CFG ${text(w.setting(n, 'cfg'))}`,
      text(w.setting(n, 'denoise')) && `denoise ${text(w.setting(n, 'denoise'))}`,
    ]
    return ['Another pass', words.filter(Boolean).join(', ')] as [string, string]
  })
  return finding(name, where, {
    prompt: w.prompt(first, 'positive') || null,
    negative: w.prompt(first, 'negative') || null,
    model,
    seed: text(w.setting(first, 'seed', 'noise_seed')),
    sampler: text(w.setting(first, 'sampler_name')),
    steps: text(w.setting(first, 'steps')),
    cfg: text(w.setting(first, 'cfg')),
    size: sized,
    loras,
    rest: rows([
      ['Scheduler', w.setting(first, 'scheduler')],
      ['Denoise', denoise === '1' ? null : denoise],
      ['Guidance', guidance],
      ['VAE', vae],
      ...passes,
    ]),
  })
}

export const comfyui: Parser = (t) => {
  const found = stored(t)
  if (!found) return null
  const graph = json(found.prompt ?? undefined) as Graph | null
  const workflow = json(found.workflow ?? undefined)
  if (!graph && !workflow) return null
  const saved = workflow
    ? { json: found.workflow!, nodes: nodeCount(workflow) }
    : { json: found.prompt!, nodes: Object.keys(graph!).length }
  // Saver nodes that also write A1111-style parameters say it more plainly than the graph does.
  const parameters = t['png:parameters'] && fromParameters(t['png:parameters'], found.where, 'ComfyUI')
  const settings = parameters || (graph ? fromGraph(graph, 'ComfyUI', found.where) : finding('ComfyUI', found.where))
  return { ...settings, workflow: saved }
}
