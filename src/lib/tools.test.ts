import { describe, expect, it } from 'vitest'
import { GROUPS, TOOLS } from './tools'

describe('TOOLS', () => {
  it('lists the eleven tools in rail order, Inspect then Edit (SPEC.md section 6)', () => {
    expect(TOOLS.map((t) => t.label)).toEqual([
      'Info',
      'Location',
      'AI check',
      'Privacy',
      'Forensics',
      'Extract',
      'Edit metadata',
      'Crop and rotate',
      'Redact',
      'Adjust',
      'Export',
    ])
  })

  it('puts the read-only tools under Inspect and the ones that make a file under Edit', () => {
    expect(GROUPS.map((g) => g.label)).toEqual(['Inspect', 'Edit'])
    expect(TOOLS.filter((t) => t.group === 'inspect')).toHaveLength(6)
    expect(TOOLS.filter((t) => t.group === 'edit')).toHaveLength(5)
  })
})
