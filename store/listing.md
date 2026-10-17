# 웹 스토어 등록 문안 (대시보드에 붙여 넣는 원본)

판 0.2.1 · 2026-10-17 작성. 올릴 파일은 `node scripts/build-zip.mjs`로 만든 `dist/regex-page-search-0.2.1.zip`이고, 그림은 `store/assets/`에 있다(`node scripts/store-assets.mjs`로 다시 만든다).
이름과 짧은 설명은 zip 안 `_locales`에서 스토어가 읽어 가므로 여기서 따로 넣지 않는다.

## 1. 스토어 등록정보(Store listing)

- **카테고리**: 생산성 › 도구 (Productivity › Tools)
- **언어**: 한국어·영어. 기본 언어는 영어(manifest `default_locale: en`), 한국어 등록정보를 따로 더한다.
- **그림**
  - 아이콘: zip 안 `icons/icon128.png` (스토어가 자동으로 쓴다)
  - 스크린숏(언어별): ko → `screenshot-ko-1.png`, `screenshot-ko-2.png` · en → `screenshot-en-1.png`, `screenshot-en-2.png` (1280×800)
  - 작은 홍보 타일(필수, 언어 구분 없음): `promo-440x280.png`
- **홈페이지 URL**: https://github.com/hw725/regex-page-search
- **지원 URL**: https://github.com/hw725/regex-page-search/issues

### 상세 설명 — 한국어

```
웹페이지를 정규식으로 검색하고, 일치한 곳을 모두 강조합니다.

■ 이런 점이 다릅니다
• ^ 와 $ 는 화면에 보이는 「줄」 단위입니다. 문단·목록·표 행의 경계와 <br> 을 줄바꿈으로 보고, HTML 소스의 줄바꿈은 무시합니다. 표 칸 사이는 탭(\t)으로 찾을 수 있습니다.
• 유니코드 모드가 늘 켜져 있습니다. 확장 B 이후 한자(𠀀 등)도 한 글자로 다루고, \p{Script=Han} 같은 속성 검색을 씁니다.
• EmEditor·Onigmo 식 속성 이름을 그대로 받습니다. \p{hangul}+\(\p{han}+\) 처럼 쓰면 JS 식(\p{Script=Hangul} …)으로 바꿔 검색하고, 바꾼 내용을 알려 줍니다.
• 정규화하지 않습니다. 호환 한자(樂 U+F914)와 통합 한자(樂 U+6A02)를 구별합니다.
• 페이지 구조를 바꾸지 않습니다. CSS Custom Highlight API 로 칠하므로 페이지 스크립트와 충돌하지 않고, 여러 요소에 걸친 일치도 칠합니다.
• 무한 스크롤처럼 내용이 바뀌면 같은 검색어로 다시 칠합니다. 「이동해도 계속 검색」을 켜면 그 탭에서 다른 페이지로 옮겨 가도 이어서 검색합니다.
• 자주 쓰는 정규식은 즐겨찾기(Chrome 동기화), 최근 20개는 자동으로 남습니다.

■ 쓰는 법
툴바 아이콘 또는 Alt+Shift+F → 정규식 입력 → Enter(다음)·Shift+Enter(이전). 옵션: 대소문자 무시, . 이 줄바꿈 포함.

■ 개인정보
네트워크 요청을 하지 않습니다. 검색은 모두 브라우저 안에서 이뤄지고, 페이지 내용은 저장하지 않습니다.

■ 알려진 한계
chrome:// 페이지·웹 스토어·내장 PDF 뷰어, iframe 안, 닫힌 shadow DOM 안은 검색하지 않습니다. (a+)+$ 처럼 역추적이 폭발하는 패턴은 탭을 멈출 수 있습니다.

소스: https://github.com/hw725/regex-page-search (MIT)
```

### 상세 설명 — English

