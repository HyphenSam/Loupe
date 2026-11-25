/** Draw Things (SPEC.md 6.3): JSON in XMP's `exif:UserComment`, with `xmp:CreatorTool` naming Draw Things.
 * Its keys are short: `c` the prompt, `uc` the negative prompt, `scale` the CFG scale. Not yet checked against
 * a real file (none was found); the keys are SD Prompt Reader's, which reads real ones. */
import { finding, json, rows, text, type Parser } from './finding'

export const drawthings: Parser = (t) => {
  if (!/Draw Things/i.test(t['xmp:creatortool'] ?? '')) return null
  const d = json(t['xmp:usercomment'])
  if (!d) return null
  const loras = [d.lora, d.loras].find(Array.isArray) as
    { file?: string; model?: string; weight?: unknown }[] | undefined
  return finding('Draw Things', 'XMP UserComment and CreatorTool', {
    prompt: text(d.c),
    negative: text(d.uc),
    model: text(d.model),
    seed: text(d.seed),
    sampler: text(d.sampler),
    steps: text(d.steps),
    cfg: text(d.scale),
    size: text(d.size)?.replace('x', ' × ') ?? null,
    loras: (loras ?? []).flatMap((l) => {
      const name = text(l.file ?? l.model)
      return name ? [{ name, weight: text(l.weight) }] : []
    }),
    rest: rows([
      ['Strength', d.strength],
      ['Shift', d.shift],
    ]),
  })
}
