(function (root) {
  'use strict';
  const MAX_SIZE = 200 * 1024 * 1024;
  const abort = signal => { if (signal?.aborted) throw new DOMException('書き出しを中止しました。', 'AbortError'); };
  function loopPosition(songTime, duration) {
    if (!Number.isFinite(songTime) || songTime < 0 || !Number.isFinite(duration) || duration <= 0) throw new Error('背景動画の時刻・長さが不正です。');
    const cycle = Math.floor((songTime + 1e-7) / duration);
    return { cycle, time: Math.max(0, songTime - cycle * duration) };
  }
  async function prepare(file, fit, signal) {
    if (!(file instanceof Blob) || file.size > MAX_SIZE) throw new Error('背景動画は200MB以下にしてください。');
    if (!['contain', 'cover'].includes(fit)) throw new Error('背景動画の配置が不正です。');
    const B = root.Mediabunny, input = new B.Input({ source: new B.BlobSource(file), formats: B.ALL_FORMATS });
    let iterator, current, next, canvas, cycle = -1;
    async function reset() {
      current?.close(); next?.close(); current = next = null;
      if (iterator) { await iterator.return().catch(() => {}); iterator = null; }
    }
    async function dispose() { await reset(); input.dispose(); if (canvas) canvas.width = canvas.height = 1; }
    try {
      abort(signal);
      const track = await input.getPrimaryVideoTrack();
      if (!track || !await track.canDecode()) throw new Error('この背景動画を読み出せません。対応するH.264のMP4やWebMを選択してください。');
      const first = await track.getFirstTimestamp(), end = await track.computeDuration(), duration = end - first;
      const width = Math.round(await track.getDisplayWidth()), height = Math.round(await track.getDisplayHeight());
      if (!Number.isFinite(duration) || duration <= 0 || ![width, height].every(n => Number.isFinite(n) && n > 0 && n <= 8192) || width * height > 32000000) throw new Error('背景動画は長さが確定した各辺8192px以下・3200万画素以下の動画を使用してください。');
      canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d'), sink = new B.VideoSampleSink(track);
      async function render(songTime) {
        abort(signal);
        const position = loopPosition(songTime, duration), at = first + position.time;
        // 各ループを順次デコード。範囲出力ではその曲時刻のループ位置から読み出す。
        if (cycle !== position.cycle || current && at < current.timestamp - 1e-7) {
          await reset(); cycle = position.cycle; iterator = sink.samples(at, end);
          current = (await iterator.next()).value;
          if (!current) throw new Error('背景動画のフレームが見つかりません。');
          next = (await iterator.next()).value;
        }
        while (next && next.timestamp <= at + 1e-7) {
          current.close(); current = next; next = null;
          abort(signal); next = (await iterator.next()).value;
        }
        abort(signal);
        context.clearRect(0, 0, width, height); current.draw(context, 0, 0, width, height);
      }
      return { background: { image: canvas, fit }, duration, render, dispose };
    } catch (error) { await dispose(); throw error; }
  }
  const api = { prepare, loopPosition, MAX_SIZE };
  root.LyricMotionVideo = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
