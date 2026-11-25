/** NovelAI (SPEC.md 6.3): PNG text chunks `Software` "NovelAI", `Source` (the model and its hash, 'NovelAI
 * Diffusion V5 0ADF9AB7'), `Description` (the prompt) and `Comment`, JSON with the settings. Its pictures
 * carry the same again as stealth metadata in the alpha channel. */
import { finding, json, rows, size, text, type Parser } from './finding'

export const novelai: Parser = (t) => {
  if (!/^NovelAI/i.test(t['png:software'] ?? '')) return null
  const c = json(t['png:comment']) ?? {}
  const [, sourceModel, sourceHash] = (t['png:source'] ?? '').match(/^(.*?)\s+([0-9A-F]{8})$/i) ?? []
  const characters = (
    (c.v4_prompt as { caption?: { char_captions?: { char_caption?: string }[] } })?.caption?.char_captions ?? []
  ).map((ch, i) => [`Character ${i + 1}`, ch.char_caption] as [string, unknown])
  const strength = /img2img/i.test(text(c.request_type) ?? '') && text(c.strength)
  const seconds = Number(t['png:generation_time'])
  return finding('NovelAI', 'the PNG text chunks “Software”, “Source” and “Comment”', {
    prompt: text(c.prompt) ?? text(t['png:description']),
    negative: text(c.uc),
    model: text(c.model_name) ?? sourceModel ?? text(t['png:source']),
    modelHash: text(c.model_hash) ?? sourceHash ?? null,
    seed: text(c.seed),
    sampler: text(c.sampler),
    steps: text(c.steps),
    cfg: text(c.scale),
    size: size(c.width, c.height),
    rest: rows([
      ...characters,
      ['Noise schedule', c.noise_schedule],
      ['CFG rescale', c.cfg_rescale || null],
      ['Image to image', strength && `Strength ${strength}`],
      ['Upscaled to', size(c.upscaled_width, c.upscaled_height)],
      ['Generation time', seconds > 0 ? `${seconds.toFixed(1)} s` : null],
    ]),
  })
}
