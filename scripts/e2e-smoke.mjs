// 브라우저로 핵심 흐름을 따라가며 화면 오류와 CSP 위반을 확인하는 스모크 테스트.
// 사용법: npm run build && npx next start -p 3100  (다른 터미널)
//        NODE_PATH=$(npm root -g) node scripts/e2e-smoke.mjs [baseUrl] [screenshotDir]
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

// 프로젝트 의존성 대신 환경에 설치된 playwright를 쓴다(NODE_PATH로 찾음).
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] ?? "http://localhost:3100";
const SHOTS = process.argv[3] ?? "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const problems = [];
let step = 0;

async function newUser(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });
  const page = await context.newPage();
  page.on("console", (m) => {
    // 다른 공간 ID 직접 접근(9단계)의 404는 의도한 결과다.
    if (m.type() === "error" && !m.location().url.includes("a_b_split")) problems.push(`[${name}] console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  return { context, page };
}

async function shot(page, label) {
  step += 1;
  await page.screenshot({ path: `${SHOTS}/${String(step).padStart(2, "0")}-${label}.png`, fullPage: true });
}

async function login(page, displayName) {
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: new RegExp(`^${displayName}`) }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function expectText(page, text) {
  await page.getByText(text).first().waitFor({ timeout: 5000 });
}

async function stepUp(page) {
  await page.getByRole("button", { name: "패스키로 확인하기 (시뮬레이션)" }).click();
}

// 0) 데이터 초기화
{
  const { page, context } = await newUser("reset");
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: "가상 데이터 처음 상태로 되돌리기" }).click();
  await shot(page, "login");
  await context.close();
}

const min = await newUser("민");
const jiwoo = await newUser("지우");

// 1) 홈
await login(min.page, "민");
await expectText(min.page, "오늘 할 일");
await expectText(min.page, "내 답변을 기다려요");
await shot(min.page, "home-min");

// 2) 지출 기록(약속대로 60:40)
await min.page.goto(`${BASE}/money`);
await min.page.getByLabel("금액").first().fill("30000");
await min.page.getByLabel("내용").first().fill("저녁 장보기");
await expectText(min.page, "나 18,000원 · 지우 12,000원 부담");
await min.page.getByRole("button", { name: "기록하기" }).click();
await expectText(min.page, "지출을 기록했어요.");
await shot(min.page, "money-min");

// 3) 지우의 50:50 제안에 동의(단계 인증)
await min.page.goto(`${BASE}/agreements`);
await min.page.locator(`a[href="/agreements/a_split"]`).click();
await expectText(min.page, "지우 님의 제안");
await shot(min.page, "proposal-review");
await min.page.getByRole("button", { name: "이 비율로 동의하기" }).click();
await stepUp(min.page);
await expectText(min.page, "동의했어요.");
await expectText(min.page, "적용 예정");
await shot(min.page, "proposal-approved");

// 4) 지우가 '조용한 시간' 약속을 혼자 철회
await login(jiwoo.page, "지우");
await jiwoo.page.goto(`${BASE}/agreements`);
await jiwoo.page.locator(`a[href="/agreements/a_quiet"]`).click();
await jiwoo.page.getByRole("button", { name: "이 약속 철회하기" }).click();
await jiwoo.page.getByRole("button", { name: "철회하기", exact: true }).click();
await expectText(jiwoo.page, "약속을 철회했어요.");
await expectText(jiwoo.page, "철회했어요. 다시 이야기해 볼까요?");
await shot(jiwoo.page, "withdrawn");

// 5) 지우: 민의 지출에 '확인 필요' 표시 → 정산 시작 불가 확인
await jiwoo.page.goto(`${BASE}/money`);
await jiwoo.page.getByRole("button", { name: "확인 필요로 표시" }).first().click();
await expectText(jiwoo.page, "확인 필요로 표시했어요.");
await expectText(jiwoo.page, "먼저 정리해야 정산을 확정할 수 있어요");
await jiwoo.page.getByRole("button", { name: "확인 필요 해제" }).click();
await jiwoo.page.getByRole("button", { name: "이 금액으로 정산 확인 시작하기" }).click();
await jiwoo.page.getByRole("button", { name: "이 계산이 맞아요" }).click();
await stepUp(jiwoo.page);
await expectText(jiwoo.page, "상대도 확인하면 확정돼요");
await shot(jiwoo.page, "settlement-pending");

// 6) 소득 계산기(서버로 보내지 않음) — 네트워크 요청 본문에 소득이 없는지 확인
const bodies = [];
min.page.on("request", (r) => bodies.push(r.postData() ?? ""));
await min.page.goto(`${BASE}/agreements/new?template=split`);
await min.page.getByRole("button", { name: "비율 정하기" }).click();
await min.page.getByRole("button", { name: "소득에 맞춰 계산해 보기" }).click();
await min.page.getByLabel("내 월 소득").fill("3500000");
await min.page.getByLabel("지우 님 월 소득").fill("2500000");
await expectText(min.page, "5% 단위로 반올림");
await shot(min.page, "income-calculator");
await min.page.getByRole("button", { name: "이 비율 쓰기" }).click();
await expectText(min.page, "60%");
if (bodies.some((b) => b.includes("3500000") || b.includes("2500000"))) problems.push("소득 값이 서버 요청에 포함됨");

// 7) 초대: 하늘이 링크 생성 → 해솔이 수락 요청 → 하늘이 코드 입력
const haneul = await newUser("하늘");
const haesol = await newUser("해솔");
await login(haneul.page, "하늘");
await haneul.page.getByRole("button", { name: "공간 만들기" }).click();
await haneul.page.waitForURL(/settings/);
await haneul.page.getByRole("button", { name: "함께 사용할 사람 초대하기" }).click();
const url = await haneul.page.getByLabel(/초대 링크/).inputValue();
await shot(haneul.page, "invite-created");

await haesol.page.goto(url);
await haesol.page.waitForURL(/\/invite$/);
if (haesol.page.url().includes(url.split("/").pop())) problems.push("초대 토큰이 주소창에 남음");
await expectText(haesol.page, "로그인하면 수락 요청을 보낼 수 있어요");
await login(haesol.page, "해솔");
await haesol.page.waitForURL(/\/invite$/);
await haesol.page.getByRole("button", { name: "수락 요청 보내기" }).click();
const code = (await haesol.page.locator(".code-display").innerText()).trim();
await shot(haesol.page, "invite-code");

await haneul.page.reload();
await expectText(haneul.page, "수락 요청이 왔어요");
await haneul.page.getByLabel("확인 코드 6자리").fill(code);
await haneul.page.getByRole("button", { name: "코드 확인하고 연결하기" }).click();
await expectText(haneul.page, "같은 권한으로 함께 사용 중");
await haesol.page.getByRole("button", { name: "연결됐는지 확인하기" }).click();
await expectText(haesol.page, "오늘 할 일");

// 8) 연결 해제(혼자, 단계 인증 없음) → 상대의 기존 세션 차단
await haesol.page.goto(`${BASE}/settings`);
await haesol.page.getByRole("button", { name: "연결 해제하기" }).click();
await haesol.page.getByRole("button", { name: "해제하기", exact: true }).click();
await haesol.page.waitForURL(/ended/);
await shot(haesol.page, "ended");
await haneul.page.goto(`${BASE}/money`);
await haneul.page.waitForURL(/ended/);

// 9) 다른 공간 ID 직접 접근
await min.page.goto(`${BASE}/agreements/a_b_split`);
await expectText(min.page, "이 기록에 접근할 수 없어요");

// 10) 320px 폭에서 가로 스크롤 없음
await min.page.setViewportSize({ width: 320, height: 700 });
for (const p of ["/", "/money", "/agreements", "/settings"]) {
  await min.page.goto(`${BASE}${p}`);
  const overflow = await min.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) problems.push(`320px 가로 스크롤: ${p}`);
}
await shot(min.page, "settings-320");

await browser.close();
if (problems.length) {
  console.error("문제 발견:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`스모크 테스트 통과 (${step}개 스크린샷: ${SHOTS})`);
