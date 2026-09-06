import * as fs from 'node:fs';
import path from 'node:path';
import { id, clone, seal, verify, demand, FoldError } from './model.js';

export class Store {
  constructor(directory, { fault = () => {}, writable = true } = {}) { demand(typeof directory === 'string' && directory.length > 0, 'DATA_DIR_REQUIRED'); this.directory = path.resolve(directory);
    demand(!this.directory.replaceAll('\\', '/').includes('/plugins/cache/'), 'INSTALL_CACHE_DATA_FORBIDDEN');
    this.fault = fault; this.writable = writable; }
  readEnvelope() {
    if (!fs.existsSync(this.directory)) return { generation: 0, digest: null, state: {} };
    const files = fs.readdirSync(this.directory).filter(f => /^\d{12}\.json$/.test(f)).sort();
    let previous = { generation: 0, digest: null, state: {} };
    for (const name of files) {
      let entry;
      try { entry = JSON.parse(fs.readFileSync(path.join(this.directory, name), 'utf8')); } catch { throw new FoldError('STORE_CORRUPT'); }
      demand(entry.schemaVersion === 1, 'STORE_VERSION_UNSUPPORTED'); verify(entry);
      demand(entry.generation === previous.generation + 1 && name === `${String(entry.generation).padStart(12, '0')}.json` && entry.previousDigest === previous.digest, 'STORE_CHAIN_BROKEN');
      previous = entry;
    }
    return previous;
  }
  read() { return clone(this.readEnvelope().state); }
  transaction(fn) {
    demand(this.writable, 'DATA_DIR_REQUIRED');
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const lock = path.join(this.directory, 'writer.lock');
    let fd;
    try { fd = fs.openSync(lock, 'wx', 0o600); } catch (e) { if (e.code === 'EEXIST') throw new FoldError('STORE_LOCKED', 'Writer lock present; do not steal a possibly live lock.'); throw e; }
    let temp;
    try {
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() })); fs.fsyncSync(fd);
      const previous = this.readEnvelope(); const state = clone(previous.state);
      const result = fn(state);
      demand(!result || typeof result.then !== 'function', 'ASYNC_TRANSACTION_FORBIDDEN');
      const entry = seal({ schemaVersion: 1, createdAt: Date.now(), generation: previous.generation + 1, previousDigest: previous.digest, state });
      this.fault('before_write');
      temp = path.join(this.directory, id('.pending'));
      const out = fs.openSync(temp, 'wx', 0o600);
      try { fs.writeFileSync(out, JSON.stringify(entry)); fs.fsyncSync(out); } finally { fs.closeSync(out); }
      this.fault('before_commit');
      fs.linkSync(temp, path.join(this.directory, `${String(entry.generation).padStart(12, '0')}.json`));
      const dir = fs.openSync(this.directory, 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
      this.fault('after_commit');
      return result === undefined ? undefined : clone(result);
    } finally {
      if (temp && fs.existsSync(temp)) fs.unlinkSync(temp);
      fs.closeSync(fd); fs.unlinkSync(lock);
    }
  }
}
