/*
 * First-visit tour. Walks through the page one part at a time and runs the
 * built-in example so the visitor sees a real result. Shown once, then
 * available again from the Tour button in the toolbar.
 */
(function () {
  'use strict';

  var App = window.AntislopApp;
  if (!App) return;
  var KEY = 'tourDone';

  var STEPS = [
    {
      title: 'Welcome to Antislop Paraphrase',
      body: 'This page takes text that sounds machine-made and crosses out the parts that give it away. Here is how it works, using an example.',
      next: 'Show me'
    },
    {
      target: '#input',
      title: 'Paste your text here',
      body: 'Anything that reads like a chatbot wrote it. For this tour we filled the box with an example that is full of tells.',
      enter: function () { if (!App.hasText()) App.loadSample(); }
    },
    {
      target: '#run',
      title: 'Press Rewrite text',
      body: 'This runs the rules on your text, right here in your browser. Ctrl + Enter does the same thing.',
      next: 'Rewrite the example',
      action: rewriteAndWait
    },
    {
      target: '.sheet-out',
      title: 'Take the clean version',
      body: 'This is the example with the tells removed. Copy it, or save it as a .txt file.',
      enter: function () { App.showTab('clean'); }
    },
    {
      target: '.sheet-out .out-body',
      title: 'Check every edit',
      body: 'Marked changes shows what was cut, struck through in color, and what was added, highlighted. Rules can misfire, so read this before you use the text.',
      enter: function () { App.showTab('marked'); }
    },
    {
      target: '#tally',
      title: 'See what was caught',
      body: function () {
        return 'A count of the edits by type. The example had ' + lastTotal + ' of them.';
      }
    },
    {
      target: '#rules',
      title: 'Choose the rules',
      body: 'Switch off any kind of edit you want to keep, like em dashes in your own writing. Your choices stay saved in this browser.',
      enter: function () { App.setRulesOpen(true); }
    },
    {
      title: 'Your turn',
      body: 'Press Clear to remove the example, then paste your own text. You can replay this tour from the Tour button at the top.',
      next: 'Start writing',
      last: true
    }
  ];

  var lastTotal = 0;
  document.addEventListener('rewrite:done', function (e) { lastTotal = e.detail.total; });

  var el = {}, index = 0, busy = false, prevFocus = null, frame = 0;
  var shells = [];

  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function build() {
    el.block = make('div', 'tour-block');
    el.ring = make('div', 'tour-ring');
    el.pop = make('div', 'tour-pop');
    el.pop.setAttribute('role', 'dialog');
    el.pop.setAttribute('aria-modal', 'true');
    el.pop.setAttribute('aria-labelledby', 'tour-title');
    el.pop.setAttribute('aria-describedby', 'tour-body');
    el.pop.tabIndex = -1;

    el.count = make('p', 'tour-count');
    el.title = make('h2', 'tour-title');
    el.title.id = 'tour-title';
    el.body = make('p', 'tour-body');
    el.body.id = 'tour-body';
    var text = make('div');
    text.setAttribute('aria-live', 'polite');
    text.appendChild(el.count);
    text.appendChild(el.title);
    text.appendChild(el.body);

    var foot = make('div', 'tour-foot');
    el.skip = make('button', 'tour-skip', 'Skip tour');
    el.back = make('button', 'btn', 'Back');
    el.next = make('button', 'btn-primary', 'Next');
    // Screen readers hear the step text along with the focused button.
    el.next.setAttribute('aria-describedby', 'tour-title tour-body');
    [el.skip, el.back, el.next].forEach(function (b) { b.type = 'button'; });
    foot.appendChild(el.skip);
    foot.appendChild(el.back);
    foot.appendChild(el.next);

    el.pop.appendChild(text);
    el.pop.appendChild(foot);

    el.skip.addEventListener('click', finish);
    el.back.addEventListener('click', function () { go(index - 1, -1); });
    el.next.addEventListener('click', onNext);
    el.pop.addEventListener('keydown', onKey);
  }

  function visible(node) {
    return node && node.getClientRects().length > 0 && !node.closest('[hidden]');
  }

  function stepTarget(s) {
    return s.target ? document.querySelector(s.target) : null;
  }

  function start() {
    if (el.pop && el.pop.isConnected) return;
    if (!el.pop) build();
    prevFocus = document.activeElement;
    shells = [document.querySelector('header.top'), document.querySelector('main'), document.querySelector('footer')];
    shells.forEach(function (n) { if (n) n.inert = true; });
    document.body.appendChild(el.block);
    document.body.appendChild(el.ring);
    document.body.appendChild(el.pop);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    go(0, 1);
  }

  function finish() {
    App.store.set(KEY, '1');
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
    shells.forEach(function (n) { if (n) n.inert = false; });
    el.block.remove();
    el.ring.remove();
    el.pop.remove();
    var back = STEPS[index] && STEPS[index].last ? document.getElementById('input') : prevFocus;
    if (back && back.focus) back.focus();
  }

  // Move to step i, skipping steps whose target is not on screen (for example
  // the edit count when nothing was edited).
  function go(i, dir) {
    while (i >= 0 && i < STEPS.length) {
      var s = STEPS[i];
      if (s.enter) s.enter();
      if (!s.target || visible(stepTarget(s))) break;
      i += dir;
    }
    if (i < 0) i = 0;
    if (i >= STEPS.length) { finish(); return; }
    index = i;
    render();
  }

  function render() {
    var s = STEPS[index];
    var total = STEPS.length - 2; // welcome and closing screens are not counted
    el.count.textContent = s.target ? 'Step ' + index + ' of ' + total : '';
    el.count.hidden = !s.target;
    el.title.textContent = s.title;
    el.body.textContent = typeof s.body === 'function' ? s.body() : s.body;
    el.next.textContent = s.next || 'Next';
    el.back.hidden = index === 0;
    el.skip.hidden = !!s.last;

    var t = stepTarget(s);
    if (t) {
      var narrow = window.innerWidth < 620;
      t.scrollIntoView({ block: narrow ? 'start' : 'center', inline: 'nearest' });
    }
    place();
    el.next.focus();
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(place);
  }

  function place() {
    var s = STEPS[index];
    var t = stepTarget(s);
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var narrow = vw < 620;

    el.pop.classList.toggle('is-docked', narrow);
    el.pop.classList.toggle('is-center', !t && !narrow);
    el.block.classList.toggle('is-dim', !t);

    if (!t) {
      el.ring.hidden = true;
      el.pop.style.left = el.pop.style.top = '';
      return;
    }

    var r = t.getBoundingClientRect();
    var pad = 6;
    el.ring.hidden = false;
    el.ring.style.left = (r.left - pad) + 'px';
    el.ring.style.top = (r.top - pad) + 'px';
    el.ring.style.width = (r.width + pad * 2) + 'px';
    el.ring.style.height = (r.height + pad * 2) + 'px';

    if (narrow) { el.pop.style.left = el.pop.style.top = ''; return; }

    // Below, then above, then beside the target; overlap its lower edge only as a last resort.
    var pw = el.pop.offsetWidth, ph = el.pop.offsetHeight, gap = 14, top, left;
    var sideTop = Math.min(Math.max(r.top, 64), vh - ph - 16);
    left = Math.min(Math.max(r.left, 16), vw - pw - 16);
    if (r.bottom + pad + gap + ph <= vh - 16) top = r.bottom + pad + gap;
    else if (r.top - pad - gap - ph >= 64) top = r.top - pad - gap - ph;
    else if (vw - r.right - pad - gap >= pw + 16) { top = sideTop; left = r.right + pad + gap; }
    else if (r.left - pad - gap >= pw + 16) { top = sideTop; left = r.left - pad - gap - pw; }
    else top = vh - ph - 16;
    el.pop.style.left = left + 'px';
    el.pop.style.top = Math.max(top, 64) + 'px';
  }

  function onNext() {
    if (busy) return;
    var s = STEPS[index];
    if (s.last) { finish(); return; }
    if (!s.action) { go(index + 1, 1); return; }
    busy = true;
    el.next.setAttribute('aria-busy', 'true');
    el.next.textContent = 'Rewriting';
    s.action().then(function () {
      busy = false;
      el.next.removeAttribute('aria-busy');
      go(index + 1, 1);
    });
  }

  function rewriteAndWait() {
    return new Promise(function (resolve) {
      var timer = setTimeout(done, 15000); // move on even if the rewrite fails
      function done() {
        clearTimeout(timer);
        document.removeEventListener('rewrite:done', done);
        resolve();
      }
      document.addEventListener('rewrite:done', done);
      App.run();
    });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); finish(); return; }
    if (e.key !== 'Tab') return;
    var items = [el.skip, el.back, el.next].filter(function (b) { return !b.hidden; });
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === el.pop)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  var openBtn = document.getElementById('tour-open');
  if (openBtn) openBtn.addEventListener('click', start);

  if (App.store.get(KEY) !== '1') {
    // Wait a beat so layout and fonts settle before measuring targets.
    setTimeout(start, 350);
  }
})();
