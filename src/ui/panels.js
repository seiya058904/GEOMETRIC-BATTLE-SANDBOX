/** CSS owns layout breakpoints; interactions read the resolved layout tokens. */
export class Panels {
  constructor(root) {
    this.root = root;
    this.active = null;
    this.trigger = null;
    this.inertNodes = [];
    document.addEventListener('keydown', event => this.key(event), true);
    this.layout = `${this.compact}/${this.modalInspector}`;
    window.addEventListener('resize', () => {
      const layout = `${this.compact}/${this.modalInspector}`;
      if (layout !== this.layout) { this.close(); this.layout = layout; }
    });
  }
  get compact() { return getComputedStyle(this.root).getPropertyValue('--compact-layout').trim() === '1'; }
  get modalInspector() { return getComputedStyle(this.root).getPropertyValue('--modal-inspector').trim() === '1'; }
  close(restoreFocus = true) {
    const wasOpen = this.active;
    for (const id of ['catalog', 'inspector']) {
      const panel = document.getElementById(id);
      panel.classList.remove('open');
      panel.removeAttribute('aria-modal');
      panel.removeAttribute('role');
    }
    for (const node of this.inertNodes) node.inert = false;
    this.inertNodes = [];
    this.root.classList.add('inspector-hidden');
    document.getElementById('drawer-backdrop').hidden = true;
    for (const trigger of this.root.querySelectorAll('[aria-controls="catalog"],[aria-controls="inspector"]')) trigger.setAttribute('aria-expanded', 'false');
    this.active = null;
    if (wasOpen && restoreFocus) {
      const target = this.trigger?.isConnected && this.trigger.getClientRects().length && !this.trigger.disabled ? this.trigger : document.getElementById('battlefield');
      target.focus({ preventScroll: true });
    }
    this.trigger = null;
  }
  open(id) {
    const trigger = document.activeElement;
    this.close(false);
    const panel = document.getElementById(id);
    if (id === 'catalog' && !this.compact) return;
    const modal = id === 'catalog' || this.modalInspector;
    this.root.classList.toggle('inspector-hidden', id !== 'inspector');
    panel.classList.add('open');
    this.active = panel;
    this.trigger = trigger;
    for (const button of this.root.querySelectorAll(`[aria-controls="${id}"]`)) button.setAttribute('aria-expanded', 'true');
    if (modal) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      document.getElementById('drawer-backdrop').hidden = false;
      this.inertNodes = [...this.root.querySelectorAll('.topbar,.bottom-bar,.arena'), document.getElementById(id === 'catalog' ? 'inspector' : 'catalog')].filter(node => !node.inert);
      for (const node of this.inertNodes) node.inert = true;
      (id === 'catalog' ? panel.querySelector('#unit-search') : panel.querySelector('button')).focus({ preventScroll: true });
    }
  }
  key(event) {
    if (!this.active || this.active.getAttribute('aria-modal') !== 'true' || document.getElementById('dialog').open) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); this.close(); return;
    }
    if (event.key !== 'Tab') return;
    const items = [...this.active.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(node => node.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (!first) return;
    if (!this.active.contains(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  }
}
