/** Keyboard shortcuts never fire while focus is in a text field (SPEC.md section 5). */

/** Whether a key press comes from somewhere typing happens, where shortcuts must not fire. */
export const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['TEXTAREA', 'SELECT'].includes(target.tagName) ||
    (target instanceof HTMLInputElement && !NOT_TYPED.includes(target.type)))

/** Inputs that take no typing, where shortcuts still work. */
const NOT_TYPED = ['file', 'checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'image']
