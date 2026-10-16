
/* Typeside app: library, challenge state machine, audio sync, results. Audio element is the authoritative clock. */
(() => {
'use strict';

const $ = s => document.querySelector(s);
const au = $('#au');
const dlg = $('#dlg');
const cap = $('#cap');

const DEF = {
  caret: true,
  hlOk: true,
  hlBad: true,
  sound: false,
  reduced: matchMedia('(prefers-reduced-motion:reduce)').matches,
  font: 22,
  confirm: true,
  accent: 'red'
};

const ls = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem('typeside.' + k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('typeside.' + k, JSON.stringify(v));
    } catch {}
  }
};

let S = { ...DEF, ...ls.get('settings', {}) };
let albums = [];
let songs = [];
let A, D, song;
let items = [];
let spans = [];
let lines = [];
let C = newC();
let cache = {};
let q = '';
let raf = 0;
let lastSec = null;
let lastLine = null;
let actx;

function newC() {
  return {
    state: 'idle',
    mode: 'full',
    eng: null,
    offset: 0,
    end: null,
    lyricsDone: false,
    doneAt: null,
    t0: 0
  };
}

const url = p => p.split('/').map(encodeURIComponent).join('/');

const fmt = s => {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

const norm = t => t
  .replace(/^\uFEFF/, '')
  .replace(/\r\n?/g, '\n')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/…/g, '...');

const busy = () => ['active', 'paused', 'loading'].includes(C.state);

// ---------- lyric parsing ----------
// "[Label]" lines are display-only; blank lines = stanza breaks (typed as Enter).

function parse(txt) {
  const out = [];
  let n = 0;

  for (const raw of txt.split('\n')) {
    const t = raw.trim();

    if (/^\[.+\]$/.test(t)) {
      out.push({ k: 'label', t: t.slice(1, -1) });
      continue;
    }

    if (!t) {
      const l = out[out.length - 1];
      if (l && l.k === 'line') out.push({ k: 'blank' });
      continue;
    }

    out.push({ k: 'line', t, i: n++ });
  }

  while (out.length && out[out.length - 1].k !== 'line') {
    out.pop();
  }

  return out;
}

function layout(its) {
  let text = '';

  its.forEach(it => {
    if (it.k === 'label') return;
    it.p = text.length;
    text += (it.k === 'line' ? it.t : '') + '\n';
  });

  return text.slice(0, -1);
}

// ---------- rendering ----------

function render(its, text) {
  const box = $('#lyrics');

  box.innerHTML = '';
  spans = new Array(text.length);
  lines = [];
  lastLine = null;

  let label = '';

  const mk = (d, c, nl) => {
    const s = document.createElement('span');
    s.className = 'ch' + (nl ? ' nl' : '');
    s.textContent = nl ? '↵' : c;
    s._nl = nl;
    d.append(s);
    return s;
  };

  its.forEach(it => {
    const d = document.createElement('div');

    if (it.k === 'label') {
      d.className = 'lab';
      d.textContent = it.t;
      label = it.t;
      box.append(d);
      return;
    }

    d.className = 'ln';
    const s = it.k === 'line' ? it.t : '';

    for (let j = 0; j < s.length; j++) {
      spans[it.p + j] = mk(d, s[j]);
    }

    if (it.p + s.length < text.length) {
      spans[it.p + s.length] = mk(d, '', true);
    }

    const note = it.k === 'line' &&
      song.annotations &&
      song.annotations[it.i];

    if (note) {
      d.classList.add('ann');
      d.title = note;
    }

    lines.push({
      p: it.p,
      e: it.p + s.length,
      el: d,
      label,
      n: it.i
    });

    box.append(d);
  });

  box.scrollTop = 0;
  markLine(true);
}

