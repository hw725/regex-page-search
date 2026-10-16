// 최근 사용·즐겨찾기 목록 — 2026-10-16 사용자 요청:
// 「자주 쓰는 정규식이나 최근에 사용한 정규식 저장해서 불러올 수 있게 해줘」
import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/history.js";

const H = globalThis.RPSHistory;
const e = (p, o) => H.entry(p, o);

test("최근 목록은 최신순이고 같은 항목은 맨 앞으로 옮겨진다", () => {
  let l = [];
  l = H.addRecent(l, e("a"));
  l = H.addRecent(l, e("b"));
  l = H.addRecent(l, e("a"));
  assert.deepEqual(l.map((x) => x.pattern), ["a", "b"]);
});

test("같은 패턴이라도 옵션이 다르면 다른 항목이다", () => {
  let l = [];
  l = H.addRecent(l, e("a"));
  l = H.addRecent(l, e("a", { ignoreCase: true }));
  assert.equal(l.length, 2);
  assert.equal(H.badge(l[0]), "i");
});

test("최근 목록은 상한(기본 20)을 넘지 않는다", () => {
  let l = [];
  for (let i = 0; i < 30; i++) l = H.addRecent(l, e("p" + i));
  assert.equal(l.length, H.RECENT_MAX);
  assert.equal(l[0].pattern, "p29");
});

test("빈 패턴은 기록하지 않는다", () => {
  assert.deepEqual(H.addRecent([], e("")), []);
});

test("즐겨찾기 토글: 없으면 더하고 있으면 뺀다", () => {
  let r = H.toggleFavorite([], e("\\p{Script=Hangul}+\\(\\p{Script=Han}+\\)"));
  assert.equal(r.added, true);
  assert.equal(H.isFavorite(r.list, e("\\p{Script=Hangul}+\\(\\p{Script=Han}+\\)")), true);
  r = H.toggleFavorite(r.list, e("\\p{Script=Hangul}+\\(\\p{Script=Han}+\\)"));
  assert.equal(r.list.length, 0);
});

test("즐겨찾기 상한에 닿으면 더하지 않고 알린다", () => {
  const full = Array.from({ length: 3 }, (_, i) => e("f" + i));
  const r = H.toggleFavorite(full, e("new"), 3);
  assert.equal(r.full, true);
  assert.equal(r.list.length, 3);
});

test("저장소에서 깨진 값이 와도 목록 함수가 견딘다", () => {
  assert.deepEqual(H.addRecent(undefined, e("a")).map((x) => x.pattern), ["a"]);
  assert.deepEqual(H.remove([null, { pattern: 3 }, e("a")], e("b")).map((x) => x.pattern), ["a"]);
});

test("백슬래시·한자·확장 B 한자가 든 패턴도 그대로 보존된다", () => {
  const p = "^第.章$|\\p{Script=Han}|𠀀";
  const l = H.addRecent([], e(p));
  assert.equal(JSON.parse(JSON.stringify(l))[0].pattern, p);
});
