(function (root) {
  'use strict';
  const P = typeof module === 'object' && module.exports ? require('./scene-project.js') : root.LyricMotionProject;
  const PRESETS = [
    { id: 'solemn', name: '重厚な登場', description: 'ゆっくり浮上して停止し、静かに消える。' },
    { id: 'impact', name: '衝突・インパクト', description: '大きく登場して収縮し、最後に弾ける。' },
    { id: 'march', name: '左から進軍', description: '左から入り、基準位置で保持して右へ退場。反転で逆方向。' },
    { id: 'call', name: '呼びかけ', description: 'ポップして登場し、軽く脈動する。' },
    { id: 'afterglow', name: '静かな余韻', description: 'ゆっくり拡大しながらフェードする。' },
    { id: 'statement', name: '強調・決め台詞', description: '素早く登場し、長めに保持して短く退場。' }
  ];
  function apply(element, id, options = {}) {
    if (!PRESETS.some(p => p.id === id)) throw new Error('未対応の振り付けプリセットです。');
    const strength = options.strength ?? 1;
    if (!Number.isFinite(strength) || strength < .25 || strength > 2) throw new Error('動きの強さは0.25〜2で指定してください。');
    const e = P.clone(element), duration = e.end - e.start;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Elementの表示時間を正しく設定してください。');
    const sign = options.mirror ? -1 : 1, { x, y } = e.position, { scale, rotation } = e.transform;
    const bound = (property, value) => Math.min(P.RANGES[property][1], Math.max(P.RANGES[property][0], value));
    const add = (property, keys) => e.animations.push(P.track(property, keys.map(([fraction, value, easing = 'ease-out']) => [duration * fraction, bound(property, value), easing])));
    const fade = (enter, exit) => add('opacity', [[0, 0], [enter, 1], [exit, 1], [1, 0, 'ease-in']]);
    e.animations = [];
    // 補助プリセットの倍率・透明度を重ねず、生成したキーだけで振り付ける。
    e.effects = { enter: { type: 'none', duration: 0 }, active: { type: 'none' }, exit: { type: 'none', duration: 0 } };
    if (id === 'solemn') {
      add('y', [[0, y + .12 * strength], [.25, y], [.85, y], [1, y - .02 * strength, 'ease-in']]); fade(.25, .82);
    } else if (id === 'impact') {
      add('scale', [[0, scale * (1 + 1.2 * strength)], [.12, scale * (1 - .12 * strength)], [.22, scale], [.82, scale], [1, scale * (1 + .5 * strength), 'ease-in']]);
      add('rotation', [[0, rotation - sign * 12 * strength], [.18, rotation], [.82, rotation], [1, rotation + sign * 15 * strength, 'ease-in']]); fade(.07, .88);
    } else if (id === 'march') {
      add('x', [[0, x - sign * .35 * strength], [.2, x], [.8, x], [1, x + sign * .35 * strength, 'ease-in']]); fade(.12, .86);
    } else if (id === 'call') {
      add('scale', [[0, scale * .25], [.12, scale * (1 + .15 * strength)], [.22, scale], [.4, scale * (1 + .06 * strength)], [.55, scale], [.7, scale * (1 + .06 * strength)], [.84, scale], [1, scale * .7, 'ease-in']]); fade(.08, .88);
    } else if (id === 'afterglow') {
      add('scale', [[0, scale * (1 - .06 * strength)], [1, scale * (1 + .12 * strength), 'linear']]); fade(.28, .7);
    } else {
      add('scale', [[0, scale * (1 - .15 * strength)], [.1, scale], [.92, scale], [1, scale * (1 + .12 * strength), 'ease-in']]);
      add('y', [[0, y + .06 * strength], [.1, y], [.92, y], [1, y - .04 * strength, 'ease-in']]); fade(.06, .94);
    }
    return e;
  }
  const SEQUENCES = [
    { id: 'impact', name: '斜め配置＋時間差Impact', description: '一覧順に時間差で登場し、共通終了。間隔は登場の時間差です。' },
    { id: 'alternate', name: '左右交互に登場', description: '一覧順に左・右から交互に入り、共通終了。間隔は登場の時間差です。' },
    { id: 'wave', name: 'ウェーブ', description: '全対象が同時に登場し、順番に上下の波が一回伝わります。間隔は波が始まる時間差です。' },
    { id: 'stack', name: '積み上げ', description: '順番にフェードインし、前の言葉を残して一つの配置を完成させます。時間差は登場間隔、終了は共通。X/Y配置間隔で積む方向を指定します。' },
    { id: 'gather', name: '集合', description: '周囲の離れた位置から、時間差で指定配置へ集まります。時間差は登場間隔、終了は共通。開始方向は一覧順に固定し、同じ設定は同じ結果になります。' },
    { id: 'center-out', name: '中央から展開', description: '選択対象の中央から左右の順に登場します。中央の組を先頭Elementの基準位置に置き、X/Y間隔で両側へ展開。時間差は中央から外へ進む間隔です。' },
    { id: 'last-accent', name: '最後の一語を強調', description: '一覧順に登場し、最後のElementだけ大きなImpactで強調します。時間差は登場間隔、終了は共通。' },
    { id: 'flow', name: '流れる歌詞', description: '一覧順に時間差で登場し、全対象が同じ速度で左へ流れ続けます。強さが速度に対応し、共通時刻で終了。X/Y間隔は各出発位置の間隔です。' },
    { id: 'exit-chain', name: '連鎖して退場', description: '全対象が同時に登場し、一覧順に上へ飛び去ります。間隔は退場完了の時間差。最後の対象が共通終了に到達します。' }
  ];
  // 一覧順を振り付け順とし、結果は通常のElementへ展開する。
  function sequence(input, sceneId, ids, options) {
    const project = P.validate(input), scene = project.scenes.find(s => s.id === sceneId);
    if (!scene) throw new Error('Sceneが見つかりません。');
    const selected = new Set(ids), targets = scene.elements.filter(e => selected.has(e.id));
    if (targets.length !== selected.size || targets.length < 2) throw new Error('同じSceneのElementを2個以上選択してください。');
    let { start, end, delay, dx, dy, strength } = options;
    const type = options.type || 'impact', motionOnly = options.motionOnly === true;
    if (motionOnly) { start = 0; end = 1; dx = 0; dy = 0; if (type !== 'wave') delay = 0; }
    if (!SEQUENCES.some(p => p.id === type)) throw new Error('未対応の複数振り付けです。');
    if (!Number.isFinite(strength) || strength < .25 || strength > 2) throw new Error('動きの強さは0.25〜2で指定してください。');
    if (![start, end, delay, dx, dy, strength].every(Number.isFinite)) throw new Error('振り付けの設定は数値で指定してください。');
    const middle = (targets.length - 1) / 2;
    const lastStep = type === 'center-out' ? Math.floor(middle) : targets.length - 1;
    if (delay < 0 || (!motionOnly && (start < 0 || end > scene.end - scene.start || start >= end || start + lastStep * delay >= end))) throw new Error('全Elementの開始が共通終了より前になるよう、Scene内の開始・終了・登場間隔を調整してください。');
    const origin = { ...targets[0].position };
    targets.forEach((e, index) => {
      const step = type === 'center-out' ? Math.floor(Math.abs(index - middle)) : index;
      if (!motionOnly) {
        e.start = ['wave', 'exit-chain'].includes(type) ? start : start + step * delay;
        e.end = type === 'exit-chain' ? end - (targets.length - 1 - index) * delay : end;
        const placementIndex = type === 'center-out' ? index - middle : index;
        e.position = { ...origin, x: origin.x + placementIndex * dx, y: origin.y + placementIndex * dy };
      }
      const generated = apply(e, type === 'alternate' ? 'march' : 'impact', { strength, mirror: type === 'alternate' && index % 2 === 1 });
      e.animations = generated.animations; e.effects = generated.effects;
      const duration = e.end - e.start;
      const fade = () => P.track('opacity', [[0, 0], [duration * .06, 1], [duration * .94, 1], [duration, 0]]);
      if (type === 'stack') {
        const enter = Math.min(.2, duration * .2), exit = Math.min(.2, duration * .2);
        e.animations = [P.track('opacity', [[0, 0], [enter, 1], [duration - exit, 1], [duration, 0]])];
      } else if (type === 'gather') {
        const angle = index * Math.PI * 2 / targets.length - Math.PI / 2;
        e.animations = [P.track('x', [[0, e.position.x + Math.cos(angle) * .3 * strength], [duration * .25, e.position.x], [duration, e.position.x]]), P.track('y', [[0, e.position.y + Math.sin(angle) * .3 * strength], [duration * .25, e.position.y], [duration, e.position.y]]), fade()];
      } else if (type === 'center-out') {
        const generated = apply(e, 'call', { strength });
        e.animations = generated.animations;
      } else if (type === 'last-accent') {
        const generated = apply(e, index === targets.length - 1 ? 'impact' : 'statement', { strength });
        e.animations = generated.animations;
        if (index === targets.length - 1) for (const key of e.animations.find(t => t.property === 'scale').keyframes) key.value *= 1.25;
      } else if (type === 'flow') {
        e.animations = [P.track('x', [[0, e.position.x, 'linear'], [duration, e.position.x - .2 * strength * duration, 'linear']]), fade()];
      } else if (type === 'wave') {
        const offset = index * delay;
        if (motionOnly && offset >= duration) throw new Error(`「${e.text.slice(0, 20)}」の表示時間より波の時間差が長いため、時間差を小さくしてください。`);
        const waveDuration = (motionOnly ? duration - offset : end - start - (targets.length - 1) * delay) * .7;
        const points = [[0, e.position.y], [offset, e.position.y], [offset + waveDuration * .25, e.position.y - .08 * strength], [offset + waveDuration * .5, e.position.y], [offset + waveDuration * .75, e.position.y + .08 * strength], [offset + waveDuration, e.position.y], [duration, e.position.y]];
        const keys = [...new Map(points.map(p => [p[0], p])).values()];
        e.animations = [P.track('y', keys), P.track('opacity', [[0, 0], [duration * .06, 1], [duration * .94, 1], [duration, 0]])];
      } else if (type === 'exit-chain') {
        const exit = Math.min(.4, duration * .3);
        e.animations = [P.track('y', [[0, e.position.y], [duration - exit, e.position.y], [duration, e.position.y - .2 * strength, 'ease-in']]), P.track('opacity', [[0, 0], [duration * .06, 1], [duration - exit, 1], [duration, 0, 'ease-in']])];
      }
    });
    return P.validate(project);
  }
  const api = { PRESETS, SEQUENCES, apply, sequence };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LyricMotionPresets = api;
})(globalThis);
