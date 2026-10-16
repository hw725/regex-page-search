import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/core.js";

const { linearize, compile, findAll, toRangeSpec } = globalThis.RPS;

// ── 가짜 DOM: 태그 이름만으로 블록·pre 여부를 정한다 ──
const BLOCK = new Set(["BODY", "DIV", "P", "LI", "UL", "H1", "PRE", "TABLE", "TR", "BLOCKQUOTE"]);
const env = {
  skip: (el) => el.nodeName === "SCRIPT" || el.nodeName === "STYLE",
  boundary: (el) => (el.nodeName === "TD" ? "cell" : BLOCK.has(el.nodeName) ? "block" : null),
  ws: (p) => {
    for (let n = p; n; n = n.parentNode) {
      if (n.nodeName === "PRE") return "pre";
      if (n.nodeName === "PL") return "pre-line";
    }
    return "normal";
  },
};
function el(name, ...kids) {
  const n = { nodeType: 1, nodeName: name, childNodes: [], parentNode: null };
  for (const k of kids) {
    const c = typeof k === "string" ? { nodeType: 3, nodeName: "#text", nodeValue: k } : k;
    c.parentNode = n;
    n.childNodes.push(c);
  }
  return n;
}
const t = (s) => s; // 가독성용

// 일치를 노드 범위로 되돌려 실제 노드 글자를 이어 붙인 결과(강조될 글자)
function covered(segs, s, e) {
  const r = toRangeSpec(segs, s, e);
  if (!r) return null;
  // 시작 노드부터 끝 노드까지 seg 순서대로 모은다
  let out = "", on = false;
  for (const g of segs) {
    for (let k = 0; k < g.offs.length; k++) {
      const atStart = g.node === r.startNode && g.offs[k] === r.startOffset;
      if (atStart) on = true;
      if (on) out += g.node.nodeValue[g.offs[k]];
      if (g.node === r.endNode && g.offs[k] + 1 === r.endOffset) return out;
    }
  }
  return out;
}

function search(root, pattern, opts) {
  const { text, segs } = linearize(root, env);
  const c = compile(pattern, opts);
  assert.ok(!c.error, c.error);
  return { text, segs, ...findAll(text, c.re) };
}

test("블록 경계마다 줄이 나뉘고 ^ $ 는 줄 단위다", () => {
  const body = el("BODY", el("P", t("第一章")), el("DIV", el("P", t("第二章"))), el("P", t("序 第三")));
  const { text, matches } = search(body, "^第.章$");
  assert.equal(text, "第一章\n第二章\n序 第三\n"); // 문서 맨 앞에는 빈 줄을 만들지 않는다
  assert.equal(matches.length, 2);
});

test("<br> 는 줄을 나누고 연속 <br> 은 빈 줄을 만든다", () => {
  const body = el("BODY", el("P", t("가"), el("BR"), el("BR"), t("나")));
  const { text } = linearize(body, env);
  assert.equal(text, "가\n\n나\n");
});

test("일반 텍스트의 소스 줄바꿈·연속 공백은 공백 하나로 접힌다", () => {
  const body = el("BODY", el("P", t("  學而\n      時習之  ")));
  const { text, segs, matches } = search(body, "學而 時習之");
  assert.equal(text, "學而 時習之\n");
  assert.equal(matches.length, 1);
  // 접힌 공백은 원문 공백 연속의 첫 글자(여기서는 소스 줄바꿈)에 대응한다
  assert.equal(covered(segs, ...matches[0]), "學而\n時習之");
});

test("pre 안의 줄바꿈과 공백은 그대로 남는다", () => {
  const body = el("BODY", el("PRE", t("  a\n    b")));
  const { text, matches } = search(body, "^ {4}b$");
  assert.equal(text, "  a\n    b\n");
  assert.equal(matches.length, 1);
});

test("pre-line 은 줄바꿈만 남기고 공백은 접는다", () => {
  const body = el("BODY", el("PL", t("a    b\nc")));
  const { text } = linearize(body, env);
  assert.equal(text, "a b\nc\n");
});

test("여러 노드에 걸친 일치가 시작·끝 노드로 정확히 되돌아간다", () => {
  const b = el("B", t("學而"));
  const body = el("BODY", el("P", t("子曰"), b, t("時習之")));
  const { segs, matches } = search(body, "曰學而時");
  assert.equal(matches.length, 1);
  const r = toRangeSpec(segs, ...matches[0]);
  assert.equal(r.startNode.nodeValue, "子曰");
  assert.equal(r.startOffset, 1);
  assert.equal(r.endNode.nodeValue, "時習之");
  assert.equal(r.endOffset, 1);
});

