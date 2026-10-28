// jsdom no implementa showModal/close: polyfill solo para los tests (docs/PLAN.md §6).
type Dlg = HTMLDialogElement & { __win: Window };

export function polyfillDialog(win: Window): void {
  const proto = (win as unknown as { HTMLDialogElement: { prototype: Record<string, unknown> } }).HTMLDialogElement.prototype;
  proto.showModal = function (this: Dlg) {
    if (this.open) throw new DOMException('ya abierto', 'InvalidStateError');
    this.setAttribute('open', '');
  };
  proto.close = function (this: Dlg) {
    if (!this.open) return;
    this.removeAttribute('open');
    this.dispatchEvent(new (win as unknown as typeof globalThis).Event('close'));
  };
}

/** Lo que hace el navegador con Escape: evento `cancel` y, si nadie lo impide, cierre. */
export function pressEscape(win: Window, dialog: HTMLDialogElement): void {
  const ev = new (win as unknown as typeof globalThis).Event('cancel', { cancelable: true });
  dialog.dispatchEvent(ev);
  if (!ev.defaultPrevented) dialog.close();
}