function paint(i) {
  const sp = spans[i];
  const e = C.eng;

  if (!sp || !e) return;

  sp.className = 'ch' +
    (sp._nl ? ' nl' : '') +
    (i < e.pos
      ? (e.typed[i] === e.text[i] ? ' ok' : ' bad')
      : '') +
    (i === e.pos && C.state === 'active' ? ' cur' : '');
}

function markLine(force) {
  const pos = C.eng ? C.eng.pos : 0;
  const cur = lines.find(l => pos <= l.e) || lines[lines.length - 1];

  if (!cur) return;
  if (cur === lastLine && !force) return;

  if (lastLine) lastLine.el.classList.remove('on');

  cur.el.classList.add('on');
  lastLine = cur;

  const box = $('#lyrics');

  box.scrollTo({
    top: Math.max(0, cur.el.offsetTop - box.clientHeight / 2),
    behavior: S.reduced ? 'auto' : 'smooth'
  });

  $('#sec').textContent =
    (cur.label ? cur.label + ' · ' : '') +
    'line ' + (lines.indexOf(cur) + 1) +
    ' of ' + lines.length;
}

// ---------- status / stats ----------

function setState(msg) {
  $('#status').textContent = msg;
}

function elapsed() {
  if (C.mode === 'practice') {
    return C.t0 ? (performance.now() - C.t0) / 1000 : 0;
  }

  return Math.max(0, au.currentTime - C.offset);
}

function span() {
  return C.mode === 'practice'
    ? 0
    : (C.end ?? au.duration) - C.offset;
}

function upd() {
  const e = C.eng;
  if (!e) return;

  const t = C.doneAt ?? elapsed();
  const len = span();
  const el = elapsed();
  const tot = e.text.length;

  $('#wpm').textContent = Math.round(e.wpm(t));
  $('#acc').textContent = Math.round(e.accuracy()) + '%';
  $('#err').textContent = e.incorrect;

  $('#rem').textContent =
    C.mode === 'practice' || !isFinite(len)
      ? '–:––'
      : fmt(len - el);

  const pt = tot ? 100 * e.correct / tot : 0;
  const pa = len > 0 ? Math.min(100, 100 * el / len) : 0;

  $('#pt').textContent = Math.round(pt) + '%';
  $('#bt').style.width = pt + '%';
  $('#chars').textContent = e.correct + ' / ' + tot;

  $('#pa').textContent = C.mode === 'practice' ? '–' : Math.round(pa) + '%';
  $('#ba').style.width = (C.mode === 'practice' ? 0 : pa) + '%';

  $('#clock').textContent =
    C.mode === 'practice'
      ? fmt(el)
      : fmt(el) + ' / ' + fmt(len);
}

function loop() {
  cancelAnimationFrame(raf);

  const f = () => {
    if (C.state !== 'active') return;

    if (C.end != null && au.currentTime >= C.end) {
      finish();
      return;
    }

    upd();
    raf = requestAnimationFrame(f);
  };

  raf = requestAnimationFrame(f);
}

function ui() {
  const p = song && cache[song.id];
  const mode = $('#mode').value;
  const b = busy();

  const hasT = song && song.timing && song.timing.length >= 2;

  $('#mode').querySelector('[value=random]').disabled = !hasT;
  $('#mode').disabled = b;

  if (mode === 'random' && !hasT) {
    $('#mode').value = 'full';
  }

  const need = $('#mode').value === 'practice'
    ? p && p.lyrics
    : p && p.lyrics && p.audio;

  $('#start').disabled = b || !need;

  $('#pause').disabled =
    !(C.state === 'active' || C.state === 'paused') ||
    C.mode === 'practice';

  $('#pause').textContent = C.state === 'paused' ? 'Resume' : 'Pause';

  $('#restart').disabled = !(b || C.state === 'finished') || !need;

  const n = [];

  if (p) {
    if (p.forced) {
      n.push('Marked unavailable in data/songs.json.');
    } else {
      if (!p.audio) n.push('Audio missing: add ' + song.audio);

      if (!p.lyrics) {
        n.push(
          (p.bad ? 'Lyric file unreadable or empty: ' : 'Lyrics missing: ') +
          song.lyrics
        );
      }
    }
  }

  if (!hasT) {
    n.push('Random Section is disabled: this song has no timing data (see README).');
  }

  $('#note').textContent = n.join(' ');
}

