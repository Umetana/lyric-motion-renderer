'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../project.js');
const R = require('../renderer.js');
const S = require('../scene-project.js');
const F = require('../effects.js');

test('Lyric Motion: JSONを往復し、未対応schema・不正時刻・重複IDを拒否する', () => {
  const project = P.sample();
  assert.deepEqual(P.validate(JSON.parse(JSON.stringify(project))), project);
  for (const mutate of [p => p.schemaVersion = 2, p => p.lyrics[0].end = 0, p => p.lyrics[0].start = NaN, p => p.lyrics[1].id = p.lyrics[0].id]) {
    const candidate = P.clone(project); mutate(candidate); assert.throws(() => P.validate(candidate));
  }
});

test('Lyric Motion: 短い行でもEnter/Exitを収め、境界で完全に非表示にする', () => {
  const line = P.cue('短い行', 1, 1.1, 'short');
  line.effects.enter.duration = 0.3; line.effects.exit.duration = 0.3;
  assert.equal(R.evaluate(line, 0.999), null);
  assert.equal(R.evaluate(line, 1).opacity, 0);
  assert.ok(R.evaluate(line, 1.05).opacity > 0.99);
  assert.equal(R.evaluate(line, 1.1), null);
  line.effects.enter.duration = 0; line.effects.exit.duration = 0;
  assert.equal(R.evaluate(line, 1).opacity, 1);
});

test('Lyric Motion: シーク順序がEffect評価へ影響しない', () => {
  const project = P.sample();
  const expected = R.evaluate(project.lyrics[1], 4);
  for (const time of [5.9, 0, 6.7, 3.1]) R.evaluate(project.lyrics[1], time);
  assert.deepEqual(R.evaluate(project.lyrics[1], 4), expected);
  assert.deepEqual(R.graphemes('か\u3099👨‍👩‍👧‍👦'), ['か\u3099', '👨‍👩‍👧‍👦']);
});

test('Lyric Motion: LRC複数時刻・offset・空行による表示終了を正規化する', () => {
  const rows = P.parseLrc('[offset:100]\n[00:01.50][00:04.5]歌詞\n[00:03.00]\n[00:06.00]最後', 10);
  assert.deepEqual(rows.map(({ start, end }) => [start, end]), [[1.6, 3.1], [4.6, 6.1], [6.1, 10]]);
  assert.throws(() => P.parseLrc('[00:12.00]長すぎる', 10));
  assert.throws(() => P.parseLrc('[00:01.00]<00:01.20>単語', 10));
  assert.throws(() => P.parseLrc('[00:01.00]'.repeat(1001) + '多すぎる', 10));
});

test('Lyric Motion: SRT重複・改行を維持し、装飾を黙って破棄しない', () => {
  const rows = P.parseSrt('1\n00:00:01,000 --> 00:00:03,000\n一行目\n二行目\n\n2\n00:00:02,000 --> 00:00:04,000\n重複');
  assert.equal(rows[0].text, '一行目\n二行目');
  assert.equal(rows[1].start, 2);
  assert.throws(() => P.parseSrt('1\n00:00:01,000 --> 00:00:03,000\n<b>装飾</b>'));
});

test('Lyric Motion v2: 初版をSceneへ移行し、文字・時間・デザイン・演出を保持する', () => {
  const old = P.sample(), migrated = S.validate(old);
  assert.equal(migrated.schemaVersion, 2);
  old.lyrics.forEach((line, i) => {
    const scene = migrated.scenes[i], e = scene.elements[0];
    assert.equal(scene.start, line.start); assert.equal(scene.end, line.end);
    assert.equal(e.start, 0); assert.equal(e.end, line.end - line.start);
    assert.equal(e.text, line.text); assert.deepEqual(e.effects, line.effects);
    assert.deepEqual(e.style, old.styles.default);
    for (const time of [line.start, line.start + 0.15, line.end - 0.1]) {
      const phase = R.evaluate(line, time), actual = F.evaluateElement(scene, e, time);
      for (const property of ['opacity', 'scale', 'reveal', 'glow', 'sweep']) assert.equal(actual[property], phase[property]);
    }
  });
  assert.deepEqual(S.validate(JSON.parse(JSON.stringify(migrated))), migrated);
});

test('Lyric Motion v2: Scene時間とElement時間で独立して出現する', () => {
  const p = S.sample(), scene = p.scenes[1], e = scene.elements[1];
  assert.equal(F.evaluateElement(scene, e, scene.start + e.start - 0.001), null);
  assert.ok(F.evaluateElement(scene, e, scene.start + e.start + 0.01));
  assert.equal(F.evaluateElement(scene, e, scene.start + e.end), null);
  assert.equal(F.evaluateElement(scene, e, scene.end), null);
});

