(function (root) {
  'use strict';
  const PRESETS = [
    { id: 'local-gothic', name: '標準ゴシック（PC）', family: '"Yu Gothic", "Meiryo", sans-serif' },
    { id: 'local-mincho', name: '標準明朝（PC）', family: '"Yu Mincho", "MS Mincho", serif' },
    { id: 'noto-sans-jp', name: 'Noto Sans JP · ゴシック', family: '"Noto Sans JP", sans-serif', google: 'Noto Sans JP', weights: '100..900' },
    { id: 'noto-serif-jp', name: 'Noto Serif JP · 明朝', family: '"Noto Serif JP", serif', google: 'Noto Serif JP', weights: '200..900' },
    { id: 'zen-maru-gothic', name: 'Zen Maru Gothic · 丸ゴシック', family: '"Zen Maru Gothic", sans-serif', google: 'Zen Maru Gothic', weights: '300;400;500;700;900' },
    { id: 'dela-gothic-one', name: 'Dela Gothic One · 極太', family: '"Dela Gothic One", sans-serif', google: 'Dela Gothic One', weights: '400' }
  ];
  const sheets = new Map();
  const primary = family => family.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const find = family => PRESETS.find(p => p.google ? p.google.toLowerCase() === primary(family).toLowerCase() : p.family === family);
  const url = preset => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(preset.google).replace(/%20/g, '+')}:wght@${preset.weights}&display=swap`;
  function descriptor(style) {
    if (style.fontSource === 'local') return null;
    if (style.fontSource !== 'google') return find(style.fontFamily);
    const name = primary(style.fontFamily);
    if (!name || /[\"'<>:;@&\\]/.test(name) || style.fontFamily.includes(',')) throw new Error('Google Fontsの正式なフォント名だけを入力してください。');
    return { id: `google:${name}:${style.fontWeight}`, google: name, weights: String(style.fontWeight) };
  }
  function stylesheet(preset) {
    if (sheets.has(preset.id)) return sheets.get(preset.id).promise;
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = url(preset); link.dataset.lyricFont = preset.id;
    const entry = { loaded: false, link }; sheets.set(preset.id, entry);
    entry.promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(false), 15000);
      function finish(ok) {
        clearTimeout(timer); link.onload = link.onerror = null;
        if (ok) { entry.loaded = true; resolve(); }
        else { link.remove(); sheets.delete(preset.id); reject(new Error(`${preset.google}を読み込めません。正式名・指定した太さ・接続を確認して再適用してください。`)); }
      }
      link.onload = () => finish(true); link.onerror = () => finish(false); document.head.append(link);
    });
    return entry.promise;
  }
  async function loadStyle(style, text = '歌詞') {
    const preset = descriptor(style); if (preset?.google) await stylesheet(preset);
    let timer;
    try {
      const faces = await Promise.race([
        document.fonts.load(`${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`, (text || '') + 'Ag'),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('フォントの読み込みがタイムアウトしました。')), 20000); })
      ]);
      if (preset?.google && !faces.length) throw new Error(`${preset.google}のフォントデータが見つかりません。`);
    } catch (error) {
      if (preset?.google) { sheets.get(preset.id)?.link.remove(); sheets.delete(preset.id); }
      throw new Error(`フォントの準備に失敗しました: ${error.message} 接続を確認するかPCフォントへ切り替えてください。`);
    } finally { clearTimeout(timer); }
  }
  function assertReady(style, text) {
    const preset = descriptor(style);
    if (preset?.google && (!sheets.get(preset.id)?.loaded || !document.fonts.check(`${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`, (text || '') + 'Ag'))) {
      throw new Error(`${preset.google}の準備が完了していません。接続を確認し、フォントを再適用してください。`);
    }
  }
  const api = { PRESETS, find, descriptor, url, loadStyle, assertReady };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LyricMotionFonts = api;
})(globalThis);