// ---------- library ----------

async function probe(s) {
  if (cache[s.id]) return cache[s.id];

  const chk = async p => {
    try {
      const response = await fetch(url(p), {
        method: 'HEAD',
        cache: 'no-store'
      });

      if (response.ok) return true;
    } catch {
      // Try a small GET request below if HEAD is unavailable.
    }

    try {
      const response = await fetch(url(p), {
        headers: { Range: 'bytes=0-0' },
        cache: 'no-store'
      });

      return response.ok;
    } catch {
      return false;
    }
  };

  if (s.status === 'unavailable') {
    return cache[s.id] = {
      audio: false,
      lyrics: false,
      forced: true
    };
  }

  const result = {
    audio: await chk(s.audio),
    lyrics: await chk(s.lyrics)
  };

  cache[s.id] = result;
  return result;
}

function renderList() {
  const ul = $('#tracks');
  ul.innerHTML = '';

  songs
    .filter(s =>
      s.album === A.id &&
      (q || s.disc === D.id) &&
      s.title.toLowerCase().includes(q)
    )
    .forEach(s => {
      const p = cache[s.id];
      const li = document.createElement('li');
      const b = document.createElement('button');

      const st = !p
        ? 'checking…'
        : p.audio && p.lyrics
          ? 'ready'
          : p.forced
            ? 'unavailable'
            : !p.audio && !p.lyrics
              ? 'needs audio + lyrics'
              : !p.audio
                ? 'needs audio'
                : 'needs lyrics';

      b.innerHTML =
        '<span class="n"></span>' +
        '<span class="t"></span>' +
        '<span class="st"></span>';

      b.children[0].textContent = String(s.track).padStart(2, '0');

      b.children[1].textContent =
        (q ? s.disc[0].toUpperCase() + s.disc.slice(1) + ' · ' : '') +
        s.title;

      b.children[2].textContent = st;

      if (song && s.id === song.id) b.classList.add('sel-on');
      if (st === 'ready') b.classList.add('ok');

      b.onclick = () => pick(s.id);

      li.append(b);
      ul.append(li);
    });
}

function syncSelects() {
  $('#disc').innerHTML = A.discs
    .map(d => `<option value="${d.id}">${d.title}</option>`)
    .join('');

  $('#disc').value = D.id;

  $('#song').innerHTML = songs
    .filter(s => s.album === A.id && s.disc === D.id)
    .map(s =>
      `<option value="${s.id}">${String(s.track).padStart(2, '0')}. ${s.title.replace(/</g, '&lt;')}</option>`
    )
    .join('');

  if (song) $('#song').value = song.id;

  $('#atitle').textContent = A.title;
  $('#asub').textContent = A.artist + ' · ' + A.year;

  const im = $('#art');

  im.hidden = true;
  im.onload = () => im.hidden = false;
  im.onerror = () => im.hidden = true;

  if (A.artwork) im.src = url(A.artwork);
}


function syncSelects() {
  $('#disc').innerHTML = A.discs
    .map(d => `<option value="${d.id}">${d.title}</option>`)
    .join('');

  $('#disc').value = D.id;

  $('#song').innerHTML = songs
    .filter(s => s.album === A.id && s.disc === D.id)
    .map(s =>
      `<option value="${s.id}">${String(s.track).padStart(2, '0')}. ${s.title.replace(/</g, '&lt;')}</option>`
    )
    .join('');

  if (song) $('#song').value = song.id;

  $('#atitle').textContent = A.title;
  $('#asub').textContent = A.artist + ' · ' + A.year;

  const im = $('#art');
  im.hidden = true;
  im.onload = () => im.hidden = false;
  im.onerror = () => im.hidden = true;

  if (A.artwork) {
    im.src = url(A.artwork);
  }
}  

