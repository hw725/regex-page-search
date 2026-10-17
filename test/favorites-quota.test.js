// 즐겨찾기는 storage.sync 의 「favorites」 키 하나에 통째로 들어간다. 키 하나의 한도(QUOTA_BYTES_PER_ITEM)는
// 8,192바이트(키 이름 + 값의 JSON)라서, 2026-10-17 발행 전 리뷰에서 《최대 200개》가 지켜지지 않음이 드러났다
// (짧은 패턴 200개만으로 10,500바이트 → 저장 실패, 화면에는 더해진 것처럼 보임).
import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/history.js";

const H = globalThis.RPSHistory;
const PER_ITEM = 8192;
const bytes = (list) => Buffer.byteLength("favorites" + JSON.stringify(list), "utf8");

function fill(make) {
  let list = [], r;
  for (let i = 0; i < 1000; i++) {
    r = H.toggleFavorite(list, H.entry(make(i), { ignoreCase: i % 2 === 0 }));
    if (r.full) break;
    list = r.list;
  }
  return { list, full: r.full };
}

test("짧은 패턴: 저장 한도를 넘기 전에 가득 참을 알린다", () => {
  const { list, full } = fill((i) => "p" + i);
  assert.equal(full, true);
  assert.ok(bytes(list) <= PER_ITEM, `${bytes(list)}바이트`);
});

test("긴 한자 패턴: UTF-8 바이트로 세어도 한도 안", () => {
  const { list, full } = fill((i) => "\\p{Script=Han}{2,}第" + "章".repeat(20) + i);
  assert.equal(full, true);
  assert.ok(list.length > 0);
  assert.ok(bytes(list) <= PER_ITEM, `${bytes(list)}바이트`);
});

test("가득 찬 뒤에도 빼기는 된다", () => {
  const { list } = fill((i) => "p" + i);
  const r = H.toggleFavorite(list, list[0]);
  assert.equal(r.full, false);
  assert.equal(r.list.length, list.length - 1);
});