test('Lyric Motion v2: キーフレームを直接補間し、過去フレームに依存しない', () => {
  const track = S.track('x', [[0, 0, 'linear'], [2, 1, 'linear']]);
  assert.equal(F.sampleTrack(track, 1), 0.5);
  assert.equal(F.sampleTrack(track, -1), 0); assert.equal(F.sampleTrack(track, 3), 1);
  track.keyframes[1].easing = 'ease-out'; assert.equal(F.sampleTrack(track, 1), 0.875);
  const p = S.sample(), s = p.scenes[0], e = s.elements[1], expected = F.evaluateElement(s, e, 2);
  for (const time of [4.8, 0, 3]) F.evaluateElement(s, e, time);
  assert.deepEqual(F.evaluateElement(s, e, 2), expected);
});

test('Lyric Motion v2: Elementごとの文字Styleを独立して保存する', () => {
  const p = S.sample(); const original = p.scenes[0].elements[1].style.fill;
  p.scenes[0].elements[0].style.fill = '#ff0000';
  const restored = S.validate(p);
  assert.equal(restored.scenes[0].elements[1].style.fill, original);
  assert.equal(restored.scenes[0].elements[0].style.fill, '#ff0000');
});

test('Lyric Motion v2: 不正なScene・Element・Animationを拒否する', () => {
  for (const mutate of [p => p.schemaVersion = 3, p => p.scenes[0].end = 0,
    p => p.scenes[0].elements[0].end = 6, p => p.scenes[0].elements[1].id = p.scenes[0].elements[0].id,
    p => p.scenes[0].elements[0].animations[0].keyframes[1].time = 0,
    p => p.scenes[0].elements[0].animations[0].keyframes[1].value = Infinity,
    p => p.scenes[0].elements[0].animations[0].property = 'unknown']) {
    const p = S.sample(); mutate(p); assert.throws(() => S.validate(p));
  }
});


test('Lyric Motion: 書き出し範囲とScene単体を解決し、元Projectを変更しない', () => {
  const E = require('../exporter.js'), p = S.sample(), before = JSON.stringify(p);
  const all = E.resolveRange(p); assert.equal(all.frameCount, 300); assert.equal(all.start, 0);
  const range = E.resolveRange(p, { start: 5.1, end: 5.2 }); assert.equal(range.frameCount, 3); assert.equal(range.project.scenes.length, 2);
  const scene = E.resolveRange(p, { sceneId: p.scenes[1].id }); assert.equal(scene.start, 5); assert.equal(scene.end, 10); assert.equal(scene.project.scenes.length, 1);
  assert.equal(JSON.stringify(p), before);
  for (const options of [{ start: -1 }, { end: 11 }, { start: 2, end: 2 }, { start: NaN }, { sceneId: 'missing' }]) assert.throws(() => E.resolveRange(p, options));
});


test('Lyric Motion: Element長さに合わせて全キーを比例伸縮し、動きの値と補間を保持する', () => {
  const e = S.element('調整', 1, 7, 'retime');
  e.animations = [S.track('x', [[0, .2], [2, .4], [6, .8]]), S.track('opacity', [[0, 0], [3, 1], [6, 0]])];
  const original = S.clone(e.animations); e.end = 4; S.retimeAnimations(e, 6);
  assert.deepEqual(e.animations[0].keyframes.map(k => k.time), [0, 1, 3]);
  assert.deepEqual(e.animations[1].keyframes.map(k => k.time), [0, 1.5, 3]);
  for (let i = 0; i < original.length; i++) for (const fraction of [0, .2, .5, .8, 1]) assert.equal(F.sampleTrack(e.animations[i], 3 * fraction), F.sampleTrack(original[i], 6 * fraction));
  e.end = 10; S.retimeAnimations(e, 3); assert.deepEqual(e.animations[0].keyframes.map(k => k.time), [0, 3, 9]);
  const before = S.clone(e.animations); e.start = 2; e.end = 11; S.retimeAnimations(e, 9); assert.deepEqual(e.animations, before);
  e.end = e.start; assert.throws(() => S.retimeAnimations(e, 9));
});