function leave() {
  return !busy() ||
    !S.confirm ||
    confirm('A challenge is in progress. Leave it and lose your progress?');
}

function hardStop() {
  cancelAnimationFrame(raf);
  au.pause();
  C = newC();

  $('#res').hidden = true;
  $('#stage').hidden = false;
  $('#banner').hidden = true;
}

async function pick(id) {
  if (song && id !== song.id && !leave()) {
    $('#song').value = song.id;
    return;
  }

  hardStop();

  song = songs.find(s => s.id === id);

  if (!song) {
    setState('Song not found');
    return;
  }

  A = albums.find(a => a.id === song.album);

  if (!A) {
    setState('Album not found');
    return;
  }

  D = A.discs.find(d => d.id === song.disc);

  if (!D) {
    setState('Disc not found');
    return;
  }

  syncSelects();
  renderList();

  $('#title').textContent = song.title;

  $('#meta').textContent =
    `${song.artist} · ${A.title} · ${D.title} disc · track ${song.track}`;

  $('#lyrics').textContent = '';
  items = [];

  setState('Checking files…');
  ui();

  const my = song;
  const p = await probe(song);

  if (song !== my) return;

  if (p.lyrics && !p.text) {
    try {
      const r = await fetch(url(song.lyrics));

      if (!r.ok) throw new Error('Could not fetch lyrics');

      p.text = norm(await r.text());

      if (!parse(p.text).length) {
        throw new Error('Lyric file is empty');
      }
    } catch {
      p.lyrics = false;
      p.bad = true;
    }
  }

  if (song !== my) return;

  if (p.audio) {
    au.src = url(song.audio);
    au.load();
  } else {
    au.removeAttribute('src');
    au.load();
  }

  renderList();

  setState(p.audio && p.lyrics ? 'Ready' : 'Unavailable');

  if (p.lyrics) {
    items = parse(p.text);

    const t = layout(items);

    C.eng = new TypingEngine(t);
    render(items, t);
  } else {
    $('#lyrics').innerHTML = '<p>No lyrics to show. See the note above.</p>';
  }

  upd();
  ui();
}

// ---------- challenge ----------

function start(reuse) {
  if (busy() || !song) return;

  const p = cache[song.id];
  const mode = $('#mode').value;

  if (!p || !p.lyrics || (mode !== 'practice' && !p.audio)) return;

  $('#res').hidden = true;
  $('#stage').hidden = false;
  $('#banner').hidden = true;

  let its = items.map(x => ({ ...x }));
  let offset = 0;
  let end = null;

  if (mode === 'random') {
    if (!(reuse && lastSec && lastSec.id === song.id)) {
      const t = song.timing;
      const n = Math.min(4, t.length);
      const i = Math.floor(Math.random() * (t.length - n + 1));

      lastSec = {
        id: song.id,
        a: t[i],
        b: t[i + n - 1]
      };
    }

    const { a, b } = lastSec;
    const from = its.findIndex(x => x.i === a.line);
    const to = its.findIndex(x => x.i === b.line);

    if (from < 0 || to < 0) {
      $('#note').textContent =
        'Timing data refers to lines that do not exist in the lyric file.';
      return;
    }

    its = its.slice(from, to + 1);
    offset = a.start;
    end = b.end;
  }

  const text = layout(its);

  render(its, text);

  C = {
    ...newC(),
    state: 'loading',
    mode,
    eng: new TypingEngine(text),
    offset,
    end
  };

  upd();

  if (mode === 'practice') {
    C.state = 'active';
    setState('Practice – start typing');
    focusCap();
    ui();
    loop();
    return;
  }

  setState('Loading audio…');
  ui();

  const go = () => {
    au.currentTime = offset;

    au.play().catch(err => {
      fail(
        err.name === 'NotSupportedError'
          ? 'Audio format not supported by this browser.'
          : 'Could not start audio: ' + err.message
      );
    });
  };

  if (au.readyState >= 1) {
    go();
  } else {
    au.addEventListener('loadedmetadata', () => {
      if (C.state === 'loading') go();
    }, { once: true });
  }
}

