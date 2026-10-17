// 화면 문구: 확장 안에서는 _locales/<언어>/messages.json(chrome.i18n), 없으면 둘째 인자의 한국어를 그대로 쓴다.
// 한국어를 코드에 남겨 두는 까닭 — core.js 는 Node 시험에서 chrome 없이 돌고, 시험은 한국어 문구를 본다.
// _locales/ko 와 이 한국어가 어긋나지 않는지는 test/i18n.test.js 가 본다.
"use strict";

globalThis.RPSt = function (key, ko, ...subs) {
  let m = "";
  try { m = chrome.i18n.getMessage(key, subs.map(String)); } catch (_) { /* chrome 없음(시험) */ }
  return m || subs.reduce((s, v, i) => s.replaceAll("$" + (i + 1), String(v)), ko);
};