test('Lyric Motion: 振り付け6種を区間と基準Transformへ適用し、文字・時間・Styleを保持する', () => {
  const M = require('../motion-presets.js');
  for (const duration of [.01, 2, 120]) for (const preset of M.PRESETS) {
    const project = S.sample(); project.project.duration = Math.max(.1, duration); project.scenes = [{ id: 'scene', name: '確認', start: 0, end: duration, elements: [] }];
    const source = S.element('プリセット', 0, duration, 'preset'); source.position.x = .7; source.position.y = .3; source.transform = { scale: 1.4, rotation: 18 };
    const before = S.clone(source), result = M.apply(source, preset.id, { strength: 2, mirror: true });
    assert.deepEqual(source, before); for (const key of ['id', 'text', 'start', 'end', 'position', 'transform', 'style']) assert.deepEqual(result[key], before[key]);
    project.scenes[0].elements = [result]; S.validate(project);
    for (const track of result.animations) { assert.equal(track.keyframes[0].time, 0); assert.equal(track.keyframes.at(-1).time, duration); }
    assert.equal(F.evaluateElement(project.scenes[0], result, duration), null);
  }
  const source = S.element('左右', 0, 2, 'mirror');
  const left = M.apply(source, 'march'), right = M.apply(source, 'march', { mirror: true });
  assert.equal(left.animations[0].keyframes[0].value + right.animations[0].keyframes[0].value, 1);
  assert.throws(() => M.apply(source, 'missing')); assert.throws(() => M.apply(source, 'march', { strength: NaN }));
});


test('Lyric Motion: 独自台本の時間・タグ・改行・区切りを解析する', () => {
  const L = require('../lyric-script.js');
  const source = '\uFEFF@lyricmotion:1\r\n@duration:00:20.000\r\n[Audio Engine: X], [Buffer: Lossless],\r\n除外本文\r\n[chorus1] @time:00:01.000-->00:10.000 @position:bottom-center @motion:impact\r\n山か|里か｜さあ答えろ\r\n[力強く]\r\n次の行/／ [括弧は本文]\r\n[verse1]\r\n歌詞B\r\n[chorus1] @time:00:09.000-->00:12.000\r\nイッポ';
  const parsed = L.parse(source); assert.equal(parsed.duration, 20); assert.equal(parsed.scenes.length, 2); assert.equal(parsed.warnings.length, 4);
  assert.deepEqual(parsed.scenes[0].parts, ['山か', '里か', 'さあ答えろ\n次の行/／ [括弧は本文]\n歌詞B']);
  assert.equal(parsed.scenes[1].name, 'chorus1'); assert.equal(L.parse('@lyricmotion:1\n[a] @time:00:00.000-->00:02.000\n詞').duration, 2);
  for (const [tail, pattern] of [
    ['[a] @time:00:00:00-->00:02.000\n詞', /2行目/], ['[a] @time:00:02.000-->00:01.000\n詞', /2行目/],
    ['[a] @time:00:00.000-->00:02.000 @motion:unknown\n詞', /2行目/], ['[a] @time:00:00.000-->00:02.000 @position:unknown\n詞', /2行目/],
    ['[a] @time:00:00.000-->00:02.000 @unknown:x\n詞', /2行目/], ['[a] @time:00:00.000-->00:02.000', /空/], ['歌詞のみ', /時間付き/]
  ]) assert.throws(() => L.parse('@lyricmotion:1\n' + tail), pattern);
  assert.throws(() => L.parse(source.replace('00:20.000', '00:05.000')), /曲の長さ/);
  assert.throws(() => L.parse(source.replace('@lyricmotion:1', '@lyricmotion:3')), /未対応/);
});

test('Lyric Motion: 台本の9方向配置・振り付け・時間保持と仮配置を検証する', () => {
  const L = require('../lyric-script.js'), base = S.sample(), before = S.clone(base);
  const measure = text => [...text].length * 40;
  for (const position of L.POSITIONS) {
    const ast = L.parse(`@lyricmotion:1\n[a] @time:00:01.000-->00:03.000 @position:${position} @motion:march\n山か|里か`);
    const result = L.build(ast, base, measure), [a, b] = result.scenes[0].elements;
    assert.deepEqual(S.validate(result), result); assert.equal(a.start, 0); assert.equal(a.end, 2); assert.ok(a.position.x < b.position.x); assert.ok(a.animations.length);
    if (position.startsWith('top')) assert.ok(a.position.y < .3);
    if (position.startsWith('bottom')) assert.ok(a.position.y > .7);
    assert.deepEqual(a.style, base.styles.default);
  }
  assert.deepEqual(base, before);
  const ast = L.parse('@lyricmotion:1\n[a] @time:00:00.000-->00:02.000\n詞');
  const warnings = []; const wide = L.build(ast, base, () => 10000, { warnings }); assert.equal(wide.scenes[0].elements[0].position.x, .5); assert.equal(warnings.length, 1);
  const tiny = S.clone(base); tiny.project.height = 64; const tall = L.build(ast, tiny, measure, { warnings }); assert.equal(tall.scenes[0].elements[0].position.y, .5); assert.equal(warnings.length, 2);
});


