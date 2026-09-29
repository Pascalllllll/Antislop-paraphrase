/* Runs the rewrite off the main thread so long texts never freeze the page. */
importScripts('engine.js');

var CHUNK = 400; // lines per progress step

self.onmessage = function (e) {
  var msg = e.data;
  if (!msg || msg.type !== 'rewrite' || typeof msg.text !== 'string') return;
  try {
    var E = self.Antislop;
    var ctx = E.makeCtx(msg.opts || {});
    var lines = msg.text.replace(/\r\n?/g, '\n').split('\n');
    var state = { inFence: false, seenText: false };
    var out = [];
    for (var i = 0; i < lines.length; i += CHUNK) {
      var part = E.rewriteLines(lines.slice(i, i + CHUNK), ctx, state);
      for (var j = 0; j < part.length; j++) out.push(part[j]);
      self.postMessage({ type: 'progress', id: msg.id, done: Math.min(i + CHUNK, lines.length), total: lines.length });
    }
    // Per-line word diff for the marked view. Lines are small, so this stays fast.
    var diff = new Array(lines.length);
    for (var k = 0; k < lines.length; k++) {
      diff[k] = lines[k] === out[k] ? null : E.diffWords(lines[k], out[k]);
    }
    self.postMessage({
      type: 'done',
      id: msg.id,
      text: E.joinOutput(lines, out),
      inLines: lines,
      diff: diff,
      counts: ctx.counts
    });
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String(err && err.message || err) });
  }
};
