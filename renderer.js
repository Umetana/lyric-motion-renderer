(function (root) {
  'use strict';
  const effects = typeof module === 'object' && module.exports ? require('./effects.js') : root.LyricMotionEffects;
  const fonts = typeof module === 'object' && module.exports ? require('./fonts.js') : root.LyricMotionFonts;
  const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
  const graphemes = text => [...segmenter.segment(text)].map(item => item.segment);
  const evaluate = effects.evaluate;
  const font = style => `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
  async function prepareFonts(project) {
    const groups = new Map([[`${project.styles.default.fontSource || 'auto'}:${font(project.styles.default)}`, { style: project.styles.default, text: 'Ag' }]]);
    for (const scene of project.scenes) for (const element of scene.elements) {
      const key = `${element.style.fontSource || 'auto'}:${font(element.style)}`, group = groups.get(key) || { style: element.style, text: '' }; group.text += element.text; groups.set(key, group);
    }
    for (const { style, text } of groups.values()) await fonts.loadStyle(style, text);
    await document.fonts.ready;
  }
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d');
      this.cache = new Map();
    }
    layer(line, style, reveal) {
      const key = JSON.stringify([line.text, style, reveal]);
      if (this.cache.has(key)) return this.cache.get(key);
      const scratch = document.createElement('canvas');
      const ctx = scratch.getContext('2d');
      ctx.font = font(style);
      const rows = line.text.split('\n').map(text => {
        const chars = graphemes(text);
        const widths = chars.map(char => ctx.measureText(char).width);
        return { chars, widths, width: widths.reduce((sum, width) => sum + width, 0) + Math.max(0, chars.length - 1) * style.letterSpacing };
      });
      const total = rows.reduce((sum, row) => sum + row.chars.length, 0);
      const visible = reveal >= 1 ? total : Math.round(total * reveal);
      const padding = Math.ceil(style.glowBlur * 3 + style.strokeWidth + style.fontSize * 0.5);
      const lineHeight = style.fontSize * style.lineHeight;
      const width = Math.max(1, Math.ceil(Math.max(0, ...rows.map(row => row.width)) + padding * 2));
      const height = Math.max(1, Math.ceil(lineHeight * rows.length + padding * 2));
      if (width > 8192 || height > 8192 || width * height > 16777216) throw new Error('文字レイヤーが大きすぎます。改行または文字サイズを調整してください。');
      scratch.width = width; scratch.height = height;
      ctx.font = font(style);
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      ctx.lineWidth = style.strokeWidth * 2;
      ctx.strokeStyle = style.stroke;
      ctx.fillStyle = style.fill;
      let index = 0;
      rows.forEach((row, rowIndex) => {
        let x = style.textAlign === 'left' ? padding : style.textAlign === 'right' ? scratch.width - padding - row.width : (scratch.width - row.width) / 2;
        const y = scratch.height / 2 + (rowIndex - (rows.length - 1) / 2) * lineHeight + style.fontSize * 0.35;
        row.chars.forEach((char, charIndex) => {
          if (index++ < visible) {
            if (style.strokeWidth > 0) ctx.strokeText(char, x, y);
            ctx.fillText(char, x, y);
          }
          x += row.widths[charIndex] + style.letterSpacing;
        });
      });
      // 複数Elementを再利用しつつ、キャッシュを8枚・合計64MB相当以内へ収める。
      let pixels = [...this.cache.values()].reduce((sum, canvas) => sum + canvas.width * canvas.height, 0);
      while (this.cache.size && (this.cache.size >= 8 || pixels + width * height > 16777216)) {
        const oldest = this.cache.keys().next().value, canvas = this.cache.get(oldest);
        pixels -= canvas.width * canvas.height; this.cache.delete(oldest);
      }
      this.cache.set(key, scratch);
      return scratch;
    }
    render(project, time, background = null) {
      const { canvas, context: ctx } = this;
      if (canvas.width !== project.project.width) canvas.width = project.project.width;
      if (canvas.height !== project.project.height) canvas.height = project.project.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      // SceneとElementの配列順で描画し、後ろの要素を手前にする。
      for (const scene of project.scenes) {
      if (time < scene.start || time >= scene.end) continue;
      for (const line of scene.elements) {
        const state = effects.evaluateElement(scene, line, time);
        if (!state) continue;
        const style = line.style; fonts.assertReady(style, line.text);
        // revealは文字数へ量子化し、同じ表示文字数のレイヤーを再利用する。
        const count = graphemes(line.text.replace(/\n/g, '')).length;
        const reveal = count ? Math.floor(state.reveal * count) / count : 1;
        const layer = this.layer(line, style, reveal);
        ctx.save();
        ctx.translate(state.x * canvas.width, state.y * canvas.height);
        ctx.rotate(state.rotation * Math.PI / 180);
        ctx.scale(state.scale, state.scale);
        ctx.globalAlpha = state.opacity;
        if (state.glow) { ctx.shadowColor = style.glowColor; ctx.shadowBlur = style.glowBlur * state.glow; }
        ctx.drawImage(layer, -layer.width / 2, -layer.height / 2);
        if (state.sweep !== null) {
          // 光の走査を文字のアルファへ限定し、背景へ矩形を出さない。
          const overlay = document.createElement('canvas');
          overlay.width = layer.width; overlay.height = layer.height;
          const ox = overlay.getContext('2d');
          ox.drawImage(layer, 0, 0);
          ox.globalCompositeOperation = 'source-in';
          const center = state.sweep * (layer.width + 400) - 200;
          const gradient = ox.createLinearGradient(center - 120, 0, center + 120, 0);
          gradient.addColorStop(0, '#ffffff00'); gradient.addColorStop(0.5, '#ffffff'); gradient.addColorStop(1, '#ffffff00');
          ox.fillStyle = gradient; ox.fillRect(0, 0, layer.width, layer.height);
          ctx.drawImage(overlay, -layer.width / 2, -layer.height / 2);
        }
        ctx.restore();
      }
      }
    }
  }
  const api = { Renderer, evaluate, graphemes, prepareFonts };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LyricMotionRenderer = api;
})(globalThis);
