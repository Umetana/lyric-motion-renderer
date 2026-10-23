// MIT Copyright (c) 2026 Umetana
(function () {
  'use strict';
  // DOMの表示・保存・通信は呼出側が担当する。座標はキャンバスの論理px。
  function create(options) {
    const { element, getCanvasRect, canvasWidth, canvasHeight, onChange } = options;
    const limits = options.limits;
    let value = {}, enabled = false, drag = null, destroyed = false;
    const removers = [];
    function listen(target, name, handler, config) {
      target.addEventListener(name, handler, config);
      removers.push(() => target.removeEventListener(name, handler, config));
    }
    function normalize(next) {
      const result = {};
      for (const key of ['x', 'y', 'width', 'height', 'scale']) {
        const [min, max, fallback] = limits[key];
        const number = Number(next[key]);
        result[key] = Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
      }
      return result;
    }
    function end() {
      const previous = drag; drag = null;
      if (previous && element.hasPointerCapture(previous.id)) element.releasePointerCapture(previous.id);
    }
    function setValue(next) { value = normalize(next); return { ...value }; }
    function emit(patch) {
      const next = normalize({ ...value, ...patch });
      const changed = Object.keys(patch).filter(key => next[key] !== value[key]);
      value = next;
      if (changed.length) onChange({ ...value }, changed);
    }
    listen(element, 'pointerdown', event => {
      if (!enabled || drag || event.button !== 0) return;
      const rect = getCanvasRect();
      if (!(rect.width > 0 && rect.height > 0)) return;
      event.preventDefault();
      drag = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY,
        x: value.x, y: value.y, scaleX: rect.width / canvasWidth, scaleY: rect.height / canvasHeight };
      element.setPointerCapture(event.pointerId);
    });
    listen(element, 'pointermove', event => {
      if (!enabled || !drag || event.pointerId !== drag.id) return;
      emit({ x: Math.round(drag.x + (event.clientX - drag.clientX) / drag.scaleX),
        y: Math.round(drag.y + (event.clientY - drag.clientY) / drag.scaleY) });
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(element, type, end);
    listen(element, 'wheel', event => {
      if (!enabled) return;
      event.preventDefault();
      if (event.deltaY) emit({ scale: Math.round((value.scale - Math.sign(event.deltaY) * (options.scaleStep || .05)) * 100) / 100 });
    }, { passive: false });
    for (const type of ['blur', 'pagehide', 'resize']) listen(window, type, end);
    listen(document, 'visibilitychange', () => { if (document.hidden) end(); });
    setValue(options.value);
    return {
      setValue,
      end,
      setEnabled(next) { enabled = !!next && !destroyed; if (!enabled) end(); },
      destroy() { enabled = false; destroyed = true; end(); removers.splice(0).forEach(remove => remove()); }
    };
  }
  window.VCTPlacementEditor = Object.freeze({ create });
})();
