(function (root) {
  'use strict';
  const legacy = typeof module === 'object' && module.exports ? require('./project.js') : root.LyricMotionLegacyProject;
  const SCHEMA = 'vct-lyric-motion.project.v2', clone = legacy.clone;
  const ENTER = ['none', ...legacy.ENTER], ACTIVE = legacy.ACTIVE, EXIT = ['none', 'fade'];
  const RANGES = { x: [-3, 4], y: [-3, 4], scale: [0, 20], rotation: [-3600, 3600], opacity: [0, 1] };
  const EASINGS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];
  function number(value, min, max, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label}は${min}〜${max}の数値で指定してください。`);
    return value;
  }
  function id(value, ids) {
    if (typeof value !== 'string' || !value || value.length > 200 || ids.has(value)) throw new Error('Scene／ElementのIDが不正または重複しています。');
    ids.add(value); return value;
  }
  function phases(value) {
    return Object.fromEntries([['enter', ENTER], ['active', ACTIVE], ['exit', EXIT]].map(([key, types]) => {
      const p = value?.[key]; if (!p || !types.includes(p.type)) throw new Error('未対応の演出です。');
      return [key, key === 'active' ? { type: p.type } : { type: p.type, duration: number(p.duration, 0, 10, '演出時間') }];
    }));
  }
  function element(text, start, end, elementId, style = legacy.sample().styles.default) {
    return { id: elementId, type: 'text', text, start, end, position: { x: 0.5, y: 0.5, anchor: 'center' }, transform: { scale: 1, rotation: 0 }, style: clone(style),
      effects: { enter: { type: 'none', duration: 0 }, active: { type: 'none' }, exit: { type: 'none', duration: 0 } }, animations: [] };
  }
  function fromCues(cues, project) {
    return cues.map((cue, i) => ({ id: `scene-${i}`, name: cue.text.slice(0, 60), start: cue.start, end: cue.end,
      elements: [{ ...element(cue.text, 0, cue.end - cue.start, cue.id, project.styles.default), effects: cue.effects, position: cue.position }] }));
  }
  function migrate(input) {
    const old = legacy.validate(input), { lyrics, ...base } = old;
    return { ...base, schema: SCHEMA, schemaVersion: 2, scenes: fromCues(lyrics, old) };
  }
  function validate(input) {
    if (input?.schema === legacy.SCHEMA && input.schemaVersion === 1) return validate(migrate(input));
    if (input?.schema !== SCHEMA || input.schemaVersion !== 2) throw new Error('未対応のプロジェクト形式です。');
    const { lyrics, ...base } = legacy.validate({ ...input, schema: legacy.SCHEMA, schemaVersion: 1, lyrics: [] });
    if (!Array.isArray(input.scenes) || input.scenes.length > 1000) throw new Error('Sceneは1000以下にしてください。');
    const sceneIds = new Set(), elementIds = new Set(); let total = 0;
    const scenes = input.scenes.map(scene => {
      const sceneId = id(scene?.id, sceneIds);
      if (typeof scene.name !== 'string' || scene.name.length > 200) throw new Error('Scene名は200文字以下にしてください。');
      const start = number(scene.start, 0, base.project.duration, 'Scene開始'), end = number(scene.end, 0, base.project.duration, 'Scene終了');
      if (start >= end) throw new Error('Scene終了は開始より後にしてください。');
      if (!Array.isArray(scene.elements) || (total += scene.elements.length) > 1000) throw new Error('Elementは全体で1000以下にしてください。');
      const elements = scene.elements.map(e => {
        const elementId = id(e?.id, elementIds);
        if (e.type !== 'text' || typeof e.text !== 'string' || e.text.length > 1000) throw new Error('文字Elementの本文は1000文字以下にしてください。');
        const eStart = number(e.start, 0, end - start + 1e-7, 'Element開始'), eEnd = number(e.end, 0, end - start + 1e-7, 'Element終了');
        if (eStart >= eEnd) throw new Error('Element終了は開始より後にしてください。');
        if (e.position?.anchor !== 'center') throw new Error('中央アンカーを指定してください。');
        if (!Array.isArray(e.animations) || e.animations.length > 5) throw new Error('Animationは5プロパティまでです。');
        const properties = new Set();
        const animations = e.animations.map(track => {
          if (!Object.hasOwn(RANGES, track?.property) || properties.has(track.property)) throw new Error('Animationのプロパティが未対応または重複しています。'); properties.add(track.property);
          if (!Array.isArray(track.keyframes) || !track.keyframes.length || track.keyframes.length > 100) throw new Error('キーフレームは1〜100個にしてください。');
          let previous = -1;
          return { property: track.property, keyframes: track.keyframes.map(key => {
            const time = number(key?.time, 0, eEnd - eStart + 1e-7, 'キーフレーム時刻');
            if (time <= previous) throw new Error('キーフレーム時刻は重複させず、昇順にしてください。'); previous = time;
            if (!EASINGS.includes(key.easing)) throw new Error('未対応の補間方法です。');
            return { time, value: number(key.value, ...RANGES[track.property], track.property), easing: key.easing };
          }) };
        });
        return { ...element(e.text, eStart, eEnd, elementId, legacy.validate({ ...base, lyrics: [], styles: { default: e.style } }).styles.default),
          position: { x: number(e.position.x, ...RANGES.x, 'X位置'), y: number(e.position.y, ...RANGES.y, 'Y位置'), anchor: 'center' },
          transform: { scale: number(e.transform?.scale, ...RANGES.scale, '倍率'), rotation: number(e.transform?.rotation, ...RANGES.rotation, '回転') }, effects: phases(e.effects), animations };
      });
      return { id: sceneId, name: scene.name, start, end, elements };
    });
    return { ...base, schema: SCHEMA, schemaVersion: 2, scenes };
  }
  function retimeAnimations(element, previousDuration) {
    const duration = element.end - element.start;
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(previousDuration) || previousDuration <= 0) throw new Error('Element終了は開始より後にしてください。');
    if (duration === previousDuration) return;
    for (const track of element.animations) for (const key of track.keyframes) {
      if (!Number.isFinite(key.time) || key.time < 0 || key.time > previousDuration + 1e-7) throw new Error('変更前のElement区間内にキーフレームを設定してください。');
      key.time = Math.min(duration, key.time / previousDuration * duration);
    }
  }
  function distributeSceneTiming(scene) {
    const next = clone(scene), duration = next.end - next.start, count = next.elements.length;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Sceneの開始・終了を正しく設定してください。');
    if (!count) throw new Error('時間を振り分けるElementがありません。');
    next.elements.forEach((element, index) => {
      const previousDuration = element.end - element.start;
      element.start = duration * index / count;
      element.end = index === count - 1 ? duration : duration * (index + 1) / count;
      retimeAnimations(element, previousDuration);
    });
    return next;
  }
  function bulkEdit(input, sceneId, elementIds, patch) {
    const project = validate(input), scene = project.scenes.find(s => s.id === sceneId), ids = new Set(elementIds);
    if (!scene || !ids.size || [...ids].some(id => !scene.elements.some(e => e.id === id))) throw new Error('同じScene内のElementを選択してください。');
    const dx = patch.dx ?? 0, dy = patch.dy ?? 0;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error('移動量は数値で指定してください。');
    for (const e of scene.elements.filter(e => ids.has(e.id))) {
      for (const [key, offset] of [['x', dx], ['y', dy]]) {
        const delta = patch[key] === undefined ? offset : number(patch[key], ...RANGES[key], `${key.toUpperCase()}指定座標`) - e.position[key];
        e.position[key] += delta; const track = e.animations.find(t => t.property === key);
        if (track) for (const frame of track.keyframes) frame.value += delta;
      }
      for (const key of ['fontSize', 'fontWeight', 'fill', 'stroke', 'fontFamily', 'fontSource']) if (patch[key] !== undefined) e.style[key] = patch[key];
      if (patch.fontSource === null) delete e.style.fontSource;
    }
    return validate(project);
  }
  const track = (property, keys) => ({ property, keyframes: keys.map(([time, value, easing = 'ease-out']) => ({ time, value, easing })) });
  function sample() {
    const { lyrics, ...base } = legacy.sample();
    const first = { id: 'scene-call', name: 'さあ ／ 答えろ', start: 0, end: 5, elements: [] };
    const call = element('さあ', 0, 4.4, 'call', { ...base.styles.default, fontSize: 125, fill: '#ffe07a', strokeWidth: 2 });
    call.position = { x: 0.22, y: 0.28, anchor: 'center' }; call.transform.rotation = -12;
    call.animations = [track('x', [[0, -0.2], [0.65, 0.22], [3.8, 0.22], [4.4, -0.3, 'ease-in']]), track('opacity', [[0, 0], [0.25, 1], [3.8, 1], [4.4, 0]])]; first.elements.push(call);
    ['答', 'え', 'ろ'].forEach((char, i) => {
      const e = element(char, 0.7 + i * 0.12, 5, `answer-${i}`, { ...base.styles.default, fontSize: 230, strokeWidth: 2, glowBlur: 36 });
      e.position.x = 0.36 + i * 0.16; e.position.y = 0.57; e.effects.active.type = 'glow'; const d = e.end - e.start;
      e.animations = [track('scale', [[0, 3.5], [0.3, 0.9], [0.48, 1], [d - 0.8, 1], [d, 0.2, 'ease-in']]),
        track('rotation', [[0, i === 1 ? 25 : -20], [0.45, 0], [d - 0.8, 0], [d, (i - 1) * 150 + 60, 'ease-in']]),
        track('x', [[0, e.position.x], [d - 0.8, e.position.x], [d, [-0.3, 0.5, 1.3][i], 'ease-in']]),
        track('y', [[0, 0.57], [d - 0.8, 0.57], [d, [0.1, -0.4, 1.3][i], 'ease-in']]),
        track('opacity', [[0, 0], [0.12, 1], [d - 0.4, 1], [d, 0]])]; first.elements.push(e);
    });
    const second = { id: 'scene-future', name: '未来へつなぐ', start: 5, end: 10, elements: [] };
    const intro = element('この瞬間を', 0, 4.8, 'moment', { ...base.styles.default, fontSize: 90, fill: '#91dfff', strokeWidth: 1 });
    intro.position = { x: 0.29, y: 0.24, anchor: 'center' }; intro.transform.rotation = -6;
    intro.animations = [track('y', [[0, -0.2], [0.65, 0.24]]), track('opacity', [[0, 0], [0.5, 1], [4, 1], [4.8, 0]])]; second.elements.push(intro);
    ['未', '来', 'へ'].forEach((char, i) => {
      const e = element(char, 0.35 + i * 0.18, 4.9, `future-${i}`, { ...base.styles.default, fontSize: 210, strokeWidth: 1 });
      e.position.x = 0.33 + i * 0.16; e.position.y = 0.51; e.effects.active.type = 'sweep'; const d = e.end - e.start;
      e.animations = [track('y', [[0, i % 2 ? -0.2 : 1.2], [0.8, 0.51], [d - 0.6, 0.51], [d, 0.3]]), track('rotation', [[0, i % 2 ? -90 : 90], [0.8, 0]]), track('scale', [[0, 0.2], [0.8, 1], [d - 0.6, 1], [d, 1.5]]), track('opacity', [[0, 0], [0.3, 1], [d - 0.6, 1], [d, 0]])]; second.elements.push(e);
    });
    const connect = element('つなぐ', 1.5, 4.9, 'connect', { ...base.styles.default, fontSize: 110, fill: '#ffe07a', strokeWidth: 1 });
    connect.position = { x: 0.73, y: 0.78, anchor: 'center' }; connect.transform.rotation = -12;
    connect.animations = [track('x', [[0, 1.3], [0.8, 0.73]]), track('opacity', [[0, 0], [0.25, 1], [2.8, 1], [3.4, 0]])]; second.elements.push(connect);
    return validate({ ...base, schema: SCHEMA, schemaVersion: 2, scenes: [first, second] });
  }
  const api = { SCHEMA, ENTER, ACTIVE, EXIT, RANGES, EASINGS, clone, validate, migrate, element, track, sample, fromCues, retimeAnimations, distributeSceneTiming, bulkEdit, parseLrc: legacy.parseLrc, parseSrt: legacy.parseSrt };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LyricMotionProject = api;
})(globalThis);