test('Lyric Motion: 9方向の移動で文字・時間・倍率・キー時刻を保ち、X/Y軌道も平行移動する', () => {
  const L = require('../lyric-script.js'), e = S.sample().scenes[0].elements[1], original = S.clone(e);
  for (const position of L.POSITIONS) {
    const next = L.placeElement(e, { width: 1920, height: 1080 }, position, text => text.length * 60);
    for (const key of ['text', 'start', 'end', 'style', 'transform']) assert.deepEqual(next[key], e[key]);
    for (const track of next.animations) {
      const previous = e.animations.find(t => t.property === track.property), delta = ['x', 'y'].includes(track.property) ? next.position[track.property] - e.position[track.property] : 0;
      track.keyframes.forEach((frame, i) => { assert.equal(frame.time, previous.keyframes[i].time); assert.equal(frame.easing, previous.keyframes[i].easing); assert.ok(Math.abs(frame.value - previous.keyframes[i].value - delta) < 1e-8); });
    }
  }
  assert.deepEqual(e, original);
  const ast = L.parse('@lyricmotion:1\n[a] @time:00:00.000-->00:02.000\n詞\n[b] @time:00:02.000-->00:04.000 @position:top-right\n詞');
  const result = L.build(ast, S.sample(), () => 100, { defaultPosition: 'bottom-left' });
  assert.ok(result.scenes[0].elements[0].position.y > .7); assert.ok(result.scenes[1].elements[0].position.y < .3);
});


test('Lyric Motion: Scene全体を一覧順に等分し、Animationを伸縮して元データを保つ', () => {
  const project = S.sample(), source = project.scenes[0], before = S.clone(source), next = S.distributeSceneTiming(source);
  assert.deepEqual(source, before); assert.equal(next.elements[0].start, 0); assert.equal(next.elements.at(-1).end, 5);
  next.elements.forEach((e, i) => {
    const original = source.elements[i]; assert.equal(e.end - e.start, 1.25);
    if (i) assert.equal(e.start, next.elements[i - 1].end);
    for (const key of ['id', 'text', 'position', 'transform', 'style', 'effects']) assert.deepEqual(e[key], original[key]);
    e.animations.forEach((track, ti) => track.keyframes.forEach((frame, ki) => {
      const old = original.animations[ti].keyframes[ki]; assert.equal(frame.value, old.value); assert.equal(frame.easing, old.easing);
      assert.ok(Math.abs(frame.time - old.time * 1.25 / (original.end - original.start)) < 1e-8);
    }));
  });
  project.scenes[0] = next; assert.deepEqual(S.validate(project), project);
  const uneven = { ...source, start: 42, end: 70, elements: source.elements.slice(0, 3) }, thirds = S.distributeSceneTiming(uneven);
  assert.equal(thirds.elements[1].start, thirds.elements[0].end); assert.equal(thirds.elements[2].end, 28);
  assert.deepEqual(S.distributeSceneTiming(next), next);
  const single = S.distributeSceneTiming({ ...source, elements: [source.elements[0]] }); assert.equal(single.elements[0].start, 0); assert.equal(single.elements[0].end, 5);
  assert.throws(() => S.distributeSceneTiming({ ...source, elements: [] }), /ありません/);
  assert.throws(() => S.distributeSceneTiming({ ...source, end: source.start }), /正しく/);
});


test('Lyric Motion: Googleフォント候補と既存familyの識別、CSS APIのURLを検証する', () => {
  const fonts = require('../fonts.js');
  assert.equal(fonts.find('"Yu Gothic", "Meiryo", sans-serif').id, 'local-gothic');
  assert.equal(fonts.find("'Noto Sans JP', sans-serif").id, 'noto-sans-jp');
  assert.equal(fonts.find('Noto Serif JP').id, 'noto-serif-jp');
  assert.equal(fonts.find('Meiryo'), undefined);
  for (const preset of fonts.PRESETS.filter(p => p.google)) {
    const url = new URL(fonts.url(preset)); assert.equal(url.origin, 'https://fonts.googleapis.com'); assert.equal(url.pathname, '/css2');
    assert.equal(url.searchParams.get('family'), `${preset.google}:wght@${preset.weights}`); assert.equal(url.searchParams.get('display'), 'swap'); assert.equal(url.searchParams.has('text'), false);
  }
});