function fail(msg) {
  cancelAnimationFrame(raf);
  au.pause();

  C.state = 'error';

  setState('Audio error');
  $('#note').textContent = msg;

  ui();
}

function lyricsComplete() {
  C.lyricsDone = true;
  C.doneAt = elapsed();

  upd();

  if (C.mode === 'practice') {
    finish();
    return;
  }

  $('#banner').hidden = false;
  $('#banner').textContent =
    'Lyrics complete. You beat the song. The audio keeps playing until it ends.';

  setState('Lyrics complete');
}

function finish() {
  if (C.state === 'finished' || C.state === 'idle') return;

  const e = C.eng;
  const practice = C.mode === 'practice';
  const len = span();

  const el = practice
    ? elapsed()
    : Math.min(len, au.ended ? len : elapsed());

  C.state = 'finished';

  cancelAnimationFrame(raf);
  au.pause();

  const t = C.doneAt ?? el;
  const tot = e.text.length;
  const w = e.words();

  const r = {
    date: new Date().toISOString(),
    title: song.title,
    mode: C.mode,
    beat: C.lyricsDone,
    wpm: Math.round(e.wpm(t)),
    raw: Math.round(e.raw(t)),
    acc: Math.round(e.accuracy() * 10) / 10,
    correct: e.correct,
    incorrect: e.incorrect,
    mistakes: e.errorKeys,
    keys: e.keys,
    total: tot,
    pct: Math.round(1000 * e.correct / tot) / 10,
    dur: len,
    el,
    doneAt: C.doneAt,
    wc: w.correct,
    wi: w.incorrect
  };

  const h = ls.get('history', []);

  h.unshift(r);
  ls.set('history', h.slice(0, 50));

  $('#stage').hidden = true;
  $('#res').hidden = false;

  setState(
    practice
      ? 'Practice done'
      : r.beat
        ? 'Completed'
        : 'Incomplete'
  );

  $('#r-title').textContent = practice
    ? 'Practice complete'
    : r.beat
      ? 'You beat the song.'
      : 'Song ended first.';

  $('#r-sub').textContent =
    `${r.title} · ${{ full: 'Full Song', random: 'Random Section', practice: 'Practice' }[r.mode]} · ` +
    (
      practice
        ? 'No audio race.'
        : r.beat
          ? `Lyrics finished at ${fmt(r.doneAt)} of ${fmt(r.dur)}.`
          : `You typed ${r.pct}% of the lyrics correctly before the music ended.`
    );

  const rows = [
    ['WPM', r.wpm],
    ['Raw WPM', r.raw],
    ['Accuracy', r.acc + '%'],
    ['Correct characters', r.correct],
    ['Incorrect characters', r.incorrect],
    ['Mistyped keystrokes (total)', r.mistakes],
    ['Total characters', r.total],
    ['Lyrics completed', r.pct + '%'],
    ['Words correct / wrong', r.wc + ' / ' + r.wi],
    ['Song duration', practice ? '–' : fmt(r.dur)],
    ['Elapsed', fmt(r.el)],
    ['Lyrics done before music ended', practice ? 'n/a' : r.beat ? 'Yes' : 'No']
  ];

  $('#r-grid').innerHTML = rows
    .map(x => `<div><dt>${x[0]}</dt><dd>${x[1]}</dd></div>`)
    .join('');

  ui();
  $('#retry').focus();
}

