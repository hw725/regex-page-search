// 화면 문구 번역(_locales) 대조 — 코드에 남긴 한국어(번역이 없을 때 쓰는 문구)와 _locales/ko 가 같아야 하고,
// en 에 빠진 열쇠가 없어야 한다. 어긋나면 한국어 화면과 Node 시험이 서로 다른 문장을 보게 된다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const locale = (l) => JSON.parse(read(`_locales/${l}/messages.json`));
const ko = locale("ko"), en = locale("en");
// "$a$" 같은 이름 자리표시를 내용("$1")으로 되돌린다 — chrome.i18n 이 하는 일
const expand = (m) => m.message.replace(/\$(\w+)\$/g, (_, n) => m.placeholders[n].content);

// 코드의 t("열쇠", "한국어", …) / RPSt("열쇠", "한국어", …)
function codeStrings() {
  const out = [];
  for (const f of ["src/core.js", "src/content.js", "popup.js"]) {
    for (const m of read(f).matchAll(/\b(?:t|RPSt)\("(\w+)", ("(?:[^"\\]|\\.)*")/g)) out.push([f, m[1], JSON.parse(m[2])]);
  }
  return out;
}

// popup.html 의 data-i18n(글자)·data-i18n-<속성>
function htmlStrings() {
  const html = read("popup.html"), out = [];
  for (const m of html.matchAll(/<\w+([^>]*)>([^<]*)/g)) {
    const attrs = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "data-i18n") out.push([v, m[2]]);
      else if (k.startsWith("data-i18n-")) out.push([v, attrs[k.slice("data-i18n-".length)]]);
    }
  }
  return out;
}

test("코드의 한국어 = _locales/ko", () => {
  const seen = codeStrings();
  assert.ok(seen.length >= 20, `t() 호출을 ${seen.length}개만 찾았다 — 정규식이 놓치는지 본다`);
  for (const [f, k, s] of seen) {
    assert.ok(ko[k], `${f}: ${k} 가 ko 에 없다`);
    assert.equal(expand(ko[k]), s, `${f}: ${k}`);
  }
});

test("popup.html 의 한국어 = _locales/ko", () => {
  const seen = htmlStrings();
  assert.ok(seen.length >= 14, `data-i18n 을 ${seen.length}개만 찾았다`); // 지금 14개
  for (const [k, s] of seen) {
    assert.ok(ko[k], `popup.html: ${k} 가 ko 에 없다`);
    assert.equal(expand(ko[k]), s, `popup.html: ${k}`);
  }
});

test("manifest 의 __MSG_…__ 가 모두 있다", () => {
  for (const m of read("manifest.json").matchAll(/__MSG_(\w+)__/g)) {
    assert.ok(ko[m[1]] && en[m[1]], m[1]);
  }
});

test("ko·en 열쇠와 자리표시가 같다", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ko).sort());
  for (const k of Object.keys(ko)) {
    assert.deepEqual(Object.keys(en[k].placeholders || {}), Object.keys(ko[k].placeholders || {}), k);
    for (const l of [ko, en]) {
      for (const n of l[k].message.matchAll(/\$(\w+)\$/g)) assert.ok(l[k].placeholders?.[n[1]], `${k}: $${n[1]}$ 정의 없음`);
    }
  }
});

test("스토어 길이 제한: 이름 75자·설명 132자 이하", () => {
  for (const l of [ko, en]) {
    assert.ok([...l.extName.message].length <= 75, l.extName.message);
    assert.ok([...l.extDesc.message].length <= 132, `${[...l.extDesc.message].length}자: ${l.extDesc.message}`);
  }
});
