(function () {
  'use strict';

  var E = window.Antislop;
  var MAX_WORDS = 150000;
  var $ = function (id) { return document.getElementById(id); };

  var input = $('input'), output = $('output'), marked = $('marked');
  var runBtn = $('run');
  var state = $('state'), stateTitle = $('state-title'), stateText = $('state-text');
  var progress = $('progress'), bar = $('progress-bar');
  var tabs = [$('tab-clean'), $('tab-marked')];
  var panels = { 'tab-clean': $('panel-clean'), 'tab-marked': $('panel-marked') };

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  /* ---------- theme ---------- */

  var root = document.documentElement;
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  function isDark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : media.matches;
  }
  function paintThemeButton() {
    var dark = isDark();
    $('theme').setAttribute('aria-pressed', String(dark));
    $('theme-label').textContent = dark ? 'Light mode' : 'Dark mode';
  }
  $('theme').addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    store.set('theme', next);
    paintThemeButton();
  });
  if (media.addEventListener) media.addEventListener('change', paintThemeButton);
  paintThemeButton();

  /* ---------- rule toggles ---------- */

  var saved = {};
  try { saved = JSON.parse(store.get('rules') || '{}') || {}; } catch (e) { saved = {}; }
  var list = $('rule-list');
  E.GROUPS.forEach(function (g) {
    var label = document.createElement('label');
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.value = g.id;
    box.checked = saved[g.id] !== false;
    box.addEventListener('change', onRulesChange);
    label.appendChild(box);
    label.appendChild(document.createTextNode(g.label));
    list.appendChild(label);
  });
  function ruleOpts() {
    var o = {};
    list.querySelectorAll('input').forEach(function (b) { o[b.value] = b.checked; });
    return o;
  }
  function paintRulesCount() {
    var o = ruleOpts();
    var on = Object.keys(o).filter(function (k) { return o[k]; }).length;
    $('rules-count').textContent = '(' + on + ' of ' + E.GROUPS.length + ' on)';
  }
  function onRulesChange() {
    store.set('rules', JSON.stringify(ruleOpts()));
    paintRulesCount();
    if (lastRun) markStale();
  }
  paintRulesCount();

  $('rules-link').addEventListener('click', function (e) {
    e.preventDefault();
    var d = $('rules');
    d.open = true;
    d.scrollIntoView({ block: 'center' });
    d.querySelector('summary').focus();
  });

  /* ---------- word count ---------- */

  var countTimer = 0;
  function plural(n, w) { return n.toLocaleString() + ' ' + w + (n === 1 ? '' : 's'); }
  function paintInCount() {
    var n = E.countWords(input.value);
    var el = $('in-count');
    el.textContent = plural(n, 'word') + (n > MAX_WORDS ? ', over the ' + MAX_WORDS.toLocaleString() + ' limit' : '');
    el.style.color = n > MAX_WORDS ? 'var(--accent)' : '';
  }
  input.addEventListener('input', function () {
    clearTimeout(countTimer);
    countTimer = setTimeout(paintInCount, 120);
    if (lastRun) markStale();
    setMsg($('in-msg'), '');
  });

  /* ---------- messages and states ---------- */

  function setMsg(el, text, isError) {
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
  }

  function showState(kind, title, text) {
    state.hidden = false;
    state.classList.toggle('is-error', kind === 'error');
    stateTitle.textContent = title;
    stateText.textContent = text;
    progress.hidden = kind !== 'loading';
    panels['tab-clean'].hidden = true;
    panels['tab-marked'].hidden = true;
    $('out-actions').hidden = true;
    $('tally').hidden = true;
  }

  function showEmpty() {
    showState('empty', 'Nothing here yet.', 'Paste something into the box and press Rewrite text. The cleaned version shows up here.');
  }

  function markStale() {
    setMsg($('out-msg'), 'The text or rules changed since this result. Press Rewrite text to update it.');
  }

  /* ---------- tabs ---------- */

  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (lastRun) panels[t.id].hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t); });
    t.addEventListener('keydown', function (e) {
      var j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j !== null) { e.preventDefault(); selectTab(tabs[j], true); }
    });
  });

  /* ---------- rewrite ---------- */

  var worker = null, workerBroken = false, reqId = 0, lastRun = null;

  function getWorker() {
    if (worker || workerBroken) return worker;
    try {
      worker = new Worker('js/worker.js');
      worker.onmessage = onWorkerMessage;
      worker.onerror = function (e) {
        e.preventDefault();
        fail('The rewrite worker stopped unexpectedly.');
        worker.terminate();
        worker = null;
      };
    } catch (e) {
      // Workers are blocked on file:// in some browsers. Run on the page instead.
      workerBroken = true;
      worker = null;
    }
    return worker;
  }

  function onWorkerMessage(e) {
    var m = e.data;
    if (!m || m.id !== reqId) return;
    if (m.type === 'progress') {
      bar.style.width = Math.round((m.done / m.total) * 100) + '%';
    } else if (m.type === 'done') {
      finish(m);
    } else if (m.type === 'error') {
      fail(m.message);
    }
  }

  function run() {
    var text = input.value;
    if (!/\S/.test(text)) {
      setMsg($('in-msg'), 'Paste some text first. The box is empty.', true);
      input.focus();
      return;
    }
    var words = E.countWords(text);
    if (words > MAX_WORDS) {
      setMsg($('in-msg'), 'This text has ' + words.toLocaleString() + ' words. The limit is ' + MAX_WORDS.toLocaleString() + ' per run, so split it into parts.', true);
      return;
    }
    setMsg($('in-msg'), '');
    setMsg($('out-msg'), '');
    reqId++;
    runBtn.setAttribute('aria-busy', 'true');
    runBtn.textContent = 'Rewriting';
    bar.style.width = '0%';
    showState('loading', 'Rewriting ' + plural(words, 'word') + '.', 'Checking each line against the rules you picked.');

    var opts = ruleOpts();
    var w = getWorker();
    if (w) {
      w.postMessage({ type: 'rewrite', id: reqId, text: text, opts: opts });
    } else {
      var id = reqId;
      setTimeout(function () {
        try {
          var lines = text.replace(/\r\n?/g, '\n').split('\n');
          var ctx = E.makeCtx(opts);
          var out = E.rewriteLines(lines, ctx, { inFence: false, seenText: false });
          finish({
            id: id,
            text: E.joinOutput(lines, out),
            inLines: lines,
            diff: lines.map(function (l, i) { return l === out[i] ? null : E.diffWords(l, out[i]); }),
            counts: ctx.counts
          });
        } catch (err) {
          fail(String(err && err.message || err));
        }
      }, 30);
    }
  }

  function resetButton() {
    runBtn.removeAttribute('aria-busy');
    runBtn.textContent = 'Rewrite text';
  }

  function fail(message) {
    resetButton();
    lastRun = null;
    showState('error', 'The rewrite failed.', 'Your original text is untouched. Try again, or reload the page if it keeps happening. Details: ' + message);
  }

  function finish(m) {
    if (m.id !== reqId) return;
    resetButton();
    lastRun = m;
    state.hidden = true;

    output.value = m.text;
    renderMarked(m.inLines, m.diff);

    var total = 0;
    var ul = $('tally-list');
    ul.textContent = '';
    E.GROUPS.forEach(function (g) {
      var n = m.counts[g.id] || 0;
      total += n;
      if (!n) return;
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.textContent = g.label;
      var num = document.createElement('b');
      num.textContent = n.toLocaleString();
      li.appendChild(name);
      li.appendChild(num);
      ul.appendChild(li);
    });
    $('tally').hidden = total === 0;
    $('out-actions').hidden = false;
    $('out-count').textContent = plural(E.countWords(m.text), 'word');

    var current = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0];
    selectTab(current);

    if (total === 0) {
      setMsg($('out-msg'), 'No tells found with the rules you picked. The text came back unchanged.');
    } else {
      setMsg($('out-msg'), plural(total, 'edit') + ' made. Open Marked changes to review each one.');
    }
    document.dispatchEvent(new CustomEvent('rewrite:done', { detail: { total: total } }));
  }

  function renderMarked(inLines, diff) {
    var frag = document.createDocumentFragment();
    var buf = '';
    function flush() {
      if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ''; }
    }
    for (var i = 0; i < inLines.length; i++) {
      var d = diff[i];
      if (!d) {
        buf += inLines[i];
      } else {
        flush();
        for (var k = 0; k < d.length; k++) {
          var op = d[k][0], txt = d[k][1];
          if (op === 0) { frag.appendChild(document.createTextNode(txt)); continue; }
          var el = document.createElement(op < 0 ? 'del' : 'ins');
          el.textContent = txt;
          frag.appendChild(el);
        }
      }
      if (i < inLines.length - 1) buf += '\n';
    }
    flush();
    marked.textContent = '';
    marked.appendChild(frag);
  }

  runBtn.addEventListener('click', run);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
  });

  /* ---------- output actions ---------- */

  $('copy').addEventListener('click', function () {
    var msg = $('out-msg');
    function fallback() {
      selectTab(tabs[0]);
      output.focus();
      output.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      setMsg(msg, ok ? 'Copied to the clipboard.' : 'Copy was blocked by the browser. The text is selected, so press Ctrl + C.', !ok);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(output.value).then(function () {
        setMsg(msg, 'Copied to the clipboard.');
      }, fallback);
    } else {
      fallback();
    }
  });

  $('download').addEventListener('click', function () {
    var blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'rewritten.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setMsg($('out-msg'), 'Saved as rewritten.txt.');
  });

  /* ---------- input actions ---------- */

  var SAMPLE = [
    "Certainly! Here's a rewritten version of your text:",
    '',
    "In today's fast-paced world, small teams must leverage the right tools in order to stay ahead. Our planner — built by a world-class team — seamlessly connects your calendar, notes, and tasks. It's not just a to-do list, it's a command center for your day.",
    '',
    "It's important to note that this could potentially change how you work. Moreover, the early feedback is a testament to our robust approach. Furthermore, we delve into your habits to find the gaps.",
    '',
    '- **Speed:** Pages open faster — much faster.',
    '- **Focus:** One screen for the whole week.',
    '',
    'This is your chance and YOU SHOULD NOT WAIT any longer.',
    '',
    'The future looks bright. I hope this helps! Let me know if you would like any changes.'
  ].join('\n');

  function loadSample() {
    input.value = SAMPLE;
    paintInCount();
    setMsg($('in-msg'), 'Sample loaded. It was written to be full of tells. Press Rewrite text.');
    if (lastRun) markStale();
  }

  $('sample').addEventListener('click', function () {
    loadSample();
    input.focus();
  });

  $('clear').addEventListener('click', function () {
    input.value = '';
    paintInCount();
    reqId++; // drop any result still on its way
    resetButton();
    lastRun = null;
    output.value = '';
    marked.textContent = '';
    showEmpty();
    setMsg($('in-msg'), '');
    setMsg($('out-msg'), '');
    input.focus();
  });

  paintInCount();
  showEmpty();

  // Hooks for the first-visit tour (js/tour.js).
  window.AntislopApp = {
    loadSample: loadSample,
    hasText: function () { return /\S/.test(input.value); },
    hasResult: function () { return !!lastRun; },
    run: run,
    showTab: function (which) { selectTab(which === 'marked' ? tabs[1] : tabs[0]); },
    setRulesOpen: function (open) { $('rules').open = open; },
    store: store
  };
})();
