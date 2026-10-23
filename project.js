(function (root) {
  'use strict';
  const SCHEMA = 'vct-lyric-motion.project.v1';
  const ENTER = ['fade', 'pop', 'impact', 'typewriter'];
  const ACTIVE = ['none', 'glow', 'sweep'];
  const EXIT = ['fade'];
  const clone = value => JSON.parse(JSON.stringify(value));
  function number(value, min, max, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${label}は${min}〜${max}の数値で指定してください。`);
    }
    return value;
  }
  function color(value, label) {
    if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new Error(`${label}は#RRGGBBで指定してください。`);
    return value;
  }
  function effect(value, types, label, timed) {
    if (!value || !types.includes(value.type)) throw new Error(`${label}の種類が未対応です。`);
    return timed ? { type: value.type, duration: number(value.duration, 0, 10, `${label}時間`) } : { type: value.type };
  }
  function validate(input) {
    if (!input || input.schema !== SCHEMA || input.schemaVersion !== 1) throw new Error('未対応のプロジェクト形式です。');
    const p = input.project;
    if (!p) throw new Error('キャンバス設定がありません。');
    const project = {
      width: number(p.width, 64, 3840, '幅'), height: number(p.height, 64, 3840, '高さ'),
      fps: number(p.fps, 24, 60, 'FPS'), duration: number(p.duration, 0.1, 600, '長さ')
    };
    if (!Number.isInteger(project.width) || !Number.isInteger(project.height) || ![24, 30, 60].includes(project.fps)) throw new Error('解像度は整数、FPSは24・30・60で指定してください。');
    if (project.width * project.height > 3840 * 2160) throw new Error('画素数は3840×2160以下にしてください。');
    const s = input.styles?.default;
    if (!s || typeof s.fontFamily !== 'string' || !s.fontFamily.trim() || s.fontFamily.length > 200) throw new Error('フォント名が不正です。');
    const style = {
      fontFamily: s.fontFamily, fontSize: number(s.fontSize, 8, 300, '文字サイズ'),
      fontWeight: number(s.fontWeight, 100, 900, '太さ'), fill: color(s.fill, '文字色'),
      stroke: color(s.stroke, '縁取り色'), strokeWidth: number(s.strokeWidth, 0, 30, '縁取り幅'),
      letterSpacing: number(s.letterSpacing, -10, 100, '字間'), lineHeight: number(s.lineHeight, 0.5, 3, '行間'),
      glowColor: color(s.glowColor, '発光色'), glowBlur: number(s.glowBlur, 0, 100, '発光幅')
    };
    if (s.textAlign !== undefined) {
      if (!['left', 'center', 'right'].includes(s.textAlign)) throw new Error('文字揃えが不正です。');
      style.textAlign = s.textAlign;
    }
    if (s.fontSource !== undefined) {
      if (!['local', 'google'].includes(s.fontSource)) throw new Error('フォントの読み込み元が不正です。');
      if (s.fontSource === 'google' && (!s.fontFamily.trim() || /[\"'<>:;@&,\\]/.test(s.fontFamily))) throw new Error('Google Fontsは正式なフォント名だけを指定してください。');
      style.fontSource = s.fontSource;
    }
    if (!Array.isArray(input.lyrics) || input.lyrics.length > 1000) throw new Error('歌詞は1000イベント以下にしてください。');
    const ids = new Set();
    const lyrics = input.lyrics.map((line, i) => {
      if (!line || typeof line.id !== 'string' || !line.id || ids.has(line.id)) throw new Error(`行${i + 1}のIDが不正または重複しています。`);
      ids.add(line.id);
      if (typeof line.text !== 'string' || line.text.length > 1000) throw new Error(`行${i + 1}の文字数は1000以下にしてください。`);
      const start = number(line.start, 0, project.duration, `行${i + 1}の開始`);
      const end = number(line.end, 0, project.duration, `行${i + 1}の終了`);
      if (start >= end) throw new Error(`行${i + 1}は終了を開始より後にしてください。`);
      if (line.style !== 'default' || line.position?.anchor !== 'center') throw new Error('この試作はdefaultスタイル・中央アンカーに対応します。');
      return {
        id: line.id, start, end, text: line.text, style: 'default',
        position: { x: number(line.position.x, 0, 1, 'X位置'), y: number(line.position.y, 0, 1, 'Y位置'), anchor: 'center' },
        effects: { enter: effect(line.effects?.enter, ENTER, '登場', true), active: effect(line.effects?.active, ACTIVE, '表示中', false), exit: effect(line.effects?.exit, EXIT, '退場', true) }
      };
    });
    const audio = input.audio == null ? null : { source: typeof input.audio.source === 'string' ? input.audio.source.slice(0, 255) : '' };
    return { schema: SCHEMA, schemaVersion: 1, project, audio, styles: { default: style }, lyrics, export: { background: color(input.export?.background, 'MP4背景色') } };
  }
  function cue(text, start, end, id) {
    return { id, start, end, text, style: 'default', position: { x: 0.5, y: 0.5, anchor: 'center' }, effects: { enter: { type: 'fade', duration: 0.3 }, active: { type: 'none' }, exit: { type: 'fade', duration: 0.3 } } };
  }
  function sample() {
    const lyrics = [cue('さあ　答えろ', 0.3, 3.1, 'sample-1'), cue('ひと文字ずつ、光になる', 3.1, 6.8, 'sample-2'), cue('この瞬間を\n未来へつなぐ', 6.8, 9.7, 'sample-3')];
    lyrics[0].effects.enter = { type: 'impact', duration: 0.45 };
    lyrics[0].effects.active.type = 'glow';
    lyrics[1].effects.enter = { type: 'typewriter', duration: 1.6 };
    lyrics[1].effects.active.type = 'glow';
    lyrics[2].effects.enter.type = 'pop';
    lyrics[2].effects.active.type = 'sweep';
    return { schema: SCHEMA, schemaVersion: 1, project: { width: 1920, height: 1080, fps: 30, duration: 10 }, audio: null, lyrics,
      styles: { default: { fontFamily: '"Yu Gothic", "Meiryo", sans-serif', fontSize: 92, fontWeight: 700, fill: '#ffffff', stroke: '#15203d', strokeWidth: 5, letterSpacing: 3, lineHeight: 1.4, glowColor: '#5ccfff', glowBlur: 28 } }, export: { background: '#00ff00' } };
  }
  function parseLrc(text, duration) {
    if (/<\d+:\d{2}(?:\.\d+)?>/.test(text)) throw new Error('Enhanced LRCの単語時刻は試作では未対応です。通常LRCを使用してください。');
    let offset = 0;
    const offsetTag = text.match(/\[offset:([+-]?\d+)\]/i);
    if (offsetTag) offset = Number(offsetTag[1]) / 1000;
    const rows = [];
    for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const tags = [...raw.matchAll(/\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]/g)];
      const lyric = raw.replace(/\[[^\]]*\]/g, '').trim();
      for (const tag of tags) {
        if (Number(tag[2]) >= 60) throw new Error('LRCの秒は60未満にしてください。');
        const start = Number(tag[1]) * 60 + Number(tag[2]) + Number(`0.${tag[3] || 0}`) + offset;
        rows.push({ start: Math.max(0, start), text: lyric });
        if (rows.length > 1000) throw new Error('LRCの時刻タグは1000以下にしてください。');
      }
    }
    if (!rows.length) throw new Error('LRCの時刻タグが見つかりません。');
    rows.sort((a, b) => a.start - b.start);
    return rows.filter(row => row.text).map((row, i) => {
      const next = rows.find(other => other.start > row.start);
      const end = next ? next.start : duration;
      if (row.start >= end || end > duration) throw new Error('LRCの時刻がプロジェクトの長さを超えています。長さを調整してください。');
      return cue(row.text, row.start, end, `lrc-${i + 1}`);
    });
  }
  function parseSrt(text) {
    const timestamp = value => {
      const m = value.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/);
      if (!m || Number(m[2]) >= 60 || Number(m[3]) >= 60) throw new Error('SRTの時刻が不正です。');
      return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    };
    const rows = text.replace(/^\uFEFF/, '').trim().split(/\r?\n\s*\r?\n/).map((block, i) => {
      const lines = block.split(/\r?\n/);
      if (/^\d+$/.test(lines[0]?.trim())) lines.shift();
      const timing = lines.shift()?.split(/\s*-->\s*/);
      if (timing?.length !== 2) throw new Error(`SRTのブロック${i + 1}に時刻がありません。`);
      const body = lines.join('\n');
      if (/<[^>]*>|\{\\/.test(body)) throw new Error('SRTの装飾タグは試作では未対応です。タグを除去して読み込んでください。');
      return cue(body, timestamp(timing[0]), timestamp(timing[1]), `srt-${i + 1}`);
    });
    if (!rows.length) throw new Error('字幕がありません。');
    return rows;
  }
  const api = { SCHEMA, ENTER, ACTIVE, EXIT, clone, validate, cue, sample, parseLrc, parseSrt };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LyricMotionLegacyProject = api;
})(globalThis);
