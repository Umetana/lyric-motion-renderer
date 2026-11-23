(function (root) {
  'use strict';
  const MAX = 0xffffffff, encoder = new TextEncoder();
  const table = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
  function crc(bytes) { let c = 0xffffffff; for (const byte of bytes) c = table[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  // 画像本体は書込後に保持せず、終端の中央ディレクトリ用メタデータだけ残す。
  function create(writable) {
    let offset = 0, chain = Promise.resolve(), failure = null, state = 'open';
    const entries = [], names = new Set(), date = new Date();
    const dosDate = ((Math.max(1980, Math.min(2107, date.getFullYear())) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    function add(name, blob) {
      if (state !== 'open') return Promise.reject(new Error('ZIPは既に終了しています。'));
      if (typeof name !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(name) || name === '.' || name === '..' || names.has(name)) return Promise.reject(new Error('ZIP内のファイル名が不正または重複しています。'));
      if (!(blob instanceof Blob) || blob.size >= MAX) return Promise.reject(new Error('ZIP内の1ファイルは4GB未満にしてください。'));
      names.add(name);
      const task = chain.then(async () => {
        if (failure) throw failure;
        const bytes = new Uint8Array(await blob.arrayBuffer()), checksum = crc(bytes), encoded = encoder.encode(name);
        const header = new Uint8Array(30 + encoded.length), view = new DataView(header.buffer);
        view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true); view.setUint16(10, dosTime, true); view.setUint16(12, dosDate, true);
        view.setUint32(14, checksum, true); view.setUint32(18, blob.size, true); view.setUint32(22, blob.size, true); view.setUint16(26, encoded.length, true); header.set(encoded, 30);
        await writable.write(new Blob([header, blob]));
        entries.push({ name: encoded, size: blob.size, checksum, offset }); offset += header.length + blob.size;
      });
      chain = task.catch(error => { failure ||= error; }); return task;
    }
    async function finish() {
      if (state !== 'open') throw new Error('ZIPは既に終了しています。');
      state = 'finishing'; await chain; if (failure) throw failure;
      const start = offset, central = [];
      for (const entry of entries) {
        const large = entry.offset >= MAX, header = new Uint8Array(46 + entry.name.length + (large ? 12 : 0)), view = new DataView(header.buffer);
        view.setUint32(0, 0x02014b50, true); view.setUint16(4, large ? 45 : 20, true); view.setUint16(6, large ? 45 : 20, true); view.setUint16(8, 0x800, true); view.setUint16(12, dosTime, true); view.setUint16(14, dosDate, true);
        view.setUint32(16, entry.checksum, true); view.setUint32(20, entry.size, true); view.setUint32(24, entry.size, true); view.setUint16(28, entry.name.length, true); view.setUint16(30, large ? 12 : 0, true); view.setUint32(42, large ? MAX : entry.offset, true); header.set(entry.name, 46);
        if (large) { const at = 46 + entry.name.length; view.setUint16(at, 1, true); view.setUint16(at + 2, 8, true); view.setBigUint64(at + 4, BigInt(entry.offset), true); }
        central.push(header); offset += header.length;
      }
      await writable.write(new Blob(central));
      const size = offset - start, zip64 = offset >= MAX || entries.length >= 65535;
      if (zip64) {
        const header = new Uint8Array(76), view = new DataView(header.buffer);
        view.setUint32(0, 0x06064b50, true); view.setBigUint64(4, 44n, true); view.setUint16(12, 45, true); view.setUint16(14, 45, true);
        view.setBigUint64(24, BigInt(entries.length), true); view.setBigUint64(32, BigInt(entries.length), true); view.setBigUint64(40, BigInt(size), true); view.setBigUint64(48, BigInt(start), true);
        view.setUint32(56, 0x07064b50, true); view.setBigUint64(64, BigInt(offset), true); view.setUint32(72, 1, true); await writable.write(header); offset += header.length;
      }
      const end = new Uint8Array(22), view = new DataView(end.buffer); view.setUint32(0, 0x06054b50, true);
      view.setUint16(8, Math.min(entries.length, 65535), true); view.setUint16(10, Math.min(entries.length, 65535), true); view.setUint32(12, Math.min(size, MAX), true); view.setUint32(16, Math.min(start, MAX), true);
      await writable.write(end); state = 'finished';
      return { fileCount: entries.length, bytes: offset + end.length, zip64 };
    }
    return { add, finish };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LyricMotionPngZip = api;
})(globalThis);
