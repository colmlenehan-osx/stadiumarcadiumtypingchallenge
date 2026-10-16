/* Typing engine. Pure logic, no DOM.
 * METRICS (all documented here, used everywhere):
 *  - keys / correctKeys / errorKeys: every printable keystroke (and Enter) accepted; Backspace is not counted.
 *  - correct: characters currently in the right place. incorrect: characters currently typed wrong (fixable by Backspace).
 *  - accuracy % = correctKeys / keys * 100 (100 before first key). Corrected mistakes still count against you.
 *  - WPM = correct / 5 / minutes. Raw WPM = keys / 5 / minutes. Both return 0 under 1 s elapsed (no divide by zero).
 *  - complete: every character typed AND zero incorrect. Input past the end of the text is refused. */
class TypingEngine {
  constructor(text) { this.text = text; this.reset(); }
  reset() { this.typed = []; this.keys = 0; this.correctKeys = 0; this.errorKeys = 0; }
  get pos() { return this.typed.length; }
  get correct() { let n = 0; for (let i = 0; i < this.typed.length; i++) if (this.typed[i] === this.text[i]) n++; return n; }
  get incorrect() { return this.typed.length - this.correct; }
  get complete() { return this.typed.length >= this.text.length && this.incorrect === 0; }
  type(ch) {
    if (this.typed.length >= this.text.length) return null;
    const ok = ch === this.text[this.typed.length];
    this.typed.push(ch); this.keys++; ok ? this.correctKeys++ : this.errorKeys++;
    return ok;
  }
  back() { if (this.typed.length) this.typed.pop(); }
  accuracy() { return this.keys ? 100 * this.correctKeys / this.keys : 100; }
  wpm(sec) { return sec >= 1 ? this.correct / 5 / (sec / 60) : 0; }
  raw(sec) { return sec >= 1 ? this.keys / 5 / (sec / 60) : 0; }
  words() { // a word is correct only if fully typed and identical; incorrect if fully attempted but wrong
    let ok = 0, bad = 0; const t = this.typed.join('');
    for (const m of this.text.matchAll(/\S+/g)) {
      const e = m.index + m[0].length;
      if (e > t.length) continue;
      t.slice(m.index, e) === m[0] ? ok++ : bad++;
    }
    return { correct: ok, incorrect: bad };
  }
}
if (typeof module !== 'undefined') module.exports = TypingEngine;
