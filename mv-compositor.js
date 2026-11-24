(function (root) {
  'use strict';
  const abort = signal => { if (signal?.aborted) throw new DOMException('書き出しを中止しました。', 'AbortError'); };
  // 出力画像と同じ中央揃え。containの余白・透過画像の下地は黒にする。
  function imageRect(width, height, imageWidth, imageHeight, fit) {
    if (![width, height, imageWidth, imageHeight].every(n => Number.isFinite(n) && n > 0) || !['contain', 'cover'].includes(fit)) throw new Error('背景画像のサイズ・配置が不正です。');
    const scale = Math[fit === 'cover' ? 'max' : 'min'](width / imageWidth, height / imageHeight);
    return { x: (width - imageWidth * scale) / 2, y: (height - imageHeight * scale) / 2, width: imageWidth * scale, height: imageHeight * scale };
  }
  async function prepare(options, range, signal) {
    if (!(options.imageFile instanceof Blob) || !(options.audioFile instanceof Blob)) throw new Error('簡易MVには背景画像と音源を選択してください。');
    if (options.imageFile.size > 30 * 1024 * 1024 || options.audioFile.size > 200 * 1024 * 1024) throw new Error('背景画像は30MB以下、音源は200MB以下にしてください。');
    const fit = options.fit || 'contain';
    if (!['contain', 'cover'].includes(fit)) throw new Error('背景画像の配置が不正です。');
    const B = root.Mediabunny;
    let image, input, iterator, pending;
    async function dispose() {
      pending?.close(); pending = null;
      if (iterator) await iterator.return().catch(() => {});
      input?.dispose(); image?.close();
    }
    try {
      abort(signal);
      image = await createImageBitmap(options.imageFile);
      if (image.width > 8192 || image.height > 8192 || image.width * image.height > 32000000) throw new Error('背景画像は各辺8192px以下、合計3200万画素以下にしてください。');
      input = new B.Input({ source: new B.BlobSource(options.audioFile), formats: B.ALL_FORMATS });
      const track = await input.getPrimaryAudioTrack();
      if (!track || !await track.canDecode()) throw new Error('この音源を読み出せません。対応するMP3・WAV等を選び直してください。');
      const sampleRate = await track.getSampleRate(), channels = await track.getNumberOfChannels();
      if (![1, 2].includes(channels)) throw new Error('簡易MVの音源はモノラルまたはステレオを使用してください。');
      if (!await B.canEncodeAudio('aac', { sampleRate, numberOfChannels: channels, bitrate: 192000 })) throw new Error('この環境では音声付きMP4のAACエンコードを利用できません。対応するChrome／Edge等で試してください。');
      abort(signal);
      const source = new B.AudioSampleSource({ codec: 'aac', bitrate: 192000 });
      iterator = new B.AudioSampleSink(track).samples(range.start, range.end);
      pending = (await iterator.next()).value;
      let cursor = 0;
      const totalFrames = Math.max(1, Math.round(range.duration * sampleRate));
      async function add(data, frames) {
        abort(signal);
        const sample = new B.AudioSample({ format: 'f32-planar', data, sampleRate, numberOfChannels: channels, timestamp: cursor / sampleRate });
        try { await source.add(sample); cursor += frames; } finally { sample.close(); }
      }
      async function silence(endFrame) {
        while (cursor < endFrame) {
          const frames = Math.min(4096, endFrame - cursor);
          await add(new Float32Array(frames * channels), frames);
        }
      }
      async function writeUntil(songTime) {
        abort(signal);
        const until = Math.min(totalFrames, Math.max(0, Math.round((songTime - range.start) * sampleRate)));
        while (pending && pending.timestamp < songTime) {
          const sample = pending;
          if (sample.sampleRate !== sampleRate || sample.numberOfChannels !== channels) throw new Error('途中で音声形式が変わる音源には対応していません。');
          const start = Math.round((sample.timestamp - range.start) * sampleRate);
          await silence(Math.min(totalFrames, Math.max(cursor, start)));
          const offset = Math.max(0, cursor - start), frames = Math.min(sample.numberOfFrames - offset, totalFrames - cursor);
          if (frames > 0) {
            const data = new Float32Array(frames * channels);
            for (let channel = 0; channel < channels; channel++) sample.copyTo(data.subarray(channel * frames, (channel + 1) * frames), { planeIndex: channel, format: 'f32-planar', frameOffset: offset, frameCount: frames });
            await add(data, frames);
          }
          sample.close(); pending = null;
          abort(signal); pending = (await iterator.next()).value;
        }
        // 音源の開始前・終端後や欠落区間は無音。曲の時刻は動かさない。
        await silence(Math.min(until, pending ? Math.max(cursor, Math.round((pending.timestamp - range.start) * sampleRate)) : until));
      }
      return { background: { image, fit }, source, writeUntil, dispose };
    } catch (error) { await dispose(); throw error; }
  }
  const api = { imageRect, prepare };
  root.LyricMotionMV = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
