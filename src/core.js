// regex-page-search 핵심 로직 — DOM API에 직접 기대지 않는다(Node 테스트에서 가짜 노드로 돌린다).
// content script(고전 스크립트)와 Node ESM 양쪽에서 읽히도록 import/export 없이 globalThis.RPS 에 싣는다.
//
// 오프셋은 전부 UTF-16 코드 단위다. JS 문자열·RegExp 결과·DOM Range 가 모두 이 단위라서 변환이 없다.
// 페이지 텍스트와 검색어는 정규화(NFC 등)하지 않는다 — 정규화는 CJK 호환 한자(U+F900–FAFF)를 통합 한자로
// 바꿔 독음 구분을 지우고, 글자 수가 바뀌어 오프셋 표도 어긋난다.
(function (root) {
  "use strict";

  // 문구 번역(src/i18n.js). Node 시험에는 i18n.js 가 없으므로 한국어에 $1… 만 채운다
  const t = root.RPSt || ((key, ko, ...subs) => subs.reduce((s, v, i) => s.replaceAll("$" + (i + 1), String(v)), ko));
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  const WS = /[ \t\n\r\f]/; // HTML 공백 정의(문서 공백 접기 대상). NBSP(U+00A0)·전각 공백(U+3000)은 접지 않는다

  /**
   * 노드 트리를 「화면에 보이는 줄」 기준의 한 문자열로 잇는다.
   *
   * env (브라우저에서는 getComputedStyle 기반, 테스트에서는 태그 기반):
   *   skip(el)    — 이 요소를 통째로 건너뛸지(script·style·숨김 등)
   *   boundary(el)— "block"(앞뒤 줄바꿈) | "cell"(뒤에 탭) | null(인라인)
   *   ws(el)      — 텍스트 노드 부모의 공백 처리: "normal" | "pre" | "pre-line"
   *
   * 반환: { text, segs }
   *   segs[i] = { node, start, end, offs } — text[start..end) 가 node 의 글자이고,
   *   offs[k] 는 text[start+k] 가 node 안에서 몇 번째 코드 단위인지. 가상 줄바꿈·탭은 어느 seg 에도 속하지 않는다.
   */
  function linearize(rootNode, env) {
    let text = "";
    const segs = [];
    let cur = null;          // 지금 채우는 seg
    let pending = null;      // 접힌 공백 하나 — 다음 보이는 글자 앞에서만 내보낸다 {node, off}

    function last() { return text.length ? text[text.length - 1] : ""; }

    function emitReal(node, off, ch) {
      if (!cur || cur.node !== node) {
        cur = { node, start: text.length, end: text.length, offs: [] };
        segs.push(cur);
      }
      cur.offs.push(off);
      text += ch;
      cur.end = text.length;
    }

    function flushPending() {
      if (pending) {
        const p = pending;
        pending = null;
        emitReal(p.node, p.off, " ");
      }
    }

    function emitVirtual(ch, force) {
      pending = null; // 줄 끝·칸 끝의 공백은 화면에 나오지 않는다
      cur = null;
      if (ch === "\n") {
        if (last() === "\t") text = text.slice(0, -1); // 표 행의 마지막 칸 뒤 탭은 줄바꿈으로 바꾼다(가상 글자라 seg 와 무관)
        if (!force && (text.length === 0 || last() === "\n")) return; // 블록 경계 줄바꿈은 겹치지 않는다
      } else if (text.length === 0 || last() === "\n" || last() === "\t") {
        return;
      }
      text += ch;
    }

    function walkText(node, mode) {
      const s = node.nodeValue || "";
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (mode === "pre") {
          flushPending();
          emitReal(node, i, ch);
          continue;
        }
        if (ch === "\n" && mode === "pre-line") {
          emitVirtualReal(node, i);
          continue;
        }
        if (WS.test(ch)) {
          const l = last();
          if (!pending && text.length && l !== "\n" && l !== "\t" && l !== " ") pending = { node, off: i };
          continue;
        }
        flushPending();
        emitReal(node, i, ch);
      }
    }

    // pre-line 의 원래 줄바꿈: 노드 안의 실제 글자이므로 seg 에 넣는다(강조 범위 끝으로 쓰일 수 있다)
    function emitVirtualReal(node, off) {
      pending = null;
      emitReal(node, off, "\n");
    }

    function walk(node) {
      if (node.nodeType === TEXT_NODE) {
        walkText(node, env.ws(node.parentNode));
        return;
      }
      if (node.nodeType !== ELEMENT_NODE && node.nodeType !== 9 && node.nodeType !== 11) return;
      if (node.nodeType === ELEMENT_NODE) {
        if (env.skip(node)) return;
        if (node.nodeName === "BR") { emitVirtual("\n", true); return; }
      }
      const b = node.nodeType === ELEMENT_NODE ? env.boundary(node) : null;
      if (b === "block") emitVirtual("\n", false);
      const kids = node.childNodes || [];
      for (let i = 0; i < kids.length; i++) walk(kids[i]);
      if (b === "block") emitVirtual("\n", false);
      else if (b === "cell") emitVirtual("\t", false);
    }

    walk(rootNode);
    return { text, segs };
  }

  // ── Onigmo/EmEditor 식 유니코드 속성 이름 → JS 식 ──
  // Onigmo 는 \p{Hangul}·\p{han}·\p{^Han} 을 받지만 JS 는 \p{Script=Hangul} 처럼 「Script=」와 정확한 대소문자가
  // 필요하다. 이름은 대소문자·밑줄·하이픈·공백을 무시하고 찾는다(Onigmo 와 같은 느슨한 대조).
  // 후보 목록에서 이 엔진이 실제로 받는 이름만 남긴다 — 목록이 엔진의 유니코드 판보다 앞서도 오류가 나지 않는다.
  const GC_NAMES = "L LC Lu Ll Lt Lm Lo M Mn Mc Me N Nd Nl No P Pc Pd Ps Pe Pi Pf Po S Sm Sc Sk So Z Zs Zl Zp C Cc Cf Cs Co Cn " +
    "Letter Cased_Letter Uppercase_Letter Lowercase_Letter Titlecase_Letter Modifier_Letter Other_Letter Mark Nonspacing_Mark " +
    "Spacing_Mark Enclosing_Mark Number Decimal_Number Letter_Number Other_Number Punctuation Connector_Punctuation " +
    "Dash_Punctuation Open_Punctuation Close_Punctuation Initial_Punctuation Final_Punctuation Other_Punctuation Symbol " +
    "Math_Symbol Currency_Symbol Modifier_Symbol Other_Symbol Separator Space_Separator Line_Separator Paragraph_Separator " +
    "Other Control Format Surrogate Private_Use Unassigned";
  const BINARY_NAMES = "ASCII ASCII_Hex_Digit Alphabetic Alpha Any Assigned Bidi_Control Bidi_Mirrored Case_Ignorable Cased " +
    "Changes_When_Casefolded Changes_When_Casemapped Changes_When_Lowercased Changes_When_NFKC_Casefolded " +
    "Changes_When_Titlecased Changes_When_Uppercased Dash Default_Ignorable_Code_Point Deprecated Diacritic Emoji " +
    "Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extended_Pictographic Extender Grapheme_Base " +
    "Grapheme_Extend Hex_Digit IDS_Binary_Operator IDS_Trinary_Operator ID_Continue ID_Start Ideographic Join_Control " +
    "Logical_Order_Exception Lowercase Lower Math Noncharacter_Code_Point Pattern_Syntax Pattern_White_Space Quotation_Mark " +
    "Radical Regional_Indicator Sentence_Terminal Soft_Dotted Terminal_Punctuation Unified_Ideograph Uppercase Upper " +
    "Variation_Selector White_Space XID_Continue XID_Start";
  const SCRIPT_NAMES = "Adlam Ahom Anatolian_Hieroglyphs Arabic Armenian Avestan Balinese Bamum Bassa_Vah Batak Bengali " +
    "Bhaiksuki Bopomofo Brahmi Braille Buginese Buhid Canadian_Aboriginal Carian Caucasian_Albanian Chakma Cham Cherokee " +
    "Chorasmian Common Coptic Cuneiform Cypriot Cypro_Minoan Cyrillic Deseret Devanagari Dives_Akuru Dogra Duployan " +
    "Egyptian_Hieroglyphs Elbasan Elymaic Ethiopic Georgian Glagolitic Gothic Grantha Greek Gujarati Gunjala_Gondi Gurmukhi " +
    "Han Hangul Hanifi_Rohingya Hanunoo Hatran Hebrew Hiragana Imperial_Aramaic Inherited Inscriptional_Pahlavi " +
    "Inscriptional_Parthian Javanese Kaithi Kannada Katakana Kawi Kayah_Li Kharoshthi Khitan_Small_Script Khmer Khojki " +
    "Khudawadi Lao Latin Lepcha Limbu Linear_A Linear_B Lisu Lycian Lydian Mahajani Makasar Malayalam Mandaic Manichaean " +
    "Marchen Masaram_Gondi Medefaidrin Meetei_Mayek Mende_Kikakui Meroitic_Cursive Meroitic_Hieroglyphs Miao Modi Mongolian " +
    "Mro Multani Myanmar Nabataean Nag_Mundari Nandinagari New_Tai_Lue Newa Nko Nushu Nyiakeng_Puachue_Hmong Ogham Ol_Chiki " +
    "Old_Hungarian Old_Italic Old_North_Arabian Old_Permic Old_Persian Old_Sogdian Old_South_Arabian Old_Turkic Old_Uyghur " +
    "Oriya Osage Osmanya Pahawh_Hmong Palmyrene Pau_Cin_Hau Phags_Pa Phoenician Psalter_Pahlavi Rejang Runic Samaritan " +
    "Saurashtra Sharada Shavian Siddham SignWriting Sinhala Sogdian Sora_Sompeng Soyombo Sundanese Syloti_Nagri Syriac " +
    "Tagalog Tagbanwa Tai_Le Tai_Tham Tai_Viet Takri Tamil Tangsa Tangut Telugu Thaana Thai Tibetan Tifinagh Tirhuta Toto " +
    "Ugaritic Vai Vithkuqi Wancho Warang_Citi Yezidi Yi Zanabazar_Square Unknown " +
    "Hani Hang Hira Kana Latn Grek Cyrl Zyyy Zinh";
  // Onigmo 의 POSIX 식 이름 중 JS 에 같은 뜻의 속성이 하나로 있는 것만(Alnum·Word·Punct 처럼 합집합이 필요한 것은 뺀다)
  const POSIX_ALIASES = { digit: "Nd", space: "White_Space", cntrl: "Cc", xdigit: "ASCII_Hex_Digit" };

  const loose = (s) => s.toLowerCase().replace(/[\s_-]/g, "");
  let propTable = null;
  function properties() {
    if (propTable) return propTable;
    propTable = new Map();
    const ok = (body) => { try { new RegExp(`\\p{${body}}`, "u"); return true; } catch (_) { return false; } };
    // 우선순위: 일반 범주 → 이진 속성 → 스크립트 (앞에서 정한 이름은 뒤가 덮지 않는다)
    for (const n of GC_NAMES.split(" ")) if (!propTable.has(loose(n)) && ok(n)) propTable.set(loose(n), n);
    for (const n of BINARY_NAMES.split(" ")) if (!propTable.has(loose(n)) && ok(n)) propTable.set(loose(n), n);
    for (const n of SCRIPT_NAMES.split(" ")) if (!propTable.has(loose(n)) && ok(`Script=${n}`)) propTable.set(loose(n), `Script=${n}`);
    for (const [k, v] of Object.entries(POSIX_ALIASES)) if (!propTable.has(k) && ok(v)) propTable.set(k, v);
    return propTable;
  }

  /**
   * 패턴 안의 \p{…}·\P{…} 이름을 JS 가 받는 표기로 바꾼다. 백슬래시 이스케이프를 따라가며 훑으므로
   * \\p{han}(백슬래시 문자 + p{han})은 건드리지 않는다. 이미 「이름=값」 꼴이거나 JS 가 그대로 받는 이름도 두지 않는다.
   * 반환: { pattern, changes: [[원래, 바꾼 것], …], unknown: [모르는 표기, …] }
   */
  function translateProps(pattern) {
    const table = properties();
    const changes = [], unknown = [];
    let out = "";
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (ch !== "\\") { out += ch; continue; }
      const nx = pattern[i + 1];
      if ((nx === "p" || nx === "P") && pattern[i + 2] === "{") {
        const close = pattern.indexOf("}", i + 3);
        if (close > 0) {
          const orig = pattern.slice(i, close + 1);
          let name = pattern.slice(i + 3, close);
          let neg = nx === "P";
          if (name.startsWith("^")) { neg = !neg; name = name.slice(1); }
          let body = null;
          if (name.includes("=")) body = name; // JS 식 그대로(Script=…, sc=…, General_Category=…)
          else {
            try { new RegExp(`\\p{${name}}`, "u"); body = name; } catch (_) { body = table.get(loose(name)) || null; }
          }
          if (body === null) {
            unknown.push(orig);
            out += orig;
          } else {
            const rep = `\\${neg ? "P" : "p"}{${body}}`;
            if (rep !== orig) changes.push([orig, rep]);
            out += rep;
          }
          i = close;
          continue;
        }
      }
      // 그 밖의 이스케이프는 두 글자를 통째로 옮긴다(\\ 다음 글자가 다시 이스케이프로 읽히지 않게)
      out += ch + (nx === undefined ? "" : nx);
      i++;
    }
    return { pattern: out, changes, unknown };
  }

  /**
   * 정규식 컴파일. ^ $ 는 줄 단위(m), 유니코드 모드(v, 미지원이면 u)는 끌 수 없다 —
   * 끄면 확장 B 이후 한자(서로게이트 쌍)의 반쪽과 일치하거나 범위식이 깨진다.
   * dotAll 은 기본 끔(에디터 관례: . 은 줄바꿈과 일치하지 않음).
   */
  function compile(pattern, opts) {
    opts = opts || {};
    if (!pattern) return { error: t("errEmpty", "검색어가 비어 있습니다") };
    const tr = translateProps(pattern);
    const r = compileJs(tr.pattern, "gm" + (opts.ignoreCase ? "i" : "") + (opts.dotAll ? "s" : ""));
    if (r.error && tr.unknown.length) {
      return {
        error: t("errUnknownProp", "알 수 없는 유니코드 속성: $1\n문자 체계는 \\p{Han}·\\p{Hangul}, 일반 범주는 \\p{L}·\\p{Lu}처럼 씁니다(대소문자 무관).", tr.unknown.join(" ")),
      };
    }
    const notes = [];
    if (tr.changes.length) notes.push(t("noteProps", "속성 이름을 JS 식으로 바꿔 검색했습니다: $1", tr.changes.map(([a, b]) => `${a} → ${b}`).join(", ")));
    if (r.note) notes.push(r.note);
    if (notes.length) r.note = notes.join("\n");
    return r;
  }

  function compileJs(pattern, base) {
    for (const uni of ["v", "u"]) {
      try {
        return { re: new RegExp(pattern, base + uni), flags: base + uni };
      } catch (e) {
        if (uni === "u") return { error: String(e.message || e) };
        // v 에서만 안 되는 문법(예: [(] 같은 이스케이프 안 된 기호)일 수도 있으니 u 로 한 번 더 시도한다.
        // v 자체를 지원하지 않는 엔진도 여기서 u 로 내려간다.
        try { new RegExp("", "v"); } catch (_) { continue; }
        try {
          return { re: new RegExp(pattern, base + "u"), flags: base + "u", note: t("noteUFallback", "v 플래그로는 오류라서 u 플래그로 검색했습니다: $1", e.message) };
        } catch (_) {
          return { error: String(e.message || e) };
        }
      }
    }
    return { error: t("errCompile", "정규식을 컴파일하지 못했습니다") };
  }

  /**
   * 모든 일치 [start, end). 길이 0 일치(^ 단독, 앞보기만 있는 패턴 등)는 칠할 수 없으므로 빼고 수만 센다.
   * matchAll 은 u/v 모드에서 빈 일치 뒤 한 「코드 포인트」씩 나아가므로 서로게이트 중간에서 멈추지 않는다.
   */
  function findAll(text, re, limit) {
    limit = limit || 10000;
    const out = [];
    let empty = 0;
    let truncated = false;
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (m[0].length === 0) { empty++; continue; }
      if (out.length >= limit) { truncated = true; break; }
      out.push([m.index, m.index + m[0].length]);
    }
    return { matches: out, empty, truncated };
  }

  /** text 오프셋 → 그 글자를 담은 seg 의 번호(없으면 -1). segs 는 start 오름차순. */
  function segAt(segs, pos) {
    let lo = 0, hi = segs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = segs[mid];
      if (pos < s.start) hi = mid - 1;
      else if (pos >= s.end) lo = mid + 1;
      else return mid;
    }
    return -1;
  }

  /** pos 이상에서 처음 나오는 「실제 노드 글자」 위치(가상 줄바꿈·탭 건너뜀). 없으면 null. */
  function firstReal(segs, pos, end) {
    let i = segAt(segs, pos);
    if (i >= 0) return { seg: segs[i], k: pos - segs[i].start };
    // pos 가 가상 글자 — 그 뒤 첫 seg
    let lo = 0, hi = segs.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (segs[mid].start <= pos) lo = mid + 1; else hi = mid; }
    if (lo < segs.length && segs[lo].start < end) return { seg: segs[lo], k: 0 };
    return null;
  }

  /** end 미만에서 마지막 「실제 노드 글자」 위치. */
  function lastReal(segs, end, start) {
    const pos = end - 1;
    let i = segAt(segs, pos);
    if (i >= 0) return { seg: segs[i], k: pos - segs[i].start };
    let lo = 0, hi = segs.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (segs[mid].end <= pos) lo = mid + 1; else hi = mid; }
    const j = lo - 1;
    if (j >= 0 && segs[j].end > start) return { seg: segs[j], k: segs[j].end - segs[j].start - 1 };
    return null;
  }

  /**
   * 일치 [s, e) → Range 재료 {startNode, startOffset, endNode, endOffset}.
   * 앞뒤의 가상 줄바꿈·탭은 잘라 낸다. 실제 글자가 하나도 없으면(가상 글자만 일치) null.
   */
  function toRangeSpec(segs, s, e) {
    const a = firstReal(segs, s, e);
    const b = lastReal(segs, e, s);
    if (!a || !b) return null;
    const aPos = a.seg.start + a.k, bPos = b.seg.start + b.k;
    if (aPos > bPos) return null;
    return {
      startNode: a.seg.node,
      startOffset: a.seg.offs[a.k],
      endNode: b.seg.node,
      endOffset: b.seg.offs[b.k] + 1,
    };
  }

  root.RPS = { linearize, compile, translateProps, findAll, toRangeSpec, segAt };
})(typeof globalThis !== "undefined" ? globalThis : this);
