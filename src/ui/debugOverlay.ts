import type { ProcessMetrics } from '../shared/ipc';

/** Small corner panel with FPS, CPU and RAM. Pure DOM, no input (the overlay stays click-through). */
export class DebugOverlay {
  private readonly el: HTMLDivElement;
  private metrics: ProcessMetrics | null = null;
  private extra: Record<string, string> = {};

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    Object.assign(this.el.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      padding: '6px 9px',
      font: '11px/1.45 ui-monospace, Consolas, monospace',
      color: '#e9fff6',
      background: 'rgba(20, 24, 32, 0.78)',
      borderRadius: '6px',
      pointerEvents: 'none',
      whiteSpace: 'pre',
      display: 'none',
      zIndex: '10',
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(this.el);
  }

  set visible(v: boolean) {
    this.el.style.display = v ? 'block' : 'none';
  }

  get visible(): boolean {
    return this.el.style.display !== 'none';
  }

  setMetrics(m: ProcessMetrics): void {
    this.metrics = m;
  }

  /** Extra key/value lines (behaviour state, mood…), set by other modules. */
  set(key: string, value: string): void {
    this.extra[key] = value;
  }

  render(fps: number, idle: boolean): void {
    if (!this.visible) return;
    const lines = [
      `FPS  ${fps.toFixed(0).padStart(3)}${idle ? '  (idle)' : ''}`,
      `CPU  ${this.metrics ? this.metrics.cpuPercent.toFixed(1).padStart(5) + ' %' : '   …'}`,
      `RAM  ${this.metrics ? this.metrics.memoryMB.toFixed(0).padStart(5) + ' MB' : '   …'}`,
      ...(this.metrics?.underCursor !== undefined
        ? [`win  under cursor: ${this.metrics.underCursor}, re-raised ${this.metrics.raised ?? 0}×`]
        : []),
      ...Object.entries(this.extra).map(([k, v]) => `${k.padEnd(4)} ${v}`),
    ];
    const text = lines.join('\n');
    if (this.el.textContent !== text) this.el.textContent = text;
  }
}
