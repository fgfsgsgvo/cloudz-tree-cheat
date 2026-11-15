/**
 * Part 1, "Where's your spot on my Christmas tree?" — every scene of the film (docs/christmas-game/tree/
 * DIRECTORS-SCRIPT.md), on the shared engine window.XM (core.js).
 *
 * The art is ours (public/christmas/img, made in Google Flow, tools/christmas/prepare_art.py): the room, the painted
 * tree, the star, the box, the ornaments and the whole cast. The lights, hooks and names are drawn here, on top.
 *
 * The tree is one tall layer (320 × 640 units) inside a camera; TILT = translateY of the layer, WIDE = scale. The
 * friend is a glass bauble with their name; every right answer lifts it one notch and lights that tier.
 */
(function () {
  'use strict';

  var X = window.XM, C = X.C, h = X.h, t = X.t, tn = X.tn;
  var KEY_CREATOR = 'XM_tree_creator';
  var notifiedFriend = null;                             // a notification's ?friend={id}: their answers open over the tree
  var KEY_FROM = 'XM_tree_from';                         // the play a comeback tree came from: {quiz, player, key, at} (phase 7)
  var FROM_DAYS = 3;                                     // a tree made later than that is the friend's own idea, not the comeback
  function comebackFrom() {
    var from = X.store(KEY_FROM);
    return from && from.at && Date.now() - from.at < FROM_DAYS * 864e5 ? { quiz: from.quiz, player: from.player, key: from.key } : undefined;
  }
  var QUESTIONS = C.rules.questions, PERFECT = C.rules.perfect;

  // ══════════════════════════════════════ the tree (our picture + lights drawn in code) ═══════════════════════
  var W = 320, H = 640, CX = 160;
  // tree-bare.webp in the layer: its tip at y 40, the tub's foot at 606 (tools/christmas/prepare_art.py trims it)
  var TREE_BOX = { left: -1.4, top: 30.8, width: 322.8, height: 582.5 };
  // the painted tree's half width every 8 units from y 40 down to the tub (y 535), measured on tree-bare.webp
  var PROFILE = [1, 8, 11, 14, 18, 23, 31, 36, 31, 35, 46, 53, 50, 44, 52, 63, 64, 57, 59, 68, 77, 79, 73, 70, 79, 90, 93, 91, 80, 90,
    100, 101, 97, 88, 95, 105, 117, 119, 115, 101, 110, 122, 130, 131, 128, 122, 112, 120, 132, 142, 144, 142, 137, 142, 147, 150, 150, 149, 145, 137, 109, 101];
  /** The tree's half width at height y. */
  function halfWidth(y) {
    var i = (y - 40) / 8, a = Math.floor(i);
    if (a < 0 || a >= PROFILE.length - 1) { return 0; }
    return PROFILE[a] + (PROFILE[a + 1] - PROFILE[a]) * (i - a);
  }
  // the 10 strings of lights, bottom (1) to top (10): just above the scalloped edge of each tier of the painting
  var TIER_Y = [517, 477, 432, 374, 327, 278, 241, 198, 157, 121];
  // where the friend's bauble hangs at each notch (left / right of the trunk, never on the same side twice)
  // (the two lowest in front of the trunk: there the camera can't rise above the cast, who stand at both sides)
  var NOTCH_SIDE = [-.16, .14, -.5, .46, -.44, .5, -.46, .42, -.4, .2];
  // (the first, on the lowest tier, hangs in front of the trunk: there the cast stands at both sides of the shot)
  var DECO_SIDE = [-.08, -.52, .48, -.5, .52, -.46, .5, -.5, .44, -.42];
  // the creator's 10 decorations, one per answer (the 6th is the local one where there is one: a parol in the
  // Philippines, a paper star lantern for Indian users)
  var DECOS = ['bell', 'candy-cane', 'bow', 'gingerbread', 'snowflake', 'red', 'present', 'pinecone', 'heart', 'icicle'];
  if (C.localDecoration && X.hasArt('ornament-' + C.localDecoration)) { DECOS[5] = C.localDecoration; }
  function decoration(n, cls) { return X.artPic('ornament-' + DECOS[n - 1], 'xm-deco' + (cls ? ' ' + cls : '')); }
  // the decorations box on the floor, left of the trunk (the host stands on the right)
  var BOX = [112, 604];
  // (the box ending's tiny twig hangs by the trunk: further right, the kneeling host would cover it)
  var IN_BOX = [112, 520], TOP_HOOK = [CX, 70], FRONT_SPOT = [CX, 300], LOW_BRANCH = [222, 452], TINY_TWIG = [192, 468];
  function notchPoint(n) {
    if (n <= 0) { return IN_BOX; }
    var y = TIER_Y[n - 1] - 20;
    return [CX + NOTCH_SIDE[n - 1] * halfWidth(y + 8), y];
  }
  function decoPoint(n) {
    var y = TIER_Y[n - 1] - 16;
    return [CX + DECO_SIDE[n - 1] * halfWidth(y + 8), y];
  }
  var BULB_COLORS = ['#FF5A55', '#FFD34D', '#7FD1AE', '#FF7EB0', '#7FB6FF'];
  // the ten bulbs painted on ui-garland.webp (x as a fraction of its width; measured on the picture)
  var GARLAND_BULBS = [.062, .163, .264, .362, .46, .557, .656, .752, .853, .953];
  function f(n) { return Math.round(n * 10) / 10; }

  /**
   * The tree: the living room behind it (`room`, the summer room for the southern hemisphere by `season`), the
   * painted tree, then in SVG the dimmer, the 10 strings of lights (`lights`) and the star's glow, then the star.
   * Fixed markup from the numbers above, no user text. One box of 320 × 640 units (the layer's shape).
   */
  function treeArt(opts, cls) {
    var box = h('div.xm-tree-art' + (cls ? '.' + cls : ''));
    if (opts.room) {
      box.appendChild(X.artPic(opts.season === 'summer' && X.hasArt('bg-living-room-summer') ? 'bg-living-room-summer' : 'bg-living-room-winter', 'xm-room-bg'));
    }
    var tree = X.artPic('tree-bare', 'xm-tree-pic');
    tree.style.cssText = 'left:' + f(TREE_BOX.left / W * 100) + '%;top:' + f(TREE_BOX.top / H * 100) + '%;width:' + f(TREE_BOX.width / W * 100) + '%';
    box.appendChild(tree);
    box.appendChild(X.svg(treeMarkup(opts)));
    var star = X.artPic('prop-star', 'xm-star-pic');
    box.appendChild(star);
    return box;
  }
  function treeMarkup(opts) {
    var s = '<svg class="xm-tree-svg" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true" preserveAspectRatio="xMidYMax meet">'
      + '<defs>'
      + '<radialGradient id="xmGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF3B0" stop-opacity=".95"/><stop offset=".4" stop-color="#FFD34D" stop-opacity=".45"/><stop offset="1" stop-color="#FFD34D" stop-opacity="0"/></radialGradient>'
      + '</defs>';
    if (opts.room) {
      // the dimmer before the last question: the room goes dark, only the tree glows
      s += '<rect class="xm-dimmer" width="' + W + '" height="' + H + '" fill="#0B0F24"/>';
    }
    if (opts.lights !== false) {
      for (var n = 1; n <= 10; n++) {
        var y = TIER_Y[n - 1], hw = halfWidth(y) * .9, x0 = CX - hw, x2 = CX + hw, y0 = y - 8, y1 = y + 14;
        s += '<g class="xm-tier" data-n="' + n + '"><path d="M' + f(x0) + ' ' + y0 + ' Q' + CX + ' ' + y1 + ' ' + f(x2) + ' ' + y0 + '" fill="none" stroke="#2A3A30" stroke-width="1.6"/>';
        var count = Math.max(3, Math.round(hw * 2 / 21));
        for (var j = 0; j < count; j++) {
          var tt = (j + .5) / count, bx = (1 - tt) * (1 - tt) * x0 + 2 * (1 - tt) * tt * CX + tt * tt * x2;
          var by = (1 - tt) * (1 - tt) * y0 + 2 * (1 - tt) * tt * y1 + tt * tt * y0;
          var c = BULB_COLORS[(j + n) % BULB_COLORS.length];
          s += '<circle class="xm-glow" cx="' + f(bx) + '" cy="' + f(by + 3) + '" r="8" fill="' + c + '" style="animation-delay:-' + ((j * 7 + n * 3) % 10) / 5 + 's"/>'
            + '<circle class="xm-bulb" cx="' + f(bx) + '" cy="' + f(by + 3) + '" r="3.6" style="--c:' + c + '"/>';
        }
        s += '</g>';
      }
    }
    // the star's glow (the star itself is our picture, on top)
    s += '<g class="xm-star"><circle class="xm-star-glow" cx="' + CX + '" cy="' + STAR_Y + '" r="50" fill="url(#xmGlow)"/></g>';
    return s + '</svg>';
  }
  var STAR_Y = 26;

  // the Head Elf (our own design: mint hat with one bell, round spectacles, a pencil) and the house puppy
  function elf(cls, poseName) { return X.artPic('elf-' + (poseName || 'clipboard'), 'xm-elf' + (cls ? ' ' + cls : '')); }
  // the Elf on the stage is a character (so his animated stickers play); elsewhere a plain picture
  function elfPose(el, poseName) { if (el.classList.contains('xm-char')) { X.pose(el, 'elf', poseName); } else { X.setArt(el, 'elf-' + poseName); } }
  /**
   * An answer's picture: our card with the creator's own character acting it out (ans-{cat|bear}-{question}-{option})
   * when it's drawn, else the question bank's photo.
   */
  function answerImg(qid, index, kind) {
    var name = 'ans-' + kind + '-' + qid + '-' + index;
    var img = X.hasArt(name) ? X.artPic(name, 'xm-ans-pic') : h('img', { src: X.answerPic(qid, index), alt: '', loading: 'eager', decoding: 'async' });
    img.addEventListener('error', function () { img.remove(); });
    return img;
  }
  function answerUrl(qid, index, kind) { var name = 'ans-' + kind + '-' + qid + '-' + index; return X.hasArt(name) ? X.artUrl(name) : X.answerPic(qid, index); }

  // ── the baubles ──────────────────────────────────────────────────────────────────────────────────────────
  var BAUBLE_COLORS = [['#FF6A63', '#B42B29'], ['#FFE07A', '#C99A12'], ['#5CC48A', '#23704A'], ['#6FA2F0', '#2B5AA6'],
    ['#FF7EB0', '#C7336A'], ['#A884F0', '#6340A6'], ['#B8C6E0', '#66779C']];   // (the silver deep enough for a white name)
  function colorOf(name) {
    var hsh = 2166136261;
    for (var i = 0; i < name.length; i++) { hsh ^= name.charCodeAt(i); hsh = Math.imul(hsh, 16777619); }
    return BAUBLE_COLORS[(hsh >>> 0) % BAUBLE_COLORS.length];
  }
  /** The name's size on the glass: full up to 3 letters, smaller for longer names so the whole name always fits. */
  function nameScale(name) { return f(Math.min(1, 3.6 / Math.max(1, Array.from(name).length)) * 100) / 100; }
  /** A name may take two lines at its spaces: sized by its longest word and the line count. */
  function bigNameScale(name) {
    var words = name.split(/\s+/), longest = Math.max.apply(null, words.map(function (w) { return Array.from(w).length; }));
    return f(Math.min(words.length > 1 && Array.from(name).length > 6 ? .62 : 1, 4.4 / Math.max(1, longest)) * 100) / 100;
  }
  /** Whether a name can be painted whole on a bauble big enough to read: two words at most, none over 10 letters. */
  function paintsWhole(name) {
    var words = name.trim().split(/\s+/);
    return words.length <= 2 && words.every(function (w) { return Array.from(w).length <= 10; });
  }
  /**
   * A glass bauble with a name painted on it (the name as a text node). Seeing your own name on the glass is the game,
   * so every bauble big enough to read carries the whole name (on two lines at a space: "Priyanka", "Mohammed Ali");
   * only the small ones at the back, and a name too long for any glass, get a monogram with the name on a tag below.
   */
  function bauble(name, cls) {
    var c = colorOf(name), chars = Array.from(name);
    var big = /is-big/.test(cls || ''), small = /is-back|is-rival|is-sheet/.test(cls || '');
    var mono = !big && chars.length > 5 && (small || !paintsWhole(name));
    if (!mono && !big && chars.length > 3) { cls = (cls ? cls + '.' : '') + 'is-wrap'; }
    var tag = mono && (!/is-back|is-sheet/.test(cls || '') || /is-you/.test(cls || ''));   // the friend's own always has it
    // on the tree it really hangs: its shadow on the needles behind, the wire, cap and glass swinging from the hook,
    // and a tip of the branch in front of the hook (both stay put while the bauble swings; place() fits them)
    var el = h('div.xm-bauble' + (cls ? '.' + cls : '') + (mono ? '.is-mono' : ''), { style: '--b1:' + c[0] + ';--b2:' + c[1] + ';--fs:' + (mono ? 1 : big || chars.length > 3 ? bigNameScale(name) : nameScale(name)) },
      h('i.xm-bauble-shadow'),
      h('span.xm-bauble-swing', h('i.xm-bauble-cap'), h('span.xm-bauble-glass', h('span.xm-bauble-name', mono ? chars[0].toUpperCase() : name)),
        tag ? h('span.xm-bauble-tag', name) : null),
      X.svg(TWIG));
    return el;
  }
  // the tip of a branch, drawn like the painted tree's tiers: its green, the dark band over the scalloped edge and
  // the brown outline (the top and the sides fade into the tree, tree.css)
  var TWIG = '<svg class="xm-bauble-twig" viewBox="0 0 100 40" aria-hidden="true">'
    + '<path d="M0 0H100V18Q88 40 72 22Q50 46 28 22Q12 40 0 18Z" fill="#3C9C5A"/>'
    + '<path d="M100 14Q88 36 72 18Q50 42 28 18Q12 36 0 14" fill="none" stroke="#1D6E40" stroke-width="5"/>'
    + '<path d="M100 18Q88 40 72 22Q50 46 28 22Q12 40 0 18" fill="none" stroke="#301C10" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // a bauble this low is in the decorations box, not on a branch
  var BOXED_Y = 500;
  /**
   * A bauble put on the tree at pt (layer units): the branch tip over its hook is as wide as the tree there allows
   * (none at the very edge, none in the box); a bauble that flies there hides it on the way and lands with a swing,
   * the branch dipping under its weight.
   */
  /**
   * A whole name on the glass, measured: smaller, step by step, until no line is cut ("Mohammed": wide letters beat a
   * letter count) and the lines stay inside the glass. Measured again once the fonts arrive.
   */
  function fitGlassName(el) {
    var nm = el.querySelector('.xm-bauble-name'), glass = el.querySelector('.xm-bauble-glass');
    if (!nm || !el.classList.contains('is-wrap') || el.xmFitted === nm.textContent) { return; }
    var fit = function () {
      if (!el.isConnected || !glass.clientWidth) { return; }
      var fs = parseFloat(el.style.getPropertyValue('--fs')) || 1;
      for (var k = 0; k < 30 && fs > .12 && (nm.scrollWidth > nm.clientWidth + 1 || nm.offsetHeight > glass.clientHeight * .74); k++) {
        fs = fs * .93; el.style.setProperty('--fs', f(fs * 1000) / 1000);
      }
      el.xmFitted = nm.textContent;
      // the friend's own bauble never carries a name too small to read: then the big letter, the name on its tag
      if (el.classList.contains('is-friend') && parseFloat(getComputedStyle(nm).fontSize) < 10) {
        var name = nm.textContent;
        el.classList.remove('is-wrap'); el.classList.add('is-mono');
        el.style.setProperty('--fs', 1);
        nm.textContent = Array.from(name)[0].toUpperCase();
        if (!el.querySelector('.xm-bauble-tag')) { el.querySelector('.xm-bauble-swing').appendChild(h('span.xm-bauble-tag', name)); }
      }
    };
    fit();
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { el.xmFitted = null; fit(); }); }
  }
  function hangBauble(el, pt, layer) {
    fitGlassName(el);
    var boxed = pt[1] >= BOXED_Y;
    var room = halfWidth(pt[1] + 4) - Math.abs(pt[0] - CX), bw = el.offsetWidth / Math.max(1, layer.offsetWidth) * W;
    var twig = bw ? Math.min(.95, room * 1.9 / bw) : .95;
    el.style.setProperty('--twig', f(twig * 100) / 100);
    el.classList.toggle('is-edge', twig < .34);
    var flying = el.style.top && el.style.transition !== 'none' && !X.reduceMotion
      && (el.style.top !== f(pt[1] / H * 100) + '%' || el.style.left !== f(pt[0] / W * 100) + '%');
    clearTimeout(el.xmLand);
    if (!flying) { el.classList.remove('is-flying'); el.classList.toggle('is-boxed', boxed); return; }
    el.classList.add('is-flying');
    el.classList.remove('is-landed');
    el.xmLand = setTimeout(function () {
      el.classList.remove('is-flying');
      el.classList.toggle('is-boxed', boxed);
      if (!boxed) { el.getBoundingClientRect(); el.classList.add('is-landed'); }
    }, 780);
  }
  function setBaubleName(el, name) {
    el.querySelector('.xm-bauble-name').textContent = name;
    el.style.setProperty('--fs', el.classList.contains('is-big') ? bigNameScale(name) : nameScale(name));
    if (el.classList.contains('is-big')) { el.classList.add('is-wrap'); el.xmFitted = null; fitGlassName(el); }   // the invitation's, as typed
    var c = colorOf(name || '?');
    el.style.setProperty('--b1', c[0]); el.style.setProperty('--b2', c[1]);
  }

  // ── the camera on the tree ───────────────────────────────────────────────────────────────────────────────
  /**
   * The tree in its room, behind a camera. opts: {room, lights, full (the whole tree, for the scoreboard), lit (all
   * lights on), decorated (the creator's 10 decorations)}. Returns the camera's controls.
   */
  function treeCam(opts) {
    opts = opts || {};
    var layer = h('div.xm-layer');
    layer.appendChild(treeArt({ room: opts.room !== false, season: C.season, lights: true }));
    // the open decorations box on the floor (the friend's bauble sits inside it, peeking over the flaps)
    var boxFront = X.artPic('prop-box-open', 'xm-box-front');
    layer.append(boxFront);
    // behind the layer: the room again, soft, so the wide shot has no empty bands at its sides
    var backdrop = opts.room !== false ? X.artPic(C.season === 'summer' ? 'bg-living-room-summer' : 'bg-living-room-winter', 'xm-cam-backdrop') : null;
    // the shot: the room and tree move together for punch-ins and shakes; the cast stands in front, steady
    var shot = h('div.xm-shot', layer);
    var cam = h('div.xm-cam' + (opts.full ? '.is-full' : '') + (opts.cls ? '.' + opts.cls : ''), backdrop, shot);
    function at(el, pt) { el.style.left = f(pt[0] / W * 100) + '%'; el.style.top = f(pt[1] / H * 100) + '%'; return el; }
    at(boxFront, [BOX[0], BOX[1] - 44]);
    if (opts.decorated) {
      for (var n = 1; n <= 10; n++) { layer.appendChild(at(decoration(n, ''), decoPoint(n))); }
    }
    // a camera taller than the layer (a tall phone's stage) gets a wider layer, centred, so the room fills it
    if (!opts.full && window.ResizeObserver) {
      new ResizeObserver(function () {
        var cw = cam.clientWidth, ch = cam.clientHeight, lw = Math.max(cw, ch / 2);
        layer.style.width = lw + 'px';
        layer.style.left = ((cw - lw) / 2) + 'px';
        // the shot in progress, re-framed for the new size
        if (ctl.last) {
          var l = ctl.last;
          if (l[0] === 'wide') { ctl.wide(l[1]); } else if (l[0] === 'on') { ctl.focusOn(l[1], l[2]); } else if (l[0] === 'at') { ctl.focusAt(l[1], l[2]); } else { ctl.focus(l[1], true); }
        }
      }).observe(cam);
    }
    var ctl = {
      el: cam, layer: layer, at: at,
      /** TILT: centre the camera on height y (layer units). */
      focus: function (y, instant) {
        if (opts.full) { return; }
        ctl.last = ['focus', y];
        cam.classList.remove('is-wide');
        var camH = cam.clientHeight, LH = layer.offsetHeight;
        var ty = Math.max(camH - LH, Math.min(0, camH / 2 - y / H * LH));
        if (instant) { layer.style.transition = 'none'; }
        layer.style.transform = 'translateY(' + f(ty) + 'px)';
        if (instant) { layer.offsetHeight; layer.style.transition = ''; }
      },
      /**
       * TILT so that height y (layer units) shows `screenY` px from the stage's top. Where the tree ends before that
       * point can rise so high (a tall stage, a low branch), the camera PUSHES IN instead, the tree's foot staying on
       * the stage's floor (up to 1.4×: closer, the other baubles would look giant).
       */
      focusAt: function (y, screenY, instant) {
        if (opts.full) { return; }
        ctl.last = ['at', y, screenY];
        if (instant) { layer.style.transition = 'none'; requestAnimationFrame(function () { layer.offsetHeight; layer.style.transition = ''; }); }
        cam.classList.remove('is-wide');
        var camH = cam.clientHeight, LH = layer.offsetHeight, ty = screenY - y / H * LH, s = 1;
        if (ty < camH - LH && y < H) {
          s = Math.min(1.4, Math.max(1, (camH - screenY) / (LH * (1 - y / H))));
          ty = Math.max(camH - LH * s, screenY - y / H * LH * s);
        }
        layer.style.transform = 'translateY(' + f(Math.min(0, ty)) + 'px)' + (s > 1 ? ' scale(' + f(s * 1000) / 1000 + ')' : '');
      },
      /**
       * TILT on height y so a thing objH px tall there shows in full above the cast's heads — framed again whenever the
       * stage changes size (the next question's answers fill the panel after the camera moves).
       */
      focusOn: function (y, objH) {
        ctl.focusAt(y, ctl.clearTop(objH));
        ctl.last = ['on', y, objH];
      },
      /**
       * Where on the stage (px from its top) a thing `objH` px tall shows in full: in the clear band between the garland
       * and the cast's heads (the answer panel's rounded edge covers the stage's last 30px), else just under the garland.
       */
      clearTop: function (objH) {
        var top = 0, bottom = cam.clientHeight - 30;
        var g = cam.querySelector('.xm-garland');
        if (g) { top = g.offsetTop + g.offsetHeight * .8; }
        cam.querySelectorAll('.xm-cam-host, .xm-cam-elf').forEach(function (c) { if (c.style.visibility !== 'hidden') { bottom = Math.min(bottom, c.offsetTop + 6); } });
        // the lines the cast say rise just over their heads (two lines ≈ 70px): a band tall enough keeps that for them
        if (bottom - 72 - top >= objH + 8) { bottom -= 72; } else if (bottom - 40 - top >= objH + 8) { bottom -= 40; }
        return bottom - top >= objH + 8 ? top + (bottom - top - objH) / 2 : top + 4;
      },
      /** WIDE: the whole tree in the frame; `top` px of headroom kept clear (a title over the shot). */
      wide: function (top) {
        if (opts.full) { return; }
        top = top || 0;
        ctl.last = ['wide', top];
        cam.classList.add('is-wide');                    // the progress garland steps out of the shot (the star!)
        var s = (cam.clientHeight - top) / layer.offsetHeight;
        layer.style.transform = 'translateY(' + top + 'px) scale(' + f(s * 1000) / 1000 + ')';
      },
      light: function (n, on) { var g = layer.querySelector('.xm-tier[data-n="' + n + '"]'); if (g) { g.classList.toggle('is-on', on !== false); } },
      lightAll: function (step) {
        var ps = [];
        for (var n = 1; n <= 10; n++) { ps.push(X.pause((n - 1) * (step || 0)).then(ctl.light.bind(null, n, true))); }
        return Promise.all(ps);
      },
      /** A bulb on tier n fizzles out (a wrong answer). */
      fizzle: function (n) {
        var g = layer.querySelector('.xm-tier[data-n="' + Math.min(10, Math.max(1, n)) + '"]');
        if (!g) { return; }
        var bulbs = g.querySelectorAll('.xm-bulb'), b = bulbs[Math.floor(Math.random() * bulbs.length)];
        b.classList.remove('is-fizzle'); b.getBoundingClientRect(); b.classList.add('is-fizzle');
      },
      star: function (on) { layer.classList.toggle('is-star', on !== false); },
      dim: function (on) { cam.classList.toggle('is-dim', on !== false); },
      /** Put an element on the tree at a point (layer units). */
      place: function (el, pt) {
        if (!el.parentNode) { layer.appendChild(el); }
        if (el.classList.contains('xm-bauble')) { hangBauble(el, pt, layer); }
        return at(el, pt);
      },
      lid: function () {},
      /** A quick push-in on the moment (a right answer, a reveal). */
      punch: function (k) {
        if (X.reduceMotion || !shot.animate) { return; }
        shot.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + (k || 1.05) + ')', offset: .35 }, { transform: 'scale(1)' }], { duration: 900, easing: 'cubic-bezier(.3,0,.2,1)' });
      },
      /** The room jolts (a wrong answer). */
      shake: function () {
        if (X.reduceMotion || !shot.animate) { return; }
        shot.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-7px,2px) rotate(-.6deg)' }, { transform: 'translate(6px,-2px) rotate(.5deg)' },
          { transform: 'translate(-4px,1px)' }, { transform: 'translate(0,0)' }], { duration: 420, easing: 'ease-out' });
      },
      /** A point (layer units) as px inside the camera, for sparkles. */
      toCam: function (pt) {
        var lr = layer.getBoundingClientRect(), cr = cam.getBoundingClientRect();
        return [lr.left - cr.left + pt[0] / W * lr.width, lr.top - cr.top + pt[1] / H * lr.height];
      }
    };
    if (opts.lit) { ctl.lightAll(0); ctl.star(true); }
    return ctl;
  }

  /** The score's zone on the tree (= the ending): the server's rule (TreeStory::ending), for the film only. */
  function zoneOf(score) { return score >= 9 ? 'top' : score >= 7 ? 'front' : score >= 5 ? 'bottom' : 'box'; }
  // the scoreboard's spots per zone: four in front, the rest smaller behind
  // (a front bauble is 48 units wide and ~62 tall: no two of a zone's four overlap)
  var ZONE_SPOTS = {
    top: [[CX, 70], [132, 158], [188, 158], [CX, 224]],
    front: [[CX, 300], [104, 324], [216, 324], [CX, 356]],
    bottom: [[222, 452], [98, 452], [CX, 474], [280, 474]],
    box: [[112, 520], [94, 528], [130, 528], [112, 534]]
  };
  var ZONE_BACK = { top: [[148, 104], [172, 104], [120, 156], [200, 156]], front: [[132, 296], [188, 296], [80, 352], [240, 352]],
    bottom: [[150, 440], [286, 480], [110, 470], [200, 440]], box: [[102, 524], [122, 524], [88, 532], [136, 532]] };
  // a crowded zone fills each back spot again a little to one side: a small ring around the spot, never drifting into
  // the next zone however many friends land there (the board shows a page of 50)
  var BACK_RING = [[0, 0], [-6, -5], [6, -5], [-6, 5], [6, 5], [0, -9], [-10, 0], [10, 0]];
  /**
   * A crowded tree: a name tag (under a monogram bauble) that would land on another bauble or another tag stays off,
   * the front baubles' tags first. Worked out in tree units from the spots, before the reveal (no tag pops off mid-film).
   */
  function untangleTags(placed) {
    // a bauble from its hook (the wire and the cap count: a tag over them looks as wrong as one over the glass)
    var box = function (x) { var bw = x.s.back ? 35.2 : 48; return [x.s.pt[0] - bw / 2, x.s.pt[1], x.s.pt[0] + bw / 2, x.s.pt[1] + bw * 1.3]; };
    var hits = function (a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; };
    var glass = placed.map(box), kept = [];
    // the friend's own name first and always (the rest give way to it), then the front ones
    var rank = function (x) { return x.el.classList.contains('is-you') ? 0 : x.s.back ? 2 : 1; };
    placed.map(function (x, i) { return i; }).sort(function (a, b) { return rank(placed[a]) - rank(placed[b]); }).forEach(function (i) {
      var x = placed[i];
      if (!x.el.querySelector('.xm-bauble-tag')) { return; }
      var w = Math.min(121.6, Array.from(x.p.name).length * 6.9 + 14), tag = [x.s.pt[0] - w / 2, glass[i][3] + 1, x.s.pt[0] + w / 2, glass[i][3] + 19];
      var hit = rank(x) > 0 && (glass.some(function (g, j) { return j !== i && hits(g, tag); }) || kept.some(function (k) { return hits(k, tag); }));
      x.el.classList.toggle('is-untagged', hit);
      if (!hit) { kept.push(tag); }
    });
  }
  /**
   * A tree with many friends (more than CROWD) is decorated all over, like a real one: the hooks are a grid across the
   * whole width of every tier (rows offset like a brick wall, never on the creator's own ornaments). In rank order, the
   * best four hang big where they belong (the top hook first); everyone else takes the highest free hook no higher than
   * their own group's line (ZONE_FLOOR), so the best still hang highest and a crowded group spills down the tree
   * instead of piling up on one spot. "Still in the box" stays in the box.
   */
  var CROWD = 12, ZONE_FLOOR = { top: 90, front: 236, bottom: 392 };
  var HOOKS = (function () {
    var hooks = [], decos = [];
    for (var n = 1; n <= 10; n++) { decos.push(decoPoint(n)); }
    // spaced like a real tree's ornaments (about 35 on it): the lights and the creator's ornaments show between them
    for (var y = 116, row = 0; y <= 486; y += 35, row++) {
      var hw = halfWidth(y + 10) * .8, count = Math.max(1, Math.floor(hw * 2 / 42)), step = hw * 2 / count;
      for (var i = 0; i < count; i++) {
        var x = CX - hw + step * (i + .5) + (row % 2 ? step / 4 : -step / 4);
        if (decos.some(function (d) { return Math.abs(d[0] - x) < 20 && Math.abs(d[1] - y) < 20; })) { continue; }
        hooks.push([f(x), y]);
      }
    }
    // highest first; on a row, the middle first (the tree fills from its centre line outward)
    return hooks.sort(function (a, b) { return a[1] - b[1] || Math.abs(a[0] - CX) - Math.abs(b[0] - CX); });
  })();
  function crowdLayout(players, highlight) {
    var big = [], used = [], box = 0, zoneBig = { top: 0, front: 0, bottom: 0, box: 0 };
    var near = function (p, q, d) { return Math.abs(p[0] - q[0]) < d && Math.abs(p[1] - q[1]) < d * 1.1; };
    var spots = players.map(function (p, rank) {
      if (p.ending === 'box') { return spotFor('box', box++); }
      if (big.length < 4) {
        var pt = ZONE_SPOTS[p.ending][zoneBig[p.ending]++];
        big.push(pt);
        return { pt: pt, back: false };
      }
      var floor = ZONE_FLOOR[p.ending] || 90;
      var hook = HOOKS.filter(function (h) { return h[1] >= floor && used.indexOf(h) === -1 && !big.some(function (b) { return near(h, b, 34); }); })[0];
      if (!hook) { return { pt: null, back: true }; }        // a tree this full: the list names them
      used.push(hook);
      return { pt: hook, back: true, crowd: true };
    });
    // the friend looking always finds their own bauble: off a full tree, they take the most central hook of their
    // own group's height from whoever had it (that friend stays in the list)
    var me = highlight ? players.findIndex(function (p) { return p.id === highlight; }) : -1;
    if (me >= 0 && !spots[me].pt) {
      var floor = ZONE_FLOOR[players[me].ending] || 90, best = -1;
      spots.forEach(function (s, i) {
        if (!s.crowd || s.pt[1] < floor) { return; }
        if (best < 0 || Math.abs(s.pt[1] - floor - 40) + Math.abs(s.pt[0] - CX) < Math.abs(spots[best].pt[1] - floor - 40) + Math.abs(spots[best].pt[0] - CX)) { best = i; }
      });
      if (best >= 0) { spots[me] = spots[best]; spots[best] = { pt: null, back: true }; }
    }
    return spots;
  }
  function spotFor(zone, i) {
    if (i < 4) { return { pt: ZONE_SPOTS[zone][i], back: false }; }
    var back = ZONE_BACK[zone], j = (i - 4) % back.length, ring = BACK_RING[Math.floor((i - 4) / back.length) % BACK_RING.length];
    return { pt: [back[j][0] + ring[0], back[j][1] + ring[1]], back: true };
  }

  // ── shared bits of the scenes ────────────────────────────────────────────────────────────────────────────
  /** A title on the big ribbon: smaller, half a pixel at a time, until it sits on the band (a long name, German…). */
  function fitTitle(el) {
    var fit = function () {
      if (!el.isConnected) { return; }
      el.style.fontSize = '';
      var size = parseFloat(getComputedStyle(el).fontSize);
      while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && size > 11) { size -= .5; el.style.fontSize = size + 'px'; }
    };
    requestAnimationFrame(fit);
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(fit); }
  }
  /** The top bar: the site's brand (the homepage's logo; its name in letters if none is set). The game stands alone. */
  function topBar() {
    var brand = C.siteLogo
      ? h('img.xm-site-logo', { src: C.siteLogo, alt: 'Cloudz.fun', width: 847, height: 211, decoding: 'async' })
      : ['cloudz', h('span', '.fun')];
    return h('div.xm-top', h('a.xm-site' + (C.siteLogo ? '.is-logo' : ''), { href: '/' }, brand));
  }
  /**
   * The landing's language switch, as Bail Me Out's and Don't Block Me's: a field (globe · this language in its own
   * name · the round arrow); a tap opens the drawer with every language in its own name, this one ticked. One tap switches.
   */
  function languagePicker() {
    var codes = Object.keys(C.languages || {});
    if (codes.length < 2) { return null; }
    var field = h('button.xm-langfield', { type: 'button', 'aria-haspopup': 'dialog', 'aria-label': '🌐 ' + C.languages[C.locale],
      onclick: function () { X.sfx('tap'); openLanguages(field, codes); } },
      h('span.xm-langfield-globe', { 'aria-hidden': 'true' }, '🌐'), h('b', C.languages[C.locale]),
      h('span.xm-langfield-arrow', { 'aria-hidden': 'true' }));
    return field;
  }
  function openLanguages(field, codes) {
    var sheet = h('div.xm-sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': field.getAttribute('aria-label') });
    var close = X.sheetBack(function () { document.removeEventListener('keydown', esc); sheet.remove(); field.focus({ preventScroll: true }); });   // Back closes it
    var esc = function (e) { if (e.key === 'Escape') { close(); } };
    var list = h('div.xm-langlist', codes.map(function (code) {
      var now = code === C.locale;
      return h('a' + (now ? '.is-now' : ''), { href: C.base + '/' + code, lang: (C.hreflangs || {})[code] || null, 'aria-current': now ? 'true' : null,
        onclick: function (e) { if (now) { e.preventDefault(); close(); } } }, C.languages[code]);
    }));
    var panel = h('div.xm-sheet-panel.is-langs', h('div.xm-sheet-head', h('span.xm-langfield-globe', { 'aria-hidden': 'true' }, '🌐'),
      h('div', h('h2.xm-h2', C.languages[C.locale])),
      h('button.xm-sheet-close', { type: 'button', 'aria-label': t('ui.close'), onclick: close }, '×')), list);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) { close(); } });
    document.addEventListener('keydown', esc);
    sheet.appendChild(panel);
    document.body.appendChild(sheet);
    X.enter(panel, 0, 'main', { y: 60 });
    var current = list.querySelector('.is-now');
    if (current) { current.scrollIntoView({ block: 'center' }); }
  }
  /** A game button with the premium press; a double tap counts once (no two scenes, films or saves from one tap). */
  /** A small text link (the friend's result: under the one main button); the same double-tap guard as button(). */
  function textLink(label, onclick) {
    var last = 0;
    return h('button.xm-link.is-dark', { type: 'button', onclick: function (e) {
      var now = Date.now();
      if (now - last < 800) { return; }
      last = now;
      return onclick.call(this, e);
    } }, label);
  }
  function button(label, cls, onclick) {
    var last = 0;
    return h('button.xm-btn' + (cls ? '.' + cls : ''), { type: 'button', onclick: function (e) {
      var now = Date.now();
      if (now - last < 800) { return; }
      last = now;
      return onclick.call(this, e);
    } }, label);
  }
  /** The cast in the camera: the Elf (top left, the announcer) and the host (bottom right, beside the tree). */
  function castIn(cam, gender) {
    var kind = X.kindOf(gender);
    // sized by the phone's height, not the stage's: the stage is measured before the answers fill the panel below it,
    // and a host sized from that would cover half the tree on a small phone
    var hostH = Math.round(Math.min(170, Math.max(96, Math.min(cam.el.clientHeight * .38, window.innerHeight * .19))));
    var host = X.character(kind, 'wave', hostH, 'xm-cam-host');
    // the Elf is a little shorter than the host; his line sits above his head (both scale with the stage)
    var elfH = Math.round(hostH * .88);
    cam.el.style.setProperty('--elf-h', elfH + 'px');
    var elfEl = X.character('elf', 'clipboard', elfH, 'xm-cam-elf');
    cam.el.append(elfEl, host);
    return { elf: elfEl, host: host, kind: kind };
  }
  // the lines: the Elf's above his head (bottom left), the host's above theirs (bottom right)
  // each speaker owns half the stage (they often talk at once), so their bubbles never overlap
  var QUICK = 450;   // ms a line that stays up holds the next beat back once typed (it is read along with what comes)
  var ELF_SAYS = { who: 'elf', pos: 'left:8px;bottom:calc(var(--elf-h, 150px) + 30px);max-width:min(230px, calc(50% - 12px))', tail: 30 };
  function hostSays(cast) {
    var left = cast.host.parentNode && cast.host.parentNode.classList.contains('is-swap');
    return { who: 'creator', pos: (left ? 'left:8px;' : 'right:8px;') + 'bottom:' + (parseFloat(cast.host.style.height) + 34) + 'px;max-width:min(230px, calc(50% - 12px))',
      tail: left ? 30 : 'calc(100% - 50px)' };
  }

  // ══════════════════════════════════════ ACT 1 — the creator ═══════════════════════════════════════════════
  var draft = {};

  /** 1.1 The window: a warm-lit window on a snowy street, a bare tree inside, the host with a bauble. */
  function landing() {
    X.setHeroGender(null);
    var root = X.scene('is-landing.is-staged');
    var kind = Math.random() < .5 ? 'cat' : 'bear';
    // the hero: the snowy street at night, the warm window of the house; the title in the sky; the host in the snow
    var host = X.character(kind, 'wave', 150, 'xm-hero-host');
    var lights = X.svg(titleLights(), 'xm-title-lights');
    var title = h('div.xm-logo.xm-landing-title', h('span.xm-logo-top', t('tree.landing.title1')), h('span.xm-logo-main', lights, t('tree.landing.title2')));
    var win = h('div.xm-hero', X.artPic('bg-snowy-window', 'xm-hero-bg'), h('i.xm-hero-glow'), title, X.artPic('prop-box-open', 'xm-hero-box'), host);
    setTimeout(function () { X.fitText(title.children); }, 0);   // "Weihnachtsbaum?" on a 320 px phone: smaller, never cut
    X.snow(win, 30);
    var cta = button(t('tree.landing.cta'), 'is-gold', function () {
      if (C.createUrl) { X.track('tree_start_moved'); location.href = X.createHref(KEY_CREATOR); return; }   // new trees: c.cloudz.fun
      X.track('tree_start');
      cta.disabled = true;
      X.sfx('whoosh');
      X.music(true);
      // the camera flies into the warm window
      if (win.animate && !X.reduceMotion) {
        win.style.transformOrigin = '50% 46%';
        X.ended(win.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(3.2)', opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.55,0,.75,0)', fill: 'forwards' })).then(stocking);
      } else { stocking(); }
    });
    var steps = h('ol.xm-steps', [1, 2, 3].map(function (n) {
      return h('li.xm-step', h('span.xm-step-n', String(n)), h('span', h('strong', t('tree.howto.' + n + '.title')), ' ', t('tree.howto.' + n + '.text')));
    }));
    var panel = h('div.xm-play.is-page', X.artPic('ui-snow', 'xm-play-snow'), h('p.xm-sub.xm-center', t('tree.landing.sub')), cta, h('p.xm-small.xm-center', t('tree.landing.meta')),
      languagePicker(), steps);   // the switch under the button: "Decorate my tree" stays in sight on a small phone
    root.append(win, panel);
    win.appendChild(h('div.xm-hero-top', topBar()));
    X.enter(host, 500, 'pop', { y: 40, s: .7 });
    X.enter(title, 250, 'accent', { y: 20, s: .9 });
    X.pause(1300).then(function () { lights.classList.add('is-on'); X.sfx('sparkle'); });
    X.cascade(panel.querySelectorAll('.xm-sub, .xm-btn, .xm-small, .xm-langfield, .xm-step'), 700, 90);
    // idle: the host tries a bauble on the tree, frowns, tries another
    (function idle(i) {
      X.pause(3200).then(function () {
        if (!host.isConnected) { return; }
        X.pose(host, kind, ['admire', 'wave', 'thumbs-up', 'wave'][i % 4]);
        X.move(host, 'hop');
        idle(i + 1);
      });
    })(0);
    X.preloadCast(['cat', 'bear']);
  }
  /** The string of lights over "Christmas tree?" (fixed markup). */
  function titleLights() {
    var s = '<svg viewBox="0 0 240 24" aria-hidden="true"><path d="M4 6 Q120 26 236 6" fill="none" stroke="#23222B" stroke-width="2"/>';
    for (var i = 0; i < 9; i++) {
      var tt = (i + .5) / 9, x = (1 - tt) * (1 - tt) * 4 + 2 * (1 - tt) * tt * 120 + tt * tt * 236, y = (1 - tt) * (1 - tt) * 6 + 2 * (1 - tt) * tt * 26 + tt * tt * 6;
      s += '<circle class="xm-glow" cx="' + f(x) + '" cy="' + f(y + 3) + '" r="7" fill="' + BULB_COLORS[i % 5] + '" style="animation-delay:-' + (i % 4) / 2 + 's"/><circle class="xm-bulb" cx="' + f(x) + '" cy="' + f(y + 3) + '" r="3.6" style="--c:' + BULB_COLORS[i % 5] + '"/>';
    }
    return s + '</svg>';
  }

  /** 1.2 Your stocking: the name is painted on the first stocking as it's typed; the cat or the bear. */
  function stocking() {
    var root = X.scene('is-stocking.is-staged');
    var nameOn = h('span.xm-stocking-name');
    var stockings = h('div.xm-stockings', [0, 1, 2].map(function (i) {
      return h('div.xm-stocking' + (i === 0 ? '.is-mine' : ''), X.artPic('prop-stocking', 'xm-stocking-svg' + (i ? ' is-' + i : '')), i === 0 ? nameOn : null);
    }));
    var elfOnMantel = elf('xm-mantel-elf');
    // the painting, the stockings on its hooks and the Elf on its shelf move as one (positions are the picture's)
    var mantel = h('div.xm-mantel', h('div.xm-mantel-art', X.artPic('bg-fireplace-close', 'xm-mantel-bg'), stockings, elfOnMantel));
    // the name shrinks until its longest word fits the stocking's width (it may wrap only between words), never below
    // a size that can be read; a single word longer than that breaks instead
    var fitName = function () {
      requestAnimationFrame(function () {
        var fs = 1;
        nameOn.style.setProperty('--fs', fs);
        nameOn.style.overflowWrap = '';
        while (fs > .7 && nameOn.scrollWidth > nameOn.clientWidth + 1) {
          fs -= .05; nameOn.style.setProperty('--fs', fs.toFixed(2));
        }
        if (nameOn.scrollWidth > nameOn.clientWidth + 1) { nameOn.style.overflowWrap = 'anywhere'; }
      });
    };
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { if (nameOn.textContent) { fitName(); } }); }
    if (draft.name) { fitName(draft.name); }
    var input = h('input.xm-input', { type: 'text', maxlength: String(C.rules.nameMax), placeholder: t('tree.stocking.placeholder'), autocomplete: 'off', enterkeyhint: 'next', 'aria-label': t('tree.stocking.label') });
    if (draft.name) { input.value = draft.name; nameOn.textContent = draft.name; }
    input.addEventListener('input', function () {
      nameOn.textContent = X.cleanName(input.value);
      fitName(nameOn.textContent);
      nameOn.classList.remove('is-paint'); nameOn.getBoundingClientRect(); nameOn.classList.add('is-paint');
      err.textContent = '';
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { input.blur(); } });
    var err = h('div.xm-error', { role: 'alert' });
    var gender = draft.gender || null;
    var cards = h('div.xm-who', ['female', 'male'].map(function (g) {
      var kind = X.kindOf(g), pic = X.character(kind, 'wave', 92);
      var card = h('button.xm-who-card' + (gender === g ? '.is-picked' : ''), { type: 'button', 'aria-pressed': gender === g ? 'true' : 'false', onclick: function () {
        gender = g;
        cards.querySelectorAll('.xm-who-card').forEach(function (c) { var on = c === card; c.classList.toggle('is-picked', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        X.pose(pic, kind, 'cheer'); X.move(pic, 'hop');
        X.sfx(kind + '-hello');
        var other = cards.querySelector('.xm-who-card:not(.is-picked) .xm-char');
        if (other) { X.pose(other, other.getAttribute('data-kind'), 'wave'); }
        err.textContent = '';
        X.buzz(10);
      } }, pic, h('span', t('tree.stocking.' + (g === 'female' ? 'girl' : 'boy'))));
      return card;
    }));
    var next = button(t('tree.stocking.next'), 'is-green', function () {
      var name = X.cleanName(input.value);
      if (!name) { err.textContent = t('tree.stocking.nameError'); next.classList.remove('is-shake'); next.getBoundingClientRect(); next.classList.add('is-shake'); input.focus(); return; }
      if (!gender) { err.textContent = t('tree.stocking.genderError'); next.classList.remove('is-shake'); next.getBoundingClientRect(); next.classList.add('is-shake'); return; }
      next.disabled = true;
      draft.name = name; draft.gender = gender;
      X.setHeroGender(gender);
      // the questions load while the stocking swings and the moods come in
      loadQuestions();
      var mine = stockings.querySelector('.is-mine');
      mine.classList.add('is-swing');
      X.sfx('bulb', 5);
      // the elf on the mantel says it (the cat or bear isn't at the fireplace): just under him (the logo and the sound
      // button are above), clear of the creator's own stocking on the left
      X.sayBy(mantel, t('tree.stocking.hi', { name: name }), elfOnMantel, { who: 'elf', below: true, gap: 10, maxWidth: 'calc(62% - 12px)' });
      X.pause(1300).then(mood);
    });
    var panel = h('div.xm-play.is-page', X.artPic('ui-snow', 'xm-play-snow'),
      h('label.xm-label', t('tree.stocking.label')), input, err,
      h('div.xm-label', t('tree.stocking.who')), cards, h('p.xm-small', t('tree.stocking.hint')), next);
    mantel.appendChild(h('div.xm-hero-top', topBar()));
    root.append(mantel, panel);
    X.enter(mantel, 0, 'main', { y: -20 });
    X.enter(elfOnMantel, 350, 'pop', { y: -30, s: .6 });
    X.cascade(root.querySelectorAll('.xm-label, .xm-input, .xm-who-card, .xm-small, .xm-btn'), 250, 60);
  }

  /** 1.3 Your Christmas mood: six cards (more on demand, or "Surprise me"); the host acts the pick out. */
  function mood() {
    var root = X.scene('is-mood.is-staged');
    var kind = X.kindOf(draft.gender);
    var order = X.shuffle(C.moods), page = 0, chosen = draft.mood || null, pages = Math.ceil(order.length / 6);
    var host = X.character(kind, 'wave', 150);
    var hostBox = h('div.xm-moodhost', X.artPic('bg-sofa', 'xm-moodhost-bg'), host);
    var grid = h('div.xm-moods');
    function card(key) {
      return h('button.xm-mood' + (key === chosen ? '.is-picked' : ''), { type: 'button', 'data-mood': key, onclick: function () { choose(key); } },
        // with its picture the card drops the line's closing emoji (the picture says it)
        X.hasArt('mood-' + key) ? X.artPic('mood-' + key, 'xm-mood-pic') : null,
        h('span', X.hasArt('mood-' + key) ? t('tree.mood.' + key).replace(/\s*(?:\p{Extended_Pictographic}|️|‍)+\s*$/u, '') : t('tree.mood.' + key)));
    }
    function render(first) {
      var keys = order.slice(page * 6, page * 6 + 6);
      if (first && keys.indexOf(first) === -1) { keys = [first].concat(keys.slice(0, 5)); }
      grid.textContent = '';
      keys.forEach(function (k) { grid.appendChild(card(k)); });
      // a long word ("Weihnachtssongs") a little smaller on a narrow card, never past it (again once the fonts are in);
      // Japanese and Korean keep their own rule (a phrase wider than the card breaks, tree.css)
      if (!/^(ja|ko)/.test(C.hreflang || '')) { X.fitText(grid.querySelectorAll('.xm-mood > span')); }
      X.cascade(grid.children, 0, 60, 'pop', { y: 14, s: .9, r: -3 });
    }
    function choose(key) {
      chosen = key;
      grid.querySelectorAll('.xm-mood').forEach(function (b) { b.classList.toggle('is-picked', b.getAttribute('data-mood') === key); });
      X.pose(host, kind, ['cheer', 'gasp', 'laugh', 'thumbs-up'][Math.floor(Math.random() * 4)]); X.move(host, 'hop');
      X.sfx('tap'); X.sfx(kind + '-giggle');
      X.say(hostBox, t('tree.mood.say.' + key), { who: 'creator', pos: 'left:8%;right:8%;max-width:none;text-align:center;top:calc(60px + env(safe-area-inset-top))', tail: 'calc(50% - 8px)' });
      cta.disabled = false;
      X.buzz(10);
    }
    var more = h('button.xm-chip', { type: 'button', onclick: function () { page = (page + 1) % pages; render(); } }, t('tree.mood.more'));
    var surprise = h('button.xm-chip', { type: 'button', onclick: function () {
      var key = X.pick(order.filter(function (k) { return k !== chosen; }));
      if (!grid.querySelector('[data-mood="' + key + '"]')) { render(key); }
      choose(key);
    } }, t('tree.mood.surprise'));
    var cta = button(t('tree.mood.cta'), 'is-green', function () { draft.mood = chosen; decorate(); });
    cta.disabled = !chosen;
    hostBox.appendChild(h('div.xm-hero-top', topBar()));
    root.append(hostBox, h('div.xm-play.is-page', X.artPic('ui-snow', 'xm-play-snow'), h('h2.xm-h2.xm-center', tn('tree.mood.heading', { creator: draft.name }, ['creator'])),
      h('p.xm-sub.xm-center', t('tree.mood.sub')), grid, h('div.xm-chips', more, surprise), cta));
    render(chosen);
    if (chosen) { choose(chosen); }
    X.enter(host, 200, 'pop', { y: 30, s: .8 });
  }

  /**
   * The answers fit their cards without a word split (fitText); a word too long for three columns even at the
   * smallest size (Tamil "போனிடெயில்" on a 360 px phone) puts that question's answers in two columns instead.
   */
  function fitAnswers(tag, opts) {
    var texts = Array.from(opts.querySelectorAll('.xm-opt-text'));
    X.fitText([tag].concat(texts));
    var check = function () {
      if (opts.classList.contains('is-many') && texts.some(function (el) { return el.style.overflowWrap === 'anywhere'; })) {
        opts.classList.remove('is-many');
        X.fitText(texts);
      }
    };
    check();
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { setTimeout(check, 0); }); }
  }

  /** The creator's questions (their gender's set): asked for while the stocking swings, asked again if that failed. */
  function loadQuestions() {
    draft.questionsPromise = X.api('GET', '/questions?' + new URLSearchParams({ gender: draft.gender, locale: C.locale, country: C.country || '' }).toString());
    draft.questionsPromise.catch(function () {});
    return draft.questionsPromise;
  }

  /** 1.4 Decorating: ten questions about you; each answer hangs a decoration and switches on that tier's lights. */
  function decorate() {
    var root = X.scene('is-climb.is-decorate');
    // a load that failed (a weak signal back on the mood screen) is tried again, never the same failure for ever
    var first = draft.questionsPromise.catch(loadQuestions).then(function (res) {
      var q = res.questions[0];
      return X.loadUrls(q.options.map(function (o, i) { return answerUrl(q.id, i, X.kindOf(draft.gender)); })).then(function () { return res; });
    });
    X.gate(first, 900).then(function (res) {
      if (!res || !res.questions || !res.questions.length) { X.toast(t('ui.error')); mood(); return; }
      // the same stage as the friend's climb: the room, the bare tree, the garland of progress; the questions on the
      // panel under a red ribbon ("Ornament k / 10"); each answer = a real ornament hung on its tier, lights on
      var tag = h('span.xm-ribbon-text');
      var cam = treeCam({ cls: 'is-stage' });
      var meter = h('div.xm-garland', { 'aria-hidden': 'true' }, X.artPic('ui-garland', 'xm-garland-pic'),
        GARLAND_BULBS.map(function (x, i) { return h('i', { 'data-n': i + 1, style: 'left:' + (x * 100) + '%' }); }));
      cam.el.appendChild(meter);
      var qbox = h('div.xm-qbox');
      var play = h('div.xm-play', X.artPic('ui-snow', 'xm-play-snow'), h('div.xm-ribbon', X.artPic('ui-ribbon', 'xm-ribbon-pic'), tag), qbox);
      play.style.setProperty('--holly', 'url("' + X.artUrl('ui-holly') + '")');
      root.append(cam.el, play);
      var cast = castIn(cam, draft.gender), kind = cast.kind, host = cast.host;
      cam.focus(TIER_Y[0], true);
      X.music(true);
      var queue = res.questions.slice(), answers = [];
      function next() {
        if (answers.length === QUESTIONS) { lightsOn(answers, cam, host, kind, qbox, cast); return; }
        if (!queue.length) { X.toast(t('ui.error')); landing(); return; }
        var q = queue[0], k = answers.length + 1;
        if (queue[1]) { X.loadUrls(queue[1].options.map(function (o, i) { return answerUrl(queue[1].id, i, kind); })); }
        tag.textContent = t('tree.decorate.tag', { k: k, n: QUESTIONS });
        elfPose(cast.elf, k % 2 ? 'clipboard' : 'pencil-lick');
        X.pose(host, kind, 'wave');
        // the tier this answer decorates, framed where its ornament will show in full (above the cast's heads)
        cam.focusOn(decoPoint(k)[1], cam.layer.offsetWidth * .085 * 1.3);
        var locked = false;
        var opts = h('div.xm-opts' + (q.options.length > 4 ? '.is-many' : q.options.length > 2 ? '.is-grid' : ''));
        q.options.forEach(function (text, index) {
          var img = answerImg(q.id, index, kind);
          var b = h('button.xm-opt', { type: 'button', onclick: function () {
            if (locked) { return; }
            locked = true;
            b.classList.add('is-picked');
            X.sfx('tap');
            X.buzz(12);
            answers.push({ quesID: q.id, optionIndex: index });
            queue.shift();
            hang(k).then(next);
          } }, img, h('span.xm-opt-text', X.fill(text, draft.name)));
          opts.appendChild(b);
        });
        var skip = h('button.xm-link.is-dark', { type: 'button', onclick: function () { if (locked) { return; } locked = true; X.sfx('swipe'); queue.push(queue.shift()); next(); } }, t('tree.decorate.skip'));
        var card = h('div.xm-q', X.marked(q.question, draft.name));
        qbox.textContent = '';
        qbox.append.apply(qbox, [card, opts, k <= 2 ? h('p.xm-small.xm-center.is-dark', t('tree.decorate.hint')) : null, h('div.xm-center', skip)].filter(Boolean));
        fitAnswers(tag, opts);
        X.enter(card, 0, 'main', { y: -16 });
        X.cascade(opts.children, 160, 60, 'pop', { y: 22, s: .92 });
      }
      /** The host hangs ornament k on tier k: it drops in, the tier's lights come on, the garland bulb lights. */
      function hang(k) {
        // a long list of answers scrolled the tree away: it comes back into view for the ornament and its lights
        if (window.scrollY > 4) { window.scrollTo({ top: 0, behavior: X.reduceMotion ? 'auto' : 'smooth' }); }
        var deco = cam.place(decoration(k, 'is-new'), decoPoint(k));
        X.enter(deco, 0, 'pop', { y: -60, s: .4 });
        X.pose(host, kind, k % 3 ? 'hang' : 'straighten');
        // straighten is drawn reaching away from the tree; turned round, the paw reaches for the ornament just hung
        if (k % 3 === 0) { host.classList.add('is-mirrored'); }
        X.sfx('pop');
        return X.pause(380).then(function () {
          cam.light(k, true);
          cam.punch(1.03);
          var g = meter.querySelector('[data-n="' + k + '"]');
          if (g) { g.classList.add('is-on'); }
          X.sfx('bulb', k);
          var p = cam.toCam(decoPoint(k));
          X.sparkle(cam.el, p[0], p[1], 8);
          if (k % 4 === 0) { X.sfx(kind + '-giggle'); }
          return X.pause(560);
        });
      }
      next();
    });
  }

  /**
   * 1.5 Lights on: the whole tree blazes on, the star lights up, the camera finds ten empty hooks ("Perfect.
   * Almost."), a flash and a Polaroid. The tree is saved meanwhile; the share screen follows.
   */
  function lightsOn(answers, cam, host, kind, qbox, cast) {
    var body = { userName: draft.name, userGender: draft.gender, mood: draft.mood, answers: answers, country: C.country, locale: C.locale,
      from: comebackFrom(),                            // the named comeback: the creator who brought them hears about it
      submissionId: X.randomId(24) };                  // a resend after a lost answer gets the same tree, not a second one
    var saved = (function book(n) {
      return X.api('POST', '/quizzes', body).catch(function (e) {
        if (e.refused) { throw e; }
        if (n < 2) { return X.wait(1500 * (n + 1)).then(function () { return book(n + 1); }); }
        return X.waitForConnection(e).then(function () { return book(0); });
      });
    })(0);
    var root = cam.el.closest('.xm-scene');
    var says = hostSays(cast);
    var play = qbox.closest('.xm-play');
    qbox.textContent = '';
    var note = h('p.xm-small.xm-center.xm-saving.is-dark', { hidden: true }, t('tree.share.saving'), h('span.xm-dots', h('i'), h('i'), h('i')));
    qbox.appendChild(note);
    // the panel steps aside; the camera pulls back; the host plugs in the lights; the star; ten empty hooks
    var film = X.pause(200).then(function () {
      play.classList.add('is-hidden');
      cam.wide();
      cam.lightAll(0);
      X.pose(host, kind, 'plug');
      elfPose(cast.elf, 'eye-roll');
      X.sfx('whoosh');
      return X.pause(900);
    }).then(function () {
      // the plug goes in: everything blazes brighter, the star bursts
      cam.punch(1.06);
      cam.star(true);
      X.sfx('top');
      var p = cam.toCam([CX, STAR_Y]);
      X.sparkle(cam.el, p[0], p[1], 22);
      X.snow(root, 16);
      X.pose(host, kind, 'gasp');
      X.sfx(kind + '-happygasp');
      return X.pause(900);
    }).then(function () {
      for (var n = 1; n <= 10; n++) {
        var hook = cam.place(h('span.xm-hook', h('i', '?')), notchPoint(n));
        X.enter(hook, n * 60, 'pop', { s: .3, y: -10 });
        (function (n) { X.pause(n * 60).then(function () { X.sfx('bulb', n); }); })(n);
      }
      X.pose(host, kind, 'admire');
      return X.sayHold(cam.el, t('tree.lights.almost'), says, 1300);
    }).then(function () {
      var flash = h('div.xm-flash');
      root.appendChild(flash);
      X.sfx('pop');
      X.pose(host, kind, 'thumbs-up');
      X.say(cam.el, t('tree.lights.cheese'), says);
      return X.pause(900).then(function () { flash.remove(); });
    });
    film.then(function () { play.classList.remove('is-hidden'); });
    film.then(function () { note.hidden = false; });
    Promise.all([saved, film]).then(function (all) {
      var res = all[0];
      var me = { id: res.quiz.id, userKey: res.userKey, name: res.quiz.name, gender: res.quiz.gender, mood: res.quiz.mood };
      X.store(KEY_CREATOR, me);
      X.store(KEY_FROM, null);                          // told once
      X.track('tree_create', { mood: me.mood, comeback: body.from ? 1 : 0 });
      draft = {};
      myTree(me, true);
    }, function () {
      film.then(function () { X.toast(t('ui.error')); stocking(); });
    });
  }

  /**
   * The creator's tree: share it ("Your tree needs friends"), then the tree with every friend's bauble at the height they
   * reached, the ranked list (tap → their answers) and "Take my tree down".
   */
  function myTree(me, fresh) {
    X.setHeroGender(me.gender);
    sendPreview(me);
    pushSubscribe(window.cloudzFcmToken);                // the creator may already have a token from an earlier page
    // a "friend found their spot" notification opens that friend's answers over the tree (once)
    if (notifiedFriend) {
      var friend = notifiedFriend;
      notifiedFriend = null;
      X.api('GET', '/quizzes/' + me.id + '/players/' + friend + '?locale=' + encodeURIComponent(C.locale), null, me.userKey)
        .then(function (res) { friendAnswers(me, res.player); }, function () { /* removed since: just the tree */ });
    }
    var link = C.shareBase + me.id;
    var share = X.shareButtons(link, t('tree.share.text', { link: '' }).trim(), function (channel) { X.track('tree_share', { channel: channel }); });
    var shareBlock = h('div.xm-share-block', h('h2.xm-h2.xm-center', fresh ? t('tree.share.heading') : t('tree.board.mine')),
      h('p.xm-sub.xm-center', t('tree.share.sub')), share);
    var listBox = h('div.xm-board'), count = h('p.xm-small.xm-center');
    // a fresh tree (no friends yet) leads with sharing; a tree with friends leads with who's on it
    var panel = fresh ? [shareBlock, count, listBox, deleteBlock(me)] : [count, listBox, shareBlock, deleteBlock(me)];
    revealScene(me.name, me.gender, fresh, panel, function (cam) {
      return loadBoard(me.id, cam, listBox, count, me).catch(function (e) {
        if (e && e.refused && e.status === 404) { X.store(KEY_CREATOR, null); landing(); }
      });
    });
  }

  var IMG = C.assets + '/img/', VER = '?v=' + C.assetVersion;

  /**
   * The tree's link-preview picture (js/tree-preview.js): drawn here in the background and uploaded once, so the link
   * shows the creator's own tree and name in WhatsApp etc. Never blocks the flow; a failed try is retried once on the
   * next visit to the tree. The server accepts it only within an hour of saving (TreePreview::UPLOAD_WINDOW_MINUTES).
   */
  var previewTried = {};
  function sendPreview(me) {
    if (!C.treePreviews || !window.XMTreePreview || previewTried[me.id] || X.store('XM_tree_preview_' + me.id)) { return; }
    previewTried[me.id] = true;
    var go = function () {
      window.XMTreePreview.send({
        img: IMG, ver: VER, kind: X.kindOf(me.gender), brand: 'cloudz.fun', dir: document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr',
        title: t('tree.preview.title', { creator: me.name }), line: t('tree.preview.line'),   // plain text (tn makes page nodes)
        url: C.api + '/quizzes/' + me.id + '/preview',
        headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': C.csrf, 'X-Requested-With': 'XMLHttpRequest', 'User-Key': me.userKey }
      }).then(function (ok) { if (ok) { X.store('XM_tree_preview_' + me.id, 1); } });
    };
    if (window.requestIdleCallback) { window.requestIdleCallback(go, { timeout: 1500 }); } else { setTimeout(go, 400); }
  }

  /**
   * "A friend found their spot" notifications: the site's one web-push token (partials/site_web_push — its own
   * permission prompt, as on every site page) joins this tree's Firebase topic, once per token and tree (XM_tree_push).
   */
  function pushSubscribe(token) {
    var me = X.store(KEY_CREATOR);
    if (!C.push || !token || !me || !me.id || !me.userKey) { return; }
    var mark = me.id + '|' + token;
    if (X.store('XM_tree_push') === mark) { return; }
    X.api('POST', '/quizzes/' + me.id + '/push', { token: token }, me.userKey)
      .then(function () { X.store('XM_tree_push', mark); X.track('push_optin'); })
      .catch(function () { /* best-effort: tried again on the next visit */ });
  }
  window.addEventListener('cloudz:fcm-token', function (e) { pushSubscribe(e.detail); if (C.quiz) { friendPushSubscribe(C.quiz.id, e.detail); } });

  /**
   * A friend's own notifications (phase 7): "{new} just took your spot at the top of {creator}'s tree 😱". The same
   * site web-push token joins this friend's topic on that tree, proved with the key their play got; once per token.
   */
  function friendPushSubscribe(quizId, token) {
    var mine = X.played(quizId);
    if (!C.push || !token || !mine || !mine.key || !mine.id) { return; }
    var mark = 'XM_tree_fpush_' + quizId, value = mine.id + '|' + token;
    if (X.store(mark) === value) { return; }
    X.api('POST', '/quizzes/' + quizId + '/players/' + mine.id + '/push', { token: token, playerKey: mine.key })
      .then(function () { X.store(mark, value); })
      .catch(function () { /* best-effort: tried again on the next visit */ });
  }

  /**
   * The tree with every friend on it: the stage (the reveal film plays on it, revealFilm) with "Who's on {name}'s
   * tree?" on the ribbon, then the panel (list, share, …) slides up. `load(cam)` fetches the friends and calls the film.
   */
  function revealScene(name, gender, fresh, panelItems, load) {
    var root = X.scene('is-reveal');
    var cam = treeCam({ decorated: true, cls: 'is-stage.is-reveal-cast' });
    var ribbon = h('div.xm-ribbon.is-title', X.artPic('ui-ribbon', 'xm-ribbon-pic'),
      h('h1.xm-ribbon-text', h('span', tn('tree.board.heading', { creator: name }, ['creator']))));
    cam.el.appendChild(ribbon);
    fitTitle(ribbon.querySelector('.xm-ribbon-text'));
    var panel = h('div.xm-play.is-result-panel.is-hidden', X.artPic('ui-snow', 'xm-play-snow'), panelItems);
    root.append(cam.el, panel);
    var cast = castIn(cam, gender);
    var shown = false;
    var show = function () {
      if (shown) { return; }
      shown = true;
      panel.classList.remove('is-hidden');
      X.adOnTop(panel);
      X.sfx('swipe');
    };
    X.enter(ribbon, 300, 'accent', { y: -30, s: .7 });
    cam.reveal = function (placed) { return revealFilm(cam, cast, placed, fresh).then(function () { return spotlight(cam, cast, placed); }).then(show); };
    Promise.resolve(load(cam)).then(show, show);
    return cam;
  }

  /** "Take my tree down" with an in-page confirm (never a browser dialog). */
  function deleteBlock(me) {
    var box = h('div.xm-center.xm-delete');
    var ask = h('button.xm-link', { type: 'button', onclick: function () {
      box.textContent = '';
      box.append(h('p.xm-sub', t('tree.board.deleteAsk')), h('div.xm-row',
        button(t('tree.board.deleteNo'), 'is-ghost', function () { box.textContent = ''; box.appendChild(ask); }),
        button(t('tree.board.deleteYes'), '', function () {
          this.disabled = true;
          X.api('DELETE', '/quizzes/' + me.id, null, me.userKey).then(done, function (e) { if (e.status === 404) { done(); } else { X.toast(t('ui.error')); box.textContent = ''; box.appendChild(ask); } });
        })));
    } }, t('tree.board.delete'));
    function done() { X.store(KEY_CREATOR, null); landing(); }
    box.appendChild(ask);
    return box;
  }

  /** The scoreboard: baubles on the tree by zone (four in front, the rest smaller behind) and the ranked list. */
  function loadBoard(quizId, cam, listBox, count, me, highlight) {
    listBox.appendChild(h('div.xm-dots.xm-center', h('i'), h('i'), h('i')));
    return X.api('GET', '/quizzes/' + quizId + '/players' + (highlight ? '?you=' + encodeURIComponent(highlight) : '')).then(function (res) {
      listBox.textContent = '';
      // the top hook's holder got there first: first among the friends with the same score (the server lists ties
      // newest first), so they rank above them and hang on the hook itself, under the star
      var hi = res.players.findIndex(function (p) { return p.id === res.holder; });
      if (hi > 0) {
        var holder = res.players.splice(hi, 1)[0], at = hi;
        while (at > 0 && res.players[at - 1].score === holder.score) { at--; }
        res.players.splice(at, 0, holder);
      }
      var players = res.players, used = { top: 0, front: 0, bottom: 0, box: 0 };
      // a friend below the first page still finds their own bauble on the tree and their own row (with its place)
      var you = res.you && !players.some(function (p) { return p.id === res.you.player.id; }) ? res.you : null;
      if (you) { players = players.concat([you.player]); }
      count.textContent = res.total ? t('tree.board.count', { n: res.total }) : '';
      if (!players.length) { listBox.appendChild(h('p.xm-sub.xm-center.xm-empty', t('tree.board.empty'))); }
      // the tree: draw the back ones first, so the front four stay on top
      var spots = players.length > CROWD ? crowdLayout(players, highlight) : players.map(function (p) { return spotFor(p.ending, used[p.ending]++); });
      var placed = players.map(function (p, i) { return { p: p, s: spots[i] }; }).filter(function (x) { return x.s.pt; });
      placed.sort(function (a, b) { return (b.s.back ? 1 : 0) - (a.s.back ? 1 : 0); });
      placed.forEach(function (x) {
        var b = bauble(x.p.name, (x.s.back ? 'is-back' : '') + (x.s.crowd ? '.is-crowd' : '') + (x.p.perfect ? '.is-gold' : '') + (highlight && x.p.id === highlight ? '.is-you' : '')
          + (x.p.id === res.holder ? '.is-hook' : ''));    // the top hook wears the crown (phase 7)
        if (me) { b.setAttribute('role', 'button'); b.setAttribute('tabindex', '0'); b.addEventListener('click', function () { friendAnswers(me, x.p); }); }
        x.el = b;
      });
      untangleTags(placed);
      // the tree's film (the reveal) hangs them one by one; a plain board pops them on
      var hung = cam.reveal ? cam.reveal(placed) : Promise.resolve(placed.forEach(function (x, i) { cam.place(x.el, x.s.pt); X.enter(x.el, 200 + i * 50, 'pop', { y: -20, s: .5 }); }));
      // the list, best first; the rest of a big tree a page at a time ("Show more"), the tree keeps the first page
      var row = function (p, rank) { return friendRow(p, rank, res.holder, me, highlight, cam, listBox, count); };
      res.players.forEach(function (p, i) { listBox.appendChild(row(p, (res.page - 1) * res.perPage + i + 1)); });
      var yours = you ? [h('div.xm-row-gap', { 'aria-hidden': 'true' }, '⋯'), row(you.player, you.rank)] : [];
      yours.forEach(function (el) { listBox.appendChild(el); });
      var page = res.page;
      if (res.total > page * res.perPage) {
        var more = button(t('tree.board.more'), 'is-ghost.xm-board-more', function () {
          more.disabled = true;
          X.api('GET', '/quizzes/' + quizId + '/players?page=' + (page + 1)).then(function (next) {
            page = next.page;
            next.players.forEach(function (p, i) {
              if (you && p.id === you.player.id) { yours.forEach(function (el) { el.remove(); }); you = null; }   // their own row arrives in its place
              listBox.insertBefore(row(p, (next.page - 1) * next.perPage + i + 1), yours[0] && yours[0].isConnected ? yours[0] : more);
            });
            more.disabled = false;
            if (next.total <= page * next.perPage || !next.players.length) { more.remove(); }
          }, function () { more.disabled = false; X.toast(t('ui.error')); });
        });
        listBox.appendChild(more);
      }
      return hung.then(function () { cam.reveal = null; X.cascade(listBox.children, 100, 40); });
    }, function (e) {
      if (e && e.refused) { throw e; }
      // a lost connection: the dots give way to a way back, never spin for ever
      listBox.textContent = '';
      listBox.appendChild(h('div.xm-center', h('p.xm-sub', t('ui.error')), button(t('ui.retry'), 'is-ghost', function () {
        listBox.textContent = '';
        loadBoard(quizId, cam, listBox, count, me, highlight).catch(function () { /* the callers' refusals: shown already */ });
      })));
    });
  }

  /** One friend's row on the board; the creator taps it for their answers (× removes them). */
  function friendRow(p, rank, holder, me, highlight, cam, listBox, count) {
    var row = h('div.xm-row-friend' + (highlight && p.id === highlight ? '.is-you' : ''),
      h('span.xm-rank', String(rank)),
      // the same glass as on the tree: a perfect score's bauble is gold there, so it is gold here too
      h('span.xm-mini-bauble', { style: p.perfect ? '--b1:#FFE07A;--b2:#C99A12' : '--b1:' + colorOf(p.name)[0] + ';--b2:' + colorOf(p.name)[1] }),
      h('span.xm-row-main', h('strong', p.name),
        h('span.xm-row-meta', p.id === holder ? h('span.xm-zone.is-hook', t('tree.board.topSpot')) : h('span.xm-zone.is-' + p.ending, t('tree.board.zone.' + p.ending)),
          h('span.xm-score', p.score + '/10'))));
    if (me) {
      // the whole row opens their answers (a "›" shows it); × removes them
      row.classList.add('is-tap');
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', p.name + ': ' + t('tree.board.seeAnswers'));
      var open = function () { friendAnswers(me, p); };
      row.addEventListener('click', open);
      row.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      row.append(h('span.xm-row-go', { 'aria-hidden': 'true' }, '›'),
        h('button.xm-row-remove', { type: 'button', 'aria-label': t('tree.board.remove', { friend: p.name }), onclick: function (e) { e.stopPropagation(); removeFriend(me, p, row, cam, listBox, count); } }, '×'));
    }
    return row;
  }

  /**
   * THE TREE REVEAL — the film's climax for the creator and for every friend: the room is dark; the lights come on
   * tier by tier as the camera rises; the star bursts; then every friend's bauble flies up from the box to the spot
   * they earned, the lowest first and the top ones last, each with a chime a step higher; the camera pulls back to the
   * whole tree, the room lights up, confetti, the music swells. About 8 s with a few friends; a tap speeds it up.
   */
  function revealFilm(cam, cast, placed, fresh) {
    var order = placed.slice().sort(function (a, b) { return b.s.pt[1] - a.s.pt[1]; });     // bottom first, the top last
    var fast = false;
    var skip = function () { fast = true; };
    cam.el.addEventListener('pointerdown', skip);
    var wait = function (ms) { return X.pause(fast ? Math.min(ms, 60) : ms); };
    // a friend straight from their own ending (fresh, with baubles) has just seen the room light up: the same film,
    // brisker, to the moment that is new to them (everyone else's bauble, then their own)
    var brisk = fresh && placed.length > 0;
    if (fresh && !placed.length) {
      // just decorated (the lights film already played): the lit tree, ten empty hooks waiting for friends
      cam.lightAll(0); cam.star(true);
      var rb0 = cam.el.querySelector('.xm-ribbon.is-title');
      cam.wide(rb0 ? rb0.offsetTop + rb0.offsetHeight * .7 : 0);
      X.music(true);
      X.pose(cast.host, cast.kind, 'cheer', true);
      for (var hk = 1; hk <= 10; hk++) { X.enter(cam.place(h('span.xm-hook', h('i', '?')), notchPoint(hk)), 300 + hk * 70, 'pop', { s: .3, y: -10 }); }
      cam.el.removeEventListener('pointerdown', skip);
      // (not the heading below it again: the line from the lights film, as the ten empty hooks wait)
      // the share panel comes up while the host says it (sharing is the next step; nothing to wait for)
      return wait(400).then(function () { X.say(cam.el, t('tree.lights.almost'), hostSays(cast)); });
    }
    cam.dim(true);
    cam.focus(TIER_Y[0] + 40, true);
    X.pose(cast.host, cast.kind, 'admire', true);
    X.music(true);
    return wait(brisk ? 400 : 700).then(function () {
      // the lights climb the tree with the camera
      X.sfx('whoosh');
      cam.focus(TIER_Y[9] + 80);
      var steps = [], step = brisk ? 90 : 150;
      for (var n = 1; n <= 10; n++) {
        (function (n) { steps.push(wait(step + n * step).then(function () { cam.light(n, true); X.sfx('bulb', n); })); })(n);
      }
      return Promise.all(steps);
    }).then(function () { return wait(brisk ? 150 : 250); }).then(function () {
      // the star
      cam.star(true);
      cam.punch(1.06);
      X.sfx('top');
      var p = cam.toCam([CX, STAR_Y]);
      X.sparkle(cam.el, p[0], p[1], 22);
      return wait(brisk ? 600 : 900);
    }).then(function () {
      // the whole tree, the room comes alive
      cam.dim(false);
      var rb = cam.el.querySelector('.xm-ribbon.is-title');
      cam.wide(rb ? rb.offsetTop + rb.offsetHeight * .7 : 0);
      X.pose(cast.host, cast.kind, 'gasp');
      X.sfx(cast.kind + '-happygasp');
      return wait(brisk ? 450 : 700);
    }).then(function () {
      // the friends fly up from the box to their spots, one by one (all of them within about 2.4 s for a friend,
      // 3.6 s on the creator's own tree)
      var gap = order.length ? Math.max(brisk ? 90 : 140, Math.min(brisk ? 360 : 520, (brisk ? 2400 : 3600) / order.length)) : 0;
      var flights = order.map(function (x, i) {
        return wait(i * gap).then(function () {
          x.el.style.transition = 'none';
          cam.place(x.el, [BOX[0], BOX[1] + 30]);
          x.el.getBoundingClientRect();
          x.el.style.transition = '';
          cam.place(x.el, x.s.pt);
          X.sfx('bulb', Math.min(10, 1 + Math.round(i * 9 / Math.max(1, order.length - 1))));
          return wait(650).then(function () {
            if (x.s.back) { return; }
            var q = cam.toCam([x.s.pt[0], x.s.pt[1] + 16]);
            X.sparkle(cam.el, q[0], q[1], x.p.perfect ? 14 : 6);
          });
        });
      });
      return Promise.all(flights);
    }).then(function () {
      X.pose(cast.host, cast.kind, order.length ? 'cheer' : 'wave');
      elfPose(cast.elf, order.length ? 'hat-off' : 'clipboard');
      if (order.length) { X.confetti(cam.el, ['#FFD34D', '#FF6A63', '#7FD1AE', '#FFFFFF']); X.sfx(cast.kind + '-woohoo'); }
      cam.el.removeEventListener('pointerdown', skip);
      return wait(fresh ? 600 : 300);
    });
  }

  /**
   * After the reveal, a friend looking at the tree finds THEMSELVES: the room dims, every other bauble falls into the
   * dark, the camera pushes in on their own bauble, which grows and glows, sparkles, a chime, and the creator says the
   * line of that ending ("Right where I can see you."). About 2.5 s (a tap ends it); then back to the whole tree.
   * Nothing for the creator's own view (no bauble of theirs on it).
   */
  function spotlight(cam, cast, placed) {
    var mine = placed.filter(function (x) { return x.el.classList.contains('is-you'); })[0];
    if (!mine) { return Promise.resolve(); }
    var cut = false;
    var skip = function () { cut = true; };
    cam.el.addEventListener('pointerdown', skip);
    var hold = function (ms) { return X.pause(cut ? 0 : ms); };
    var ribbon = cam.el.querySelector('.xm-ribbon.is-title'), under = ribbon ? ribbon.offsetTop + ribbon.offsetHeight + 6 : 0;
    cam.dim(true);
    cam.layer.classList.add('is-spotlight');
    mine.el.classList.add('is-spot');
    // still in the box: the bauble rises out of it, the camera on the box without a push-in (it would carry the box
    // toward the Elf at the edge); on the tree: pushed in, above the cast's heads
    if (mine.p.ending === 'box') { mine.el.classList.add('is-peek'); cam.focus(mine.s.pt[1]); } else {
      cam.focusAt(mine.s.pt[1], Math.max(under, cam.clearTop(mine.el.offsetHeight * 1.4)));
    }
    X.sfx('whoosh');
    return hold(700).then(function () {
      X.sfx('top');
      X.buzz(20);
      var c = cam.toCam([mine.s.pt[0], mine.s.pt[1] + 24]);
      X.sparkle(cam.el, c[0], c[1], 16);
      X.pose(cast.host, cast.kind, mine.p.ending === 'box' ? 'kneel' : mine.p.ending === 'top' ? 'cheer' : 'admire');
      // the line never covers the bauble it is about (the camera has landed by now)
      var says = hostSays(cast); says.avoid = mine.el.querySelector('.xm-bauble-glass');
      return X.sayHold(cam.el, t('tree.ending.' + mine.p.ending + '.creator', { friend: mine.p.name }), says, cut ? 400 : 1300);
    }).then(function () {
      cam.el.removeEventListener('pointerdown', skip);
      clearSays(cam);
      cam.dim(false);
      cam.layer.classList.remove('is-spotlight');
      mine.el.classList.remove('is-spot', 'is-peek');
      cam.wide(under ? under - 6 - (ribbon.offsetHeight * .3) : 0);
      X.pose(cast.host, cast.kind, 'cheer');
      return X.pause(500);
    });
  }

  function removeFriend(me, p, row, cam, listBox, count) {
    if (row.nextElementSibling && row.nextElementSibling.classList.contains('xm-row-confirm')) { return; }   // asked already
    var ask =h('div.xm-row-confirm', h('span', t('tree.board.removeAsk', { friend: p.name })),
      h('button.xm-chip', { type: 'button', onclick: function () { ask.remove(); } }, t('tree.board.removeNo')),
      h('button.xm-chip.is-red', { type: 'button', onclick: function (e) {
        var yes = e.currentTarget;
        if (yes.disabled) { return; }
        yes.disabled = true;                              // one tap, one removal
        var removed = function () {
          cam.layer.querySelectorAll('.xm-bauble').forEach(function (b) { b.remove(); });
          listBox.textContent = '';
          loadBoard(me.id, cam, listBox, count, me).catch(function () { listBox.textContent = ''; X.toast(t('ui.error')); });
        };
        X.api('DELETE', '/quizzes/' + me.id + '/players/' + p.id, null, me.userKey).then(removed, function (err) {
          if (err && err.status === 404) { removed(); return; }   // already gone (a second device): the same result
          yes.disabled = false;
          X.toast(t('ui.error'));
        });
      } }, t('tree.board.removeYes')));
    row.after(ask);
  }

  /** A friend's answers next to the creator's (the creator only, with their key). */
  function friendAnswers(me, p) {
    if (document.querySelector('.xm-sheet')) { return; }   // a double tap opens one sheet
    X.track('view_friend_answers', { ending: p.ending });
    var sheet = h('div.xm-sheet', { role: 'dialog', 'aria-modal': 'true' });
    var panel = h('div.xm-sheet-panel');
    var close = X.sheetBack(function () { sheet.remove(); document.removeEventListener('keydown', esc); });   // the phone's Back closes it, never the site
    var esc = function (e) { if (e.key === 'Escape') { close(); } };
    document.addEventListener('keydown', esc);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) { close(); } });
    var head = h('div.xm-sheet-head', bauble(p.name, 'is-sheet' + (p.perfect ? '.is-gold' : '')),
      h('div', h('h2.xm-h2', tn('tree.answers.heading', { friend: p.name }, ['friend'])),
        h('span.xm-zone.is-' + p.ending, t('tree.board.zone.' + p.ending) + ' · ' + p.score + '/10')),
      h('button.xm-sheet-close', { type: 'button', 'aria-label': t('ui.close'), onclick: close }, '×'));
    var list = h('div.xm-answers', h('div.xm-dots.xm-center', h('i'), h('i'), h('i')));
    panel.append(head, list);
    sheet.appendChild(panel);
    document.body.appendChild(sheet);
    X.enter(panel, 0, 'main', { y: 60 });
    var kind = X.kindOf(me.gender);
    // one answer as its picture (the creator's own cat or bear, as in the game) with who chose it and a ✓ / ✗
    var pick = function (qid, choice, who, right) {
      return h('figure.xm-pick' + (right ? '.is-right' : '.is-wrong'), h('div.xm-pick-pic', answerImg(qid, choice.index, kind)),
        h('span.xm-pick-mark', { 'aria-hidden': 'true' }, right ? '✓' : '✗'),
        h('figcaption', h('span.xm-answer-who', who), h('span.xm-pick-text', X.fill(choice.text, me.name))));
    };
    X.api('GET', '/quizzes/' + me.id + '/players/' + p.id + '?locale=' + encodeURIComponent(C.locale), null, me.userKey).then(function (res) {
      list.textContent = '';
      res.answers.forEach(function (a, i) {
        // the same answer: its picture once, both of them beside it; else the friend's pick, then the creator's answer
        var pair = a.right
          ? h('div.xm-answer-pair.is-match', h('figure.xm-pick.is-right', h('div.xm-pick-pic', answerImg(a.id, a.creator.index, kind)),
            h('span.xm-pick-mark', { 'aria-hidden': 'true' }, '✓')),
            h('div.xm-match', h('div.xm-match-who', h('span.xm-answer-who', t('tree.answers.creator')), h('span.xm-answer-who', p.name)),
              h('b.xm-pick-text', X.fill(a.creator.text, me.name))))
          : h('div.xm-answer-pair', pick(a.id, a.friend, p.name, false), pick(a.id, a.creator, t('tree.answers.creator'), true));
        list.appendChild(h('div.xm-answer' + (a.right ? '.is-right' : '.is-wrong'),
          h('div.xm-answer-q', h('span.xm-answer-n', String(i + 1)), h('span', X.marked(a.question, me.name))), pair));
      });
      X.cascade(list.children, 0, 50, 'pop', { y: 16, s: .96 });
    }, function () { list.textContent = ''; list.appendChild(h('p.xm-sub', t('ui.error'))); });
  }

  // ══════════════════════════════════════ ACT 2 — the friend climbs ═════════════════════════════════════════
  /** 2.1 The invitation: an envelope, the creator's card and mood, a blank bauble the friend's name is painted on. */
  function invite(quiz) {
    X.setHeroGender(quiz.gender);
    var done = X.played(quiz.id);
    if (done) { result(quiz, done, false); return; }
    // a play still on its way (the app was closed while it saved): it goes through first, then its result — never a
    // second round and a second bauble
    var waiting = X.pendingPlay(quiz.id);
    if (waiting) {
      var through = function () {
        return X.sendPlay(quiz.id, waiting).catch(function (e) { if (e.refused) { throw e; } return X.waitForConnection(e).then(through); });
      };
      X.gate(through(), 600).then(function () { var p = X.played(quiz.id); if (p) { result(quiz, p, false); } else { invite(quiz); } });
      return;
    }
    var roundPromise = X.api('GET', '/quizzes/' + quiz.id + '/round?locale=' + encodeURIComponent(C.locale));
    roundPromise.catch(function () {});
    var root = X.scene('is-invite');
    var kind = X.kindOf(quiz.gender);
    var polaroid = h('div.xm-polaroid', h('div.xm-polaroid-pic', X.artPic(C.season === 'summer' ? 'bg-living-room-summer' : 'bg-living-room-winter', 'xm-room-bg'), treeArt({ room: false, lights: true }, 'xm-polaroid-tree'), X.character(kind, 'wave', 104, 'xm-polaroid-host')),
      h('span.xm-polaroid-name', quiz.name));
    var cardText = h('h1.xm-h2.xm-center', tn('tree.invite.card', { creator: quiz.name, their: X.their(quiz.gender) }, ['creator']));
    var moodSticker = h('div.xm-sticker', t('tree.invite.mood', { mood: t('tree.mood.' + quiz.mood) }));
    // social proof (phase 7): who is on the tree already, and who holds the top hook — filled in when the round comes
    var proof = h('p.xm-proof', { hidden: true });
    roundPromise.then(function (res) {
      var tree = res && res.tree;
      if (!tree || !tree.count || !proof.isConnected) { return; }
      proof.append(h('span.xm-proof-line', t('tree.invite.proof', { creator: quiz.name, n: tree.count })),
        tree.top ? h('span.xm-proof-line', t('tree.invite.top', { top: tree.top })) : '');   // '' not null: append() prints "null"
      proof.hidden = false;
      X.enter(proof, 0, 'pop', { y: 10, s: .8 });
    }, function () {});
    var card = h('div.xm-xcard', polaroid, cardText, moodSticker, proof);
    var envelope = h('div.xm-envelope', h('i.xm-envelope-back'), card, h('i.xm-envelope-front'), h('i.xm-envelope-seal'));
    var ball = bauble('?', 'is-big.is-blank');
    // (the box says what it's for: the rule line above takes the label's room)
    var input = h('input.xm-input', { type: 'text', maxlength: String(C.rules.nameMax), placeholder: t('tree.invite.label'), autocomplete: 'off', enterkeyhint: 'go', 'aria-label': t('tree.invite.label') });
    var err = h('div.xm-error', { role: 'alert' });
    input.addEventListener('input', function () {
      var name = X.cleanName(input.value);
      setBaubleName(ball, name || '?');
      ball.classList.toggle('is-blank', !name);
      var nm = ball.querySelector('.xm-bauble-name');
      nm.classList.remove('is-paint'); nm.getBoundingClientRect(); nm.classList.add('is-paint');
      err.textContent = '';
    });
    var go = button(t('tree.invite.cta'), 'is-gold', function () {
      var name = X.cleanName(input.value);
      if (!name) { err.textContent = t('tree.stocking.nameError'); go.classList.remove('is-shake'); go.getBoundingClientRect(); go.classList.add('is-shake'); input.focus(); return; }
      go.disabled = true;
      X.track('tree_play_start');
      X.move(ball, 'hop').then(function () { climb(quiz, roundPromise, name); });
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { go.click(); } });
    // the envelope arrives on the snowy street at night; the bauble and the name on the cream panel below
    var hero = h('div.xm-hero.is-invite', X.artPic('bg-snowy-window', 'xm-hero-bg'), h('i.xm-hero-glow'), h('div.xm-hero-top', topBar()), envelope);
    X.snow(hero, 24);
    // the rule before they start (a WhatsApp click lands here): ten questions, each right answer a branch higher
    var rule = h('p.xm-invite-rule.xm-center', tn('tree.invite.rule', { creator: quiz.name }, ['creator']));
    var panel = h('div.xm-play.is-page', X.artPic('ui-snow', 'xm-play-snow'), h('div.xm-ballrow', ball), rule, input, err, go);
    root.classList.add('is-staged');
    root.append(hero, panel);
    // the seal pops, the card slides out (about 2 s; the fields are usable at once)
    if (!X.reduceMotion) {
      envelope.classList.add('is-sealed');
      X.pause(500).then(function () { envelope.classList.remove('is-sealed'); envelope.classList.add('is-open'); });
    } else { envelope.classList.add('is-open'); }
    X.enter(moodSticker, 1400, 'pop', { s: .4, r: -12 });
    X.enter(ball, 1700, 'pop', { x: 80, s: .6, r: 90 });
    X.cascade(root.querySelectorAll('.xm-invite-rule, .xm-input, .xm-btn'), 1800, 70);
  }

  /** 2.2–2.3 The living room and the climb: ten questions; every right answer lifts the bauble a notch. */
  function climb(quiz, roundPromise, friend) {
    var root = X.scene('is-climb');
    var hostKind = X.kindOf(quiz.gender);
    var ready = roundPromise.then(function (res) {
      var q = res.questions[0];
      return X.loadUrls(q.options.map(function (o) { return answerUrl(q.id, o.index, hostKind); }).concat(X.artUrl('bg-living-room-winter'), X.artUrl('tree-bare'))).then(function () { return res; });
    }, function (e) { return { error: e }; });
    X.gate(ready, 700).then(function (res) {
      if (!res || res.error || !res.questions) {
        if (res && res.error && res.error.refused) { closed(); return; }
        X.toast(t('ui.offline')); invite(quiz); return;
      }
      var round = res.questions;
      // the stage: the room fills the screen; a slim bar on top (question k, ten little lights); the answers on a
      // cream panel at the bottom, the Elf and the host standing on its edge
      var tag = h('span.xm-ribbon-text'), cam = treeCam({ decorated: true, cls: 'is-stage' });
      // the progress: a pine garland across the top whose ten bulbs light up as the bauble climbs
      var meter = h('div.xm-garland', { 'aria-hidden': 'true' }, X.artPic('ui-garland', 'xm-garland-pic'),
        GARLAND_BULBS.map(function (x, i) { return h('i', { 'data-n': i + 1, style: 'left:' + (x * 100) + '%' }); }));
      cam.el.appendChild(meter);
      // the answer panel: snow resting on its edge, a red ribbon with "Question k / 10"
      var qbox = h('div.xm-qbox');
      var play = h('div.xm-play', X.artPic('ui-snow', 'xm-play-snow'), h('div.xm-ribbon', X.artPic('ui-ribbon', 'xm-ribbon-pic'), tag), qbox);
      play.style.setProperty('--holly', 'url("' + X.artUrl('ui-holly') + '")');
      root.append(cam.el, play);
      var cast = castIn(cam, quiz.gender);
      // the other friends' baubles already on the tree (phase 7), each at its own height on the side away from the
      // friend's climb, those with the same score stepped in toward the trunk; the friend climbs past them
      var rivals = ((res.tree && res.tree.others) || []).filter(function (r) { return r.score > 0; });
      var atScore = {};
      rivals.forEach(function (r) {
        var n = atScore[r.score] = (atScore[r.score] || 0) + 1, y = TIER_Y[r.score - 1] - 20, side = NOTCH_SIDE[r.score - 1] > 0 ? -1 : 1;
        r.el = cam.place(bauble(r.name, 'is-back.is-rival'), [CX + side * Math.max(.18, .62 - (n - 1) * .16) * halfWidth(y + 8), y + (n - 1) * 6]);
      });
      var ball = bauble(friend, 'is-friend');
      cam.el.xmAvoid = ball.querySelector('.xm-bauble-glass');   // no line on this stage ever covers the friend's bauble
      cam.place(ball, [IN_BOX[0], IN_BOX[1] - 160]);
      ball.style.opacity = '0';
      cam.focus(560, true);
      var names = { creator: quiz.name, friend: friend, them: X.them(quiz.gender) };
      var notch = 0, answers = [], streakRight = 0, streakWrong = 0;
      // the intro film (about 6 s; a tap skips each line): outside the warm window → the camera pushes in through
      // the glass → the host walks in and greets the friend → the Elf pops up and drops the bauble in the box →
      // the answer panel slides up
      play.classList.add('is-hidden');
      cast.host.style.visibility = 'hidden';
      cast.elf.style.visibility = 'hidden';
      var outside = h('div.xm-outside', X.artPic('bg-snowy-window', 'xm-outside-bg'), h('i.xm-outside-glow'));
      cam.el.appendChild(outside);
      X.snow(outside, 26);
      cam.focus(330, true);
      X.music(true);
      X.pause(900).then(function () {
        // through the glass
        X.sfx('whoosh');
        return outside.animate && !X.reduceMotion
          ? X.ended(outside.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(2.8)', opacity: 1, offset: .7 }, { transform: 'scale(3.4)', opacity: 0 }],
            { duration: 1000, easing: 'cubic-bezier(.55,0,.35,1)', fill: 'forwards' })) : null;
      }).then(function () {
        outside.remove();
        cam.focus(470);
        cast.host.style.visibility = '';
        X.sfx('footsteps');
        return X.walkIn(cast.host, cast.kind, cam.el.clientWidth * .55, 1000);
      }).then(function () {
        X.pose(cast.host, cast.kind, 'arrive');
        X.sfx(cast.kind + '-hello');
        return X.sayHold(cam.el, t('tree.room.youCame', names), hostSays(cast));
      }).then(function () {
        clearSays(cam);
        X.pose(cast.host, cast.kind, 'wave');
        cast.elf.style.visibility = '';
        X.enter(cast.elf, 0, 'pop', { y: 80, s: .6 });
        X.sfx('pop');
        elfPose(cast.elf, 'drop-box');
        cam.focus(IN_BOX[1] - 20);
        return X.pause(400);
      }).then(function () {
        // the bauble drops into the box with a bounce
        ball.style.opacity = '';
        cam.place(ball, IN_BOX);
        return X.pause(400);
      }).then(function () {
        X.move(ball.querySelector('.xm-bauble-swing'), 'hop');   // the glass moves; its place on the stage stays
        X.sfx('drop');
        X.sfx('elf-hm');
        var p = cam.toCam([IN_BOX[0], IN_BOX[1] + 30]);
        X.sparkle(cam.el, p[0], p[1], 10);
        // the first question comes up once his line is typed; the line stays up to be read with it
        return X.sayHold(cam.el, t('tree.room.elfIntro', names), ELF_SAYS, QUICK);
      }).then(function () {
        elfPose(cast.elf, 'clipboard');
        X.sfx('swipe');
        play.classList.remove('is-hidden');
        return X.pause(300);
      }).then(function () { ask(0, true); });

      /** The camera on the friend's bauble at pt, showing all of it above the cast's heads (in the box: the box). */
      function frameBall(pt) {
        if (pt[1] >= BOXED_Y) { cam.focus(pt[1] + 40); return; }
        cam.focusOn(pt[1], ball.offsetHeight * (ball.querySelector('.xm-bauble-tag') ? 1.2 : 1));
        // once the camera has settled: a name tag that would hang behind the Elf or the host (they stand in front of
        // the tree) is worn above the bauble instead
        clearTimeout(ball.xmTagCheck);
        ball.xmTagCheck = setTimeout(function () {
          var tag = ball.querySelector('.xm-bauble-tag');
          if (!tag) { return; }
          ball.classList.remove('is-tag-up');
          var r = tag.getBoundingClientRect();
          var hidden = [cast.host, cast.elf].some(function (c) {
            var q = c.getBoundingClientRect(), w = q.width * .16;
            return r.left < q.right - w && q.left + w < r.right && r.top < q.bottom && q.top + q.height * .06 < r.bottom;
          });
          ball.classList.toggle('is-tag-up', hidden);
        }, 900);
      }
      /** Question i; `keep`: the line on the stage stays up (it is read along with the question, the next tap clears it). */
      function ask(i, keep) {
        var q = round[i], k = i + 1;
        if (round[i + 1]) { X.loadUrls(round[i + 1].options.map(function (o) { return answerUrl(round[i + 1].id, o.index, cast.kind); })); }
        tag.textContent = t('tree.question.tag', { k: k, n: round.length });
        if (!keep) { clearSays(cam); }
        frameBall(notchPoint(notch));
        elfPose(cast.elf, 'clipboard');
        X.pose(cast.host, cast.kind, 'wave');
        // (no "Question k." from the Elf: the ribbon says it, and his bubble would cover the friend's bauble)
        var locked = false;
        var opts = h('div.xm-opts.is-two');
        q.options.forEach(function (o) {
          var img = answerImg(q.id, o.index, cast.kind);
          img.addEventListener('error', function () { img.remove(); });
          var b = h('button.xm-opt', { type: 'button', onclick: function () {
            if (locked) { return; }
            locked = true;
            // a friend who scrolled to reach the answer is brought back to the tree: the climb is the moment
            if (window.scrollY > 4) { window.scrollTo({ top: 0, behavior: X.reduceMotion ? 'auto' : 'smooth' }); }
            answers.push(o.index);
            b.classList.add('is-picked');
            X.sfx('tap');
            X.sfx(cast.kind + '-nervous');
            X.buzz(12);
            X.pose(cast.host, cast.kind, 'fingers-crossed');
            // the drum roll: the card lifts and glows for a beat, then the tree answers
            X.pause(420).then(function () { return o.correct ? right(b, k) : wrong(b, opts, k); }).then(function () { return rhythm(k); }).then(function () {
              if (k < round.length) { ask(i + 1, !breaks(k)); } else { finish(); }
            });
          } }, img, h('span.xm-opt-text', X.fill(o.text, quiz.name)));
          opts.appendChild(b);
        });
        var card = h('div.xm-q', X.marked(q.question, quiz.name));
        qbox.textContent = '';
        qbox.append(card, opts);
        X.fitText([tag].concat(Array.from(opts.querySelectorAll('.xm-opt-text'))));   // no word split on a small phone
        X.enter(card, 0, 'main', { y: -16 });
        X.cascade(opts.children, 180, 90, 'pop', { y: 26, s: .9 });
      }
      /**
       * How long the Elf's quip after answer k holds the next question back: just a beat (it stays up to be read with
       * the question), its full reading time before a moment that clears it, none after the last answer (the ending
       * film starts with the Elf) or before the last question (the dimmed room's line is his). null = no quip.
       */
      function quipHold(k) { return k >= round.length - 1 ? null : breaks(k) ? undefined : QUICK; }
      function quip(key, k) {
        var ms = quipHold(k);
        return ms === null ? X.pause(300) : X.sayHold(cam.el, t(X.poolLine(key, 8), names), ELF_SAYS, ms);
      }
      function right(b, k) {
        b.classList.add('is-right');
        notch++; streakRight++; streakWrong = 0;
        meter.querySelector('[data-n="' + notch + '"]').classList.add('is-on');
        clearSays(cam);
        var pt = notchPoint(notch);
        frameBall(pt);
        cam.place(ball, pt);
        // the bauble flies up its branch trailing sparkles; the shot pushes in as it lands
        (function trail(n) {
          if (n <= 0) { return; }
          var r = ball.getBoundingClientRect(), c = cam.el.getBoundingClientRect();
          X.sparkle(cam.el, r.left - c.left + r.width / 2, r.top - c.top + r.height * .6, 3);
          X.pause(110).then(function () { trail(n - 1); });
        })(6);
        elfPose(cast.elf, 'hmph');
        X.move(cast.elf, 'hop');
        X.sfx('rise');
        return X.pause(700).then(function () {
          cam.punch(1.045);
          cam.light(notch, true);
          X.sfx('correct');
          X.sfx('bulb', notch);
          X.sfx(cast.kind + (notch >= 7 ? '-woohoo' : '-cheer'));
          X.pause(450).then(function () { X.sfx('elf-hmph'); });
          var p = cam.toCam([pt[0], pt[1] + 20]);
          X.sparkle(cam.el, p[0], p[1], 9);
          X.pose(cast.host, cast.kind, 'cheer');
          // climbing past another friend's bauble is a moment of its own (phase 7): their bauble wobbles as you pass
          var passed = rivals.filter(function (r) { return r.score === notch - 1; })[0];
          if (passed) {
            X.move(passed.el.querySelector('.xm-bauble-swing'), 'shake');
            X.sfx('pop');
            return X.sayHold(cam.el, t('tree.rhythm.passed', { name: passed.name }), ELF_SAYS, quipHold(k) || undefined);
          }
          if (streakRight === 3) { return X.sayHold(cam.el, t('tree.rhythm.streak', names), ELF_SAYS, quipHold(k) || undefined); }
          if (quipHold(k) !== null && Math.random() < .35) { X.say(cam.el, t(X.poolLine('tree.creator.right', 3), names), hostSays(cast)); }
          return quip('tree.elf.right', k);
        });
      }
      function wrong(b, opts, k) {
        b.classList.add('is-wrong');
        streakWrong++; streakRight = 0;
        var good = Array.prototype.find.call(opts.children, function (o) { return o !== b; });
        if (good) { good.classList.add('is-answer'); }
        cam.fizzle(notch + 1);
        cam.shake();
        X.sfx('wrong');
        X.sfx(cast.kind + (streakWrong >= 2 ? '-groan' : '-dismay'));
        X.pause(500).then(function () { X.sfx('elf-chuckle'); });
        X.move(ball.querySelector('.xm-bauble-swing'), 'shake');
        clearSays(cam);
        X.pose(cast.host, cast.kind, 'facepalm');
        elfPose(cast.elf, 'chuckle');
        return X.pause(300).then(function () {
          if (streakWrong === 3) { return X.sayHold(cam.el, t('tree.rhythm.slump', names), ELF_SAYS, quipHold(k) || undefined); }
          if (quipHold(k) !== null && Math.random() < .35) { X.say(cam.el, t(X.poolLine('tree.creator.wrong', 3), names), hostSays(cast)); }
          return quip('tree.elf.wrong', k);
        });
      }
      /** The moments that break the rhythm: the puppy after question 3, the dimmed room before the last one. */
      function breaks(k) { return (k === 3 && notch >= 2) || k === round.length - 1; }
      function rhythm(k) {
        if (k === 3 && notch >= 2) {
          clearSays(cam);
          X.pose(cast.host, cast.kind, 'gasp');
          return X.sayHold(cam.el, t('tree.rhythm.goingUp', names), hostSays(cast), 1200);
        }
        if (k === round.length - 1) {
          clearSays(cam);
          cam.dim(true);
          cam.focus(TOP_HOOK[1] + 60);
          // "the top hook is right there" only when one more right answer can still reach it (9 / 10 is the top's band);
          // a bauble further down hears "make it count"
          var finalLine = notch >= 8 ? 'tree.rhythm.final' : 'tree.rhythm.finalFar';
          return X.pause(900).then(function () { return X.sayHold(cam.el, t(finalLine, names), ELF_SAYS); }).then(function () {
            frameBall(notchPoint(notch));
            cam.dim(false);
          });
        }
        return Promise.resolve();
      }
      function finish() {
        qbox.textContent = '';
        play.classList.add('is-hidden');                 // the ending film gets the whole screen
        var score = notch, zone = zoneOf(score);
        var save = X.sendPlay(quiz.id, { playerName: friend, answers: answers, submissionId: X.randomId(24) });
        var film = endingFilm(zone, score, { cam: cam, cast: cast, ball: ball, names: names, root: root });
        Promise.all([save.catch(function (e) { return { error: e }; }), film]).then(function (all) {
          var res = all[0];
          if (res.error && res.error.refused && res.error.status === 404) { closed(); return; }   // the tree was taken down
          if (res.error && res.error.refused) { X.toast(t('ui.error')); }   // refused otherwise: their result, not "taken down"
          var p = res.error ? { name: friend, score: score, ending: zone, perfect: score >= PERFECT } : X.played(quiz.id) || res.player;
          if (!res.error) { p.id = res.player.id; }
          X.track('tree_play_end', { ending: p.ending });
          result(quiz, p, true);
        });
      }
    });
  }
  function clearSays(cam) { cam.el.querySelectorAll('.xm-say').forEach(function (b) { b.remove(); }); X.finishTyping(); }

  /** ACT 3: the ending's mini-film in the same room (6–8 s, a tap speeds it up). */
  function endingFilm(zone, score, s) {
    var cam = s.cam, cast = s.cast, ball = s.ball, names = s.names;
    clearSays(cam);
    // the ending's own jingle and the host's reaction
    X.pause(500).then(function () {
      X.sfx(zone);
      X.sfx(cast.kind + { top: '-woohoo', front: '-happygasp', bottom: '-giggle', box: '-dismay' }[zone]);
    });
    var say = function (key, who, ms) { return X.sayHold(cam.el, t(key, names), who === 'elf' ? ELF_SAYS : hostSays(cast), ms); };
    // the bauble's new spot framed above the cast's heads, as on the climb
    var frame = function (pt, k) { cam.focusOn(pt[1], ball.offsetHeight * (k || 1)); };
    if (zone === 'top') {
      frame(TOP_HOOK);
      return X.pause(500).then(function () {
        elfPose(cast.elf, 'tiptoe');
        cam.place(ball, TOP_HOOK);
        return say('tree.ending.top.elf', 'elf');
      }).then(function () {
        clearSays(cam);
        cam.star(true);
        cam.lightAll(90);
        // the perfect 10: the name turns gold and the Elf takes his hat off
        if (score >= PERFECT) { ball.classList.add('is-gold'); elfPose(cast.elf, 'hat-off'); } else { elfPose(cast.elf, 'eye-roll'); }
        return X.pause(800);
      }).then(function () {
        cam.wide();
        X.pose(cast.host, cast.kind, 'cheer');
        X.move(cast.host, 'hop');
        X.confetti(cam.el, ['#FFD34D', '#FFE9A0', '#F2BF26', '#FFFFFF']);
        return say('tree.ending.top.creator', 'host', 1600);
      });
    }
    if (zone === 'front') {
      frame(FRONT_SPOT, 1.25);
      return X.pause(400).then(function () {
        cam.place(ball, FRONT_SPOT);
        ball.classList.add('is-front');
        elfPose(cast.elf, 'eye-roll');
        return say('tree.ending.front.elf', 'elf');
      }).then(function () {
        clearSays(cam);
        X.pose(cast.host, cast.kind, 'admire');
        return say('tree.ending.front.creator', 'host');
      }).then(function () {
        cam.wide();
        cam.lightAll(60);
        return X.pause(1200);
      });
    }
    if (zone === 'bottom') {
      frame(LOW_BRANCH);
      return X.pause(400).then(function () {
        cam.place(ball, LOW_BRANCH);
        elfPose(cast.elf, 'chuckle');
        return say('tree.ending.bottom.elf', 'elf');
      }).then(function () {
        clearSays(cam);
        ball.classList.add('is-spin');
        return X.pause(900);
      }).then(function () {
        X.pose(cast.host, cast.kind, 'try-not-laugh');
        return say('tree.ending.bottom.creator', 'host');
      });
    }
    // still in the box: funny, then warm (the worst ending still ends with the friend on the tree)
    cam.focus(560);
    return X.pause(400).then(function () {
      cam.lid(true);
      elfPose(cast.elf, 'drop-box');
      cam.place(ball, IN_BOX);
      return say('tree.ending.box.elf', 'elf', 1100);
    }).then(function () {
      cam.lid(false);
      clearSays(cam);
      ball.classList.add('is-peek');
      X.pose(cast.host, cast.kind, 'facepalm');
      return X.pause(900);
    }).then(function () {
      ball.classList.remove('is-peek');
      cam.lid(true);
      cam.place(ball, TINY_TWIG);
      frame(TINY_TWIG);
      X.pose(cast.host, cast.kind, 'kneel');
      return say('tree.ending.box.creator', 'host');
    }).then(function () {
      cam.lid(false);
      clearSays(cam);
      elfPose(cast.elf, 'eye-roll');
      return say('tree.ending.box.elf2', 'elf');
    });
  }

  /** The result card on the night window, then: who's on the tree, share my spot, decorate your own. */
  function result(quiz, p, fresh) {
    X.setHeroGender(quiz.gender);
    var root = X.scene('is-result');
    X.snow(root, 18);
    var zone = p.ending || zoneOf(p.score), names = { creator: quiz.name, friend: p.name };
    var title = t('tree.ending.' + zone + '.title');
    // the result is a scene on the same stage: the tree lit, the friend's bauble where it landed, the cast reacting,
    // the ending on the red ribbon; the score and what's next on the cream panel below
    var cam = treeCam({ decorated: true, lit: zone !== 'box', cls: 'is-stage.is-swap' + (zone === 'box' ? '.is-box-end' : '') });
    var spot = zone === 'box' ? IN_BOX : spotFor(zone, 0).pt;
    // still in the box, the bauble peeks out over the flaps (the host kneels beside it, a step aside)
    var ball = bauble(p.name, 'is-friend' + (p.perfect ? '.is-gold' : '') + (zone === 'front' ? '.is-front' : '') + (zone === 'box' ? '.is-peek' : ''));
    cam.place(ball, spot);
    var hostPose = { top: 'cheer', front: 'admire', bottom: 'try-not-laugh', box: 'kneel' }[zone];
    var ribbon = h('div.xm-ribbon.is-title', X.artPic('ui-ribbon', 'xm-ribbon-pic'), h('h1.xm-ribbon-text', title.replace(/\s*(?:\p{Extended_Pictographic}|️|‍)+\s*$/u, '')));
    cam.el.appendChild(ribbon);
    fitTitle(ribbon.querySelector('.xm-ribbon-text'));
    var card = h('div.xm-endcard-text',
      zone === 'top' ? h('p.xm-endcard-line', t('tree.ending.top.line')) : null,
      p.perfect ? h('div.xm-perfect', t('tree.ending.perfect')) : null,
      p.top ? h('div.xm-perfect.is-hook', t('tree.result.tookTop')) : null,     // the top hook is theirs (phase 7)
      h('p.xm-endcard-score', tn('tree.ending.score', { friend: p.name, creator: quiz.name, n: p.score }, ['friend', 'creator'])),
      zone === 'box' ? h('p.xm-endcard-line', tn('tree.ending.box.line', names, ['creator'])) : null);
    // ONE main action (owner, 2026-11-02: the viral loop): decorate your own tree; the rest are small links under it
    var see = textLink(t('tree.board.seeTree'), function () { board(quiz, p); });
    // the place by its name ("The top"), not the creator's title ("The top of MY tree" in the friend's mouth)
    // the friend's own share, by how they did: a brag at the top, a dare in the middle, a joke on themselves at the bottom
    var shareKey = zone === 'top' ? 'tree.result.shareTop' : zone === 'box' ? 'tree.result.shareLow' : 'tree.result.shareText';
    var shareText = t(shareKey, { creator: quiz.name, ending: t('tree.board.zone.' + zone), n: p.score, link: '' }).trim();
    var link = C.shareBase + quiz.id;
    var shareMine = textLink(t('tree.result.share'), function () {
      X.track('tree_share', { channel: cardFile ? 'result_card' : 'result' });
      // the result card as a picture where the phone can share files (drawn when this screen opened), else text
      // a share sheet that fails for any reason but the friend closing it falls back to the text, then to copying
      var waUrl = 'https://wa.me/?text=' + encodeURIComponent(shareText + ' ' + link);
      var whatsApp = function () { window.open(waUrl, '_blank', 'noopener'); };
      // copied → say so; refused (iOS outside a tap) → go to WhatsApp in this tab: a new window this late (after the
      // share sheet failed) is blocked, a plain navigation is not, and Back returns to this result (it is stored)
      var copied = function () { X.copy(shareText + ' ' + link).then(function (ok) { if (ok) { X.toast(t('ui.copied')); } else { location.href = waUrl; } }); };
      var asText = function (e) {
        if (e && e.name === 'AbortError') { return; }
        (navigator.share ? navigator.share({ text: shareText, url: link }) : Promise.reject()).catch(function (e2) { if (!(e2 && e2.name === 'AbortError')) { copied(); } });
      };
      if (cardFile && navigator.canShare && navigator.canShare({ files: [cardFile] })) {
        navigator.share({ files: [cardFile], text: shareText + ' ' + link }).catch(asText);
      } else if (navigator.share) { asText(); }
      else { whatsApp(); }
    });
    // the share picture, drawn now so a tap on Share opens the share sheet at once (iPhone allows it only in the tap)
    var cardFile = null;
    if (window.XMTreePreview && window.File) {
      var colour = colorOf(p.name);
      window.XMTreePreview.card({ img: IMG, ver: VER, dir: document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr',
        scene: { bg: C.season === 'summer' ? 'bg-living-room-summer' : 'bg-living-room-winter', tree: 'card-tree',
          host: { name: X.kindOf(quiz.gender) + '-' + hostPose, h: 430, x: 190 },
          bauble: { y: { top: 0.24, front: 0.48, bottom: 0.74, box: 0.9 }[zone], colour: colour[0], dark: colour[1], letter: Array.from(p.name)[0].toUpperCase(), name: p.name } },
        // "6 / 10" stays on one line of the picture (no-break spaces)
        title: title, line: t('tree.ending.score', { friend: p.name, creator: quiz.name, n: p.score }).replace(/(\d+)\s*\/\s*10/, '$1 / 10'),
        invite: t('tree.card.invite', { creator: quiz.name }), brand: 'cloudz.fun' })
        .then(function (cv) { cv.toBlob(function (blob) { if (blob) { cardFile = new File([blob], 'christmas-tree.jpg', { type: 'image/jpeg' }); } }, 'image/jpeg', 0.85); })
        .catch(function () { /* text share still works */ });
    }
    // the named comeback (phase 7): "Riya put you on the bottom branch. Where will you put Riya? 🎄" — the friend's
    // own tree remembers where they came from (their key stays in this browser, never in the address), so Riya hears
    // "Aman made a tree. Your spot is waiting."
    var comeback = h('p.xm-comeback', tn('tree.comeback.' + zone, { creator: quiz.name }, ['creator']));
    var own = h('a.xm-btn.is-gold.xm-own', { href: X.createHref(KEY_CREATOR), onclick: function () {
      X.track('tree_loop_click');
      var mine = X.played(quiz.id);
      if (mine && mine.key && mine.id) { X.store(KEY_FROM, { quiz: quiz.id, player: mine.id, key: mine.key, at: Date.now() }); }
    } }, t('tree.result.again'));
    var actions = h('div.xm-actions', comeback, own, h('div.xm-result-links', shareMine, see));
    friendPushSubscribe(quiz.id, window.cloudzFcmToken);   // "someone took your spot" (an earlier page may have the token)
    var panel = h('div.xm-play.is-result-panel', X.artPic('ui-snow', 'xm-play-snow'), card, actions);
    panel.style.setProperty('--holly', 'url("' + X.artUrl('ui-holly') + '")');
    root.append(cam.el, panel);
    X.adOnTop(panel);
    var cast = castIn(cam, quiz.gender);
    X.pose(cast.host, cast.kind, hostPose, true);
    elfPose(cast.elf, zone === 'top' && p.perfect ? 'hat-off' : zone === 'bottom' ? 'chuckle' : zone === 'box' ? 'drop-box' : 'eye-roll');
    // the bauble framed between the ribbon and the cast's heads (in the box: the box)
    var rb = ribbon.offsetTop + ribbon.offsetHeight;
    if (zone === 'box') { cam.focus(spot[1] + 30, true); } else { cam.focusAt(spot[1], Math.max(rb + 6, cam.clearTop(ball.offsetHeight * (zone === 'front' ? 1.25 : 1))), true); }
    X.enter(ribbon, 200, 'accent', { y: -30, s: .7 });
    X.enter(ball, 400, 'pop', { y: -60, s: .4 });
    X.cascade(panel.querySelectorAll('.xm-endcard-text > *, .xm-btn'), 600, 90);
    if (fresh) { X.pause(500).then(function () { X.sfx(zone); }); }
    if (fresh && (zone === 'top')) { X.confetti(cam.el); }
  }

  /** "Who's on {creator}'s tree?" for a friend: the tree with every bauble, the list (no answers: those are private). */
  function board(quiz, p) {
    var listBox = h('div.xm-board'), count = h('p.xm-small.xm-center');
    var actions = h('div.xm-actions', h('a.xm-btn.is-gold', { href: X.createHref(KEY_CREATOR), onclick: function () { X.track('tree_loop_click'); } }, t('tree.result.again')),
      p ? button(t('ui.back'), 'is-ghost', function () { result(quiz, p, false); }) : null);
    revealScene(quiz.name, quiz.gender, true, [count, listBox, actions], function (cam) {
      return loadBoard(quiz.id, cam, listBox, count, null, p && p.id).catch(function (e) { if (e && e.refused) { closed(); } });
    });
  }

  /** The link of a tree that was taken down: the Elf beside a bare tree. */
  function closed() {
    var root = X.scene('is-closed');
    X.snow(root, 18);
    var bare = h('div.xm-closed-scene', treeArt({ room: false, lights: false }, 'xm-closed-tree'), elf('xm-closed-elf', 'eye-roll'));
    root.append(topBar(), bare, h('h1.xm-h2.xm-center', t('tree.closed')), h('a.xm-btn.is-gold', { href: X.createHref(KEY_CREATOR) }, t('tree.closed.cta')));
    X.enter(bare, 0, 'main', { y: 20 });
  }

  // ── start ────────────────────────────────────────────────────────────────────────────────────────────────
  (function start() {
    // the notification's ?friend={id} is read once and leaves the address at once (a tree made in this tab never
    // inherits it), as Bail Me Out
    var q = new URLSearchParams(location.search), friend = q.get('friend');
    if (friend !== null) { q.delete('friend'); history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '')); }
    if (friend && /^\d{1,12}$/.test(friend)) { notifiedFriend = friend; }
    var me = X.store(KEY_CREATOR);
    if (C.visitId) {
      if (!C.quiz) { closed(); return; }
      if (me && me.id === C.quiz.id) { myTree(me, false); return; }
      invite(C.quiz);
      return;
    }
    if (me && me.id) { myTree(me, false); return; }
    // arrived from the main site's "Decorate my tree" (?start=1): straight into making one, no second tap
    if (X.startNow()) { X.track('tree_start'); stocking(); return; }
    landing();
  })();
})();