```
Search any web page with a regular expression and highlight every match.

■ What is different
• ^ and $ anchor to the lines you see. Block boundaries (paragraphs, list items, table rows) and <br> count as line breaks; newlines in the HTML source do not. Table cells are separated by a tab (\t).
• Unicode mode is always on. CJK Extension B+ characters (𠀀 …) are single characters, and property escapes such as \p{Script=Han} work.
• Onigmo/EmEditor-style property names are accepted as-is. \p{hangul}+\(\p{han}+\) is converted to JS syntax (\p{Script=Hangul} …), and the popup tells you what it changed.
• No normalization. CJK compatibility ideographs (樂 U+F914) stay distinct from unified ones (樂 U+6A02).
• The page DOM is never modified. Highlights use the CSS Custom Highlight API, so page scripts are unaffected and matches can span several elements.
• When the page content changes (infinite scroll, “load more”), it searches again. With “Keep searching after navigation”, the same pattern follows the tab to new pages.
• Favorites (synced with Chrome sync) and the 20 most recent patterns are saved.

■ How to use
Toolbar icon or Alt+Shift+F → type a regex → Enter (next) / Shift+Enter (previous). Options: ignore case, . matches newline.

■ Privacy
No network requests. Everything runs in your browser and page content is never stored.

■ Known limits
Does not run on chrome:// pages, the Chrome Web Store, or the built-in PDF viewer, and does not search inside iframes or closed shadow DOM. Catastrophic-backtracking patterns such as (a+)+$ can freeze the tab.

Source: https://github.com/hw725/regex-page-search (MIT)
```

## 2. 개인정보 보호 관행(Privacy practices)

- **단일 목적(Single purpose)**
  ```
  Find and highlight text that matches a regular expression on the current web page.
  ```
- **권한 사유(Permission justification)**
  - `activeTab`
    ```
    Lets the extension read the page the user is looking at only after the user clicks the toolbar icon or presses the shortcut, so it can search that page.
    ```
  - `scripting`
    ```
    Injects the extension's own bundled scripts (src/i18n.js, src/core.js, src/content.js) to find and highlight matches: into the active tab when the user opens the popup, and, only if the user turned on "Keep searching after navigation", into that same tab after it loads a new page. No remote code is injected.
    ```
  - `storage`
    ```
    Saves the user's favorite patterns (storage.sync), recent patterns and last options (storage.local), and, for a tab with "Keep searching after navigation" on, that tab's ID with its pattern and options (storage.session, cleared when the browser closes). Nothing leaves the browser except through Chrome sync.
    ```
  - 호스트 권한 `<all_urls>` (선택 권한, optional_host_permissions)
    ```
    Optional. Requested only when the user turns on "Keep searching after navigation" for a tab. It lets the extension re-run the same search when that tab loads a new page, because activeTab access ends on navigation. Only the tab where the user turned it on is searched, and the feature turns off when the user unchecks it, presses "Clear", or closes the tab or browser.
    ```
- **원격 코드(Remote code)**: 아니요, 원격 코드를 사용하지 않습니다(No, I am not using remote code).
- **데이터 사용(Data usage) — 수집 항목 체크**: **웹사이트 콘텐츠(Website content)**만 체크한다. 스토어 FAQ 3번은 기기 안에서만 처리하는 데이터도 밝히라고 한다. 이 확장은 페이지 글자를 읽어 그 탭 안에서 일치를 찾는다. 나머지 항목(개인 식별 정보·건강·금융·인증·통신·위치·웹 기록·사용자 활동)은 체크하지 않는다.
  - 판단 근거: [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) 3·14번. 입력한 검색 패턴이 《사용자 활동》에 드는지는 문서에 정의가 없다. 키 입력을 기록하는 것이 아니어서 체크하지 않았다(신뢰도: 보통). 심사에서 지적되면 체크를 더한다.
- **인증 세 가지**: 모두 체크(제3자 판매 안 함 · 핵심 기능과 무관한 용도로 쓰거나 넘기지 않음 · 신용도 판단·대출 용도로 쓰지 않음)
- **개인정보처리방침 URL**: https://hw725.github.io/regex-page-search/PRIVACY.html

## 3. 배포(Distribution)

- 공개 범위: 공개(Public)
- 지역: 모든 지역
- 가격: 무료

## 4. 심사자에게(Test instructions, 선택)

```
No account or setup needed. Open any normal web page, click the toolbar icon (or press Alt+Shift+F), type a pattern such as ^\S+ ERROR.*$ or \p{Han}+ and press Enter. "Keep searching after navigation" asks for the optional all-sites permission only when it is switched on.
```
