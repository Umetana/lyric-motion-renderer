(function (root) {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  // Effectは描画せず、指定時刻から描画パラメータだけを返す。
  const enterEffects = {
    none: () => ({}),
    fade: p => ({ opacity: p }),
    pop: p => ({ scale: 1 - Math.exp(-6 * p) * Math.cos(8 * p) * (1 - p) }),
    impact: p => ({ opacity: p, scale: 1 + 0.6 * (1 - p) ** 3 }),
    typewriter: p => ({ reveal: p })
  };
  const activeEffects = {
    none: () => ({}),
    glow: elapsed => ({ glow: 0.8 + 0.2 * Math.sin(elapsed * Math.PI * 2) }),
    sweep: elapsed => ({ sweep: (elapsed % 2) / 2 })
  };
  function evaluate(line, time) {
    if (time < line.start || time >= line.end) return null;
    const span = line.end - line.start;
    const enter = line.effects.enter;
    const exit = line.effects.exit;
    // 短い行でも登場・退場を区間内へ収め、再生履歴に依存しない。
    const enterTime = enter.type === 'none' ? 0 : enter.duration;
    const exitTime = exit.type === 'none' ? 0 : exit.duration;
    const factor = Math.min(1, span / Math.max(span, enterTime + exitTime));
    const enterDuration = enterTime * factor;
    const exitDuration = exitTime * factor;
    const elapsed = time - line.start;
    const p = enterDuration === 0 ? 1 : clamp(elapsed / enterDuration);
    const out = exitDuration === 0 ? 1 : clamp((line.end - time) / exitDuration);
    const state = { opacity: 1, scale: 1, reveal: 1, glow: 0, sweep: null,
      ...enterEffects[enter.type](p), ...activeEffects[line.effects.active.type](elapsed) };
    state.opacity *= out;
    return state;
  }
  const easing = { linear: t => t, 'ease-in': t => t ** 3, 'ease-out': t => 1 - (1 - t) ** 3,
    'ease-in-out': t => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2 };
  function sampleTrack(track, time) {
    const keys = track.keyframes;
    if (time <= keys[0].time) return keys[0].value;
    for (let i = 1; i < keys.length; i++) if (time <= keys[i].time) {
      const a = keys[i - 1], b = keys[i];
      const t = easing[b.easing]((time - a.time) / (b.time - a.time));
      return a.value + (b.value - a.value) * t;
    }
    return keys[keys.length - 1].value;
  }
  function evaluateElement(scene, element, time) {
    if (time < scene.start || time >= scene.end) return null;
    const phase = evaluate(element, time - scene.start);
    if (!phase) return null;
    const local = time - scene.start - element.start;
    const values = { x: element.position.x, y: element.position.y, scale: element.transform.scale, rotation: element.transform.rotation, opacity: 1 };
    for (const track of element.animations) values[track.property] = sampleTrack(track, local);
    return { ...phase, x: values.x, y: values.y, scale: values.scale * phase.scale, rotation: values.rotation, opacity: values.opacity * phase.opacity };
  }
  const api = { evaluate, evaluateElement, sampleTrack };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LyricMotionEffects = api;
})(globalThis);