test('Lyric Motion: 台本v2のフレーズ時間・同時表示・重なり・Scene切替を既存JSONへ変換する', () => {
  const L = require('../lyric-script.js');
  const text = '@lyricmotion:2\n[a] @time:01:12.000-->01:38.000 @motion:impact\n未指定\n@phrase:00:06.000-->00:10.000\n蹴|り｜飛\n[力強く]\nば\n@phrase:00:06.240-->00:10.000\nして\n[b] @time:01:38.000-->01:40.000\n次の歌詞';
  const ast = L.parse(text), p = L.build(ast, S.sample(), text => text.length * 30), scene = p.scenes[0];
  assert.equal(ast.version, 2); assert.deepEqual(scene.elements.map(e => [e.text, e.start, e.end]), [['未指定', 0, 26], ['蹴', 6, 10], ['り', 6, 10], ['飛\nば', 6, 10], ['して', 6.24, 10]]);
  assert.equal(p.scenes[1].elements[0].start, 0); assert.equal(p.scenes[1].elements[0].end, 2);
  assert.deepEqual(S.validate(JSON.parse(JSON.stringify(p))), p);
  const e = scene.elements[1]; assert.equal(e.animations[0].keyframes.at(-1).time, 4);
  assert.equal(F.evaluateElement(scene, e, 77.999), null); assert.ok(F.evaluateElement(scene, e, 78.01)); assert.equal(F.evaluateElement(scene, e, 82), null);
  const tiny = S.clone(S.sample()); tiny.project.height = 64; const warnings = [], fallback = L.build(ast, tiny, () => 100, { warnings }); assert.ok(warnings.length); assert.deepEqual(fallback.scenes[0].elements.map(e => [e.start, e.end]), scene.elements.map(e => [e.start, e.end]));
  const old = '@lyricmotion:1\n[a] @time:00:00.000-->00:05.000\n山か|里か';
  assert.deepEqual(L.build(L.parse(old), S.sample(), () => 50), L.build(L.parse(old.replace(':1', ':2')), S.sample(), () => 50));
});

test('Lyric Motion: 台本v2の不正なフレーズ時間・空本文・孤立指定を行番号付きで拒否する', () => {
  const L = require('../lyric-script.js'), prefix = '@lyricmotion:2\n[a] @time:00:01.000-->00:05.000\n';
  for (const directive of ['@phrase:00:02.000-->00:01.000', '@phrase:00:00.000-->00:00.000', '@phrase:00:00.000-->00:04.001', '@phrase:bad-->00:03.000', '@phrase 00:00.000-->00:03.000', '@phrase:00:00.000 -->00:03.000']) assert.throws(() => L.parse(prefix + directive + '\n詞'), /3行目/);
  assert.throws(() => L.parse(prefix + '@phrase:00:00.000-->00:02.000\n|｜\n'), /3行目.*空/);
  assert.throws(() => L.parse(prefix + '@phrase:00:00.000-->00:02.000\n@phrase:00:02.000-->00:04.000\n詞'), /3行目.*空/);
  assert.throws(() => L.parse('@lyricmotion:2\n@phrase:00:00.000-->00:01.000\n詞'), /2行目.*Scene/);
  assert.throws(() => L.parse(prefix.replace(':2', ':1') + '@phrase:00:00.000-->00:01.000\n詞'), /3行目.*v2/);
  const fractional = L.parse('@lyricmotion:2\n[a] @time:00:00.100-->00:00.400\n@phrase:00:00.000-->00:00.300\n詞');
  assert.ok(Math.abs(fractional.scenes[0].phrases[0].end - (fractional.scenes[0].end - fractional.scenes[0].start)) < 1e-7);
});


test('Lyric Motion: 複数Elementの一括編集で相対配置と軌道を保ち、対象外と時間を変更しない', () => {
  const source = S.sample(), before = S.clone(source), ids = source.scenes[0].elements.slice(1, 3).map(e => e.id);
  const result = S.bulkEdit(source, source.scenes[0].id, ids, { dx: .01, dy: -.03, fontSize: 100, fill: '#ff0000', stroke: '#000000', fontFamily: 'Meiryo' });
  assert.deepEqual(source, before); assert.deepEqual(result.scenes[1], source.scenes[1]); assert.deepEqual(result.scenes[0].elements[0], source.scenes[0].elements[0]); assert.deepEqual(result.scenes[0].elements[3], source.scenes[0].elements[3]);
  for (let i = 1; i <= 2; i++) {
    const a = result.scenes[0].elements[i], b = source.scenes[0].elements[i]; assert.equal(a.position.x, b.position.x + .01); assert.equal(a.position.y, b.position.y - .03);
    assert.equal(a.style.fontSize, 100); assert.equal(a.style.fill, '#ff0000'); assert.equal(a.style.stroke, '#000000'); assert.equal(a.style.fontFamily, 'Meiryo');
    for (const key of ['start', 'end', 'text', 'effects', 'transform']) assert.deepEqual(a[key], b[key]);
    a.animations.forEach((t, ti) => t.keyframes.forEach((k, ki) => { const old=b.animations[ti].keyframes[ki]; assert.equal(k.time,old.time); assert.equal(k.easing,old.easing); assert.ok(Math.abs(k.value-old.value-(t.property==='x'?.01:t.property==='y'?-.03:0))<1e-8); }));
  }
  for (const patch of [{dx:99}, {dy:NaN}, {fontSize:0}, {fill:'bad'}, {fontFamily:''}]) assert.throws(()=>S.bulkEdit(source, source.scenes[0].id, ids, patch));
  assert.throws(()=>S.bulkEdit(source, source.scenes[0].id, [], {})); assert.throws(()=>S.bulkEdit(source, source.scenes[0].id, [source.scenes[1].elements[0].id], {}));
  assert.deepEqual(source, before);
});

