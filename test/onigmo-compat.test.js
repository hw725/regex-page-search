// Onigmo/EmEditor 식 유니코드 속성 표기 호환 — 2026-10-16 사용자 지적:
// 「\p{hangul}+\(\p{han}+\) 이걸로 검색해봤는데 전혀 안 돼」 (JS 는 \p{Script=Hangul} 처럼 써야 해서 문법 오류였다)
import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/core.js";

const { compile, findAll } = globalThis.RPS;

function count(pattern, text, opts) {
  const c = compile(pattern, opts);
  assert.ok(!c.error, `${pattern}: ${c.error}`);
  return findAll(text, c.re).matches.length;
}

test("사용자가 쓴 패턴 그대로 — 소문자 스크립트 이름", () => {
  assert.equal(count("\\p{hangul}+\\(\\p{han}+\\)", "한글(漢字) 가나(かな) 학이(學而)"), 2);
});

test("스크립트 이름은 대소문자·밑줄·공백을 가리지 않는다", () => {
  assert.equal(count("\\p{Hangul}", "가a"), 1);
  assert.equal(count("\\p{HAN}", "漢a"), 1);
  assert.equal(count("\\p{old italic}", "\u{10300}a"), 1);
  assert.equal(count("\\p{Old_Italic}", "\u{10300}a"), 1);
});

test("부정: \\P{…} 와 Onigmo 식 \\p{^…}", () => {
  assert.equal(count("\\P{Han}", "漢a字"), 1);
  assert.equal(count("\\p{^Han}", "漢a字"), 1);
});

test("일반 범주·이진 속성도 대소문자를 가리지 않는다", () => {
  assert.equal(count("\\p{lu}", "Ab"), 1);
  assert.equal(count("\\p{letter}+", "ab 가나"), 2);
  assert.equal(count("\\p{ideographic}", "漢a"), 1);
  assert.equal(count("\\p{alpha}+", "ab12"), 1);
});

test("Onigmo POSIX 식 이름: Digit·Space", () => {
  assert.equal(count("\\p{Digit}+", "a12b٣"), 2);
  assert.equal(count("\\p{Space}", "a b"), 1);
});

test("문자 집합 안에서도 바꾼다", () => {
  assert.equal(count("[\\p{han}\\p{hangul}]+", "漢字한글 abc"), 1);
});

test("이미 JS 식인 표기는 그대로 둔다", () => {
  const c = compile("\\p{Script=Han}\\p{sc=Hang}\\p{L}");
  assert.ok(!c.error, c.error);
  assert.ok(!c.note, "바꾼 것이 없으면 안내문도 없다");
});

test("바꾼 내용은 안내문으로 알린다", () => {
  const c = compile("\\p{hangul}");
  assert.match(c.note || "", /\\p\{hangul\}.*\\p\{Script=Hangul\}/);
});

test("이스케이프한 백슬래시 뒤의 p{…} 는 속성이 아니다", () => {
  // \\p{han} = 백슬래시 문자 + p{han} — JS 에서는 p{han} 이 수량자처럼 보여 오류가 날 수 있지만, 바꾸지는 않아야 한다
  const c = compile("\\\\p\\{han\\}");
  assert.ok(!c.error, c.error);
  assert.equal(findAll("\\p{han}", c.re).matches.length, 1);
});

test("모르는 속성 이름은 한국어 안내와 함께 오류", () => {
  const c = compile("\\p{nosuchscript}");
  assert.ok(c.error);
  assert.match(c.error, /알 수 없는 유니코드 속성/);
});
