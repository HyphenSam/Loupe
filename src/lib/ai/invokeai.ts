/** InvokeAI (SPEC.md 6.3), in each of its forms: the `invokeai_metadata` text chunk (JSON, InvokeAI 3 and
 * later, beside an `invokeai_graph`), and before it `sd-metadata` (JSON, 2.x) and `Dream` (a command line). */
import { chunk, finding, json, rows, size, text, type Parser } from './finding'

type Named = { name?: string; model_name?: string; hash?: string } | undefined
const named = (m: unknown) => text((m as Named)?.name ?? (m as Named)?.model_name)

function metadata(m: Record<string, unknown>) {
  const loras = Array.isArray(m.loras) ? (m.loras as { model?: Named; lora?: Named; weight?: unknown }[]) : []
  return finding('InvokeAI', chunk('invokeai_metadata'), {
    prompt: text(m.positive_prompt),
    negative: text(m.negative_prompt),
    model: named(m.model),
    modelHash: text((m.model as Named)?.hash),
    seed: text(m.seed),
    sampler: text(m.scheduler),
    steps: text(m.steps),
    cfg: text(m.cfg_scale),
    size: size(m.width, m.height),
    loras: loras.flatMap((l) => {
      const name = named(l.model ?? l.lora)
      return name ? [{ name, weight: text(l.weight) }] : []
    }),
    rest: rows([
      ['Mode', m.generation_mode],
      ['VAE', named(m.vae)],
      ['Version', m.app_version],
    ]),
  })
}

function sdMetadata(m: Record<string, unknown>) {
  const image = (m.image ?? {}) as Record<string, unknown>
  const prompt = Array.isArray(image.prompt)
    ? (image.prompt as { prompt?: string }[]).map((p) => p.prompt ?? '').join(' ')
    : image.prompt
  return finding('InvokeAI', chunk('sd-metadata'), {
    prompt: text(prompt),
    model: text(m.model_weights),
    modelHash: text(m.model_hash),
    seed: text(image.seed),
    sampler: text(image.sampler),
    steps: text(image.steps),
    cfg: text(image.cfg_scale),
    size: size(image.width, image.height),
    rest: rows([['Version', m.app_version]]),
  })
}

/** `"prompt" -s 50 -S 2980747362 -W 512 -H 768 -C 5 -A k_lms`. */
function dream(command: string) {
  const prompt = command.match(/^"((?:[^"\\]|\\.)*)"/)?.[1]
  if (prompt === undefined) return null
  const flag = (f: string) => command.match(new RegExp(`\\s-${f}\\s+(\\S+)`))?.[1] ?? null
  return finding('InvokeAI', chunk('Dream'), {
    prompt: text(prompt),
    seed: flag('S'),
    sampler: flag('A'),
    steps: flag('s'),
    cfg: flag('C'),
    size: size(flag('W'), flag('H')),
    rest: [{ label: 'Command', value: command }],
  })
}

export const invokeai: Parser = (t) => {
  const m = json(t['png:invokeai_metadata'])
  if (m) return metadata(m)
  const sd = json(t['png:sd-metadata'])
  if (sd) return sdMetadata(sd)
  return t['png:dream'] ? dream(t['png:dream']) : null
}