test('Lyric Motion: 任意Google Fontsの読み込み元を往復し、ローカル指定と旧JSONを区別する', () => {
  const Fonts = require('../fonts.js'), p = S.sample();
  const e = p.scenes[0].elements[0]; e.style.fontFamily = 'Roboto'; e.style.fontSource = 'google';
  assert.deepEqual(S.validate(JSON.parse(JSON.stringify(p))), p);
  assert.match(Fonts.url(Fonts.descriptor(e.style)), /family=Roboto:wght@700/);
  assert.equal(Fonts.descriptor({ ...e.style, fontSource: 'local' }), null);
  assert.equal(Fonts.descriptor({ ...e.style, fontSource: undefined }), undefined);
  const local = S.bulkEdit(p, p.scenes[0].id, [e.id], { fontFamily: 'Meiryo', fontSource: 'local' });
  assert.equal(local.scenes[0].elements[0].style.fontSource, 'local');
  assert.deepEqual(local.scenes[0].elements[1], p.scenes[0].elements[1]);
  const preset = S.bulkEdit(local, p.scenes[0].id, [e.id], { fontFamily: 'Noto Sans JP', fontSource: null });
  assert.equal(preset.scenes[0].elements[0].style.fontSource, undefined);
  assert.equal(Fonts.descriptor(preset.scenes[0].elements[0].style).id, 'noto-sans-jp');
  for (const name of ['Roboto&text=secret', 'Roboto, serif', '<script>']) {
    const invalid = S.clone(p); invalid.scenes[0].elements[0].style.fontFamily = name; assert.throws(() => S.validate(invalid));
  }
});

test('Lyric Motion: 複数振り付けは一覧順に配置・登場をずらし、共通終了と個別編集可能なキーを生成する', () => {
  const M = require('../motion-presets.js'), original = S.sample(), scene = original.scenes[0];
  const ids = [scene.elements[2].id, scene.elements[0].id, scene.elements[1].id];
  const options = { start: 1, end: 4.5, delay: .15, dx: .12, dy: -.08, strength: 1 };
  const result = M.sequence(original, scene.id, ids, options), targets = result.scenes[0].elements;
  for (let i = 0; i < 3; i++) {
    const before = scene.elements[i], e = targets[i];
    assert.equal(e.start, 1 + i * .15); assert.equal(e.end, 4.5);
    assert.equal(e.position.x, scene.elements[0].position.x + i * .12);
    assert.equal(e.position.y, scene.elements[0].position.y - i * .08);
    assert.equal(e.text, before.text); assert.deepEqual(e.style, before.style); assert.deepEqual(e.transform, before.transform);
    assert.deepEqual(e.animations, M.apply(e, 'impact', { strength: 1 }).animations);
    assert.equal(e.animations.find(t => t.property === 'opacity').keyframes.at(-1).time, e.end - e.start);
  }
  assert.deepEqual(targets[3], scene.elements[3]); assert.deepEqual(result.scenes[1], original.scenes[1]);
  assert.deepEqual(original, S.sample()); assert.deepEqual(S.validate(JSON.parse(JSON.stringify(result))), result);
  for (const patch of [{ delay: 2 }, { delay: -.1 }, { end: 6 }, { start: -1 }, { dx: 10 }, { strength: 0 }, { dy: NaN }]) assert.throws(() => M.sequence(original, scene.id, ids, { ...options, ...patch }));
  assert.throws(() => M.sequence(original, scene.id, [ids[0]], options));
  assert.throws(() => M.sequence(original, scene.id, [ids[0], 'missing'], options));
  const offscreen = M.sequence(original, scene.id, ids, { ...options, dx: .6, delay: 0 });
  assert(offscreen.scenes[0].elements[2].position.x > 1); assert.equal(offscreen.scenes[0].elements[2].start, 1);
});

