/**
 * The focus trap of the modal panels.
 *
 * The app has three modal surfaces: the dialogs of the forms, the drawer of
 * the navigation and the sheet of the inspector. They share **one** trap:
 * the rules of a modal are the same for the three of them, and a second
 * implementation would be a second thing to get wrong.
 *
 * A native `<dialog>` opened with `showModal()` traps the focus by itself —
 * but jsdom does not implement `showModal()`, and the drawer and the sheet
 * are not native dialogs at all: they are ordinary elements over the
 * content. The trap therefore lives here, and the dialogs use it for their
 * fallback path.
 */

/** The controls a keyboard user can reach. */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

/**
 * The reachable controls of a panel.
 *
 * A control that is inside a hidden subtree is not reachable: the `hidden`
 * attribute hides it from the keyboard and from the reader.
 */
export function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('hidden') && element.closest('[hidden]') === null
  );
}

/**
 * Moves the focus to the first control of a panel.
 *
 * A control may ask for the focus explicitly (`data-autofocus`): the first
 * field of a form is more useful than the close button.
 */
export function focusFirstControl(root: HTMLElement): void {
  const preferred = root.querySelector<HTMLElement>('[data-autofocus]');
  const focusable = focusableElements(root);

  (preferred ?? focusable[0] ?? root).focus();
}

/**
 * Keeps the focus inside a panel when the user presses <kbd>Tab</kbd>.
 *
 * The focus goes to the last control when the user goes back from the first
 * one, and to the first one when the user goes forward from the last. The
 * panel itself takes the focus when it holds no control at all.
 */
export function trapTabKey(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== 'Tab') {
    return;
  }

  const focusable = focusableElements(root);

  if (focusable.length === 0) {
    event.preventDefault();
    root.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || active === root)) {
    event.preventDefault();
    first.focus();
  }
}
