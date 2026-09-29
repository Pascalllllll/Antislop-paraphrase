const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');

const r = (t, o) => E.rewrite(t, o).text;

test('em dashes: paired aside becomes commas', () => {
  assert.equal(r('The policy — announced without warning — affects everyone.'),
    'The policy, announced without warning, affects everyone.');
});

test('em dashes: short ending becomes a colon', () => {
  assert.equal(r('There was one problem — money.'), 'There was one problem: money.');
});

test('em dashes: double hyphen counts, markdown rule and ranges do not', () => {
  assert.equal(r('Fast -- and cheap, for a while.'), 'Fast, and cheap, for a while.');
  assert.equal(r('---'), '---');
  assert.equal(r('Pages 10–12 cover it.'), 'Pages 10–12 cover it.');
});

test('chatbot preamble and closers are removed', () => {
  const out = r("Certainly! Here's a rewritten version of your essay:\n\nThe plan works. I hope this helps! Let me know if you need more.");
  assert.equal(out, 'The plan works.');
});

test('openers are cut and the next word is capitalized', () => {
  assert.equal(r("Here's the thing: most teams never read it."), 'Most teams never read it.');
  assert.equal(r("It's important to note that this could potentially slip."), 'This could slip.');
});

test('buzzwords are swapped with case kept', () => {
  assert.equal(r('Seamless sync. We delve into data to leverage our robust stack.'),
    'Smooth sync. We look at data to use our solid stack.');
});

test('decorative adjectives drop and the article is fixed', () => {
  assert.equal(r('We hired an industry-leading team and a innovative agency.'),
    'We hired a team and an agency.');
});

test('formula sentences', () => {
  assert.equal(r("It's not just a dashboard, it's a command center."), "It's a dashboard and a command center.");
  assert.equal(r('She is not only smart but also kind.'), 'She is smart and kind.');
});

test('formatting: bold markers, emoji, shouted clauses', () => {
  assert.equal(r('## 🚀 Launch'), '## Launch');
  assert.equal(r('- **Speed:** faster pages'), '- Speed: faster pages');
  assert.equal(r('We are late and WE MUST ACT NOW before Friday.'), 'We are late and we must act now before Friday.');
  assert.equal(r('THIS WHOLE LINE IS A HEADING'), 'THIS WHOLE LINE IS A HEADING');
});

test('URLs, emails, inline code and fenced code are left alone', () => {
  const t = 'See https://x.com/a--b and `in order to` or me--you@ex.com.\n```\nleverage — robust\n```';
  assert.equal(r(t), t);
});

test('rules can be switched off', () => {
  assert.equal(r('A seamless — fast tool.', { vocab: false }), 'A seamless: fast tool.');
  assert.equal(r('A seamless — fast tool.', { dash: false }), 'A smooth — fast tool.');
});

test('clean human text passes through unchanged', () => {
  const t = "I went back to the shop on Tuesday. The owner, a tall guy named Ray, still remembered me.\n\nWe talked about his dog for twenty minutes.";
  assert.equal(r(t), t);
});

test('counts reflect edits', () => {
  const res = E.rewrite('A seamless tool — really.');
  assert.equal(res.counts.vocab, 1);
  assert.equal(res.counts.dash, 1);
});

test('word diff reconstructs both sides', () => {
  const a = 'We will leverage the robust data in order to win.';
  const b = E.rewrite(a).text;
  const d = E.diffWords(a, b);
  assert.equal(d.filter(x => x[0] <= 0).map(x => x[1]).join(''), a);
  assert.equal(d.filter(x => x[0] >= 0).map(x => x[1]).join(''), b);
});

test('handles 40,000+ words quickly', () => {
  const para = "In today's digital age, we leverage robust tools — seamlessly — in order to delve into data. I hope this helps!\n";
  const big = para.repeat(2500); // ~45k words
  const t0 = Date.now();
  const res = E.rewrite(big);
  assert.ok(Date.now() - t0 < 5000);
  assert.ok(!res.text.includes('—'));
});

test('one huge line with many edits diffs without blowing memory', () => {
  const line = "We leverage robust tools — seamlessly — in order to delve into data. ".repeat(3000);
  const out = E.rewrite(line).text;
  const d = E.diffWords(line, out);
  assert.equal(d.filter(x => x[0] <= 0).map(x => x[1]).join(''), line);
  assert.equal(d.filter(x => x[0] >= 0).map(x => x[1]).join(''), out);
});

test('diff correctness on random edits', () => {
  const words = 'the a cat dog ran sat on mat , . and'.split(' ');
  for (let i = 0; i < 300; i++) {
    const gen = () => Array.from({ length: Math.floor(Math.random() * 30) }, () => words[Math.floor(Math.random() * words.length)]).join(' ');
    const a = gen(), b = gen();
    const d = E.diffWords(a, b);
    assert.equal(d.filter(x => x[0] <= 0).map(x => x[1]).join(''), a);
    assert.equal(d.filter(x => x[0] >= 0).map(x => x[1]).join(''), b);
  }
});
