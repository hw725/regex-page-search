// 웹 스토어에 올릴 zip 을 만든다: node scripts/build-zip.mjs → dist/regex-page-search-<판>.zip
// 확장이 실행할 때 쓰는 파일(RUNTIME)만 담는다 — 저장소를 통째로 압축하면 node_modules·시험·계약 파일까지 올라간다.
// 바깥 의존성 없이 zip 을 쓰고 읽는다(zlib 의 deflateRaw·crc32). readZip 은 test/package.test.js 가 쓴다.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 파일은 그대로, 폴더는 안의 파일 전부. E2E(scripts/e2e-capture.mjs)도 이 목록으로 확장 사본을 만든다
export const RUNTIME = ["manifest.json", "background.js", "popup.html", "popup.css", "popup.js", "src", "_locales", "icons"];

export function runtimeFiles() {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(ROOT, rel);
    if (fs.statSync(abs).isDirectory()) for (const n of fs.readdirSync(abs).sort()) walk(path.posix.join(rel, n));
    else out.push(rel);
  };
  for (const r of RUNTIME) walk(r);
  return out;
}

// zip 안 시각은 고정한다(1980-01-01 00:00) — 같은 내용이면 같은 zip 이 나온다
const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1;

export function buildZip(outPath) {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const locals = [], centrals = [];
  let offset = 0;
  for (const name of runtimeFiles()) {
    const data = fs.readFileSync(path.join(ROOT, name));
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const nameBuf = Buffer.from(name, "utf8");
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(DOS_TIME, 10); h.writeUInt16LE(DOS_DATE, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nameBuf.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10); c.writeUInt16LE(DOS_TIME, 12); c.writeUInt16LE(DOS_DATE, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    locals.push(h, nameBuf, comp);
    centrals.push(c, nameBuf);
    offset += h.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([...locals, cd, end]));
  return { version, count: centrals.length / 2 };
}

// 중앙 디렉터리로 읽는다 → Map<이름, 내용>
export function readZip(buf) {
  const e = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (e < 0) throw new Error("zip 끝 표지가 없다");
  const n = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const out = new Map();
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("중앙 디렉터리가 깨졌다");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), klen = buf.readUInt16LE(p + 32);
    const lo = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");
    const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
    const raw = buf.subarray(start, start + csize);
    out.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nlen + xlen + klen;
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const out = path.join(ROOT, "dist", `regex-page-search-${version}.zip`);
  const r = buildZip(out);
  console.log(`${path.relative(ROOT, out)} — 파일 ${r.count}개, ${fs.statSync(out).size} 바이트`);
}