function key(ch) {
  if (C.state !== 'active' || C.lyricsDone) return;

  if (C.mode === 'practice' && !C.t0) {
    C.t0 = performance.now();
  }

  const ok = C.eng.type(ch);

  if (ok === null) return;
  if (!ok) beep();

  paint(C.eng.pos - 1);
  paint(C.eng.pos);
  markLine();
  upd();

  if (C.eng.complete) lyricsComplete();
}

function back() {
  if (C.state !== 'active' || C.lyricsDone) return;

  const p = C.eng.pos;

  C.eng.back();

  paint(p);
  paint(C.eng.pos);
  markLine();
  upd();
}

function beep() {
  if (!S.sound) return;

  try {
    actx = actx || new AudioContext();

    const o = actx.createOscillator();
    const g = actx.createGain();

    o.frequency.value = 160;
    g.gain.value = .04;

    o.connect(g);
    g.connect(actx.destination);

    o.start();
    o.stop(actx.currentTime + .08);
  } catch {}
}

const focusCap = () => cap.focus({ preventScroll: true });

// ---------- audio events (attached once) ----------

au.addEventListener('playing', () => {
  if (
    C.mode !== 'practice' &&
    (C.state === 'loading' || C.state === 'paused')
  ) {
    C.state = 'active';
    setState(C.lyricsDone ? 'Lyrics complete' : 'Active');
    focusCap();
    ui();
    loop();
  }
});

au.addEventListener('pause', () => {
  if (C.state === 'active' && !au.ended) {
    C.state = 'paused';

    cancelAnimationFrame(raf);

    setState('Paused');
    upd();
    ui();
  }
});

au.addEventListener('ended', () => {
  if (C.state === 'active' || C.state === 'paused') {
    finish();
  }
});

au.addEventListener('error', () => {
  if (C.state === 'loading' || busy()) {
    fail('Audio failed to load or the format is unsupported (use MP3, M4A, OGG or WAV).');
  } else if (song && cache[song.id] && au.getAttribute('src')) {
    cache[song.id].audio = false;
    renderList();
    ui();
  }
});

// ---------- input ----------

document.addEventListener('keydown', e => {
  if (
    C.state !== 'active' ||
    dlg.open ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    e.isComposing
  ) return;

  if (e.target.matches('select,input,textarea:not(#cap)')) return;

  if (e.key === 'Backspace') {
    e.preventDefault();
    back();
    return;
  }

  const ch = e.key === 'Enter'
    ? '\n'
    : e.key.length === 1
      ? e.key
      : null;

  if (!ch) return;

  e.preventDefault();
  key(ch);
});

document.addEventListener('keyup', e => {
  if (
    C.state === 'active' &&
    e.key === ' ' &&
    e.target.tagName === 'BUTTON'
  ) {
    e.preventDefault();
  }
});

cap.addEventListener('input', () => {
  for (const ch of cap.value) key(ch);
  cap.value = '';
});

$('#lyrics').addEventListener('click', () => {
  if (C.state === 'active') focusCap();
});

