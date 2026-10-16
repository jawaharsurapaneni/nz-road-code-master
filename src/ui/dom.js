// Minimal DOM helpers.
//
// Everything user-visible is written with textContent, never innerHTML, so no
// question text, imported file content or stored value can ever be interpreted
// as markup. The single exception is insertTrustedSvg, which is used only for
// the build-time diagram registry in ui/svg.js.

const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach((key) => {
      const value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = String(value);
      else if (key === 'html') throw new Error('html attribute is not supported; use text');
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'dataset') {
        Object.keys(value).forEach((d) => { node.dataset[d] = String(value[d]); });
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, String(value));
      }
    });
  }
  appendChildren(node, children);
  return node;
}

export function appendChildren(node, children) {
  if (children === null || children === undefined) return node;
  const list = Array.isArray(children) ? children : [children];
  list.forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.appendChild(typeof child === 'object' && child.nodeType
      ? child
      : document.createTextNode(String(child)));
  });
  return node;
}

export function frag(children) {
  const f = document.createDocumentFragment();
  appendChildren(f, children);
  return f;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function byId(id) {
  return document.getElementById(id);
}

/**
 * Parses an SVG string from the built-in diagram registry. The markup is a
 * build-time constant authored in this repository - it never contains user or
 * imported data - and is parsed as image/svg+xml rather than assigned to
 * innerHTML.
 */
export function insertTrustedSvg(container, markup) {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName === 'parsererror' || svg.namespaceURI !== SVG_NS) {
    container.appendChild(el('p', { class: 'muted', text: 'Diagram unavailable.' }));
    return container;
  }
  container.appendChild(document.importNode(svg, true));
  return container;
}

// --------------------------------------------------------------- feedback

export function toast(message, kind) {
  const root = byId('toast-root');
  if (!root) return;
  const node = el('div', { class: `toast${kind ? ` ${kind}` : ''}`, text: message });
  root.appendChild(node);
  window.setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 4200);
}

/**
 * A focus-trapping confirmation dialog. Resolves true when confirmed.
 * Used for anything destructive or irreversible: exiting an exam, resetting
 * progress, overwriting progress with an import.
 */
export function confirmDialog(opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    const root = byId('dialog-root');
    const previousFocus = document.activeElement;
    let settled = false;

    function close(result) {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      clear(root);
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      resolve(result);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
      if (e.key !== 'Tab') return;
      const focusables = root.querySelectorAll('button');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    const confirmBtn = el('button', {
      class: `btn ${o.danger ? 'btn-danger' : 'btn-primary'}`,
      type: 'button',
      text: o.confirmLabel || 'Confirm',
      onClick: () => close(true),
    });

    const dialog = el('div', {
      class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title',
    }, [
      el('h2', { id: 'dialog-title', text: o.title || 'Are you sure?' }),
      ...(Array.isArray(o.body) ? o.body : [o.body]).filter(Boolean)
        .map((line) => (typeof line === 'string' ? el('p', { text: line }) : line)),
      el('div', { class: 'btn-row', style: 'margin-top:16px' }, [
        confirmBtn,
        el('button', {
          class: 'btn', type: 'button', text: o.cancelLabel || 'Cancel',
          onClick: () => close(false),
        }),
      ]),
    ]);

    clear(root);
    root.appendChild(el('div', { class: 'dialog-backdrop', onClick: (e) => { if (e.target === e.currentTarget) close(false); } }, dialog));
    document.addEventListener('keydown', onKey, true);
    confirmBtn.focus();
  });
}

// --------------------------------------------------------------- utility

export function formatPercent(value) {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value * 10) / 10}%`;
}

export function formatDate(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}`;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsText(file);
  });
}