test("블록을 넘는 일치(\\n 포함)는 앞뒤 가상 줄바꿈을 잘라 낸다", () => {
  const body = el("BODY", el("P", t("甲")), el("P", t("乙")));
  const { segs, matches } = search(body, "甲\\n乙\\n");
  assert.equal(matches.length, 1);
  const r = toRangeSpec(segs, ...matches[0]);
  assert.equal(r.startNode.nodeValue, "甲");
  assert.equal(r.startOffset, 0);
  assert.equal(r.endNode.nodeValue, "乙");
  assert.equal(r.endOffset, 1);
  const lead = search(body, "\\n乙");
  const r2 = toRangeSpec(lead.segs, ...lead.matches[0]);
  assert.equal(r2.startNode.nodeValue, "乙");
  assert.equal(r2.startOffset, 0);
});

test("가상 글자만 일치하면 칠할 범위가 없다", () => {
  const body = el("BODY", el("P", t("甲")), el("P", t("乙")));
  const { segs, matches } = search(body, "\\n");
  assert.ok(matches.length >= 1);
  for (const m of matches) assert.equal(toRangeSpec(segs, ...m), null);
});

test("확장 B 이후 한자(서로게이트 쌍)는 한 글자로 센다", () => {
  const body = el("BODY", el("P", t("𠀀𠀁𠀂")), el("P", t("𪜀一")));
  const r1 = search(body, "^.{3}$");
  assert.equal(r1.matches.length, 1, ". 이 서로게이트 반쪽과 일치하면 6글자로 보여 실패한다");
  const r2 = search(body, "[𠀀-𪛟]");
  assert.equal(r2.matches.length, 3);
  const r3 = search(body, "\\p{Script=Han}");
  assert.equal(r3.matches.length, 5);
  // 강조 범위 끝이 서로게이트 쌍 뒤쪽까지 포함한다
  const spec = toRangeSpec(r1.segs, ...r1.matches[0]);
  assert.equal(spec.endOffset, 6);
});

test("빈 일치(^ 단독)는 서로게이트 중간에서 멈추지 않고 칠할 목록에서 빠진다", () => {
  const body = el("BODY", el("P", t("𠀀𠀁")));
  const { matches, empty } = search(body, "(?:)");
  assert.equal(matches.length, 0);
  // 텍스트 「𠀀𠀁\n」(코드 단위 5)에서 코드포인트 경계 0·2·4·5 의 4곳. 서로게이트 중간(1·3)에서 멈추면 6곳이 된다
  assert.equal(empty, 4);
});

test("페이지 텍스트는 정규화하지 않는다 — 호환 한자는 통합 한자와 구별된다", () => {
  const compat = "樂"; // 樂 (CJK COMPATIBILITY IDEOGRAPH-F914, 독음 「낙」)
  const unified = "樂"; // 樂
  assert.equal(compat.normalize("NFC"), unified, "전제: NFC 는 이 둘을 같게 만든다");
  const body = el("BODY", el("P", t(`快${compat}`)), el("P", t(`音${unified}`)));
  const { text } = linearize(body, env);
  assert.ok(text.includes(compat), "호환 한자가 그대로 남아야 한다");
  assert.equal(search(body, compat).matches.length, 1);
  assert.equal(search(body, unified).matches.length, 1);
});

test("NFD 한글도 바꾸지 않는다(오프셋 보존)", () => {
  const nfd = "한글".normalize("NFD");
  const body = el("BODY", el("P", t(nfd)));
  const { text, segs } = linearize(body, env);
  assert.equal(text, nfd + "\n");
  assert.equal(segs[0].offs.length, nfd.length);
});

test("script·style 은 건너뛰고 표 칸은 탭으로 나뉜다", () => {
  const body = el("BODY", el("SCRIPT", t("var 第=1")), el("TABLE", el("TR", el("TD", t("名")), el("TD", t("字")))));
  const { text } = linearize(body, env);
  assert.equal(text, "名\t字\n");
});

test("v 플래그에서 오류인 [(] 같은 패턴은 u 로 내려가 안내문을 단다", () => {
  const c = compile("[(]");
  assert.ok(!c.error);
  assert.match(c.flags, /u$/);
  assert.ok(c.note);
  const ok = compile("第");
  assert.match(ok.flags, /^gmv$/);
});

test("문법 오류는 메시지로 돌려준다", () => {
  assert.ok(compile("(").error);
  assert.ok(compile("").error);
});

test("대소문자 무시·dotAll 옵션", () => {
  const body = el("BODY", el("P", t("Abc")), el("P", t("aBC")));
  assert.equal(search(body, "abc", { ignoreCase: true }).matches.length, 2);
  assert.equal(search(body, "c.a").matches.length, 0);
  assert.equal(search(body, "c.a", { dotAll: true }).matches.length, 1);
});

test("일치 상한을 넘으면 잘라 내고 표시한다", () => {
  const { text } = linearize(el("BODY", el("P", t("a".repeat(50)))), env);
  const r = findAll(text, compile("a").re, 10);
  assert.equal(r.matches.length, 10);
  assert.equal(r.truncated, true);
});
