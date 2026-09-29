/* =====================================================================
 *  EMU386 - Editor de código con resaltado, números de línea y
 *  puntos de ruptura (clic en el margen).
 * ===================================================================== */
'use strict';
(function (EMU) {
  const LH = 20, PAD = 6;
  const REGS = new Set(['al', 'cl', 'dl', 'bl', 'ah', 'ch', 'dh', 'bh', 'ax', 'cx', 'dx', 'bx', 'sp', 'bp', 'si', 'di',
    'eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi', 'es', 'cs', 'ss', 'ds', 'cr0', 'cr2', 'cr3']);
  const DIRS = new Set(['db', 'dw', 'dd', 'equ', 'org', 'align', 'times', 'end', 'offset', 'ptr', 'byte', 'word', 'dword',
    'far', 'near', 'short', 'dup', 'proc', 'endp', 'segment', 'ends', 'assume', '.model', '.code', '.data', '.stack', 'rep', 'repe', 'repz', 'repne', 'repnz']);
  const esc = EMU.escapeHtml;
  const span = (c, t) => `<span class="${c}">${esc(t)}</span>`;

  function hlLine(line) {
    let ci = -1, q = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === q) q = null; }
      else if (c === "'" || c === '"') q = c;
      else if (c === ';') { ci = i; break; }
    }
    const code = ci >= 0 ? line.slice(0, ci) : line;
    const com = ci >= 0 ? line.slice(ci) : '';
    const re = /('[^']*'?|"[^"]*"?)|([A-Za-z_.@?$][\w.@?$]*)(\s*:)?|([0-9][0-9A-Za-z_]*)|([^'"A-Za-z_.@?$0-9]+)/g;
    let out = '', m;
    while ((m = re.exec(code))) {
      if (m[1] !== undefined) out += span('tk-str', m[1]);
      else if (m[2] !== undefined) {
        const w = m[2].toLowerCase();
        if (m[3] && !REGS.has(w)) out += span('tk-lbl', m[2]) + esc(m[3]);
        else {
          const cls = REGS.has(w) ? 'tk-reg' : EMU.MNEMONICS.has(w) ? 'tk-op' : DIRS.has(w) ? 'tk-dir' : '';
          out += (cls ? span(cls, m[2]) : esc(m[2])) + (m[3] ? esc(m[3]) : '');
        }
      } else if (m[4] !== undefined) out += span('tk-num', m[4]);
      else out += esc(m[5]);
    }
    if (com) out += span('tk-com', com);
    return out;
  }

  class Editor {
    constructor(host, opts) {
      this.opts = opts || {};
      host.innerHTML = '<div class="editor"><div class="gutter"><div class="gutter-inner"></div></div>' +
        '<div class="code-area"><pre class="hl"></pre><div class="errlayer"></div><div class="curline"></div>' +
        '<textarea spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" wrap="off"></textarea></div></div>';
      this.ta = host.querySelector('textarea');
      this.pre = host.querySelector('pre');
      this.gutter = host.querySelector('.gutter');
      this.gin = host.querySelector('.gutter-inner');
      this.curEl = host.querySelector('.curline');
      this.errLayer = host.querySelector('.errlayer');
      this.bps = new Set();
      this.errLines = new Set();
      this.cur = -1;
      if (this.opts.readOnly) this.ta.readOnly = true;
      this.ta.addEventListener('input', () => { this.refresh(); if (this.opts.onChange) this.opts.onChange(); });
      this.ta.addEventListener('scroll', () => this.syncScroll());
      this.ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && !this.ta.readOnly) {
          e.preventDefault();
          if (!document.execCommand('insertText', false, '\t')) {
            const s = this.ta.selectionStart;
            this.ta.setRangeText('\t', s, this.ta.selectionEnd, 'end');
            this.refresh();
          }
        }
      });
      this.gutter.addEventListener('click', (e) => {
        const r = this.gutter.getBoundingClientRect();
        const line = Math.floor((e.clientY - r.top + this.ta.scrollTop - PAD) / LH) + 1;
        if (line < 1 || line > this.lineCount()) return;
        if (this.bps.has(line)) this.bps.delete(line); else this.bps.add(line);
        this.renderGutter();
        if (this.opts.onBreakpoints) this.opts.onBreakpoints();
      });
    }
    get value() { return this.ta.value; }
    set value(v) { this.ta.value = v; this.ta.scrollTop = 0; this.refresh(); }
    lineCount() { return this.ta.value.split('\n').length; }
    refresh() {
      const lines = this.ta.value.split('\n');
      this.pre.innerHTML = lines.map(hlLine).join('\n') + '\n\n';
      for (const b of [...this.bps]) if (b > lines.length) this.bps.delete(b);
      this.renderGutter();
      this.syncScroll();
    }
    renderGutter() {
      const n = this.lineCount();
      let h = '';
      for (let i = 1; i <= n; i++) {
        const c = ['gl'];
        if (this.bps.has(i)) c.push('bp');
        if (i === this.cur) c.push('cur');
        if (this.errLines.has(i)) c.push('errl');
        h += `<div class="${c.join(' ')}">${i}</div>`;
      }
      this.gin.innerHTML = h;
      let e = '';
      for (const l of this.errLines) e += `<div class="errline" style="top:${PAD + (l - 1) * LH}px"></div>`;
      this.errLayer.innerHTML = e;
      this.syncScroll();
    }
    syncScroll() {
      const st = this.ta.scrollTop;
      this.pre.scrollTop = st;
      this.pre.scrollLeft = this.ta.scrollLeft;
      this.gin.style.transform = `translateY(${-st}px)`;
      this.errLayer.style.transform = `translateY(${-st}px)`;
      if (this.cur > 0) {
        this.curEl.style.display = 'block';
        this.curEl.style.top = (PAD + (this.cur - 1) * LH - st) + 'px';
      } else this.curEl.style.display = 'none';
    }
    setCurrent(line, scroll) {
      if (line === this.cur) { if (scroll) this.reveal(line); return; }
      this.cur = line;
      this.renderGutter();
      if (scroll && line > 0) this.reveal(line);
    }
    reveal(line) {
      const top = PAD + (line - 1) * LH, h = this.ta.clientHeight;
      if (top < this.ta.scrollTop + LH || top > this.ta.scrollTop + h - 2 * LH) {
        this.ta.scrollTop = Math.max(0, top - h / 3);
        this.syncScroll();
      }
    }
    setErrors(lines) { this.errLines = new Set(lines); this.renderGutter(); }
    goto(line) {
      const lines = this.ta.value.split('\n');
      let pos = 0;
      for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
      this.ta.focus();
      this.ta.setSelectionRange(pos, pos + (lines[line - 1] || '').length);
      this.reveal(line);
    }
  }

  EMU.Editor = Editor;
  EMU.highlightLine = hlLine;
})(window.EMU);
