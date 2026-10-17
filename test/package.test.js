// 웹 스토어 배포 zip 검사 — 2026-10-17 사용자 요청:
// 「이 크롬 익스텐션 공식적으로 발행이 가능할까? … 발행 가능하면 모든 과정을 쭉 진행해줘.」
// 스토어는 zip 안의 manifest 와 아이콘만 보고 심사한다. 저장소에서 잘 돌아도 zip 에 빠진 파일이 있으면 설치가 깨진다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildZip, readZip } from "../scripts/build-zip.mjs";

const out = join(mkdtempSync(join(tmpdir(), "rps-zip-")), "pkg.zip");
const { version } = buildZip(out);
const entries = readZip(readFileSync(out)); // Map<이름, Buffer>
const manifest = JSON.parse(entries.get("manifest.json").toString("utf8"));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const pngSize = (buf) => {
  assert.equal(buf.subarray(1, 4).toString("latin1"), "PNG", "PNG 서명이 아니다");
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
};

test("manifest·package.json 판 번호가 같다", () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(version, manifest.version);
});

test("아이콘 16·32·48·128 이 있고 실제 크기가 맞다", () => {
  for (const n of ["16", "32", "48", "128"]) {
    const p = manifest.icons && manifest.icons[n];
    assert.ok(p, `icons.${n} 이 manifest 에 없다`);
    assert.ok(entries.has(p), `${p} 이 zip 에 없다`);
    assert.deepEqual(pngSize(entries.get(p)), [Number(n), Number(n)], p);
    assert.equal(manifest.action.default_icon[n], p, `action.default_icon.${n}`);
  }
});

test("manifest 가 참조하는 파일이 모두 들어 있다", () => {
  const refs = [manifest.background.service_worker, manifest.action.default_popup];
  const html = entries.get(manifest.action.default_popup).toString("utf8");
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) refs.push(m[1]);
  // executeScript 로 넣는 파일
  for (const f of ["background.js", "popup.js"]) {
    for (const m of entries.get(f).toString("utf8").matchAll(/"(src\/[\w.-]+\.js)"/g)) refs.push(m[1]);
  }
  for (const r of refs) assert.ok(entries.has(r), `${r} 이 zip 에 없다`);
});

test("런타임 밖 파일이 없다", () => {
  const banned = /^(test|scripts|node_modules|\.harness|\.claude|\.git|dist|store)\/|^(package(-lock)?\.json|harness\.contract\.json|README\.md|\.gitignore|PRIVACY\.md)$/;
  for (const name of entries.keys()) assert.ok(!banned.test(name), `${name} 이 zip 에 들어갔다`);
});

test("원격 코드가 없다(MV3 정책)", () => {
  for (const [name, buf] of entries) {
    if (!/\.(js|html)$/.test(name)) continue;
    const s = buf.toString("utf8");
    assert.ok(!/<script[^>]+src="https?:/i.test(s), `${name}: 외부 script`);
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|\beval\s*\(|new Function\s*\(/.test(s), `${name}: 원격·동적 코드`);
  }
});
