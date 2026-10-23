(function (global) {
    'use strict';

    let instanceSerial = 0;

    function create(options) {
        const config = options && typeof options === 'object' ? options : {};
        const mount = config.mount;
        if (!(mount instanceof Element)) throw new TypeError('VCTChoiceDialog.create requires a mount Element');
        const attached = new Map();
        const instanceId = `vct-cd-${++instanceSerial}`;
        let activeSelect = null;

        const overlay = document.createElement('section');
        overlay.className = 'vct-cd-overlay';
        overlay.hidden = true;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = `
            <div class="vct-cd-dialog">
                <h2 class="vct-cd-title">選択</h2>
                <div class="vct-cd-options"></div>
                <div class="vct-cd-actions">
                    <button class="vct-cd-cancel" type="button">キャンセル</button>
                    <button class="vct-cd-confirm" type="button">決定</button>
                </div>
            </div>`;
        mount.replaceChildren(overlay);

        const title = overlay.querySelector('.vct-cd-title');
        const optionArea = overlay.querySelector('.vct-cd-options');
        const confirmButton = overlay.querySelector('.vct-cd-confirm');

        function optionLabel(option) { return option.label || option.textContent || option.value; }
        function selectedLabel(select) {
            const option = [...select.options].find(item => item.value === select.value);
            return option ? optionLabel(option) : '選択してください';
        }

        function refresh(select) {
            const targets = select ? [[select, attached.get(select)]] : [...attached.entries()];
            for (const [target, targetConfig] of targets) {
                if (!targetConfig) continue;
                targetConfig.trigger.textContent = selectedLabel(target);
                targetConfig.trigger.disabled = target.disabled;
            }
            if (activeSelect?.disabled || !activeSelect?.isConnected) close();
        }

        function open(select) {
            const selectConfig = attached.get(select);
            if (!selectConfig || select.disabled) return;
            activeSelect = select;
            const label = typeof selectConfig.label === 'function' ? selectConfig.label(select) : selectConfig.label;
            title.textContent = label || select.getAttribute('aria-label') || '選択';
            const radioName = `${instanceId}-choice`;
            optionArea.replaceChildren(...[...select.options].map(option => {
                const row = document.createElement('label');
                row.className = 'vct-cd-option';
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = radioName;
                radio.value = option.value;
                radio.checked = option.value === select.value;
                radio.disabled = option.disabled;
                const text = document.createElement('span');
                text.className = 'vct-cd-option-text';
                text.textContent = optionLabel(option);
                row.append(radio, text);
                return row;
            }));
            overlay.hidden = false;
            const checked = optionArea.querySelector('input:checked');
            (checked || optionArea.querySelector('input:not(:disabled)') || confirmButton).focus();
        }

        function close() {
            const selectConfig = activeSelect ? attached.get(activeSelect) : null;
            activeSelect = null;
            overlay.hidden = true;
            optionArea.replaceChildren();
            selectConfig?.trigger.focus();
        }

        function confirm() {
            if (!activeSelect) return;
            const checked = optionArea.querySelector('input:checked');
            if (!checked) return;
            const select = activeSelect;
            select.value = checked.value;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            refresh(select);
            close();
        }

        function attach(select, selectOptions) {
            if (!(select instanceof HTMLSelectElement)) throw new TypeError('attach requires a select Element');
            if (attached.has(select)) return attached.get(select).trigger;
            const selectConfig = selectOptions && typeof selectOptions === 'object' ? selectOptions : {};
            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'vct-cd-trigger';
            select.classList.add('vct-cd-native-hidden');
            select.insertAdjacentElement('afterend', trigger);
            attached.set(select, { ...selectConfig, trigger });
            trigger.addEventListener('click', () => open(select));
            select.addEventListener('input', () => refresh(select));
            select.addEventListener('change', () => refresh(select));
            refresh(select);
            return trigger;
        }

        overlay.querySelector('.vct-cd-cancel').addEventListener('click', close);
        confirmButton.addEventListener('click', confirm);
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        overlay.addEventListener('keydown', event => {
            if (event.key === 'Escape') { close(); event.preventDefault(); }
            if (event.key === 'Enter' && event.target.matches('input[type="radio"]')) { confirm(); event.preventDefault(); }
        });

        return Object.freeze({ attach, open, close, refresh, overlay });
    }

    global.VCTChoiceDialog = Object.freeze({ create });
})(window);