test('Lyric Motion: 左右交互・ウェーブ・連鎖退場を時間差付きで生成する', () => {
 const M = require('../motion-presets.js'), p = S.sample(), scene = p.scenes[0], ids = scene.elements.slice(0,3).map(e=>e.id), options={start:.5,end:4.5,delay:.2,dx:.1,dy:0,strength:1};
 for(const type of ['alternate','wave','exit-chain']) {
  const result=M.sequence(p,scene.id,ids,{...options,type}), es=result.scenes[0].elements;
  assert.deepEqual(es[3],scene.elements[3]);assert.deepEqual(result.scenes[1],p.scenes[1]);assert.deepEqual(S.validate(JSON.parse(JSON.stringify(result))),result);
  for(let i=0;i<3;i++) {assert.equal(es[i].text,scene.elements[i].text);assert.deepEqual(es[i].style,scene.elements[i].style);assert.deepEqual(es[i].transform,scene.elements[i].transform);}
  if(type==='alternate') {for(let i=0;i<3;i++){assert.equal(es[i].start,.5+i*.2);assert.equal(es[i].end,4.5);const x=es[i].animations.find(t=>t.property==='x').keyframes[0].value;assert(i%2?x>es[i].position.x:x<es[i].position.x);}}
  if(type==='wave'){for(let i=0;i<3;i++){assert.equal(es[i].start,.5);assert.equal(es[i].end,4.5);const keys=es[i].animations.find(t=>t.property==='y').keyframes;assert(keys.some(k=>k.value<es[i].position.y));assert(keys.some(k=>k.value>es[i].position.y));assert.equal(keys.at(-1).value,es[i].position.y);}}
  if(type==='exit-chain'){for(let i=0;i<3;i++){assert.equal(es[i].start,.5);assert.equal(es[i].end,4.5-(2-i)*.2);assert(es[i].animations.find(t=>t.property==='y').keyframes.at(-1).value<es[i].position.y);}}
  assert.doesNotThrow(()=>M.sequence(p,scene.id,ids,{...options,type,delay:0}));
  assert.throws(()=>M.sequence(p,scene.id,ids,{...options,type,delay:3}));
 }
 assert.deepEqual(p,S.sample());assert.throws(()=>M.sequence(p,scene.id,ids,{...options,type:'unknown'}));
});

test('Lyric Motion: 積み上げ・集合・中央展開・最後強調・等速の流れを通常のキーへ展開する', () => {
 const M=require('../motion-presets.js'),p=S.sample(),scene=p.scenes[0],ids=scene.elements.slice(0,3).map(e=>e.id),o={start:.5,end:4.5,delay:.2,dx:.1,dy:.03,strength:1};
 for(const type of ['stack','gather','center-out','last-accent','flow']) {
  const result=M.sequence(p,scene.id,ids,{...o,type}),es=result.scenes[0].elements;
  assert.deepEqual(es[3],scene.elements[3]);assert.deepEqual(result.scenes[1],p.scenes[1]);assert.deepEqual(S.validate(JSON.parse(JSON.stringify(result))),result);assert.deepEqual(M.sequence(p,scene.id,[...ids].reverse(),{...o,type}),result);
  for(let i=0;i<3;i++){assert.equal(es[i].end,4.5);assert.deepEqual(es[i].style,scene.elements[i].style);assert.equal(es[i].text,scene.elements[i].text);assert.deepEqual(es[i].transform,scene.elements[i].transform);}
  if(type==='stack')assert(es.slice(0,3).every(e=>e.animations.length===1&&e.animations[0].property==='opacity'));
  if(type==='gather')for(const e of es.slice(0,3)){assert(e.animations.some(t=>['x','y'].includes(t.property)&&Math.abs(t.keyframes[0].value-e.position[t.property])>.01));for(const t of e.animations.filter(t=>['x','y'].includes(t.property)))assert.equal(t.keyframes.at(-1).value,e.position[t.property]);}
  if(type==='center-out'){assert.equal(es[1].start,.5);assert.equal(es[0].start,.7);assert.equal(es[2].start,.7);assert.equal(es[1].position.x,scene.elements[0].position.x);const even=M.sequence(p,scene.id,scene.elements.map(e=>e.id),{...o,type}).scenes[0].elements;assert.equal(even[1].start,.5);assert.equal(even[2].start,.5);assert.equal(even[0].start,.7);}
  if(type==='last-accent'){const held=es[2].animations.find(t=>t.property==='scale').keyframes[2].value;assert.equal(held,es[2].transform.scale*1.25);}
  if(type==='flow')for(const e of es.slice(0,3)){const t=e.animations.find(t=>t.property==='x');assert(t.keyframes.every(k=>k.easing==='linear'));assert(Math.abs((t.keyframes[1].value-t.keyframes[0].value)/(e.end-e.start)+.2)<1e-12);}
  assert.doesNotThrow(()=>M.sequence(p,scene.id,ids,{...o,type,delay:0}));assert.throws(()=>M.sequence(p,scene.id,ids,{...o,type,dx:10}));
 }
 assert.deepEqual(p,S.sample());assert.throws(()=>M.sequence(p,scene.id,ids,{...o,type:'flow',end:5,strength:2,start:0,dx:-1}));
});

