(function (global) {
    'use strict';

    const DEFAULT_PRESETS = Object.freeze([
        '#ffffff', '#b9c7da', '#000000', '#ff4d5e', '#ffb020', '#ffe34d', '#38d27a', '#2ea8ff',
        '#765cff', '#e458ff', '#00e5d4', '#7a8599', '#202938', '#8b5a2b', '#ff7aa8', '#a8ff60'
    ]);

    function isHex(value) { return /^#[0-9a-f]{6}$/i.test(String(value || '')); }
    function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }

    function hexToHsl(hex) {
        const value = isHex(hex) ? hex.slice(1) : '000000';
        const r = parseInt(value.slice(0, 2), 16) / 255;
        const g = parseInt(value.slice(2, 4), 16) / 255;
        const b = parseInt(value.slice(4, 6), 16) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const lightness = (max + min) / 2;
        const delta = max - min;
        let hue = 0, saturation = 0;
        if (delta) {
            saturation = delta / (1 - Math.abs(2 * lightness - 1));
            if (max === r) hue = 60 * (((g - b) / delta) % 6);
            else if (max === g) hue = 60 * ((b - r) / delta + 2);
            else hue = 60 * ((r - g) / delta + 4);
        }
        return { h: Math.round((hue + 360) % 360), s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
    }

    function hslToHex(hue, saturation, lightness) {
        const h = ((Number(hue) % 360) + 360) % 360;
        const s = clamp(saturation, 0, 100) / 100;
        const l = clamp(lightness, 0, 100) / 100;
        const chroma = (1 - Math.abs(2 * l - 1)) * s;
        const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - chroma / 2;
        const rgb = h < 60 ? [chroma,x,0] : h < 120 ? [x,chroma,0] : h < 180 ? [0,chroma,x] : h < 240 ? [0,x,chroma] : h < 300 ? [x,0,chroma] : [chroma,0,x];
        return '#' + rgb.map(value => Math.round((value + m) * 255).toString(16).padStart(2, '0')).join('');
    }

    function create(options) {
        const config = options && typeof options === 'object' ? options : {};
        const mount = config.mount;
        if (!(mount instanceof Element)) throw new TypeError('VCTInlineColorPicker.create requires a mount Element');
        const presets = Array.isArray(config.presets) ? config.presets.filter(isHex) : DEFAULT_PRESETS;
        const attached = new Map();
        let activeInput = null;

        const panel = document.createElement('section');
        panel.className = 'vct-icp-panel';
        panel.hidden = true;
        panel.innerHTML = `
            <div class="vct-icp-head"><span class="vct-icp-preview"></span><strong class="vct-icp-title">色</strong><button class="vct-icp-close" type="button">閉じる</button></div>
            <label class="vct-icp-row"><span>色相</span><input class="vct-icp-hue" type="range" min="0" max="360"><output class="vct-icp-hue-value vct-icp-value"></output></label>
            <label class="vct-icp-row"><span>彩度</span><input class="vct-icp-saturation" type="range" min="0" max="100"><output class="vct-icp-saturation-value vct-icp-value"></output></label>
            <label class="vct-icp-row"><span>明度</span><input class="vct-icp-lightness" type="range" min="0" max="100"><output class="vct-icp-lightness-value vct-icp-value"></output></label>
            <input class="vct-icp-hex" type="text" maxlength="7" spellcheck="false" aria-label="HEXカラー">
            <div class="vct-icp-presets"></div>`;
        mount.replaceChildren(panel);

        const query = selector => panel.querySelector(selector);
        const hue = query('.vct-icp-hue');
        const saturation = query('.vct-icp-saturation');
        const lightness = query('.vct-icp-lightness');
        const hexInput = query('.vct-icp-hex');

        function updateInputSwatch(input) {
            input.style.setProperty('--vct-icp-input-color', isHex(input.value) ? input.value : 'transparent');
        }

        function syncPanel(hex) {
            const normalized = isHex(hex) ? hex.toLowerCase() : '#000000';
            const hsl = hexToHsl(normalized);
            hue.value = hsl.h;
            saturation.value = hsl.s;
            lightness.value = hsl.l;
            query('.vct-icp-hue-value').textContent = `${hsl.h}°`;
            query('.vct-icp-saturation-value').textContent = `${hsl.s}%`;
            query('.vct-icp-lightness-value').textContent = `${hsl.l}%`;
            hexInput.value = normalized;
            query('.vct-icp-preview').style.background = normalized;
        }

        function apply(hex) {
            if (!activeInput || !isHex(hex)) return;
            const normalized = hex.toLowerCase();
            activeInput.value = normalized;
            updateInputSwatch(activeInput);
            activeInput.dispatchEvent(new Event('input', { bubbles: true }));
            syncPanel(normalized);
        }

        function open(input) {
            const inputConfig = attached.get(input);
            if (!inputConfig || input.disabled) return;
            activeInput = input;
            panel.hidden = false;
            query('.vct-icp-title').textContent = typeof inputConfig.label === 'function' ? inputConfig.label(input) : (inputConfig.label || '色');
            syncPanel(input.value);
        }

        function close() {
            activeInput = null;
            panel.hidden = true;
        }

        function attach(input, inputOptions) {
            if (!(input instanceof HTMLInputElement)) throw new TypeError('attach requires an input Element');
            if (attached.has(input)) return input;
            attached.set(input, inputOptions && typeof inputOptions === 'object' ? inputOptions : {});
            input.classList.add('vct-icp-input');
            input.type = 'text';
            input.maxLength = 7;
            input.spellcheck = false;
            input.addEventListener('focus', () => open(input));
            input.addEventListener('click', () => open(input));
            input.addEventListener('input', () => updateInputSwatch(input));
            updateInputSwatch(input);
            return input;
        }

        function refresh() {
            attached.forEach((_, input) => updateInputSwatch(input));
            if (activeInput?.disabled || !activeInput?.isConnected) close();
            else if (activeInput) syncPanel(activeInput.value);
        }

        query('.vct-icp-close').addEventListener('click', close);
        [hue, saturation, lightness].forEach(slider => slider.addEventListener('input', () => apply(hslToHex(hue.value, saturation.value, lightness.value))));
        hexInput.addEventListener('input', () => { if (isHex(hexInput.value)) apply(hexInput.value); });
        query('.vct-icp-presets').replaceChildren(...presets.map(color => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'vct-icp-preset';
            button.style.setProperty('--vct-icp-preset', color);
            button.title = color;
            button.setAttribute('aria-label', color);
            button.addEventListener('click', () => apply(color));
            return button;
        }));

        return Object.freeze({ attach, open, close, refresh, panel });
    }

    global.VCTInlineColorPicker = Object.freeze({ create, isHex, hexToHsl, hslToHex, DEFAULT_PRESETS });
})(window);
