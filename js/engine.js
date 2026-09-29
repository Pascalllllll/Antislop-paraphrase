/*
 * Rewrite engine. Pure functions, no DOM, so it runs in the Web Worker,
 * in the page, and under Node for tests.
 *
 * Text is processed line by line. Each line is rewritten on its own, which
 * keeps the word diff small and lets the worker report progress.
 */
(function (root) {
  'use strict';

  var GROUPS = [
    { id: 'dash', label: 'Em dashes' },
    { id: 'chat', label: 'Chatbot lines and openers' },
    { id: 'vocab', label: 'Buzzwords' },
    { id: 'filler', label: 'Filler and hedges' },
    { id: 'formula', label: 'Formula sentences' },
    { id: 'format', label: 'Formatting tells' }
  ];

  // Sentence start: line start (after an optional list or heading marker),
  // or after closing punctuation.
  var START = String.raw`(^\s*(?:[-*+>]\s+|\d+[.)]\s+|#{1,6}\s+)?|[.!?:]["'”’)\]]*\s+)`;

  function matchCase(src, repl) {
    if (!repl) return repl;
    if (src.length > 1 && src === src.toUpperCase() && /[A-Z]/.test(src)) return repl.toUpperCase();
    if (/^[A-Z]/.test(src)) return repl.charAt(0).toUpperCase() + repl.slice(1);
    return repl;
  }

  function articleFor(word, like) {
    var w = word.toLowerCase();
    var an;
    if (/^(hour|honest|honou?r|heir)/.test(w)) an = true;
    else if (/^(uni|use|usu|ur[aeiou]|eu|one\b|once|u[bcfhjkqrstn][aeiou])/.test(w)) an = false;
    else an = /^[aeiou]/.test(w);
    var a = an ? 'an' : 'a';
    return /^[A-Z]/.test(like) ? a.charAt(0).toUpperCase() + a.slice(1) : a;
  }

  // Word and phrase swaps. [pattern, replacement, group]
  // Patterns are wrapped in \b...\b and matched case-insensitively.
  var SWAPS = [
    // filler
    ['in order to', 'to', 'filler'],
    ['due to the fact that', 'because', 'filler'],
    ['owing to the fact that', 'because', 'filler'],
    ['in spite of the fact that', 'although', 'filler'],
    ['despite the fact that', 'although', 'filler'],
    ['at this point in time', 'now', 'filler'],
    ['at the present time', 'now', 'filler'],
    ['in the event that', 'if', 'filler'],
    ['for the purpose of', 'for', 'filler'],
    ['has the ability to', 'can', 'filler'],
    ['have the ability to', 'can', 'filler'],
    ['is able to', 'can', 'filler'],
    ['are able to', 'can', 'filler'],
    ['a large number of', 'many', 'filler'],
    ['a significant number of', 'many', 'filler'],
    ['the vast majority of', 'most', 'filler'],
    ['the majority of', 'most', 'filler'],
    ['a myriad of', 'many', 'filler'],
    ['a plethora of', 'many', 'filler'],
    ['a wide range of', 'many', 'filler'],
    ['a wide variety of', 'many', 'filler'],
    ['first and foremost', 'first', 'filler'],
    ['each and every', 'every', 'filler'],
    ['prior to', 'before', 'filler'],
    ['subsequent to', 'after', 'filler'],
    ['in close proximity to', 'near', 'filler'],
    ['with regard to', 'about', 'filler'],
    ['with regards to', 'about', 'filler'],
    ['in regard to', 'about', 'filler'],
    ['utilizes', 'uses', 'filler'],
    ['utilized', 'used', 'filler'],
    ['utilizing', 'using', 'filler'],
    ['utilize', 'use', 'filler'],
    ['utilization', 'use', 'filler'],
    ['utilises', 'uses', 'filler'],
    ['utilised', 'used', 'filler'],
    ['utilising', 'using', 'filler'],
    ['utilise', 'use', 'filler'],
    ['commence', 'start', 'filler'],
    ['commenced', 'started', 'filler'],
    ['that being said', 'still', 'filler'],
    ['having said that', 'still', 'filler'],

    // vocabulary
    ['seamlessly', 'smoothly', 'vocab'],
    ['seamless', 'smooth', 'vocab'],
    ['effortlessly', 'easily', 'vocab'],
    ['effortless', 'easy', 'vocab'],
    ['robust', 'solid', 'vocab'],
    ['meticulously', 'carefully', 'vocab'],
    ['meticulous', 'careful', 'vocab'],
    ['pivotal', 'key', 'vocab'],
    ['bustling', 'busy', 'vocab'],
    ['holistic', 'complete', 'vocab'],
    ['synergy', 'cooperation', 'vocab'],
    ['synergies', 'shared gains', 'vocab'],
    ['paradigm shift', 'big shift', 'vocab'],
    ['game-changer', 'big change', 'vocab'],
    ['game changer', 'big change', 'vocab'],
    ['game-changing', 'major', 'vocab'],
    ['revolutionize', 'change', 'vocab'],
    ['revolutionizes', 'changes', 'vocab'],
    ['revolutionized', 'changed', 'vocab'],
    ['revolutionizing', 'changing', 'vocab'],
    ['revolutionise', 'change', 'vocab'],
    ['revolutionising', 'changing', 'vocab'],
    ['streamline', 'simplify', 'vocab'],
    ['streamlines', 'simplifies', 'vocab'],
    ['streamlined', 'simpler', 'vocab'],
    ['streamlining', 'simplifying', 'vocab'],
    ['delve into', 'look at', 'vocab'],
    ['delves into', 'looks at', 'vocab'],
    ['delved into', 'looked at', 'vocab'],
    ['delving into', 'looking at', 'vocab'],
    ['delve deeper', 'look closer', 'vocab'],
    ['delve', 'dig', 'vocab'],
    ['delves', 'digs', 'vocab'],
    ['delving', 'digging', 'vocab'],
    ['embark on', 'start', 'vocab'],
    ['embarks on', 'starts', 'vocab'],
    ['embarked on', 'started', 'vocab'],
    ['embarking on', 'starting', 'vocab'],
    ['ever-evolving', 'changing', 'vocab'],
    ['ever evolving', 'changing', 'vocab'],
    ['ushering in', 'bringing', 'vocab'],
    ['ushers in', 'brings', 'vocab'],
    ['usher in', 'bring', 'vocab'],
    ['navigate the complexities of', 'deal with', 'vocab'],
    ['navigating the complexities of', 'dealing with', 'vocab'],
    ['unlock the full potential of', 'make full use of', 'vocab'],
    ['unlock the potential of', 'make better use of', 'vocab'],
    ['unlock the power of', 'use', 'vocab'],
    ['unlocking the power of', 'using', 'vocab'],
    ['unleash the power of', 'use', 'vocab'],
    ['harness the power of', 'use', 'vocab'],
    ['harnessing the power of', 'using', 'vocab'],
    ['a rich tapestry of', 'a mix of', 'vocab'],
    ['a vibrant tapestry of', 'a mix of', 'vocab'],
    ['a tapestry of', 'a mix of', 'vocab'],
    ['tapestry', 'mix', 'vocab'],
    ['a testament to', 'proof of', 'vocab'],
    ['plays a crucial role in', 'matters for', 'vocab'],
    ['plays a pivotal role in', 'matters for', 'vocab'],
    ['plays a vital role in', 'matters for', 'vocab'],
    ['play a crucial role in', 'matter for', 'vocab'],
    ['play a pivotal role in', 'matter for', 'vocab'],
    ['play a vital role in', 'matter for', 'vocab'],
    ['in the realm of', 'in', 'vocab'],
    ['within the realm of', 'within', 'vocab'],
    ['a new era of', 'a new kind of', 'vocab']
  ];

  // Adjectives dropped when they sit in front of a noun ("a world-class team" -> "a team").
  var DROP_ADJ = [
    'world-class', 'industry-leading', 'best-in-class', 'state-of-the-art',
    'cutting-edge', 'next-generation', 'next-gen', 'groundbreaking', 'ground-breaking',
    'revolutionary', 'innovative', 'unparalleled', 'unrivaled', 'unrivalled',
    'top-notch', 'ultimate', 'transformative'
  ];

  // Sentence-level cuts: the whole sentence is removed.
  var CUT_SENTENCES = [
    [/^I hope (?:this|that|it|these)\b[^]*$/i, 'chat'],
    [/^Hope (?:this|that|it) helps\b[^]*$/i, 'chat'],
    [/^(?:Please )?(?:let me know|feel free to|don['’]t hesitate to|do not hesitate to)\b[^]*$/i, 'chat'],
    [/^If you have any (?:other |more |further |additional )?questions\b[^]*$/i, 'chat'],
    [/^(?:Would you like me to|Do you want me to|Shall I|Want me to|Should I)\b[^]*\?$/i, 'chat'],
    [/^(?:Happy (?:writing|coding|reading|learning|editing)|You['’]re welcome|Great question)[.!]*$/i, 'chat'],
    [/^As an AI(?: language model)?\b[^]*$/i, 'chat'],
    [/^(?:Let['’]s|Let us) (?:dive|jump|get started|get into it|begin|explore|unpack|break (?:it|this) down|take a (?:closer |deeper )?look)\b[^]*$/i, 'chat'],
    [/^In this (?:article|post|guide|blog post|piece|essay|section|tutorial),? (?:we|I)(?:['’]ll| will| are going to| am going to)\b[^]*$/i, 'chat'],
    [/^(?:The future (?:looks|is) (?:bright|promising)|Exciting times (?:lie|are) ahead|Only time will tell|The possibilities are endless|The sky['’]s the limit)\b[^]*$/i, 'formula']
  ];

  // Openers cut from the start of a sentence; the next word gets a capital.
  var CUT_OPENERS = [
    ['Honestly\\?', 'chat'],
    ['Let[\'’]s be (?:honest|real)[,:]', 'chat'],
    ['Here[\'’]s the thing[,:]', 'chat'],
    ['Real talk[,:]', 'chat'],
    ['Here[\'’]s what you need to know[:.]', 'chat'],
    ['Without further ado,', 'chat'],
    ['(?:Certainly|Absolutely|Of course|Great question|Sure thing)[!.,]', 'chat'],
    ['At (?:its|the) core,', 'formula'],
    ['At the end of the day,', 'formula'],
    ['Fundamentally,', 'formula'],
    ['Notably,', 'formula'],
    ['Importantly,', 'formula'],
    ['In conclusion,', 'formula'],
    ['In summary,', 'formula'],
    ['To summarize,', 'formula'],
    ['In today[\'’]s (?:fast-paced|digital|modern|ever-changing|ever-evolving|rapidly changing|interconnected) (?:world|age|era|landscape|society|environment),', 'formula'],
    ['In an (?:era|age) (?:where|when|of) [^,.!?]{1,60},', 'formula'],
    ['It(?:[\'’]s| is) (?:worth noting|important to note|important to remember|worth mentioning|crucial to note|essential to note) that', 'filler'],
    ['It should be noted that', 'filler'],
    ['It could be argued that', 'filler']
  ];

  // Same phrases inside a sentence, where they are simply removed.
  var CUT_INLINE = [
    [/,?\s*\bit(?:['’]s| is) (?:worth noting|important to note|worth mentioning) that\b/gi, 'filler'],
    [/\b(could|may|might|can|would|will)\s+(?:potentially|possibly|perhaps|conceivably)\b/gi, 'filler', '$1'],
    [/\bpotentially possibly\b/gi, 'filler', 'possibly'],
    [/\b(?:perhaps maybe|maybe perhaps)\b/gi, 'filler', 'maybe'],
    [/\b(is|are|was|were|stands as|serves as|stand as|serve as) (?:a |an )?(?:true |real |powerful |clear |living )?testament to\b/gi, 'vocab', function (m, v) {
      var plural = /^(are|were|stand|serve)/i.test(v);
      var past = /^(was|were)$/i.test(v);
      return matchCase(m, past ? 'showed' : plural ? 'show' : 'shows');
    }],
    [/\b(leverag)(e|es|ed|ing)\s+(?=(?:the|our|your|their|its|this|these|those|a|an|existing|AI|data|modern)\b)/gi, 'vocab', function (m, s, end) {
      var map = { e: 'use', es: 'uses', ed: 'used', ing: 'using' };
      return matchCase(m, map[end.toLowerCase()]) + ' ';
    }],
    [/\b(elevat|enhanc)(e|es|ed|ing)\s+(?=(?:your|our|their|the|its|every)\b)/gi, 'vocab', function (m, s, end) {
      var map = { e: 'improve', es: 'improves', ed: 'improved', ing: 'improving' };
      return matchCase(m, map[end.toLowerCase()]) + ' ';
    }],
    [/\bempower(s|ed|ing)?\s+(you|users|teams|people|them|us|everyone|businesses|developers|customers|creators|students)\s+to\s+/gi, 'vocab', function (m, end, who) {
      var map = { '': 'let', s: 'lets', ed: 'let', ing: 'letting' };
      return matchCase(m, map[(end || '').toLowerCase()]) + ' ' + who + ' ';
    }],
    [/\b(foster)(s|ed|ing)?\s+(?=(?:a|an|the)\s+(?:sense|culture|environment|community|spirit|atmosphere)\b)/gi, 'vocab', function (m, s, end) {
      var map = { '': 'build', s: 'builds', ed: 'built', ing: 'building' };
      return matchCase(m, map[(end || '').toLowerCase()]) + ' ';
    }],
    [/\bnext[- ]level\b/gi, 'vocab', 'better']
  ];

  var ACRONYMS = /^(AI|API|APIs|URL|URLs|CEO|CTO|CFO|USA|US|UK|EU|UN|FAQ|PDF|HTML|CSS|SQL|IT|HR|PR|TV|OK|NASA|FBI|CIA|NATO|GDP|ID|IDs|I)$/;

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  var SWAP_RES = SWAPS.map(function (s) {
    var body = escapeRe(s[0]).replace(/ /g, '\\s+').replace(/'/g, "['’]");
    return { re: new RegExp('\\b' + body + '\\b', 'gi'), to: s[1], group: s[2] };
  });

  var DROP_RE = new RegExp(
    '\\b(?:(a|an)\\s+)?(?:' + DROP_ADJ.map(escapeRe).join('|') + ')(?:,?\\s+and\\s+(?=\\w))?\\s+(?=([A-Za-z][\\w-]*))',
    'gi'
  );

  var OPENER_RES = CUT_OPENERS.map(function (o) {
    return { re: new RegExp(START + o[0] + '[ \\t]*([\'"“‘(]?[a-z])?', 'gi'), group: o[1] };
  });

  var EMOJI_RE = /(?![\u00A9\u00AE\u2122\u2194-\u2199])\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*/gu;

  // Keep URLs, emails, and inline code out of every rule.
  var PROTECT_RE = /`[^`\n]+`|\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+|[\w.+-]+@[\w-]+\.[\w.-]+/g;

  function Ctx(opts) {
    this.opts = opts;
    this.counts = {};
    this.transitions = 0;
    GROUPS.forEach(function (g) { this.counts[g.id] = 0; }, this);
  }
  Ctx.prototype.on = function (group) { return this.opts[group] !== false; };
  Ctx.prototype.hit = function (group, n) { this.counts[group] += n || 1; };

  // Replace with a counter. `to` may be a string, a $-pattern, a function, or null (delete).
  function apply(s, re, to, group, ctx) {
    return s.replace(re, function () {
      var args = arguments;
      var m = args[0];
      var out;
      if (to === null) out = '';
      else if (typeof to === 'function') out = to.apply(null, args);
      else if (to.indexOf('$') >= 0) out = to.replace(/\$(\d)/g, function (_, i) { return args[+i] || ''; });
      else out = matchCase(m.replace(/^\s+/, ''), to);
      if (out !== m) ctx.hit(group);
      return out;
    });
  }

  function splitSentences(line) {
    return line.match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)\s*|[.!?]+\s*/g) || [line];
  }

  function words(s) {
    var m = s.match(/[A-Za-z0-9’']+/g);
    return m ? m.length : 0;
  }

  function fixDashes(line, ctx) {
    // Normalize double hyphens and spaced en dashes to em dashes first.
    var s = line
      .replace(/(^|[^-])--(?!-)/g, '$1—')
      .replace(/\s–\s/g, ' — ')
      .replace(/―/g, '—');
    if (s.indexOf('—') < 0) return line;

    return splitSentences(s).map(function (sent) {
      if (sent.indexOf('—') < 0) return sent;
      var trail = sent.match(/\s*$/)[0];
      var body = sent.slice(0, sent.length - trail.length);
      var lead = body.match(/^\s*[-*+>]?\s*—\s*/);
      if (lead) {
        // A dash used as a bullet or dialogue marker.
        ctx.hit('dash');
        body = body.slice(0, lead.index) + lead[0].replace(/—\s*/, '');
      }
      var parts = body.split(/\s*—\s*/);
      if (parts.length === 1) return body + trail;
      var count = parts.length - 1;
      ctx.hit('dash', count);
      var out = parts[0];
      for (var i = 1; i < parts.length; i++) {
        var prev = out;
        var next = parts[i];
        if (!next) continue;
        var sep;
        if (/[,;:.!?]$/.test(prev)) sep = ' ';
        else if (count === 1 && i === parts.length - 1 && words(next) <= 5 && /[.!?]["'”’)]*$/.test(next) && !/^(and|but|or|so|yet|which|who|that|because)\b/i.test(next)) sep = ': ';
        else sep = ', ';
        // Drop a comma right before the closing punctuation of a paired aside.
        out = prev + sep + next;
      }
      out = out.replace(/,\s*([.!?;:])/g, '$1');
      return out + trail;
    }).join('');
  }

  function fixNotJust(s, ctx) {
    s = apply(s, /\b(It|This|That)(['’]s| is| was) not (?:just|only|merely|simply) ([^,;.!?]+?)[,;]\s*(?:it|this|that)(?:['’]s| is| was) ([^.!?]+)/gi,
      function (m, a, v, x, y) { return a + v + ' ' + x + ' and ' + y; }, 'formula', ctx);
    s = apply(s, /\bnot only ((?!(?:does|do|did|is|are|was|were|can|could|will|would|has|have|had)\b)[^,.;!?]+?),? but (?:also )?/gi,
      function (m, x) { return x + ' and '; }, 'formula', ctx);
    return s;
  }

  function fixTransitions(s, ctx) {
    return s.replace(new RegExp(START + '(Moreover|Furthermore|Additionally|In addition),\\s*([a-z])?', 'gi'), function (m, start, word, next) {
      ctx.transitions++;
      ctx.hit('formula');
      if (ctx.transitions === 1) return start + 'Also, ' + (next ? next.toLowerCase() : '');
      return start + (next ? next.toUpperCase() : '');
    });
  }

  function fixCaps(line, ctx) {
    if (!/[a-z]/.test(line)) return line; // an all-caps line is a heading or a deliberate shout
    return line.replace(/\b[A-Z][A-Z'’]*(?:[ ,]+[A-Z][A-Z'’]*){2,}\b/g, function (m, offset) {
      var ws = m.split(/([ ,]+)/);
      var real = ws.filter(function (w, i) { return i % 2 === 0; });
      var acr = real.filter(function (w) { return ACRONYMS.test(w); }).length;
      if (real.length - acr < 3) return m;
      ctx.hit('format');
      var before = line.slice(0, offset);
      var atStart = /(^\s*(?:[-*+>]\s+|\d+[.)]\s+|#{1,6}\s+)?|[.!?]["'”’)]*\s+)$/.test(before);
      return ws.map(function (w, i) {
        if (i % 2 === 1 || ACRONYMS.test(w)) return w;
        var lw = w.toLowerCase();
        if (i === 0 && atStart) lw = lw.charAt(0).toUpperCase() + lw.slice(1);
        return lw;
      }).join('');
    });
  }

  function fixQuotes(line, ctx) {
    var re = /(["“])([^"”\s]{1,30})(["”])/g;
    var n = (line.match(re) || []).length;
    if (n < 3) return line;
    return line.replace(re, function (m, a, w) { ctx.hit('format'); return w; });
  }

  function tidy(s) {
    return s
      .replace(/([^\s])[ \t]{2,}/g, '$1 ')
      .replace(/[ \t]+([,.;:!?])/g, '$1')
      .replace(/,\s*,/g, ',')
      .replace(/,([.;:!?])/g, '$1')
      .replace(/([.!?])\s*,/g, '$1')
      .replace(/^(\s*(?:[-*+>]\s+|\d+[.)]\s+|#{1,6}\s+)?)[,;:]\s*/, '$1')
      .replace(/^(\s*(?:[-*+>]\s+|\d+[.)]\s+|#{1,6}\s+)?)([a-z])/, function (m, p, c) { return p + c.toUpperCase(); })
      .replace(/([.!?]\s+)([a-z])(?=[a-z])/g, function (m, p, c) { return p + c.toUpperCase(); })
      .replace(/[ \t]+$/, '');
  }

  function rewriteLine(line, ctx, isFirstLine) {
    if (!/\S/.test(line)) return line;

    // Pull protected spans out of reach.
    var kept = [];
    var s = line.replace(/[\uE000\uE001]/g, '').replace(PROTECT_RE, function (m) {
      kept.push(m);
      return '\uE000' + (kept.length - 1) + '\uE001';
    });
    var original = s;

    if (ctx.on('chat') && isFirstLine &&
        /^(?:(?:Sure|Certainly|Absolutely|Of course|Great question)[!,.]?\s*)?(?:Here(?:['’]s| is| are) (?:a|an|the|your|some)\b[^\n]{0,100}:|(?:Sure|Certainly|Absolutely|Of course)[!.]?)\s*$/i.test(s)) {
      ctx.hit('chat');
      return '';
    }

    if (ctx.on('format')) {
      s = apply(s, EMOJI_RE, null, 'format', ctx);
      s = apply(s, /\*\*([^*\n]+?)\*\*/g, '$1', 'format', ctx);
      s = apply(s, /(^|[\s(])__([^_\n]+?)__(?=[\s).,;:!?]|$)/g, '$1$2', 'format', ctx);
      s = fixCaps(s, ctx);
      s = fixQuotes(s, ctx);
    }

    if (ctx.on('dash')) s = fixDashes(s, ctx);

    if (ctx.on('chat') || ctx.on('formula')) {
      s = splitSentences(s).filter(function (sent) {
        var t = sent.trim().replace(/^(?:[-*+>]\s+|\d+[.)]\s+|#{1,6}\s+)/, '');
        for (var i = 0; i < CUT_SENTENCES.length; i++) {
          var c = CUT_SENTENCES[i];
          if (ctx.on(c[1]) && c[0].test(t)) { ctx.hit(c[1]); return false; }
        }
        return true;
      }).join('');
    }

    OPENER_RES.forEach(function (o) {
      if (!ctx.on(o.group)) return;
      s = s.replace(o.re, function (m, start, next) {
        ctx.hit(o.group);
        return start + (next ? next.slice(0, -1) + next.slice(-1).toUpperCase() : '');
      });
    });

    if (ctx.on('formula')) {
      s = fixNotJust(s, ctx);
      s = fixTransitions(s, ctx);
    }

    CUT_INLINE.forEach(function (c) {
      if (!ctx.on(c[1])) return;
      s = apply(s, c[0], c.length > 2 ? c[2] : null, c[1], ctx);
    });

    SWAP_RES.forEach(function (w) {
      if (!ctx.on(w.group)) return;
      s = apply(s, w.re, w.to, w.group, ctx);
    });

    if (ctx.on('vocab')) {
      s = apply(s, DROP_RE, function (m, art, next) {
        return art ? articleFor(next, art) + ' ' : '';
      }, 'vocab', ctx);
    }

    if (s !== original) s = tidy(s);

    return s.replace(/\uE000(\d+)\uE001/g, function (m, i) { return kept[+i]; });
  }

  function makeCtx(opts) {
    return new Ctx(opts || {});
  }

  // Rewrite a slice of lines. `state` carries code-fence and first-line
  // tracking across slices so the worker can process in chunks.
  function rewriteLines(lines, ctx, state) {
    var out = new Array(lines.length);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^\s*(```|~~~)/.test(line)) {
        state.inFence = !state.inFence;
        out[i] = line;
        continue;
      }
      if (state.inFence) { out[i] = line; continue; }
      var first = !state.seenText && /\S/.test(line);
      if (/\S/.test(line)) state.seenText = true;
      out[i] = rewriteLine(line, ctx, first);
    }
    return out;
  }

  // Lines that were emptied by a cut are removed, then runs of blank lines
  // collapse to the longest run found in the input.
  function joinOutput(inLines, outLines) {
    var maxBlank = 0, run = 0;
    inLines.forEach(function (l) {
      if (/\S/.test(l)) run = 0; else maxBlank = Math.max(maxBlank, ++run);
    });
    var kept = [];
    for (var i = 0; i < outLines.length; i++) {
      if (!/\S/.test(outLines[i]) && /\S/.test(inLines[i])) continue;
      kept.push(outLines[i]);
    }
    var res = [];
    run = 0;
    kept.forEach(function (l) {
      if (/\S/.test(l)) { run = 0; res.push(l); }
      else if (++run <= Math.max(maxBlank, 1)) res.push(l);
    });
    while (res.length && !/\S/.test(res[0]) && /\S/.test(inLines[0] || '')) res.shift();
    while (res.length > 1 && !/\S/.test(res[res.length - 1])) res.pop();
    return res.join('\n');
  }

  function rewrite(text, opts) {
    var ctx = makeCtx(opts);
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var out = rewriteLines(lines, ctx, { inFence: false, seenText: false });
    return { text: joinOutput(lines, out), lines: out, counts: ctx.counts };
  }

  // Word-level diff (Myers, O((N+M)D)). Returns [op, text] pairs where
  // op is 0 (same), -1 (removed), 1 (added).
  function tokenize(s) {
    return s.match(/\s+|[\w’']+|[^\w\s]/g) || [];
  }

  function diffWords(a, b) {
    if (a === b) return a ? [[0, a]] : [];
    var A = tokenize(a), B = tokenize(b);
    var pre = 0;
    while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
    var suf = 0;
    while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
    var a1 = A.slice(pre, A.length - suf), b1 = B.slice(pre, B.length - suf);
    var mid = myers(a1, b1);
    var ops = [];
    if (pre) ops.push([0, A.slice(0, pre).join('')]);
    mid.forEach(function (o) { ops.push(o); });
    if (suf) ops.push([0, A.slice(A.length - suf).join('')]);
    // merge neighbours with the same op
    var merged = [];
    ops.forEach(function (o) {
      var last = merged[merged.length - 1];
      if (last && last[0] === o[0]) last[1] += o[1];
      else merged.push([o[0], o[1]]);
    });
    return merged;
  }

  // Each step stores only the diagonals it can reach, so memory grows with
  // the number of edits squared, not with the length of the line.
  var MAX_EDITS = 3000;

  function myers(a, b) {
    var n = a.length, m = b.length;
    if (!n) return m ? [[1, b.join('')]] : [];
    if (!m) return [[-1, a.join('')]];
    var max = n + m, off = max;
    var v = new Int32Array(2 * max + 2);
    var trace = [];
    var d, k, x, y, found = false;
    for (d = 0; d <= max && d <= MAX_EDITS; d++) {
      trace.push(v.slice(off - d, off + d + 1));
      for (k = -d; k <= d; k += 2) {
        if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) x = v[off + k + 1];
        else x = v[off + k - 1] + 1;
        y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= n && y >= m) { found = true; break; }
      }
      if (found) break;
    }
    // Too many edits to trace: show the whole span as replaced.
    if (!found) return [[-1, a.join('')], [1, b.join('')]];

    var ops = [];
    x = n; y = m;
    for (; d > 0; d--) {
      var vp = trace[d];
      k = x - y;
      var prevK = (k === -d || (k !== d && vp[k - 1 + d] < vp[k + 1 + d])) ? k + 1 : k - 1;
      var px = vp[prevK + d], py = px - prevK;
      while (x > px && y > py) { ops.push([0, a[--x]]); y--; }
      if (x === px) ops.push([1, b[--y]]);
      else ops.push([-1, a[--x]]);
    }
    while (x > 0 && y > 0) { ops.push([0, a[--x]]); y--; }
    return ops.reverse();
  }

  function countWords(text) {
    var m = text.match(/\S+/g);
    return m ? m.length : 0;
  }

  var api = {
    GROUPS: GROUPS,
    rewrite: rewrite,
    rewriteLines: rewriteLines,
    joinOutput: joinOutput,
    makeCtx: makeCtx,
    diffWords: diffWords,
    countWords: countWords
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Antislop = api;
})(typeof self !== 'undefined' ? self : this);
