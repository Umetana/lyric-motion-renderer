(function (root) {
  'use strict';
  const LIMIT = 240 * 1024 * 1024, JSON_LIMIT = 2 * 1024 * 1024;
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
  const table = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
  function crc(bytes) { let c = 0xffffffff; for (const b of bytes) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function check(ok) { if (!ok) throw new Error('素材込みプロジェクトが破損しているか、未対応の形式です。'); }
  const json = value => new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  // ZIP STORE方式。圧縮済みの音源・画像を再圧縮せず、標準ZIPとしてまとめる。
  async function pack(project, audio, reference, view) {
    const entries = [['project.json', json(project)]];
    if (entries[0][1].size > JSON_LIMIT) throw new Error('プロジェクトJSONは2MB以下にしてください。');
    if (project.audio && !audio) throw new Error('音源が未接続です。音源を再選択するか、音源を外してから素材込み保存してください。');
    const manifest = { schema: 'lyric-motion.bundle.v1', view, audio: null, reference: null };
    for (const [key, file, max] of [['audio', audio, 200], ['reference', reference, 30]]) if (file) {
      if (file.size > max * 1024 * 1024) throw new Error(`${key}の素材サイズが上限を超えています。`);
      manifest[key] = { name: file.name, type: file.type }; entries.push([`assets/${key}`, file]);
    }
    entries.push(['manifest.json', json(manifest)]);
    if (entries.reduce((sum, [, blob]) => sum + blob.size, 0) > LIMIT - 4096) throw new Error('素材込み保存は合計240MB以下にしてください。');
    const parts = [], central = []; let offset = 0, centralSize = 0;
    for (const [name, blob] of entries) {
      const bytes = new Uint8Array(await blob.arrayBuffer()), nameBytes = encoder.encode(name), checksum = crc(bytes);
      const local = new Uint8Array(30 + nameBytes.length), l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint32(14, checksum, true); l.setUint32(18, bytes.length, true); l.setUint32(22, bytes.length, true); l.setUint16(26, nameBytes.length, true); local.set(nameBytes, 30);
      const header = new Uint8Array(46 + nameBytes.length), c = new DataView(header.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint32(16, checksum, true); c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, nameBytes.length, true); c.setUint32(42, offset, true); header.set(nameBytes, 46);
      parts.push(local, bytes); central.push(header); offset += local.length + bytes.length; centralSize += header.length;
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer); e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }
  async function unpack(file) {
    check(file.size >= 22 && file.size <= LIMIT);
    const bytes = new Uint8Array(await file.arrayBuffer()), data = new DataView(bytes.buffer), end = bytes.length - 22;
    check(data.getUint32(end, true) === 0x06054b50 && data.getUint16(end + 4, true) === 0 && data.getUint16(end + 6, true) === 0 && data.getUint16(end + 20, true) === 0);
    const count = data.getUint16(end + 10, true), size = data.getUint32(end + 12, true), start = data.getUint32(end + 16, true);
    check(count >= 2 && count <= 4 && count === data.getUint16(end + 8, true) && start + size === end);
    const entries = new Map(); let cursor = start, localEnd = 0;
    for (let i = 0; i < count; i++) {
      check(cursor + 46 <= end && data.getUint32(cursor, true) === 0x02014b50);
      const length = data.getUint32(cursor + 24, true), nameLength = data.getUint16(cursor + 28, true), extra = data.getUint16(cursor + 30, true), comment = data.getUint16(cursor + 32, true), at = data.getUint32(cursor + 42, true), checksum = data.getUint32(cursor + 16, true);
      check(data.getUint16(cursor + 8, true) === 0x800 && data.getUint16(cursor + 10, true) === 0 && data.getUint32(cursor + 20, true) === length && cursor + 46 + nameLength + extra + comment <= end);
      const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
      check(['project.json', 'manifest.json', 'assets/audio', 'assets/reference'].includes(name) && !entries.has(name));
      const max = name === 'assets/audio' ? 200 * 1024 * 1024 : name === 'assets/reference' ? 30 * 1024 * 1024 : JSON_LIMIT;
      check(length <= max && at === localEnd && at + 30 <= start && data.getUint32(at, true) === 0x04034b50);
      const localName = data.getUint16(at + 26, true), localExtra = data.getUint16(at + 28, true), content = at + 30 + localName + localExtra;
      check(data.getUint16(at + 6, true) === 0x800 && data.getUint16(at + 8, true) === 0 && data.getUint32(at + 14, true) === checksum && data.getUint32(at + 18, true) === length && data.getUint32(at + 22, true) === length && content + length <= start && decoder.decode(bytes.subarray(at + 30, at + 30 + localName)) === name);
      const body = bytes.subarray(content, content + length); check(crc(body) === checksum); entries.set(name, new Blob([body])); localEnd = content + length;
      cursor += 46 + nameLength + extra + comment;
    }
    check(cursor === end && localEnd === start && entries.has('project.json') && entries.has('manifest.json'));
    const project = JSON.parse(await entries.get('project.json').text()), manifest = JSON.parse(await entries.get('manifest.json').text());
    check(manifest.schema === 'lyric-motion.bundle.v1');
    const result = { project, view: manifest.view };
    for (const key of ['audio', 'reference']) {
      const info = manifest[key], blob = entries.get(`assets/${key}`); check(!!info === !!blob);
      if (info) { check(typeof info.name === 'string' && info.name.length > 0 && info.name.length <= 1000 && typeof info.type === 'string' && info.type.length < 200); result[key] = new File([blob], info.name, { type: info.type }); }
      else result[key] = null;
    }
    check(!project.audio || result.audio && project.audio.source === result.audio.name);
    check(!result.audio || project.audio?.source === result.audio.name);
    check(result.view && typeof result.view.visible === 'boolean' && ['contain', 'cover'].includes(result.view.fit));
    return result;
  }
  const api = { pack, unpack, LIMIT };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LyricMotionBundle = api;
})(globalThis);
