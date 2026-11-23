(function (root) {
  'use strict';
  function abort(signal) {
    if (signal?.aborted) throw new DOMException('書き出しを中止しました。', 'AbortError');
  }
  const pngBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNGの生成に失敗しました。')), 'image/png'));
  function resolveRange(input, options = {}) {
    const P = root.LyricMotionProject || (typeof require === 'function' ? require('./scene-project.js') : null);
    const project = P.validate(input), duration = project.project.duration;
    let start = options.start ?? 0, end = options.end ?? duration;
    if (options.sceneId !== undefined) {
      const scene = project.scenes.find(s => s.id === options.sceneId);
      if (!scene) throw new Error('書き出すSceneを選択してください。');
      start = scene.start; end = scene.end; project.scenes = [scene];
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration || start >= end) throw new Error('書き出し範囲は曲の0秒〜終端内で、開始より終了を後にしてください。');
    return { project, start, end, duration: end - start, frameCount: Math.max(1, Math.ceil((end - start) * project.project.fps - 1e-9)) };
  }
  async function exportProject(input, options) {
    const range = resolveRange(input, options), project = range.project;
    const { format, signal, onProgress = () => {}, writePng, target } = options;
    if (!['png', 'mp4'].includes(format)) throw new Error('未対応の出力形式です。');
    if (format === 'png' && !writePng) throw new Error('PNG保存先がありません。');
    const concurrency = options.pngConcurrency ?? 2;
    if (format === 'png' && ![1, 2].includes(concurrency)) throw new Error('PNGの同時処理数は1または2で指定してください。');
    abort(signal);
    await root.LyricMotionRenderer.prepareFonts(project);
    abort(signal);
    const canvas = document.createElement('canvas');
    const renderer = new root.LyricMotionRenderer.Renderer(canvas);
    const { width, height, fps } = project.project;
    const { duration, frameCount } = range;
    let output, source;
    const started = performance.now(), timings = { renderMs: 0, pngEncodeMs: 0, fileWriteMs: 0 };
    const pending = new Set(), pngStats = { bytes: 0, concurrency, maxInFlight: 0 };
    let writeError = null, completed = 0;
    const progress = () => onProgress({ completed: ++completed, total: frameCount, elapsedSeconds: (performance.now() - started) / 1000 });
    function enqueuePng(frameIndex) {
      const encodeStarted = performance.now();
      // toBlob呼出時のCanvasをスナップショットし、最大2枚だけを処理中にする。
      const encoded = pngBlob(canvas);
      const task = (async () => {
        const blob = await encoded; timings.pngEncodeMs += performance.now() - encodeStarted; pngStats.bytes += blob.size;
        abort(signal); if (writeError) return;
        const writeStarted = performance.now();
        await writePng(`frame_${String(frameIndex + 1).padStart(6, '0')}.png`, blob);
        timings.fileWriteMs += performance.now() - writeStarted;
        progress();
      })().catch(error => { writeError ||= error; }).finally(() => pending.delete(task));
      pending.add(task); pngStats.maxInFlight = Math.max(pngStats.maxInFlight, pending.size);
    }
    try {
      if (format === 'mp4') {
        if (!root.Mediabunny || typeof VideoEncoder === 'undefined') throw new Error('この環境ではMP4エンコードを利用できません。Chromeのlocalhost配信で試してください。');
        if (width % 2 || height % 2) throw new Error('MP4の幅・高さは偶数にしてください。');
        const { Output, Mp4OutputFormat, CanvasSource, BufferTarget, canEncodeVideo } = root.Mediabunny;
        const config = { width, height, frameRate: fps, bitrate: 12000000 };
        if (!await canEncodeVideo('avc', config)) throw new Error('この解像度・FPSでH.264を書き出せません。設定を下げてください。');
        abort(signal);
        canvas.width = width; canvas.height = height;
        // メモリ出力は短い技術検証だけに限定する。長時間は逐次保存する。
        if (!target && duration > 10) throw new Error('10秒を超えるMP4は逐次保存に対応したブラウザーで書き出してください。');
        output = new Output({ format: new Mp4OutputFormat({ fastStart: target ? false : 'in-memory' }), target: target || new BufferTarget() });
        source = new CanvasSource(canvas, { codec: 'avc', bitrate: 12000000 });
        output.addVideoTrack(source, { frameRate: fps });
        await output.start();
      }
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        abort(signal);
        while (format === 'png' && pending.size >= concurrency) { await Promise.race(pending); abort(signal); if (writeError) throw writeError; }
        if (writeError) throw writeError;
        const time = frameIndex / fps;
        const phaseStarted = performance.now();
        renderer.render(project, range.start + time, format === 'mp4' ? project.export.background : null);
        timings.renderMs += performance.now() - phaseStarted;
        if (format === 'png') enqueuePng(frameIndex);
        else { await source.add(time, 1 / fps); progress(); }
        if (frameIndex % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      await Promise.all(pending);
      abort(signal); if (writeError) throw writeError;
      if (output) { source.close(); await output.finalize(); }
      return { buffer: output && !target ? output.target.buffer : null, report: {
        schema: 'vct-lyric-motion.export-report.v1', format, width, height, fps, frameCount,
        duration: frameCount / fps, requestedDuration: duration, sourceStart: range.start, sourceEnd: range.end, sceneId: options.sceneId ?? null, audioIncluded: false,
        alpha: format === 'png', ...(format === 'png' ? { timings, pngStats } : {}), elapsedSeconds: (performance.now() - started) / 1000
      } };
    } catch (error) {
      // 中止／失敗後も処理中の画像化・書込を回収してから画面操作を戻す。
      await Promise.all(pending);
      if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {});
      throw error;
    } finally {
      renderer.cache.clear();
      canvas.width = 1; canvas.height = 1;
    }
  }
  root.LyricMotionExporter = { exportProject, pngBlob, resolveRange };
  if (typeof module === 'object' && module.exports) module.exports = root.LyricMotionExporter;
})(globalThis);
