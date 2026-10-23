(function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const P = node ? require('./scene-project.js') : root.LyricMotionProject;
  const M = node ? require('./motion-presets.js') : root.LyricMotionPresets;
  const POSITIONS = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'];
  function fail(line, message) { throw new Error(`${line}行目: ${message}`); }
  function timestamp(value, line) {
    const match = /^(\d{2}):([0-5]\d)\.(\d{3})$/.exec(value);
    if (!match) fail(line, '時間は 分:秒.ミリ秒（例 00:12.500）で指定してください。');
    return Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 1000;
  }
  function parse(text) {
    const scenes = [], warnings = []; let current = null, version = 0, duration = null;
    const flushBlock = () => {
      if (!current) return;
      const block = current.block;
      const parts = block.lines.join('\n').split(/[|｜]/).map(s => s.replace(/^\n+|\n+$/g, '')).filter(s => s.trim());
      if (block.explicit && !parts.length) fail(block.line, '時間指定したフレーズの本文が空です。');
      for (const text of parts) {
        if (text.length > 1000) fail(block.line, '区切り後の本文は1000文字以下にしてください。');
        current.phrases.push({ text, start: block.start, end: block.end, line: block.line, explicit: block.explicit });
      }
    };
    const finish = () => {
      if (!current) return;
      flushBlock(); current.parts = current.phrases.map(p => p.text);
      if (!current.parts.length) fail(current.line, 'Sceneの歌詞が空です。');
      delete current.block; scenes.push(current);
    };
    for (const [index, raw] of text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').entries()) {
      const line = index + 1, trimmed = raw.trim();
      if (trimmed.startsWith('@phrase')) {
        if (version !== 2) fail(line, '@phrase: は台本v2用です。先頭を @lyricmotion:2 にしてください。');
        if (!current) fail(line, 'フレーズ時間は時間付きSceneの中に記述してください。');
        const match = /^@phrase:(\S+)-->(\S+)$/.exec(trimmed);
        if (!match) fail(line, '@phrase:開始-->終了 と記述してください。');
        const start = timestamp(match[1], line), end = timestamp(match[2], line), sceneDuration = current.end - current.start;
        if (start >= end || start < 0 || end > sceneDuration + 1e-7) fail(line, `フレーズ時間はScene内の0〜${Number(sceneDuration.toFixed(3))}秒で、開始より終了を後にしてください。`);
        flushBlock(); current.block = { line, start, end: Math.min(end, sceneDuration), explicit: true, lines: [] }; continue;
      }
      if (trimmed.startsWith('@')) {
        if (scenes.length || current) fail(line, '全体設定は最初のSceneより前に記述してください。');
        if (/^@lyricmotion:[12]$/.test(trimmed) && !version) { version = Number(trimmed.slice(-1)); continue; }
        if (trimmed.startsWith('@duration:') && duration === null) { duration = timestamp(trimmed.slice(10), line); if (duration < .1 || duration > 600) fail(line, '曲の長さは0.1〜600秒で指定してください。'); continue; }
        fail(line, '未知の設定、未対応の版、または重複した全体設定です。');
      }
      const heading = /^\[([^\[\]]+)\]\s+(.+)$/.exec(trimmed);
      if (heading && heading[2].includes('@')) {
        if (!version) fail(line, '先頭に @lyricmotion:1 または @lyricmotion:2 を記述してください。');
        const fields = {}, tokens = heading[2].split(/\s+/);
        for (const token of tokens) {
          const match = /^@(time|position|motion):(.+)$/.exec(token);
          if (!match || fields[match[1]]) fail(line, '未知の指定、重複指定、または記述の誤りです。');
          fields[match[1]] = match[2];
        }
        if (!fields.time) fail(line, '独自指定のある見出しには @time:開始-->終了 が必要です。');
        const times = fields.time.split('-->'); if (times.length !== 2) fail(line, '@time:開始-->終了 と記述してください。');
        const start = timestamp(times[0], line), end = timestamp(times[1], line);
        if (end <= start || end > 600) fail(line, '終了は開始より後、600秒以下にしてください。');
        if (!POSITIONS.includes(fields.position || 'center')) fail(line, '未知の配置名です。');
        if (fields.motion && !M.PRESETS.some(p => p.id === fields.motion)) fail(line, '未知の振り付け名です。');
        if (heading[1].length > 200) fail(line, 'Scene名は200文字以下にしてください。');
        finish(); current = { line, name: heading[1], start, end, position: fields.position || 'center', motion: fields.motion || null, positionSpecified: !!fields.position, phrases: [], block: { line, start: 0, end: end - start, explicit: false, lines: [] } }; continue;
      }
      if (trimmed.includes('@time:')) fail(line, '時間指定は [Scene名] @time:開始-->終了 の形で記述してください。');
      // 独立したタグ行だけを除外する。歌詞に含まれる括弧は本文として保持する。
      if (/^(?:\[[^\[\]]+\]\s*,?\s*)+$/.test(trimmed)) { warnings.push({ line, message: '時間なしタグ行を無視', text: raw }); continue; }
      if (current) current.block.lines.push(raw);
      else if (trimmed) warnings.push({ line, message: '最初の時間付きSceneより前の本文を除外', text: raw });
    }
    finish();
    if (!version) throw new Error('先頭に @lyricmotion:1 または @lyricmotion:2 を記述してください。');
    if (!scenes.length) throw new Error('時間付きSceneがありません。例: [verse1] @time:00:00.000-->00:10.000');
    if (scenes.length > 1000 || scenes.reduce((n, s) => n + s.parts.length, 0) > 1000) throw new Error('Scene・Elementはそれぞれ1000以下にしてください。');
    const last = Math.max(...scenes.map(s => s.end));
    if (duration !== null && duration < last) fail(scenes.find(s => s.end > duration).line, 'Scene終了が曲の長さを超えています。');
    return { version, duration: duration ?? Math.max(.1, last), scenes, warnings };
  }
  function placeElement(element, canvas, position, measure) {
    if (!POSITIONS.includes(position)) throw new Error('未知の配置名です。');
    const e = P.clone(element), style = e.style, padding = Math.max(style.strokeWidth, style.glowBlur) * 2;
    const lines = e.text.split('\n'), w = (Math.max(...lines.map(s => Math.max(1, measure(s, style)))) + padding) * e.transform.scale;
    const h = (lines.length * style.fontSize * style.lineHeight + padding) * e.transform.scale;
    const angle = e.transform.rotation * Math.PI / 180;
    const boxWidth = Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h;
    const boxHeight = Math.abs(Math.sin(angle)) * w + Math.abs(Math.cos(angle)) * h;
    const factorX = position.endsWith('left') ? 0 : position.endsWith('right') ? 1 : .5;
    const factorY = position.startsWith('top') ? 0 : position.startsWith('bottom') ? 1 : .5;
    for (const [key, dimension, size, factor] of [['x', canvas.width, boxWidth, factorX], ['y', canvas.height, boxHeight, factorY]]) {
      const next = size > dimension * .9 ? .5 : (.05 * dimension + size / 2 + (dimension * .9 - size) * factor) / dimension;
      const delta = next - e.position[key]; e.position[key] = next;
      const track = e.animations.find(t => t.property === key); if (track) for (const frame of track.keyframes) frame.value += delta;
    }
    return e;
  }
  function build(script, base, measure, options = {}) {
    const project = P.clone(base), { width, height } = project.project, style = project.styles.default;
    project.project.duration = script.duration; project.audio = null;
    project.scenes = script.scenes.map((scene, index) => {
      try {
        const makeElement = (text, i) => {
          const timing = scene.phrases?.[i] || { start: 0, end: scene.end - scene.start };
          return P.element(text, timing.start, timing.end, `script-${index}-${i}`, style);
        };
        const padding = Math.max(style.strokeWidth, style.glowBlur) * 2, gap = style.fontSize * .3;
        const rows = []; let row = [], used = 0;
        for (const [phraseIndex, text] of scene.parts.entries()) {
          const lines = text.split('\n'), w = Math.max(...lines.map(s => Math.max(1, measure(s, style)))) + padding;
          const h = lines.length * style.fontSize * style.lineHeight + padding;

          if (row.length && used + gap + w > width * .9) { rows.push(row); row = []; used = 0; }
          row.push({ text, w, h, index: phraseIndex }); used += (row.length > 1 ? gap : 0) + w;
        }
        rows.push(row);
        const heights = rows.map(r => Math.max(...r.map(i => i.h))), totalHeight = heights.reduce((a, b) => a + b, 0);
        const position = scene.positionSpecified === false ? (options.defaultPosition || scene.position) : scene.position;
        if (!POSITIONS.includes(position)) throw new Error('未知の配置名です。');
        const overflow = totalHeight > height * .9 || rows.some(r => r.some(item => item.w > width * .9));
        if (overflow) {
          options.warnings?.push({ line: scene.line, name: scene.name, message: '文字群が画面に収まらないため、各Elementを同じ指定領域へ重ねて仮配置します。文字サイズと時間は保持します。' });
          const elements = scene.parts.map((text, i) => {
            let e = placeElement(makeElement(text, i), project.project, position, measure);
            if (scene.motion) e = M.apply(e, scene.motion); return e;
          });
          return { id: `script-scene-${index}`, name: scene.name, start: scene.start, end: scene.end, elements };
        }
        const vertical = position.startsWith('top') ? 0 : position.startsWith('bottom') ? 1 : .5;
        const horizontal = position.endsWith('left') ? 0 : position.endsWith('right') ? 1 : .5;
        let top = height * .05 + (height * .9 - totalHeight) * vertical; const elements = [];
        rows.forEach((r, ri) => {
          const rowWidth = r.reduce((n, i) => n + i.w, 0) + gap * (r.length - 1);
          let left = width * .05 + (width * .9 - rowWidth) * horizontal;
          for (const item of r) {
            let e = makeElement(item.text, item.index);
            e.position.x = (left + item.w / 2) / width; e.position.y = (top + heights[ri] / 2) / height;
            if (scene.motion) e = M.apply(e, scene.motion);
            elements.push(e); left += item.w + gap;
          }
          top += heights[ri];
        });
        return { id: `script-scene-${index}`, name: scene.name, start: scene.start, end: scene.end, elements };
      } catch (error) { fail(scene.line, error.message); }
    });
    return P.validate(project);
  }
  const api = { parse, build, timestamp, POSITIONS, placeElement };
  if (node) module.exports = api; else root.LyricMotionScript = api;
})(globalThis);
