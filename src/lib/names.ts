/** Output names (SPEC.md section 8). */

/** The file's name without its last extension. */
export const stem = (name: string) => name.replace(/(?<=.)\.[^.]*$/, '')
