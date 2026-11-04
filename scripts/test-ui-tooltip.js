'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'public/ui-tooltip.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/ui-tooltip.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

console.log('\n== komponen tooltip dashboard ==');
assert.ok(js.includes("setAttribute('role', 'tooltip')"));
assert.ok(js.includes('HOVER_DELAY = 400'));
assert.ok(js.includes('LONG_PRESS_DELAY = 500'));
assert.ok(js.includes("event.key === 'Escape'"));
assert.ok(js.includes("setAttribute('aria-describedby'"));
assert.ok(js.includes('MAX_WIDTH = 280'));
assert.ok(js.includes('pointerdown'));
assert.ok(js.includes('focusin'));
assert.ok(js.includes('touchstart'));
assert.ok(css.includes('max-width: 280px'));
assert.ok(css.includes('.ui-info-btn'));
assert.ok(css.includes('prefers-reduced-motion'));
assert.ok(html.includes('href="/ui-tooltip.css"'));
assert.ok(html.includes('src="/ui-tooltip.js"'));
assert.ok(server.includes("'ui-tooltip.js'"));
assert.ok(server.includes("'ui-tooltip.css'"));
assert.ok(/test-ui-tooltip\.js/.test(pkg));
console.log('  LULUS tooltip: hover, fokus, klik, long-press, Esc, aria, dan batas lebar');

// Regresi keamanan: isi tooltip tidak boleh ditafsirkan sebagai HTML aktif.
assert.ok(!/\.innerHTML/.test(js), 'tooltip tidak boleh memakai innerHTML');
assert.ok(!/\.outerHTML\s*=/.test(js), 'tooltip tidak boleh menulis outerHTML');
assert.ok(!/insertAdjacentHTML/.test(js), 'tooltip tidak boleh memakai insertAdjacentHTML');
assert.ok(js.includes('createTextNode'), 'teks tooltip harus masuk lewat createTextNode');
assert.ok(js.includes('ALLOWED_TAGS') && js.includes('DROP_TAGS'), 'tag tooltip harus dibatasi daftar izin');
assert.ok(js.includes('function safeHref'), 'href tautan tooltip harus disaring');
assert.ok(/setAttribute\('rel', 'noopener noreferrer'\)/.test(js), 'tautan tooltip harus memakai rel noopener');
console.log('  LULUS tooltip: penyaringan markup, tanpa innerHTML, href dan rel aman');
console.log('\n2/2 uji tooltip lulus.');
