/** Tiny DOM helpers for the lab's control panel. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.append(c);
  return node;
}

export function section(parent: HTMLElement, title: string, open = true): HTMLElement {
  const body = el('div', { className: 'section' });
  const d = el('details', { open }, [el('summary', { textContent: title }), body]);
  parent.append(d);
  return body;
}

export function slider(
  parent: HTMLElement,
  label: string,
  opts: { min: number; max: number; step?: number; value: number; testId?: string },
  onInput: (v: number) => void,
): { set(v: number): void; input: HTMLInputElement } {
  const input = el('input', {
    type: 'range',
    min: String(opts.min),
    max: String(opts.max),
    step: String(opts.step ?? 0.01),
    value: String(opts.value),
  });
  if (opts.testId) input.dataset.testid = opts.testId;
  const out = el('output', { textContent: opts.value.toFixed(2) });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = v.toFixed(2);
    onInput(v);
  });
  parent.append(el('div', { className: 'row' }, [el('label', { textContent: label }), input, out]));
  return {
    input,
    set(v: number) {
      input.value = String(v);
      out.textContent = v.toFixed(2);
    },
  };
}

export function select<T extends string>(
  parent: HTMLElement,
  label: string,
  options: readonly { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): HTMLSelectElement {
  const s = el(
    'select',
    {},
    options.map((o) => el('option', { value: o.value, textContent: o.label })),
  );
  s.value = value;
  s.addEventListener('change', () => onChange(s.value as T));
  parent.append(el('div', { className: 'row' }, [el('label', { textContent: label }), s]));
  return s;
}

export function buttons(
  parent: HTMLElement,
  items: readonly { label: string; onClick: (e: MouseEvent) => void; id?: string }[],
): HTMLButtonElement[] {
  const wrap = el('div', { className: 'buttons' });
  const made = items.map((it) => {
    const b = el('button', { type: 'button', textContent: it.label });
    if (it.id) b.dataset.id = it.id;
    b.addEventListener('click', it.onClick);
    wrap.append(b);
    return b;
  });
  parent.append(wrap);
  return made;
}

export function checkbox(
  parent: HTMLElement,
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void,
): HTMLInputElement {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  parent.append(el('label', {}, [input, label]));
  return input;
}

/** localStorage that never throws (private mode, disabled storage). */
export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};
