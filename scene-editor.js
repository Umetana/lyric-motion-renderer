(async function () {
  'use strict';
  const M = LyricMotionPresets, L = LyricMotionScript;
  let motionUndo = null, bulkSceneId = null;
  const bulkIds = new Set();
  let sequenceSelection = '', librarySceneId = null;
  const P = LyricMotionProject, R = LyricMotionRenderer, E = LyricMotionExporter;
  const $ = id => document.getElementById(id), renderer = new R.Renderer($('preview'));
  const names = { none: 'なし', fade: 'Fade', pop: 'Pop', impact: 'Impact', typewriter: 'Typewriter', glow: 'Glow', sweep: 'Sweep',
    x: 'X位置', y: 'Y位置', scale: '倍率', rotation: '回転（度）', opacity: '透明度', linear: '等速', 'ease-in': '加速', 'ease-out': '減速', 'ease-in-out': '加速→減速' };
  const styleBindings = { 'font-family': 'fontFamily', 'font-size': 'fontSize', 'font-weight': 'fontWeight', fill: 'fill', stroke: 'stroke', 'stroke-width': 'strokeWidth', 'letter-spacing': 'letterSpacing', 'glow-color': 'glowColor', 'glow-blur': 'glowBlur' };
  let project = P.sample(), sceneId = project.scenes[0].id, elementId = project.scenes[0].elements[1].id;
  let time = 1.5, playing = false, clockStart = 0, audioUrl = null, busy = false, controller = null, dialog, placement, revision = 0;
  const selectedScene = (p = project) => p.scenes.find(s => s.id === sceneId);
  const selectedElement = (p = project) => selectedScene(p)?.elements.find(e => e.id === elementId);
  const numeric = input => input.value.trim() === '' ? NaN : Number(input.value);
  // 表示を丸めても未編集の座標は元の精度を維持する。
  function coordinateValue(input) { return input.value === input.dataset.displayValue ? Number(input.dataset.preciseValue) : numeric(input); }
  function setCoordinate(input, value) { input.value = Number(value.toFixed(4)); input.dataset.displayValue = input.value; input.dataset.preciseValue = String(value); }
  selectOptions($('font-preset'), [...LyricMotionFonts.PRESETS.map(p => p.id), 'google', 'custom'], 'local-gothic');
  for (const option of $('font-preset').options) option.textContent = LyricMotionFonts.PRESETS.find(p => p.id === option.value)?.name || (option.value === 'google' ? 'Google Fonts指定（試験）' : 'カスタム（PC）');
  function syncFontPreset() {
    const current = LyricMotionFonts.find($('font-family').value), source = selectedElement()?.style.fontSource; $('font-preset').value = source === 'google' ? 'google' : source === 'local' ? 'custom' : current?.id || 'custom'; $('font-custom').hidden = !['custom', 'google'].includes($('font-preset').value);
  }
  const newId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
  selectOptions($('motion-preset'), M.PRESETS.map(p => p.id), M.PRESETS[0].id);
  for (const option of $('motion-preset').options) option.textContent = M.PRESETS.find(p => p.id === option.value).name;
  function updateMotionControls() {
    $('motion-description').textContent = M.PRESETS.find(p => p.id === $('motion-preset').value)?.description || '';
    $('apply-motion').disabled = busy || !selectedElement();
    $('apply-bulk-motion').disabled = busy || !bulkIds.size;
    $('apply-sequence').disabled = busy || bulkIds.size < 2;
    $('undo-motion').disabled = busy || motionUndo?.sceneId !== sceneId || !motionUndo?.entries.some(entry => selectedScene()?.elements.some(e => e.id === entry.id));
  }
  $('preset-controls').addEventListener('change', event => { event.stopPropagation(); updateMotionControls(); });
  function applyMotion(ids) {
    mutate(p => {
      const candidate = P.clone(p), scene = selectedScene(candidate), entries = [];
      for (const id of ids) {
        const target = scene.elements.find(e => e.id === id);
        if (!target) throw new Error('適用対象のElementが見つかりません。');
        entries.push({ id, duration: target.end - target.start, animations: P.clone(target.animations), effects: P.clone(target.effects) });
        const generated = M.apply(target, $('motion-preset').value, { strength: numeric($('motion-strength')), mirror: $('motion-mirror').checked });
        target.animations = generated.animations; target.effects = generated.effects;
      }
      const checked = P.validate(candidate);
      p.scenes = checked.scenes; motionUndo = { sceneId, entries };
      message(`${ids.length} Elementへ振り付けを適用しました。再生で確認し、キーを個別に調整できます。`);
    });
  }
  $('apply-motion').addEventListener('click', () => applyMotion([elementId]));
  $('apply-bulk-motion').addEventListener('click', () => { if (bulkIds.size) applyMotion([...bulkIds]); });
  $('undo-motion').addEventListener('click', () => mutate(p => {
    if (!motionUndo || motionUndo.sceneId !== sceneId) return;
    for (const entry of motionUndo.entries) {
      const target = selectedScene(p).elements.find(e => e.id === entry.id); if (!target) continue;
      if (entry.position) { target.position = P.clone(entry.position); target.start = entry.start; target.end = entry.end; }
      target.animations = P.clone(entry.animations); target.effects = P.clone(entry.effects); P.retimeAnimations(target, entry.duration);
    }
    P.validate(p); motionUndo = null; message('直前の振り付け適用を戻しました。');
  }));
  selectOptions($('sequence-type'), M.SEQUENCES.map(p => p.id), 'impact');
  for (const option of $('sequence-type').options) option.textContent = M.SEQUENCES.find(p => p.id === option.value).name;
  function updateSequenceDescription() {
    const type = $('sequence-type').value, only = $('sequence-motion-only').checked;
    const descriptions = {
      impact: '現在の配置と表示区間でImpactを生成します。', alternate: '現在の基準位置へ左・右から交互に入る動きを生成します。',
      stack: '各Elementの現在の表示区間にフェードを付けます。既存の登場順と配置を保ちます。', gather: '周囲の離れた位置から、各Elementの現在の基準位置へ集まります。',
      'center-out': '中央から展開で使うポップの動きを付けます。登場順と基準位置は現在の設定を使います。',
      'last-accent': '現在の登場時刻を保ち、最後のElementだけ大きなImpactで強調します。', flow: '各Elementの現在の表示区間で同じ速度で左へ流れます。強さで速度を調整します。',
      wave: '各Elementの登場から時間差で上下の波を一回生成します。設定済みの開始・終了は変えません。',
      'exit-chain': '各Elementの現在の終了時刻に合わせて上へ飛び去ります。終了時刻の順番は変えません。'
    };
    $('sequence-description').textContent = only ? descriptions[type] : M.SEQUENCES.find(p => p.id === type)?.description || '';
    $('sequence-full-hint').hidden = only; $('sequence-layout-hint').hidden = only;
    for (const key of ['start', 'end', 'dx', 'dy']) $(`sequence-${key}`).disabled = busy || only;
    $('sequence-delay').disabled = busy || (only && type !== 'wave');
    $('sequence-mode-hint').textContent = only ? '動きのみ：各Elementの開始・終了・基準X/Y・デザインを保持します。中央から展開の登場順や連鎖退場の終了時刻は変更しません。ウェーブの時間差は各Element登場からの遅れです。' : '配置・時間も生成：指定した開始・終了・配置間隔で位置と時刻も置き換えます。';
  }
  $('sequence-controls').addEventListener('change', event => { if (['sequence-type', 'sequence-motion-only'].includes(event.target.id)) updateSequenceDescription(); });
  $('apply-sequence').addEventListener('click', () => mutate(p => {
    const scene = selectedScene(p), targets = scene.elements.filter(e => bulkIds.has(e.id));
    const options = Object.fromEntries(['start', 'end', 'delay', 'dx', 'dy', 'strength'].map(key => [key, numeric($(`sequence-${key}`))]));
    options.type = $('sequence-type').value; options.motionOnly = $('sequence-motion-only').checked;
    const candidate = M.sequence(p, sceneId, [...bulkIds], options);
    const entries = targets.map(e => ({ id: e.id, ...(!options.motionOnly ? { start: e.start, end: e.end, position: P.clone(e.position) } : {}), duration: e.end - e.start, animations: P.clone(e.animations), effects: P.clone(e.effects) }));
    p.scenes = candidate.scenes; motionUndo = { sceneId, entries };
    message(`${targets.length} Elementへ${M.SEQUENCES.find(item => item.id === options.type).name}を生成しました。再生して位置・時刻を調整できます。`);
  }));
  function updatePlacementControls() {
    const active = selectedElement(), allowed = !!active && (!bulkIds.size || bulkIds.has(elementId));
    placement?.setEnabled(!playing && !busy && allowed);
    $('placement').disabled = playing || busy || !allowed;
    $('placement').dataset.count = bulkIds.size ? String(bulkIds.size) : '';
    $('placement').classList.toggle('bulk-moving', !!bulkIds.size);
    $('placement').title = !allowed ? 'チェックしたElementを文字ボタンで選んでください' : bulkIds.size ? `${bulkIds.size} Elementの基準位置とX/Y軌道をまとめてドラッグ（ホイールは個別倍率）` : '基準位置をドラッグ／ホイールで基準倍率';
    $('placement').setAttribute('aria-label', $('placement').title);
    $('placement-status').textContent = bulkIds.size ? (allowed ? `${bulkIds.size} Elementをまとめて移動（表示されていない文字も対象）` : 'チェックしたElementを文字ボタンで選ぶと、まとめてドラッグできます。') : '選択Elementを個別に移動';
  }
  selectOptions($('bulk-font'), ['keep', ...LyricMotionFonts.PRESETS.map(p => p.id), 'google', 'custom'], 'keep');
  for (const option of $('bulk-font').options) option.textContent = LyricMotionFonts.PRESETS.find(p => p.id === option.value)?.name || (option.value === 'keep' ? '変更なし' : option.value === 'google' ? 'Google Fonts指定（試験）' : 'カスタム（PC）');
  function updateBulkControls() {
    updatePlacementControls(); updateMotionControls();
    $('inspector-multiple').hidden = !bulkIds.size;
    $('inspector-selection').textContent = bulkIds.size ? `一括編集対象: ${bulkIds.size} Element` : '個別編集';
    $('bulk-controls').hidden = !bulkIds.size;
    $('sequence-controls').hidden = bulkIds.size < 2; updateSequenceDescription();
    const targets = selectedScene()?.elements.filter(e => bulkIds.has(e.id)) || [];
    const signature = JSON.stringify([sceneId, targets.map(e => e.id)]);
    if (signature !== sequenceSelection) {
      sequenceSelection = signature;
      $('sequence-start').value = targets.length ? Math.min(...targets.map(e => e.start)) : 0;
      $('sequence-end').value = targets.length ? Math.max(...targets.map(e => e.end)) : 0;
    }
    $('sequence-targets').textContent = `一覧順: ${targets.map(e => e.text.slice(0, 12)).join(' → ')}`;
    $('bulk-count').textContent = `${bulkIds.size} Element選択`;
    $('bulk-targets').textContent = `${selectedScene()?.name || ''} · ${bulkIds.size} Elementへ適用`;
    $('bulk-apply').disabled = busy || !bulkIds.size; $('bulk-all').disabled = busy || !selectedScene()?.elements.length; $('bulk-clear').disabled = busy || !bulkIds.size;
    for (const row of $('elements').querySelectorAll('.element-row')) { const selected = bulkIds.has(row.dataset.elementId); row.classList.toggle('bulk-selected', selected); row.querySelector('input').checked = selected; }
  }
  $('bulk-all').addEventListener('click', () => { for (const e of selectedScene()?.elements || []) bulkIds.add(e.id); updateBulkControls(); });
  $('bulk-clear').addEventListener('click', () => { bulkIds.clear(); updateBulkControls(); });
  $('bulk-controls').addEventListener('change', event => {
    if (event.target.id === 'bulk-position-mode') { $('bulk-relative').hidden = $('bulk-position-mode').value !== 'relative'; $('bulk-absolute').hidden = $('bulk-position-mode').value !== 'absolute'; }
    if (event.target.id === 'bulk-font') $('bulk-font-custom').hidden = !['custom', 'google'].includes($('bulk-font').value); });
  $('bulk-apply').addEventListener('click', async () => {
    if (busy || !bulkIds.size) return;
    try {
      pause(); readEditor(); const patch = {};
      if ($('bulk-position-mode').value === 'absolute') {
        for (const axis of ['x', 'y']) if ($(`bulk-${axis}`).value.trim()) patch[axis] = numeric($(`bulk-${axis}`));
      } else { patch.dx = $('bulk-dx').value.trim() ? numeric($('bulk-dx')) : 0; patch.dy = $('bulk-dy').value.trim() ? numeric($('bulk-dy')) : 0; }
      if ($('bulk-size').value.trim()) patch.fontSize = numeric($('bulk-size'));
      if ($('bulk-weight').value !== 'keep') patch.fontWeight = numeric($('bulk-weight'));
      for (const [id, key] of [['bulk-fill', 'fill'], ['bulk-stroke', 'stroke']]) if ($(id).value.trim()) patch[key] = $(id).value.trim();
      const choice = $('bulk-font').value;
      if (choice !== 'keep') { patch.fontFamily = ['custom', 'google'].includes(choice) ? $('bulk-family').value.trim() : LyricMotionFonts.PRESETS.find(p => p.id === choice).family; patch.fontSource = choice === 'google' ? 'google' : choice === 'custom' ? 'local' : null; }
      const candidate = P.bulkEdit(project, sceneId, [...bulkIds], patch); lock(true);
      try { await R.prepareFonts(candidate); project = candidate; revision++; renderer.cache.clear(); }
      finally { lock(false); fillEditor(); }
      if (draw()) message(`${bulkIds.size} Elementへ一括編集を適用しました。`);
    } catch (error) { message(error.message, true); }
  });
  const colorIds = ['fill', 'stroke', 'glow-color', 'background'];
  const colorPicker = VCTInlineColorPicker.create({ mount: $('color-picker-mount'), presets: [...VCTInlineColorPicker.DEFAULT_PRESETS, '#00ff00', '#0000ff', '#ff00ff'] });
  for (const id of [...colorIds, 'bulk-fill', 'bulk-stroke']) {
    const input = $(id); colorPicker.attach(input, { label: input.closest('label').firstChild.textContent });
    const placePicker = () => {
      if (busy) return;
      const row = input.closest('.pair') || input.closest('label'); row.after($('color-picker-mount'));
      colorPicker.panel.scrollIntoView({ block: 'nearest' });
    };
    input.addEventListener('focus', placePicker); input.addEventListener('click', placePicker);
  }
  function syncBackgroundPreset() {
    const color = project.export.background.toLowerCase();
    $('background-preset').value = ['#00ff00', '#0000ff', '#ff00ff'].includes(color) ? color : 'custom';
    dialog?.refresh($('background-preset'));
  }
  let referenceUrl = null, referenceRevision = 0, referenceFile = null, audioFile = null;
  const saveHandles = new Map();
  function updateReference() {
    $('reference-image').hidden = !referenceUrl || !$('reference-visible').checked || $('preview-background').checked;
    $('reference-image').style.objectFit = document.querySelector('input[name="reference-fit"]:checked').value;
    $('reference-visible').disabled = busy || !referenceUrl; $('reference-clear').disabled = busy || !referenceUrl;
  }
  $('reference-file').addEventListener('change', async () => {
    const file = $('reference-file').files[0]; if (!file || busy) return;
    const revision = ++referenceRevision; let url;
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('参照画像は30MB以下にしてください。');
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('PNG・JPEG・WebPの画像を選択してください。');
      url = URL.createObjectURL(file); const image = new Image(); image.src = url; await image.decode();
      if (image.naturalWidth > 8192 || image.naturalHeight > 8192 || image.naturalWidth * image.naturalHeight > 32000000) throw new Error('参照画像は各辺8192px以下、合計3200万画素以下にしてください。');
      if (revision !== referenceRevision) return;
      if (referenceUrl) URL.revokeObjectURL(referenceUrl); referenceUrl = url; url = null;
      referenceFile = file; $('reference-image').src = referenceUrl; $('reference-name').textContent = file.name; $('reference-visible').checked = true; $('preview-background').checked = false; updateReference(); draw();
      message('背景画像を参照表示しました。書き出しには含まれません。');
    } catch (error) { if (revision === referenceRevision) message(`参照画像を読み込めません: ${error.message}`, true); }
    finally { if (url) URL.revokeObjectURL(url); $('reference-file').value = ''; }
  });
  function clearReference() {
    referenceRevision++; if (referenceUrl) URL.revokeObjectURL(referenceUrl); referenceUrl = null;
    referenceFile = null; $('reference-image').removeAttribute('src'); $('reference-name').textContent = '画像なし'; $('reference-visible').checked = false; updateReference();
  }
  $('reference-clear').addEventListener('click', () => { clearReference(); message('参照画像を外しました。'); });
  $('reference-visible').addEventListener('change', () => { if ($('reference-visible').checked) $('preview-background').checked = false; updateReference(); draw(); });
  for (const input of document.querySelectorAll('input[name="reference-fit"]')) input.addEventListener('change', updateReference);
  $('preview-background').addEventListener('change', () => { updateReference(); draw(); });
  $('settings').addEventListener('change', event => {
    if (event.target.id === 'font-preset') {
      event.stopImmediatePropagation(); const preset = LyricMotionFonts.PRESETS.find(p => p.id === $('font-preset').value);
      $('font-custom').hidden = !!preset;
      if (preset) { $('font-family').value = preset.family; message('フォントを準備しています。'); change(); } else $('font-family').focus();
      return;
    }
    if (event.target.id !== 'background-preset') return;
    event.stopImmediatePropagation(); if ($('background-preset').value === 'custom') return;
    $('background').value = $('background-preset').value; change();
  });
  $('settings').addEventListener('input', event => {
    if (!colorIds.includes(event.target.id) || !VCTInlineColorPicker.isHex(event.target.value) || busy) return;
    try { pause(); readEditor(); syncBackgroundPreset(); draw(); } catch (error) { message(error.message, true); }
  });
  function pause() { playing = false; $('audio').pause(); $('play').textContent = '再生'; updatePlacementControls(); }
  function fitPreview() {
    const ratio = project.project.width / project.project.height;
    const wrap = $('stage').parentElement, panel = wrap.parentElement;
    let limit = innerHeight * 0.24;
    if (innerWidth >= 1100) {
      const panelStyle = getComputedStyle(panel);
      let controls = parseFloat(panelStyle.paddingTop) + parseFloat(panelStyle.paddingBottom) + 2;
      for (const child of panel.children) {
        const style = getComputedStyle(child); if (child === wrap || style.display === 'none') continue;
        controls += child.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      }
      limit = Math.max(80, panel.clientHeight - controls);
    }
    const width = Math.min(wrap.clientWidth - 2, limit * ratio);
    $('stage').style.width = `${Math.max(1, width)}px`; $('stage').style.height = `${Math.max(1, width / ratio)}px`;
    $('stage').style.aspectRatio = `${ratio}`;
  }
  const previewObserver = new ResizeObserver(fitPreview);
  previewObserver.observe($('stage').parentElement); previewObserver.observe(document.querySelector('.preview-panel'));
  $('toggle-animation').addEventListener('click', () => {
    const collapsed = !$('animation-content').hidden;
    $('animation-content').hidden = collapsed; document.querySelector('main').classList.toggle('animation-collapsed', collapsed);
    $('toggle-animation').setAttribute('aria-expanded', String(!collapsed)); $('toggle-animation').textContent = collapsed ? '展開する' : '折りたたむ';
    requestAnimationFrame(fitPreview);
  });
  function draw() {
    try { renderer.render(project, time, $('preview-background').checked ? project.export.background : null); } catch (error) { pause(); message(error.message, true); return false; }
    fitPreview();
    $('seek').max = project.project.duration; $('seek').value = time;
    $('time').textContent = `曲全体 ${time.toFixed(3)} / ${project.project.duration.toFixed(3)} 秒`;
    updateTiming();
    const e = selectedElement(); $('placement').hidden = !e || busy;
    if (e) { $('placement').style.left = `${e.position.x * 100}%`; $('placement').style.top = `${e.position.y * 100}%`; }
    return true;
  }
  function updateTiming() {
    const s = selectedScene(), e = selectedElement();
    const sceneTime = s ? time - s.start : null, elementTime = e ? sceneTime - e.start : null;
    $('local-time').textContent = s ? `選択Scene内 ${sceneTime.toFixed(3)} 秒${sceneTime < 0 || time >= s.end ? '（区間外）' : ''}${e ? ` ／ 選択Element内 ${elementTime.toFixed(3)} 秒${elementTime < 0 || sceneTime >= e.end ? '（区間外）' : ''}` : ''}` : 'Scene未選択';
    $('element-time').textContent = e ? `曲全体での表示区間: ${(s.start + e.start).toFixed(3)}〜${(s.start + e.end).toFixed(3)} 秒` : '';
    $('set-element-start').disabled = busy || !e || sceneTime < 0 || sceneTime >= e.end;
    $('set-element-end').disabled = busy || !e || sceneTime <= e.start || time > s.end;
  }
  function exportOptions() {
    const scope = $('export-scope').value;
    return scope === 'scene' ? { sceneId: sceneId ?? '' } : scope === 'range' ? { start: numeric($('export-start')), end: numeric($('export-end')) } : {};
  }
  function updateExportRange() {
    $('export-range').hidden = $('export-scope').value !== 'range';
    try {
      const range = E.resolveRange(project, exportOptions());
      $('export-range-info').textContent = `曲の ${range.start.toFixed(3)}〜${range.end.toFixed(3)} 秒 → 動画の0秒から · ${range.frameCount}フレーム${$('export-scope').value === 'scene' ? '（他のSceneは含みません）' : ''}`;
    } catch (error) { $('export-range-info').textContent = error.message; }
  }
  function setTime(value) {
    pause(); time = Math.max(0, Math.min(project.project.duration, value));
    if (audioUrl && Number.isFinite($('audio').duration)) { time = Math.min(time, $('audio').duration); $('audio').currentTime = time; }
    draw();
  }
  function clearAudio() {
    pause(); $('audio').removeAttribute('src'); $('audio').load();
    if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = null; audioFile = null; $('audio-file').value = '';
    $('audio-name').textContent = project.audio?.source ? `${project.audio.source}（音源を再選択してください）` : '音源なし（時計でプレビュー）';
  }
  function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
  const jsonBlob = value => new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  function button(text, action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', action); return b; }
  function selectOptions(select, values, current) {
    select.replaceChildren(...values.map(value => { const o = document.createElement('option'); o.value = value; o.textContent = names[value] || value; return o; }));
    select.value = current;
  }
  function readEditor() {
    const p = P.clone(project);
    for (const key of ['width', 'height', 'fps', 'duration']) p.project[key] = numeric($(key));
    p.export.background = $('background').value.trim();
    const s = selectedScene(p), e = selectedElement(p);
    if (s) { s.name = $('scene-name').value; s.start = numeric($('scene-start')); s.end = numeric($('scene-end')); }
    if (e) {
      const previousDuration = e.end - e.start, previousPosition = { ...e.position };
      e.text = $('element-text').value; e.start = numeric($('element-start')); e.end = numeric($('element-end'));
      const sceneDuration = s.end - s.start;
      if (!Number.isFinite(e.start) || !Number.isFinite(e.end) || e.start < 0 || e.end > sceneDuration || e.start >= e.end) throw new Error(`Elementの開始・終了はScene内の0〜${Number(sceneDuration.toFixed(3))}秒で、開始より終了を後にしてください。`);
      e.position.x = coordinateValue($('element-x')); e.position.y = coordinateValue($('element-y')); e.transform.scale = numeric($('element-scale')); e.transform.rotation = numeric($('element-rotation'));
      for (const [input, key] of Object.entries(styleBindings)) e.style[key] = ['fontFamily', 'fill', 'stroke', 'glowColor'].includes(key) ? $(input).value.trim() : numeric($(input));
      if ($('text-align').value !== 'center' || e.style.textAlign !== undefined) e.style.textAlign = $('text-align').value;
      if (['google', 'custom'].includes($('font-preset').value)) e.style.fontSource = $('font-preset').value === 'google' ? 'google' : 'local'; else delete e.style.fontSource;
      e.effects = { enter: { type: $('enter').value, duration: numeric($('enter-duration')) }, active: { type: $('active').value }, exit: { type: $('exit').value, duration: numeric($('exit-duration')) } };
      e.animations = e.animations.map(track => ({ property: track.property, keyframes: [...$('keyframes').querySelectorAll('tr[data-property]')].filter(row => row.dataset.property === track.property).map(row => ({ time: numeric(row.querySelector('[data-key="time"]')), value: ['x', 'y'].includes(track.property) ? coordinateValue(row.querySelector('[data-key="value"]')) : numeric(row.querySelector('[data-key="value"]')), easing: row.querySelector('select').value })) }));
      // 基準座標の数値変更もドラッグと同じく軌道全体を平行移動する。
      for (const axis of ['x', 'y']) {
        const delta = e.position[axis] - previousPosition[axis];
        if (delta) for (const track of e.animations.filter(t => t.property === axis)) for (const key of track.keyframes) key.value += delta;
      }
      P.retimeAnimations(e, previousDuration);
    }
    project = P.validate(p); revision++; time = Math.min(time, project.project.duration); renderer.cache.clear();
    // 保存などで再度読み取っても、未更新の入力値からキーを戻さない。
    const current = selectedElement();
    if (current) {
      for (const axis of ['x', 'y']) setCoordinate($(`element-${axis}`), current.position[axis]);
      for (const row of $('keyframes').querySelectorAll('tr[data-property="x"], tr[data-property="y"]')) {
        const key = current.animations.find(t => t.property === row.dataset.property)?.keyframes[Number(row.dataset.index)];
        if (key) setCoordinate(row.querySelector('[data-key="value"]'), key.value);
      }
    }
    return project;
  }
  function mutate(action) {
    if (busy) return;
    const previousScene = sceneId, previousElement = elementId;
    try { pause(); readEditor(); const candidate = P.clone(project); action(candidate); project = P.validate(candidate); revision++; fillEditor(); draw(); }
    catch (error) { sceneId = previousScene; elementId = previousElement; message(error.message, true); }
  }
  function fillEditor() {
    const sceneScroll = $('scenes').scrollTop, elementScroll = $('elements').scrollTop;
    const s = selectedScene() || project.scenes[0]; sceneId = s?.id;
    const sceneChanged = librarySceneId !== sceneId; librarySceneId = sceneId;
    $('scene-count').textContent = `${project.scenes.length}件`; $('element-count').textContent = `${s?.elements.length || 0}件`;
    $('library-scene-name').textContent = s ? `選択Scene: ${s.name || 'Scene'}` : 'Sceneなし'; $('library-scene-name').title = s?.name || '';
    const e = s?.elements.find(item => item.id === elementId) || s?.elements[0]; elementId = e?.id;
    if (bulkSceneId !== sceneId) { bulkIds.clear(); bulkSceneId = sceneId; }
    for (const id of bulkIds) if (!s?.elements.some(item => item.id === id)) bulkIds.delete(id);
    placement?.destroy(); dialog?.close();
    // 共通choice-dialogの接続を再構築し、破棄したElementのDOMを保持しない。
    for (const select of document.querySelectorAll('#settings select, #export-settings select, #bulk-controls select, #sequence-controls select, #save-controls select')) {
      const value = select.value, replacement = select.cloneNode(true);
      if (select.nextElementSibling?.classList.contains('vct-cd-trigger')) select.nextElementSibling.remove();
      replacement.classList.remove('vct-cd-native-hidden'); select.replaceWith(replacement); replacement.value = value;
    }
    dialog = VCTChoiceDialog.create({ mount: $('choice-dialog-mount') });
    for (const key of ['width', 'height', 'fps', 'duration']) $(key).value = project.project[key];
    $('background').value = project.export.background; syncBackgroundPreset(); colorPicker.refresh();
    $('scene-settings').hidden = !s; $('element-settings').hidden = !e;
    $('element-title').textContent = e ? `選択中: ${e.text.slice(0, 40) || '空の文字'}` : 'Element未選択'; $('element-title').title = e?.text || '';
    $('inspector-scene').textContent = s ? `Scene: ${s.name || 'Scene'}` : 'Sceneなし';
    if (s) { $('scene-name').value = s.name; $('scene-start').value = s.start; $('scene-end').value = s.end; }
    if (e) {
      $('element-text').value = e.text; $('element-start').value = e.start; $('element-end').value = e.end;
      for (const key of ['x', 'y']) setCoordinate($(`element-${key}`), e.position[key]);
      for (const key of ['scale', 'rotation']) $(`element-${key}`).value = e.transform[key];
      if (![...$('font-weight').options].some(o => Number(o.value) === e.style.fontWeight)) { const option = document.createElement('option'); option.value = e.style.fontWeight; option.textContent = e.style.fontWeight; $('font-weight').append(option); }
      for (const [input, key] of Object.entries(styleBindings)) $(input).value = e.style[key];
      $('text-align').value = e.style.textAlign || 'center';
      syncFontPreset();
      for (const [key, values] of [['enter', P.ENTER], ['active', P.ACTIVE], ['exit', P.EXIT]]) selectOptions($(key), values, e.effects[key].type);
      $('enter-duration').value = e.effects.enter.duration; $('exit-duration').value = e.effects.exit.duration;
    }
    for (const select of document.querySelectorAll('#settings select, #export-settings select, #bulk-controls select, #sequence-controls select, #save-controls select')) {
      const label = select.closest('label'), title = label?.firstChild.textContent || '選択';
      const trigger = dialog.attach(select, { label: title }); trigger.id = `choice-${select.id}`;
      // 項目名・余白からボタンを起動せず、選択は可視ボタンだけで行う。
      if (label) label.htmlFor = select.id;
      select.tabIndex = -1;
    }
    $('scenes').replaceChildren(...project.scenes.map(scene => {
      const b = button(`${scene.name || 'Scene'} · ${scene.start.toFixed(2)}〜${scene.end.toFixed(2)}秒`, () => {
        try { readEditor(); sceneId = scene.id; elementId = null; fillEditor(); const current = selectedScene(); setTime(current.start + Math.min(0.5, (current.end - current.start) / 2)); } catch (error) { message(error.message, true); }
      }); b.classList.toggle('selected', scene.id === sceneId); return b;
    }));
    $('elements').replaceChildren(...(s?.elements || []).map(item => {
      const b = button(`${item.text || '空の文字'} · ${item.start.toFixed(2)}〜${item.end.toFixed(2)}秒`, () => {
        try { readEditor(); elementId = item.id; fillEditor(); if ($('seek-on-select').checked && (time < s.start + item.start || time >= s.start + item.end)) setTime(s.start + item.start + Math.min(0.5, (item.end - item.start) / 2)); else draw(); } catch (error) { message(error.message, true); }
      }); b.classList.toggle('selected', item.id === elementId); b.dataset.elementId = item.id;
      const row = document.createElement('div'); row.className = 'element-row'; row.dataset.elementId = item.id;
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = bulkIds.has(item.id); check.setAttribute('aria-label', `一括編集対象: ${item.text.slice(0, 30)}`);
      check.addEventListener('change', () => { if (check.checked) bulkIds.add(item.id); else bulkIds.delete(item.id); updateBulkControls(); });
      row.append(check, b); return row;
    }));
    $('scenes').scrollTop = sceneScroll; $('elements').scrollTop = sceneChanged ? 0 : elementScroll;
    fillTracks(e); updateSplitPreview();
    for (const id of ['remove-element', 'split-element', 'split-phrases', 'move-back', 'move-front']) $(id).disabled = !e;
    $('add-element').disabled = !s; $('remove-scene').disabled = !s;
    for (const b of $('track-tools').querySelectorAll('button')) b.disabled = !e || e.animations.some(t => t.property === b.dataset.track);
    if (e) {
      const { width, height } = project.project;
      placement = VCTPlacementEditor.create({ element: $('placement'), getCanvasRect: () => $('preview').getBoundingClientRect(), canvasWidth: width, canvasHeight: height,
        limits: { x: [-3 * width, 4 * width, width / 2], y: [-3 * height, 4 * height, height / 2], width: [1, width, 32], height: [1, height, 32], scale: [0, 20, 1] },
        value: { x: e.position.x * width, y: e.position.y * height, width: 32, height: 32, scale: e.transform.scale },
        onChange(value, changed) {
          try {
            pause(); const previous = selectedElement();
            const ids = bulkIds.size ? [...bulkIds] : [elementId];
            // 同じ差分を全対象の基準位置・X/Yキーへ加え、相互の位置関係を維持する。
            const dx = changed.includes('x') ? value.x / width - previous.position.x : 0;
            const dy = changed.includes('y') ? value.y / height - previous.position.y : 0;
            const candidate = P.bulkEdit(project, sceneId, ids, { dx, dy }), target = selectedElement(candidate);
            if (changed.includes('scale')) { const ratio = previous.transform.scale ? value.scale / previous.transform.scale : 1; target.transform.scale = value.scale; const track = target.animations.find(t => t.property === 'scale'); if (track) for (const frame of track.keyframes) frame.value *= ratio; }
            project = P.validate(candidate); revision++;
            const next = selectedElement(); setCoordinate($('element-x'), next.position.x); setCoordinate($('element-y'), next.position.y); $('element-scale').value = next.transform.scale;
            for (const row of $('keyframes').querySelectorAll('tr[data-property]')) {
              const value = next.animations.find(t => t.property === row.dataset.property).keyframes[Number(row.dataset.index)].value, input = row.querySelector('[data-key="value"]');
              if (['x', 'y'].includes(row.dataset.property)) setCoordinate(input, value); else input.value = value;
            }
            draw();
          } catch (error) { const current = selectedElement(); placement.setValue({ x: current.position.x * width, y: current.position.y * height, width: 32, height: 32, scale: current.transform.scale }); message(`移動できません: ${error.message}`, true); }
        } }); updatePlacementControls();
    }
    dialog.refresh(); colorPicker.refresh(); updateTiming(); updateExportRange(); updateMotionControls(); updateReference(); updateBulkControls();
  }
  function fillTracks(e) {
    $('keyframes').replaceChildren();
    for (const track of e?.animations || []) {
      const header = document.createElement('tr'); header.className = 'track-header'; const cell = document.createElement('td'); cell.colSpan = 5;
      cell.append(document.createTextNode(`${names[track.property]}　`), button('キー追加', () => mutate(p => {
        const target = selectedElement(p), t = target.animations.find(t => t.property === track.property);
        const at = Math.max(0, Math.min(target.end - target.start, time - selectedScene(p).start - target.start));
        if (t.keyframes.some(k => Math.abs(k.time - at) < 1e-7)) throw new Error('現在位置には既にキーがあります。シークしてから追加してください。');
        t.keyframes.push({ time: at, value: LyricMotionEffects.sampleTrack(t, at), easing: 'ease-out' }); t.keyframes.sort((a, b) => a.time - b.time);
      })), button('動きを削除', () => mutate(p => { selectedElement(p).animations = selectedElement(p).animations.filter(t => t.property !== track.property); })));
      header.append(cell); $('keyframes').append(header);
      track.keyframes.forEach((key, index) => {
        const row = document.createElement('tr'); row.dataset.property = track.property; row.dataset.index = index;
        const cells = Array.from({ length: 5 }, () => { const td = document.createElement('td'); row.append(td); return td; }); cells[0].textContent = names[track.property];
        for (const [field, target] of [['time', cells[1]], ['value', cells[2]]]) { const input = document.createElement('input'); input.type = 'number'; input.step = '0.001'; if (field === 'value' && ['x', 'y'].includes(track.property)) setCoordinate(input, key[field]); else input.value = key[field]; input.dataset.key = field; input.setAttribute('aria-label', `${names[track.property]} キー${index + 1} ${field === 'time' ? '時刻' : '値'}`); target.append(input); }
        const select = document.createElement('select'); selectOptions(select, P.EASINGS, key.easing); cells[3].append(select); dialog.attach(select, { label: '補間方法' });
        cells[4].append(button('キー削除', () => mutate(p => { const t = selectedElement(p).animations.find(t => t.property === track.property); if (t.keyframes.length === 1) throw new Error('最後のキーを消す場合は「動きを削除」を使用してください。'); t.keyframes.splice(index, 1); })));
        $('keyframes').append(row);
      });
    }
  }
  async function change() {
    try { pause(); readEditor(); const current = revision; await R.prepareFonts(project); if (current !== revision) return; fillEditor(); if (draw()) message('変更を反映しました。JSON保存で演出を保存できます。'); }
    catch (error) { message(error.message, true); }
  }
  $('settings').addEventListener('change', event => { if (!event.target.closest('.reference-controls')) change(); }); $('scene-settings').addEventListener('change', change); $('keyframes').addEventListener('change', change);
  $('track-tools').addEventListener('click', event => { const prop = event.target.dataset.track; if (!prop) return; mutate(p => {
    const e = selectedElement(p); const initial = prop === 'opacity' ? 1 : ['x', 'y'].includes(prop) ? e.position[prop] : e.transform[prop];
    e.animations.push(P.track(prop, [[0, initial], [e.end - e.start, initial]]));
  }); });
  $('add-scene').addEventListener('click', () => mutate(p => { const start = Math.min(time, p.project.duration - 0.1); const scene = { id: newId('scene'), name: '新しいScene', start, end: Math.min(start + 3, p.project.duration), elements: [] }; p.scenes.push(scene); sceneId = scene.id; elementId = null; }));
  $('remove-scene').addEventListener('click', () => { if (confirm('選択Sceneと中のElementを削除しますか？')) mutate(p => { p.scenes = p.scenes.filter(s => s.id !== sceneId); sceneId = null; elementId = null; }); });
  $('add-element').addEventListener('click', () => mutate(p => { const s = selectedScene(p), e = P.element('新しい文字', 0, s.end - s.start, newId('text'), selectedElement(p)?.style || p.styles.default); s.elements.push(e); elementId = e.id; }));
  $('remove-element').addEventListener('click', () => mutate(p => { const s = selectedScene(p); s.elements = s.elements.filter(e => e.id !== elementId); elementId = null; }));
  for (const [id, delta] of [['move-back', -1], ['move-front', 1]]) $(id).addEventListener('click', () => mutate(p => {
    const items = selectedScene(p).elements, i = items.findIndex(e => e.id === elementId), j = i + delta;
    if (j >= 0 && j < items.length) [items[i], items[j]] = [items[j], items[i]];
  }));
  function splitRows(text, characters = false, newlines = $('split-newlines').checked) {
    const normalized = text.replace(/\r\n?/g, '\n');
    if (characters) return normalized.split('\n').map(line => R.graphemes(line));
    if (newlines) return normalized.split('\n').map(line => line.split(/[|｜]/).filter(part => part.trim().length));
    return [normalized.split(/[|｜]/).map(part => part.replace(/^\n+|\n+$/g, '')).filter(part => part.trim().length)];
  }
  function updateSplitPreview() {
    const parts = splitRows($('element-text').value).flat();
    $('split-preview').textContent = `分割後: ${parts.length} Element · ${parts.map(text => `「${text}」`).join(' / ')}`;
  }
  $('element-text').addEventListener('input', updateSplitPreview);
  $('split-newlines').addEventListener('change', event => { event.stopPropagation(); updateSplitPreview(); });
  async function splitElement(characters) {
    if (busy) return;
    try {
      pause(); readEditor(); const current = revision, newlines = $('split-newlines').checked; await R.prepareFonts(project);
      if (current !== revision || busy) return;
      mutate(p => {
        const s = selectedScene(p), source = selectedElement(p), rows = splitRows(source.text, characters, newlines);
        if (rows.flat().length < 2) throw new Error(characters ? '分解する文字を2文字以上入力してください。' : '本文を |・｜で2つ以上に区切ってください。改行で分ける場合はチェックを入れてください。');
        const count = p.scenes.reduce((sum, scene) => sum + scene.elements.length, 0) - 1 + rows.flat().length;
        if (count > 1000) throw new Error('分割後のElementが上限の1000個を超えます。');
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${source.style.fontWeight} ${source.style.fontSize}px ${source.style.fontFamily}`;
        const { width, height } = p.project, scale = source.transform.scale;
        const padding = Math.max(source.style.strokeWidth, source.style.glowBlur) * 2;
        const measure = text => { const chars = R.graphemes(text); return Math.max(1, chars.reduce((sum, char) => sum + ctx.measureText(char).width, 0) + source.style.letterSpacing * Math.max(0, chars.length - 1)); };
        const gap = characters ? Math.max(0, source.style.letterSpacing) * scale : source.style.fontSize * 0.3 * scale;
        const rowHeight = source.style.fontSize * source.style.lineHeight * scale;
        const placedRows = [];
        for (const row of rows) {
          let items = [], used = 0;
          for (const text of row) {
            const lines = text.split('\n');
            const itemWidth = (Math.max(...lines.map(measure)) + padding) * scale;
            const itemHeight = rowHeight * lines.length + padding * scale;
            if (itemWidth > width * 0.9) throw new Error('画面幅を超えるフレーズがあります。区切りを増やすか文字サイズ・基準倍率を小さくしてください。');
            if (items.length && used + gap + itemWidth > width * 0.9) { placedRows.push(items); items = []; used = 0; }
            items.push({ text, width: itemWidth, height: itemHeight }); used += (items.length > 1 ? gap : 0) + itemWidth;
          }
          placedRows.push(items);
        }
        const heights = placedRows.map(row => Math.max(rowHeight + padding * scale, ...row.map(item => item.height)));
        const totalHeight = heights.reduce((sum, value) => sum + value, 0);
        if (totalHeight > height * 0.9) throw new Error('分割後の配置が画面の高さを超えます。文字サイズ・基準倍率を小さくしてください。');
        const top = Math.max(height * 0.05, Math.min(height * 0.95 - totalHeight, source.position.y * height - totalHeight / 2));
        const parts = []; let rowTop = top;
        placedRows.forEach((row, rowIndex) => {
          const total = row.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, row.length - 1);
          let left = Math.max(width * 0.05, Math.min(width * 0.95 - total, source.position.x * width - total / 2));
          for (const item of row) {
            const e = P.clone(source); e.id = newId(characters ? 'char' : 'phrase'); e.text = item.text;
            const next = { x: (left + item.width / 2) / width, y: (rowTop + heights[rowIndex] / 2) / height };
            for (const key of ['x', 'y']) {
              const delta = next[key] - source.position[key]; e.position[key] = next[key];
              const track = e.animations.find(t => t.property === key); if (track) for (const frame of track.keyframes) frame.value += delta;
            }
            parts.push(e); left += item.width + gap;
          }
          rowTop += heights[rowIndex];
        });
        const index = s.elements.findIndex(e => e.id === source.id); s.elements.splice(index, 1, ...parts); elementId = parts[0].id;
        message(`${parts.length} Elementへ分割しました。画面内で折り返し、元の時間・デザイン・動きをコピーしています。`);
      });
    } catch (error) { message(error.message, true); }
  }
  $('distribute-timing').addEventListener('click', async () => {
    if (busy) return;
    try {
      pause(); readEditor(); const scene = selectedScene();
      if (!scene) throw new Error('Sceneを選択してください。');
      const next = P.distributeSceneTiming(scene), candidate = P.clone(project);
      candidate.scenes[candidate.scenes.findIndex(s => s.id === scene.id)] = next; P.validate(candidate);
      const review = $('timing-review'), items = $('timing-review-items'); items.replaceChildren();
      $('timing-review-info').textContent = `${scene.name} · ${(scene.end - scene.start).toFixed(3)}秒 / ${scene.elements.length} Element · 1個あたり ${((scene.end - scene.start) / scene.elements.length).toFixed(6)}秒（Scene内の時刻）`;
      next.elements.forEach((e, i) => {
        const item = document.createElement('p'); item.textContent = `${i + 1}. ${e.start.toFixed(6)}〜${e.end.toFixed(6)}秒 · ${e.text}`; items.append(item);
      });
      lock(true);
      try {
        const confirmed = await new Promise(resolve => {
          review.addEventListener('close', () => resolve(review.returnValue === 'apply'), { once: true }); review.returnValue = 'cancel'; review.showModal();
          for (const b of review.querySelectorAll('button')) b.disabled = false;
        });
        if (!confirmed) { message('時間の均等配分をキャンセルしました。'); return; }
      } finally { lock(false); fillEditor(); }
      mutate(p => {
        p.scenes[p.scenes.findIndex(s => s.id === next.id)] = next;
        message(`${next.elements.length} Elementへ時間を均等に振り分けました。曲に合わせて手直ししてください。`);
      });
    } catch (error) { message(error.message, true); }
  });
  $('split-element').addEventListener('click', () => splitElement(true));
  $('split-phrases').addEventListener('click', () => splitElement(false));
  for (const [id, key] of [['set-element-start', 'start'], ['set-element-end', 'end']]) $(id).addEventListener('click', () => mutate(p => {
    const s = selectedScene(p), e = selectedElement(p), at = time - s.start;
    if (at < 0 || at > s.end - s.start || (key === 'start' ? at >= e.end : at <= e.start)) throw new Error('現在位置をElementの有効な開始・終了に設定できません。');
    const previousDuration = e.end - e.start; e[key] = at;
    P.retimeAnimations(e, previousDuration);
    message('現在のプレビュー位置を設定し、Animationのキー時刻を区間の長さに合わせました。');
  }));
  $('export-settings').addEventListener('change', updateExportRange);
  for (const [id, key] of [['set-export-start', 'start'], ['set-export-end', 'end']]) $(id).addEventListener('click', () => { $(`export-${key}`).value = time.toFixed(3); updateExportRange(); });
  function lock(value) {
    busy = value; for (const e of document.querySelectorAll('button, input, select, textarea')) e.disabled = value;
    $('cancel').disabled = !value; updatePlacementControls(); dialog.refresh(); colorPicker.refresh(); updateReference(); updateBulkControls();
  }
  async function writeFile(directory, name, blob) {
    const writable = await (await directory.getFileHandle(name, { create: true })).createWritable();
    try { await writable.write(blob); await writable.close(); } catch (error) { await writable.abort().catch(() => {}); throw error; }
  }
  async function runExport(format) {
    if (busy) return; let directory = null, writable = null, completed = false;
    try {
      pause(); readEditor(); const rangeOptions = exportOptions(); E.resolveRange(project, rangeOptions); lock(true); controller = new AbortController(); $('progress').value = 0; $('progress-text').textContent = '保存先を選択'; let target = null;
      if (format === 'png') {
        if (!window.showDirectoryPicker) throw new Error('PNG連番はフォルダー保存に対応したChrome等で利用してください。');
        const parent = await window.showDirectoryPicker({ mode: 'readwrite' }); if (controller.signal.aborted) throw new DOMException('中止', 'AbortError');
        directory = await parent.getDirectoryHandle(newId('lyric-motion'), { create: true }); await writeFile(directory, 'project.lyricmotion.json', jsonBlob(project));
      } else if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({ suggestedName: 'lyric-motion.mp4', types: [{ description: 'MP4動画', accept: { 'video/mp4': ['.mp4'] } }] });
        if (controller.signal.aborted) throw new DOMException('中止', 'AbortError'); writable = await handle.createWritable(); target = new Mediabunny.StreamTarget(writable);
      }
      $('progress-text').textContent = '書き出し準備中';
      const result = await E.exportProject(project, { ...rangeOptions, format, target, signal: controller.signal, writePng: directory ? (name, blob) => writeFile(directory, name, blob) : null,
        onProgress: ({ completed, total, elapsedSeconds }) => { $('progress').value = completed / total; $('progress-text').textContent = `${completed} / ${total} フレーム · ${elapsedSeconds.toFixed(1)}秒`; } });
      if (directory) await writeFile(directory, 'export-report.json', jsonBlob(result.report));
      if (result.buffer) download(new Blob([result.buffer], { type: 'video/mp4' }), 'lyric-motion.mp4'); completed = true;
      $('progress-text').textContent = `完了 · ${result.report.frameCount}フレーム`; message('動く文字素材を書き出しました。');
    } catch (error) { const canceled = error.name === 'AbortError'; $('progress-text').textContent = canceled ? '中止' : '失敗'; message(`${canceled ? '書き出しを中止しました。' : error.message}${directory ? ' 途中のファイルは出力フォルダーへ残しています。' : ''}`, !canceled); }
    finally { if (writable && !completed) await writable.abort().catch(() => {}); controller = null; lock(false); fillEditor(); draw(); }
  }
  $('seek').addEventListener('input', () => setTime(numeric($('seek'))));
  $('play').addEventListener('click', async () => {
    if (playing) { pause(); return; }
    try { readEditor(); const current = revision; await R.prepareFonts(project); if (current !== revision || busy) return;
      if (time >= project.project.duration || (audioUrl && time >= $('audio').duration)) setTime(0);
      if (audioUrl) { $('audio').currentTime = time; await $('audio').play(); }
      clockStart = performance.now() - time * 1000; playing = true; placement?.setEnabled(false); $('play').textContent = '一時停止';
    } catch (error) { message(error.message, true); }
  });
  $('audio').addEventListener('ended', pause); $('audio').addEventListener('error', () => { pause(); message('音源を再生できません。対応形式を選択してください。', true); });
  $('audio-file').addEventListener('change', () => { const file = $('audio-file').files[0]; if (!file) return; if (file.size > 200 * 1024 * 1024) { message('音源は200MB以下にしてください。', true); return; }
    clearAudio(); audioFile = file; audioUrl = URL.createObjectURL(file); $('audio').src = audioUrl; project.audio = { source: file.name }; $('audio-name').textContent = file.name; time = 0; draw(); });
  $('audio-clear').addEventListener('click', () => { project.audio = null; clearAudio(); });
  $('sample').addEventListener('click', async () => { if (!confirm('編集内容を文字演出サンプルで置き換えますか？')) return; project = P.sample(); saveHandles.clear(); motionUndo = null; sequenceSelection = ''; bulkIds.clear(); revision++; sceneId = project.scenes[0].id; elementId = project.scenes[0].elements[1].id; clearAudio(); time = 1.5; $('export-scope').value = 'all'; $('export-start').value = 0; $('export-end').value = project.project.duration; fillEditor(); await R.prepareFonts(project); draw(); });
  async function saveProject(mode) {
    if (busy) return; let writable = null;
    try {
      pause(); readEditor(); const format = $('save-format').value, bundle = format === 'bundle';
      if (bundle && project.audio && !audioFile) throw new Error('音源が未接続です。音源を再選択するか、音源を外してから素材込み保存してください。');
      lock(true);
      const extension = bundle ? '.lyricmotion.zip' : '.lyricmotion.json', name = `project${extension}`;
      let handle = mode === 'save' ? saveHandles.get(format) : null;
      if (mode !== 'download' && window.showSaveFilePicker && !handle) handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: bundle ? '素材込みプロジェクト' : 'プロジェクトJSON', accept: bundle ? { 'application/zip': ['.zip'] } : { 'application/json': ['.json'] } }] });
      const blob = bundle ? await LyricMotionBundle.pack(project, audioFile, referenceFile, { visible: $('reference-visible').checked, fit: document.querySelector('input[name="reference-fit"]:checked').value }) : jsonBlob(project);
      if (handle) {
        writable = await handle.createWritable(); await writable.write(blob); await writable.close(); writable = null; saveHandles.set(format, handle);
        message(`${handle.name}へ保存しました。次回の保存で上書きできます。`);
      } else { download(blob, name); message(`${bundle ? '素材込みプロジェクト' : 'プロジェクトJSON'}をダウンロードしました。`); }
    } catch (error) { if (writable) await writable.abort().catch(() => {}); message(error.name === 'AbortError' ? '保存をキャンセルしました。' : error.message, error.name !== 'AbortError'); }
    finally { lock(false); }
  }
  $('save').addEventListener('click', () => saveProject('save'));
  $('save-as').addEventListener('click', () => saveProject('as'));
  $('download-project').addEventListener('click', () => saveProject('download'));
  async function loadFile(input, callback) {
    const file = input.files[0]; if (!file || busy) return; let result;
    const bundle = input.id === 'load' && /\.zip$/i.test(file.name);
    try { pause(); lock(true); if (file.size > (bundle ? LyricMotionBundle.LIMIT : 2 * 1024 * 1024)) throw new Error(bundle ? '素材込みファイルは240MB以下にしてください。' : '読込ファイルは2MB以下にしてください。');
      result = await callback(bundle ? null : await file.text(), file.name, file); if (result.cancelled) { message('台本の読み込みをキャンセルしました。'); return; } await R.prepareFonts(result.project); project = result.project; saveHandles.clear(); motionUndo = null; sequenceSelection = ''; bulkIds.clear(); revision++; sceneId = project.scenes[0]?.id; elementId = project.scenes[0]?.elements[0]?.id;
      clearAudio();
      if (result.bundle) {
        clearReference();
        if (result.audio) { audioFile = result.audio; audioUrl = URL.createObjectURL(audioFile); $('audio').src = audioUrl; $('audio-name').textContent = audioFile.name; }
        if (result.reference) { referenceFile = result.reference; referenceUrl = result.referenceURL; result.referenceURL = null; $('reference-image').src = referenceUrl; $('reference-name').textContent = referenceFile.name; }
        $('reference-visible').checked = !!referenceFile && result.view.visible;
        document.querySelector(`input[name="reference-fit"][value="${result.view.fit}"]`).checked = true;
        $('preview-background').checked = false; $('save-format').value = 'bundle'; updateReference();
      } else if (input.id === 'load') $('save-format').value = 'json';
      $('export-scope').value = 'all'; $('export-start').value = 0; $('export-end').value = project.project.duration; time = project.scenes[0]?.start || 0; message(result.note || (result.migrated ? '初版JSONをScene形式へ移行しました。保存はv2形式です。' : '読み込みました。'));
    } catch (error) { message(error.message, true); } finally { if (result?.referenceURL) URL.revokeObjectURL(result.referenceURL); input.value = ''; lock(false); fillEditor(); draw(); }
  }
  $('load').addEventListener('change', () => loadFile($('load'), async (text, name, file) => {
    if (text !== null) { const raw = JSON.parse(text); return { project: P.validate(raw), migrated: raw.schemaVersion === 1 }; }
    const result = await LyricMotionBundle.unpack(file); result.project = P.validate(result.project); result.bundle = true;
    if (result.reference) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(result.reference.type)) throw new Error('参照画像の形式が未対応です。');
      const url = URL.createObjectURL(result.reference);
      try { const image = new Image(); image.src = url; await image.decode(); if (image.naturalWidth > 8192 || image.naturalHeight > 8192 || image.naturalWidth * image.naturalHeight > 32000000) throw new Error('参照画像の画素数が上限を超えています。'); result.referenceURL = url; }
      catch (error) { URL.revokeObjectURL(url); throw error; }
    }
    return result;
  }));
  $('subtitle-file').addEventListener('change', () => loadFile($('subtitle-file'), (text, name) => {
    const p = P.clone(readEditor()); const cues = /\.lrc$/i.test(name) ? P.parseLrc(text, p.project.duration) : /\.srt$/i.test(name) ? P.parseSrt(text) : null;
    if (!cues) throw new Error('LRCまたはSRTを選択してください。'); p.scenes = P.fromCues(cues, p); return { project: P.validate(p) };
  }));
  const positionLabels = ['左上', '上中央', '右上', '左中央', '中央', '右中央', '左下', '下中央', '右下'];
  function positionGrid(mount, action, selected = null) {
    mount.replaceChildren(...L.POSITIONS.map((position, i) => {
      const b = button(positionLabels[i], () => {
        if (selected !== null) { for (const other of mount.children) other.setAttribute('aria-pressed', String(other === b)); }
        action(position);
      }); b.dataset.position = position;
      if (selected !== null) b.setAttribute('aria-pressed', String(position === selected)); return b;
    }));
  }
  async function placeTargets(position, ids) {
    if (busy || !ids.length) return;
    try {
      pause(); readEditor(); const current = revision; await R.prepareFonts(project); if (current !== revision || busy) return;
      mutate(p => {
        const ctx = document.createElement('canvas').getContext('2d');
        const measure = (text, style) => { ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`; const chars = R.graphemes(text); return chars.reduce((n, char) => n + ctx.measureText(char).width, 0) + Math.max(0, chars.length - 1) * style.letterSpacing; };
        for (const e of selectedScene(p).elements.filter(e => ids.includes(e.id))) Object.assign(e, L.placeElement(e, p.project, position, measure));
        message(`${ids.length} Elementと移動軌道を配置しました。ドラッグで微調整できます。`);
      });
    } catch (error) { message(error.message, true); }
  }
  positionGrid($('element-position-grid'), position => placeTargets(position, elementId ? [elementId] : []));
  positionGrid($('bulk-position-grid'), position => placeTargets(position, [...bulkIds]));
  function reviewScript(script, base, measure) {
    const review = $('script-review'), summary = $('script-summary'); let candidate, placementWarnings;
    const refresh = position => {
    placementWarnings = []; candidate = L.build(script, base, measure, { defaultPosition: position, warnings: placementWarnings }); summary.replaceChildren();
    for (const warning of placementWarnings) { const item = document.createElement('p'); item.className = 'hint'; item.textContent = `${warning.line}行目・${warning.name}: ${warning.message}`; summary.append(item); }
    const info = document.createElement('p'); info.textContent = `${script.scenes.length} Scene / ${script.scenes.reduce((n, s) => n + s.parts.length, 0)} Element / ${script.duration.toFixed(3)}秒`; summary.append(info);
    for (const warning of script.warnings) {
      const item = document.createElement('p'); item.className = 'hint'; item.textContent = `${warning.line}行目: ${warning.message} · ${warning.text}`; summary.append(item);
    }
    for (const scene of script.scenes) {
      const item = document.createElement('article'), title = document.createElement('h3'), body = document.createElement('pre');
      title.textContent = `${scene.name} · ${scene.start.toFixed(3)}〜${scene.end.toFixed(3)}秒 · ${scene.parts.length} Element · ${scene.positionSpecified ? scene.position : position} · ${scene.motion || '動きなし'}`;
      body.textContent = scene.phrases.map((phrase, i) => `${i + 1}. Scene内 ${phrase.start.toFixed(3)}〜${phrase.end.toFixed(3)}秒${phrase.explicit ? '' : '（Scene全体）'} · ${phrase.text}`).join('\n\n'); item.append(title, body); summary.append(item);
    }
    };
    positionGrid($('script-position-grid'), refresh, 'center'); refresh('center');
    return new Promise(resolve => {
      review.addEventListener('close', () => resolve(review.returnValue === 'apply' ? { project: candidate, note: placementWarnings.length ? `読み込みました。${placementWarnings.length} Sceneは仮配置です。時間・位置を調整してください。` : null } : { cancelled: true }), { once: true });
      review.returnValue = 'cancel'; review.showModal();
      for (const button of review.querySelectorAll('button')) button.disabled = false;
    });
  }
  $('script-file').addEventListener('change', () => loadFile($('script-file'), async text => {
    const script = LyricMotionScript.parse(text), base = P.clone(readEditor());
    const style = base.styles.default;
    await LyricMotionFonts.loadStyle(style, script.scenes.flatMap(s => s.parts).join('')); await document.fonts.ready;
    const ctx = document.createElement('canvas').getContext('2d'); ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
    const measure = text => { const chars = R.graphemes(text); return chars.reduce((n, char) => n + ctx.measureText(char).width, 0) + Math.max(0, chars.length - 1) * style.letterSpacing; };
    return reviewScript(script, base, measure);
  }));
  $('still').addEventListener('click', async () => { try { readEditor(); await R.prepareFonts(project); const canvas = document.createElement('canvas'), stillRenderer = new R.Renderer(canvas);
    try { stillRenderer.render(project, time); download(await E.pngBlob(canvas), `lyric-${time.toFixed(3)}.png`); } finally { stillRenderer.cache.clear(); canvas.width = 1; canvas.height = 1; } draw(); } catch (error) { message(error.message, true); } });
  $('export-png').addEventListener('click', () => runExport('png')); $('export-mp4').addEventListener('click', () => runExport('mp4')); $('cancel').addEventListener('click', () => controller?.abort());
  // 自動保存は明示的なファイル保存と別。未選択の前回作業を上書きしない。
  let recoveryReady = false, recoveryWriting = false, recoveryPending = null, recoveryFingerprint = '', recoveryAudio = null, recoveryReference = null;
  const recoveryStatus = text => { $('recovery-status').textContent = text; };
  function recoveryState() {
    return { schema: 'lyric-motion.recovery.v1', project: P.clone(project), time: Math.round(time * 1000) / 1000, sceneId, elementId,
      view: { visible: $('reference-visible').checked, fit: document.querySelector('input[name="reference-fit"]:checked').value, background: $('preview-background').checked, seekOnSelect: $('seek-on-select').checked, format: $('save-format').value } };
  }
  async function autoSaveWork() {
    if (!recoveryReady || recoveryPending || recoveryWriting || busy) return;
    const state = recoveryState(), fingerprint = JSON.stringify(state);
    if (fingerprint === recoveryFingerprint && audioFile === recoveryAudio && referenceFile === recoveryReference) return;
    recoveryWriting = true;
    const nextAudio = audioFile, nextReference = referenceFile, changes = {};
    if (nextAudio !== recoveryAudio) changes.audio = nextAudio;
    if (nextReference !== recoveryReference) changes.reference = nextReference;
    try {
      await LyricMotionRecovery.write({ ...state, savedAt: Date.now() }, changes);
      recoveryFingerprint = fingerprint; recoveryAudio = nextAudio; recoveryReference = nextReference;
      recoveryStatus(`自動保存済み ${new Date().toLocaleTimeString()}（このブラウザ内）`);
    } catch (error) { recoveryStatus(`自動保存できません: ${error.message}。JSON／素材込みZIPで保存してください。`); }
    finally { recoveryWriting = false; }
  }
  $('restore-work').addEventListener('click', async () => {
    if (!recoveryPending || busy) return; let imageUrl;
    try {
      pause(); lock(true); const { state, audio, reference } = recoveryPending;
      if (state.schema !== 'lyric-motion.recovery.v1') throw new Error('復帰データの形式が未対応です。');
      const candidate = P.validate(state.project);
      if (!state.view || !['contain', 'cover'].includes(state.view.fit) || typeof state.time !== 'number' || !Number.isFinite(state.time)) throw new Error('復帰データの表示設定が不正です。');
      if (audio && (!(audio instanceof Blob) || audio.size > 200 * 1024 * 1024 || audio.name !== candidate.audio?.source)) throw new Error('復帰音源が不正です。');
      if (reference) {
        if (!(reference instanceof Blob) || reference.size > 30 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(reference.type)) throw new Error('復帰画像が不正です。');
        imageUrl = URL.createObjectURL(reference); const image = new Image(); image.src = imageUrl; await image.decode();
        if (image.naturalWidth > 8192 || image.naturalHeight > 8192 || image.naturalWidth * image.naturalHeight > 32000000) throw new Error('復帰画像の画素数が上限を超えています。');
      }
      await R.prepareFonts(candidate);
      project = candidate; revision++; motionUndo = null; sequenceSelection = ''; bulkIds.clear(); saveHandles.clear();
      clearAudio(); clearReference();
      if (audio) { audioFile = audio; audioUrl = URL.createObjectURL(audio); $('audio').src = audioUrl; $('audio-name').textContent = audio.name; }
      if (reference) { referenceFile = reference; referenceUrl = imageUrl; imageUrl = null; $('reference-image').src = referenceUrl; $('reference-name').textContent = reference.name; }
      sceneId = state.sceneId; elementId = state.elementId; time = Math.max(0, Math.min(project.project.duration, state.time));
      $('reference-visible').checked = !!reference && state.view.visible; document.querySelector(`input[name="reference-fit"][value="${state.view.fit}"]`).checked = true;
      $('preview-background').checked = !!state.view.background; $('seek-on-select').checked = state.view.seekOnSelect !== false; $('save-format').value = state.view.format === 'bundle' ? 'bundle' : 'json';
      $('export-scope').value = 'all'; $('export-start').value = 0; $('export-end').value = project.project.duration;
      recoveryPending = null; $('recovery-actions').hidden = true; recoveryAudio = audioFile; recoveryReference = referenceFile;
      recoveryStatus('前回の作業を復元しました。保存先ファイルは選び直してください。'); message('前回の作業を復元しました。');
    } catch (error) { recoveryStatus(`復元できません: ${error.message}。再試行か、前回の作業を破棄してください。`); }
    finally { if (imageUrl) URL.revokeObjectURL(imageUrl); lock(false); fillEditor(); draw(); }
  });
  $('discard-work').addEventListener('click', async () => {
    if (busy) return;
    try { lock(true); await LyricMotionRecovery.clear(); recoveryPending = null; $('recovery-actions').hidden = true; recoveryFingerprint = JSON.stringify(recoveryState()); recoveryAudio = null; recoveryReference = null; recoveryStatus('前回の作業を破棄しました。変更後は自動保存します。'); }
    catch (error) { recoveryStatus(`破棄できません: ${error.message}`); }
    finally { lock(false); }
  });
  async function initializeRecovery() {
    try {
      // 同じURLの複数タブが交互に前回作業を上書きするのを防ぐ。
      if (navigator.locks) {
        const acquired = await new Promise((resolve, reject) => {
          navigator.locks.request('lyric-motion-recovery-owner', { ifAvailable: true }, lock => {
            resolve(!!lock); if (!lock) return;
            return new Promise(release => window.addEventListener('pagehide', release, { once: true }));
          }).catch(reject);
        });
        if (!acquired) { recoveryStatus('別タブが自動保存を使用中です。このタブではファイル保存を使ってください。'); return; }
      }
      const previous = await LyricMotionRecovery.read();
      recoveryFingerprint = JSON.stringify(recoveryState()); recoveryReady = true;
      if (previous.state) { recoveryPending = previous; $('recovery-actions').hidden = false; recoveryStatus(`前回の作業があります（${new Date(previous.state.savedAt).toLocaleString()}）。復元／破棄を選ぶまで自動保存は待機します。`); }
      else recoveryStatus('自動保存待機中（変更後、このブラウザ内に保存）');
    } catch (error) { recoveryStatus(`自動保存は利用できません: ${error.message}。ファイル保存を使ってください。`); }
  }
  fillEditor(); await R.prepareFonts(project); draw();
  window.addEventListener('pagehide', () => { recoveryReady = false; });
  window.addEventListener('pageshow', event => { if (event.persisted) initializeRecovery(); });
  await initializeRecovery();
  setInterval(autoSaveWork, 3000);
  for (const event of ['change', 'click', 'pointerup']) document.addEventListener(event, () => setTimeout(autoSaveWork, 700));
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoSaveWork(); });
  function tick() { if (playing && !busy) { time = Math.min(project.project.duration, audioUrl ? $('audio').currentTime : (performance.now() - clockStart) / 1000); if (time >= project.project.duration) pause(); draw(); } requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
})();