window.addEventListener('beforeunload', e => {
  if (busy() && S.confirm) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------- controls ----------

$('#start').onclick = () => start(false);

$('#restart').onclick = () => {
  cancelAnimationFrame(raf);
  au.pause();
  C = newC();
  start(true);
};

$('#pause').onclick = () => {
  if (C.state === 'active') {
    au.pause();
  } else if (C.state === 'paused') {
    au.play();
  }
};

$('#retry').onclick = () => {
  C = newC();
  start(true);
};

$('#replay').onclick = () => {
  C = newC();
  lastSec = null;
  start(false);
};

$('#back').onclick = () => {
  hardStop();
  setState('Ready');

  if (C.eng === null && song) pick(song.id);
};

$('#mode').onchange = () => {
  if (!leave()) return;
  pick(song.id);
};

$('#q').oninput = e => {
  q = e.target.value.trim().toLowerCase();
  renderList();
};

$('#song').onchange = e => pick(e.target.value);

$('#disc').onchange = e => {
  D = A.discs.find(d => d.id === e.target.value);

  const f = songs.find(s => s.album === A.id && s.disc === D.id);

  if (f) pick(f.id);
};

$('#album').onchange = e => {
  const a = albums.find(x => x.id === e.target.value);
  const f = songs.find(s => s.album === a.id);

  if (f) pick(f.id);
};

// ---------- settings ----------

function applySettings() {
  document.body.classList.toggle('no-caret', !S.caret);
  document.body.classList.toggle('no-ok', !S.hlOk);
  document.body.classList.toggle('no-bad', !S.hlBad);
  document.body.classList.toggle('reduced', S.reduced);

  document.documentElement.dataset.accent = S.accent;
  $('#lyrics').style.fontSize = S.font + 'px';

  ls.set('settings', S);
}

const bind = {
  's-caret': 'caret',
  's-ok': 'hlOk',
  's-bad': 'hlBad',
  's-sound': 'sound',
  's-reduced': 'reduced',
  's-confirm': 'confirm',
  's-font': 'font',
  's-accent': 'accent'
};

for (const [id, k] of Object.entries(bind)) {
  $('#' + id).addEventListener('input', e => {
    S[k] = e.target.type === 'checkbox'
      ? e.target.checked
      : e.target.type === 'range'
        ? +e.target.value
        : e.target.value;

    applySettings();
  });
}

function histList() {
  $('#hist').innerHTML = ls.get('history', [])
    .slice(0, 15)
    .map(r =>
      `<li>${new Date(r.date).toLocaleDateString()} · ${r.title.replace(/</g, '&lt;')} · ${r.mode} · ${r.wpm} wpm · ${r.acc}% · ${r.beat ? 'beat' : r.mode === 'practice' ? 'practice' : r.pct + '% typed'}</li>`
    )
    .join('') || '<li>No history yet.</li>';
}

$('#open-set').onclick = () => {
  if (C.state === 'active' && C.mode !== 'practice') au.pause();

  for (const [id, k] of Object.entries(bind)) {
    const el = $('#' + id);

    if (el.type === 'checkbox') {
      el.checked = S[k];
    } else {
      el.value = S[k];
    }
  }

  histList();
  dlg.showModal();
};

dlg.addEventListener('close', () => {
  if (C.state === 'paused') $('#pause').focus();
});

$('#clear').onclick = () => {
  ls.set('history', []);
  histList();
};

// ---------- boot ----------

(async () => {
  applySettings();

  try {
    const get = async p => {
      const r = await fetch(p);

      if (!r.ok) throw new Error(p + ' → ' + r.status);

      return r.json();
    };

    [albums, songs] = await Promise.all([
      get('data/albums.json'),
      get('data/songs.json')
    ]);
  } catch (err) {
    $('#title').textContent = 'Could not load the catalogue';

    $('#meta').textContent =
      'Opening index.html directly from disk blocks fetch(). Run "python3 -m http.server" in this folder and open http://localhost:8000, or deploy to GitHub Pages. (' +
      err.message +
      ')';

    return;
  }

  if (!albums.length || !songs.length) {
    $('#title').textContent = 'Catalogue is empty';
    $('#meta').textContent = 'Check data/albums.json and data/songs.json.';
    return;
  }

  A = albums[0];

  $('#album').innerHTML = albums
    .map(a => `<option value="${a.id}">${a.title}</option>`)
    .join('');

  D = A.discs[0];

  syncSelects();

  const first = songs.find(s => s.album === A.id && s.disc === D.id);

  songs
    .filter(s => s.album === A.id)
    .forEach(async s => {
      await probe(s);
      renderList();
    });

  if (first) {
    await pick(first.id);
  } else {
    $('#title').textContent = 'No songs found';
    $('#meta').textContent = 'Check the song album and disc IDs in data/songs.json.';
  }
})();

})();