test('Lyric Motion: 一括絶対座標は軸別に軌道を移し、繰り返しても加算しない', () => {
 const p=S.sample(),scene=p.scenes[0],ids=scene.elements.slice(0,2).map(e=>e.id),result=S.bulkEdit(p,scene.id,ids,{x:.5});
 for(let i=0;i<2;i++){const old=scene.elements[i],e=result.scenes[0].elements[i];assert.equal(e.position.x,.5);assert.equal(e.position.y,old.position.y);const t=e.animations.find(t=>t.property==='x'),before=old.animations.find(t=>t.property==='x');if(t)for(let k=0;k<t.keyframes.length;k++)assert(Math.abs(t.keyframes[k].value-before.keyframes[k].value-(.5-old.position.x))<1e-12);}
 assert.deepEqual(S.bulkEdit(result,scene.id,ids,{x:.5}),result);assert.deepEqual(result.scenes[0].elements[2],scene.elements[2]);assert.deepEqual(p,S.sample());
 for(const patch of [{x:5},{y:NaN},{x:.5,y:-5}])assert.throws(()=>S.bulkEdit(p,scene.id,ids,patch));
});

test('Lyric Motion: 素材込みZIPはJSONと素材の実体を往復し、破損と未接続音源を拒否する', async () => {
 const B=require('../project-bundle.js'),p=S.sample();p.audio={source:'song.wav'};
 const audio=new File([new Uint8Array([1,2,3,4])],'song.wav',{type:'audio/wav'}),image=new File([new Uint8Array([5,6,7])],'背景.png',{type:'image/png'}),view={visible:false,fit:'cover'};
 const zip=await B.pack(p,audio,image,view),result=await B.unpack(zip);
 assert.deepEqual(result.project,p);assert.deepEqual(result.view,view);assert.equal(result.audio.name,audio.name);assert.equal(result.reference.name,image.name);assert.equal(result.audio.type,'audio/wav');assert.deepEqual(new Uint8Array(await result.audio.arrayBuffer()),new Uint8Array([1,2,3,4]));
 assert.deepEqual(new Uint8Array(await result.reference.arrayBuffer()),new Uint8Array([5,6,7]));
 const bad=new Uint8Array(await zip.arrayBuffer());bad[45]^=1;await assert.rejects(()=>B.unpack(new Blob([bad])));await assert.rejects(()=>B.unpack(new Blob([bad.subarray(0,100)])));
 await assert.rejects(()=>B.pack(p,null,image,view));
 const empty=await B.unpack(await B.pack(S.sample(),null,null,{visible:false,fit:'contain'}));assert.equal(empty.audio,null);assert.equal(empty.reference,null);
});

test('Lyric Motion: 全複数プリセットで時刻・配置を保持して動きだけ置き換えられる', () => {
 const M=require('../motion-presets.js'),p=S.sample(),scene=p.scenes[0];
 for(let i=0;i<3;i++){const e=scene.elements[i],old=e.end-e.start;e.start=.2+i*.6;e.end=3+i*.4;S.retimeAnimations(e,old);e.position.x=.2+i*.2;e.position.y=.3+i*.1;}
 const ids=scene.elements.slice(0,3).map(e=>e.id),omit=e=>{const c=S.clone(e);delete c.animations;delete c.effects;return c;};
 for(const preset of M.SEQUENCES){const options={type:preset.id,motionOnly:true,start:NaN,end:NaN,dx:NaN,dy:NaN,delay:.05,strength:1},result=M.sequence(p,scene.id,ids,options);
  for(let i=0;i<3;i++){const e=result.scenes[0].elements[i],old=scene.elements[i];assert.deepEqual(omit(e),omit(old));assert(e.animations.length);for(const t of e.animations)assert(t.keyframes.at(-1).time<=e.end-e.start+1e-7);if(preset.id==='flow'){const k=e.animations.find(t=>t.property==='x').keyframes;assert(Math.abs((k[1].value-k[0].value)/(e.end-e.start)+.2)<1e-12);}}
  assert.deepEqual(result.scenes[0].elements[3],scene.elements[3]);assert.deepEqual(result.scenes[1],p.scenes[1]);assert.deepEqual(S.validate(JSON.parse(JSON.stringify(result))),result);
 }
 assert.throws(()=>M.sequence(p,scene.id,ids,{type:'wave',motionOnly:true,delay:5,strength:1}));
});
