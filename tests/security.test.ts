// 개정안 §7 보안 시나리오(SEC-xx)를 서비스 계층에서 검증한다.
// DB 정책(RLS) 수준의 같은 시나리오는 db/tests/rls.sql에서 검증한다.
import { describe, expect, it } from "vitest";
import { as, expectCode, setup } from "./helpers";
import { approveVersion, listAgreements, proposeVersion, withdrawAgreement } from "@/server/services/agreements";
import { confirmSettlement, createExpense, deleteExpense, monthSummary, setDispute, startSettlement, updateExpense } from "@/server/services/expenses";
import { completeTask, listTasks } from "@/server/services/tasks";
import {
  confirmInvitation,
  createHousehold,
  createInvitation,
  endedSnapshot,
  exportMyData,
  leaveHousehold,
  myOpenInvitation,
  overview,
  requestAcceptance,
} from "@/server/services/household";
import { logout, revokeOtherSessions } from "@/server/services/auth";

const MONTH = "2026-10";
const newExpense = (paidBy: string, key = `key-${Math.random()}`) => ({
  amount: 30000,
  description: "장보기",
  paidBy,
  spentOn: "2026-10-25",
  split: { mode: "rule" as const },
  idempotencyKey: key,
});

describe("공간 격리 (SEC-01~04)", () => {
  it("SEC-01/02 다른 공간 지출은 조회·수정·삭제할 수 없고 존재 여부도 드러나지 않는다", () => {
    const store = setup();
    const seojun = as(store, "u_seojun", { stepUp: true });
    expect(monthSummary(seojun, MONTH).expenses.map((e) => e.id)).toEqual(["e_b_1"]);
    expectCode(() => updateExpense(seojun, "e_1", 1, { amount: 1, description: "x", paidBy: "u_seojun", spentOn: "2026-10-25", split: { mode: "equal" } }), "not_found");
    expectCode(() => deleteExpense(seojun, "e_1", 1), "not_found");
    expectCode(() => setDispute(seojun, "e_1", true), "not_found");
    expect(store.expenses.find((e) => e.id === "e_1")!.amount).toBe(650000);
  });

  it("SEC-04 다른 공간의 약속에 동의할 수 없다", () => {
    const store = setup();
    const seojun = as(store, "u_seojun", { stepUp: true });
    const v = store.versions.find((x) => x.id === "v_split_2")!;
    expectCode(() => approveVersion(seojun, v.id, v.contentHash), "not_found");
  });

  it("SEC-04 결제자를 공간 밖 사용자로 위조할 수 없다", () => {
    const store = setup();
    expectCode(() => createExpense(as(store, "u_min"), newExpense("u_seojun")), "validation");
  });

  it("세션 없이는 아무것도 할 수 없다", () => {
    const store = setup();
    expectCode(() => monthSummary({ store, sessionId: undefined }, MONTH), "unauthenticated");
    expectCode(() => monthSummary({ store, sessionId: "s_forged" }, MONTH), "unauthenticated");
  });
});

describe("합의 (SEC-09, 15, 16, 25)", () => {
  it("제안자는 보내는 순간 동의한 것으로 기록되고, 상대 동의 전에는 적용되지 않는다", () => {
    const store = setup();
    const min = as(store, "u_min");
    const { versionId } = proposeVersion(min, {
      agreementId: null,
      title: "분리수거 기준",
      content: { type: "text", body: "페트병은 라벨을 떼고 헹궈서 내놓아요." },
      effectiveFrom: "2026-10-25",
      reviewOn: null,
    });
    const view = listAgreements(min).find((a) => a.pending?.versionId === versionId)!;
    expect(view.pending!.approvedByMe).toBe(true);
    expect(view.pending!.approvedByPartner).toBe(false);
    expect(view.current).toBeNull();

    const jiwoo = as(store, "u_jiwoo");
    approveVersion(jiwoo, versionId, view.pending!.contentHash);
    expect(listAgreements(jiwoo).find((a) => a.current?.versionId === versionId)).toBeDefined();
  });

  it("SEC-25 금전 약속 동의에는 단계 인증이 필요하다", () => {
    const store = setup();
    const v = store.versions.find((x) => x.id === "v_split_2")!;
    expectCode(() => approveVersion(as(store, "u_min"), v.id, v.contentHash), "step_up_required");
    expect(approveVersion(as(store, "u_min", { stepUp: true }), v.id, v.contentHash).status).toBe("scheduled");
  });

  it("단계 인증은 5분이 지나면 다시 필요하다", () => {
    const store = setup();
    const min = as(store, "u_min", { stepUp: true });
    const t0 = store.clock();
    store.clock = () => t0 + 6 * 60 * 1000;
    const v = store.versions.find((x) => x.id === "v_split_2")!;
    expectCode(() => approveVersion(min, v.id, v.contentHash), "step_up_required");
  });

  it("SEC-16 화면을 연 뒤 상대가 수정안을 보내면, 예전 화면의 동의는 거부된다", () => {
    const store = setup();
    const min = as(store, "u_min", { stepUp: true });
    const stale = listAgreements(min).find((a) => a.agreementId === "a_split")!.pending!;

    // 지우가 50:50 제안을 55:45로 고쳐 다시 보냄 → 이전 제안은 대체됨
    const jiwoo = as(store, "u_jiwoo", { stepUp: true });
    proposeVersion(jiwoo, {
      agreementId: "a_split",
      title: "생활비 나누기",
      content: { type: "split", rule: { kind: "ratio", weights: { u_min: 55, u_jiwoo: 45 } } },
      effectiveFrom: "2026-11-01",
      reviewOn: null,
    });
    expectCode(() => approveVersion(min, stale.versionId, stale.contentHash), "invalid_state");

    const fresh = listAgreements(min).find((a) => a.agreementId === "a_split")!.pending!;
    expectCode(() => approveVersion(min, fresh.versionId, stale.contentHash), "stale_content");
    expect(approveVersion(min, fresh.versionId, fresh.contentHash).status).toBe("scheduled");
  });

  it("SEC-09 승인된 버전의 내용은 바꿀 수 없고, 바꾸려면 새 버전 동의가 필요하다", () => {
    const store = setup();
    const min = as(store, "u_min", { stepUp: true });
    const { versionId } = proposeVersion(min, {
      agreementId: "a_quiet",
      title: "조용한 시간",
      content: { type: "text", body: "평일 밤 12시 이후로 바꿔요." },
      effectiveFrom: "2026-10-25",
      reviewOn: null,
    });
    const a = listAgreements(min).find((x) => x.agreementId === "a_quiet")!;
    expect(a.current!.versionId).toBe("v_quiet_1"); // 기존 약속 유지
    expect(a.pending!.versionId).toBe(versionId);
  });

  it("SEC-15 적용 중인 약속은 한 사람이 혼자 즉시 철회할 수 있고, 이후 지출에 기본 분담이 적용되지 않는다", () => {
    const store = setup();
    const jiwoo = as(store, "u_jiwoo");
    withdrawAgreement(jiwoo, "v_split_1");
    const a = listAgreements(jiwoo).find((x) => x.agreementId === "a_split")!;
    expect(a.current).toBeNull();
    expect(a.history.find((v) => v.versionId === "v_split_1")!.withdrawnByMe).toBe(true);

    const min = as(store, "u_min");
    expect(monthSummary(min, MONTH).defaultRule).toBeNull();
    expectCode(() => createExpense(min, newExpense("u_min")), "validation");
    // 직접 정하면 기록할 수 있다
    expect(createExpense(min, { ...newExpense("u_min"), split: { mode: "equal" } }).id).toBeTruthy();
    // 이미 기록된 지출의 배분 스냅샷은 그대로다
    expect(store.expenses.find((e) => e.id === "e_1")!.shares).toEqual({ u_min: 390000, u_jiwoo: 260000 });
  });

  it("상대가 만든 제안을 대신 취소할 수 없다", async () => {
    const store = setup();
    const { cancelProposal } = await import("@/server/services/agreements");
    expectCode(() => cancelProposal(as(store, "u_min"), "v_split_2"), "invalid_state");
  });

  it("비율은 5% 단위만 받는다", () => {
    const store = setup();
    expectCode(
      () =>
        proposeVersion(as(store, "u_min"), {
          agreementId: "a_split",
          title: "생활비 나누기",
          content: { type: "split", rule: { kind: "ratio", weights: { u_min: 58, u_jiwoo: 42 } } },
          effectiveFrom: "2026-11-01",
          reviewOn: null,
        }),
      "validation",
    );
  });
});

describe("감시 신호 금지 (SEC-17)", () => {
  const FORBIDDEN = /email|last_?seen|viewed|read_?at|completed_?at|session|createdAt|stepUp|token|^ip$/i;

  function keysDeep(value: unknown, acc: string[] = []): string[] {
    if (Array.isArray(value)) value.forEach((v) => keysDeep(v, acc));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        acc.push(k);
        keysDeep(v, acc);
      }
    }
    return acc;
  }

  it("파트너에게 나가는 응답에 이메일·접속·열람·완료 시각 필드가 없다", () => {
    const store = setup();
    const min = as(store, "u_min");
    completeTask(as(store, "u_jiwoo"), "t_dishes");
    const payloads = [overview(min), listAgreements(min), monthSummary(min, MONTH), listTasks(min)];
    const keys = keysDeep(payloads);
    expect(keys.filter((k) => FORBIDDEN.test(k))).toEqual([]);
    expect(JSON.stringify(payloads)).not.toContain("@example.test");
  });

  it("집안일 완료는 날짜만 저장한다", () => {
    const store = setup();
    completeTask(as(store, "u_jiwoo"), "t_dishes");
    expect(store.tasks.find((t) => t.id === "t_dishes")!.completions).toEqual([{ on: "2026-10-25", by: "u_jiwoo" }]);
  });
});

describe("초대 (SEC-06, 07, 20, 28)", () => {
  function pairUp() {
    const store = setup();
    const haneul = as(store, "u_haneul");
    createHousehold(haneul);
    const { token } = createInvitation(haneul);
    return { store, haneul, token };
  }

  it("링크를 연 것만으로는 공간에 들어가지 않고, 초대자가 코드를 확인해야 한다", () => {
    const { store, haneul, token } = pairUp();
    const haesol = as(store, "u_haesol");
    const { code } = requestAcceptance(haesol, token);
    expect(overview(haesol).householdId).toBeNull();

    const inv = myOpenInvitation(haneul)!;
    expect(inv.hasRequest).toBe(true);
    expect(JSON.stringify(inv)).not.toContain("u_haesol"); // 확인 전에는 받는 사람을 밝히지 않음
    confirmInvitation(haneul, inv.id, code);
    expect(overview(haesol).partner!.displayName).toBe("하늘");
  });

  it("SEC-20 링크를 제3자가 먼저 열면, 진짜 받는 사람은 가로챌 수 없고 제3자는 코드 없이 들어올 수 없다", () => {
    const { store, haneul, token } = pairUp();
    const seojun = as(store, "u_seojun");
    leaveHousehold(seojun, { redactText: false, blockPartner: false }); // 공간이 없는 상태로 만들기
    requestAcceptance(seojun, token);
    expectCode(() => requestAcceptance(as(store, "u_haesol"), token), "invalid_state");
    const inv = myOpenInvitation(haneul)!;
    expectCode(() => confirmInvitation(haneul, inv.id, "000000"), "validation");
    expect(overview(seojun).householdId).toBeNull();
  });

  it("확인 코드가 5번 틀리면 초대가 취소된다", () => {
    const { store, haneul, token } = pairUp();
    const { code } = requestAcceptance(as(store, "u_haesol"), token);
    const wrong = code === "123456" ? "654321" : "123456";
    const inv = myOpenInvitation(haneul)!;
    for (let i = 0; i < 5; i++) expectCode(() => confirmInvitation(haneul, inv.id, wrong), "validation");
    expectCode(() => confirmInvitation(haneul, inv.id, code), "not_found");
  });

  it("SEC-06 만료·취소된 초대는 사용할 수 없다", () => {
    const { store, token } = pairUp();
    const t0 = store.clock();
    store.clock = () => t0 + 25 * 60 * 60 * 1000;
    expectCode(() => requestAcceptance(as(store, "u_haesol"), token), "invalid_state");
    expectCode(() => requestAcceptance(as(store, "u_haesol"), "not-a-real-token-but-long-enough"), "invalid_state");
  });

  it("SEC-07 정원이 찬 공간은 초대할 수 없다", () => {
    const store = setup();
    expectCode(() => createInvitation(as(store, "u_min")), "invalid_state");
  });

  it("SEC-28 초대를 차단한 사람에게서 온 초대는 받을 수 없다(사유는 드러내지 않음)", () => {
    const store = setup();
    const min = as(store, "u_min");
    leaveHousehold(min, { redactText: false, blockPartner: true });
    const jiwoo = as(store, "u_jiwoo");
    createHousehold(jiwoo);
    const { token } = createInvitation(jiwoo);
    try {
      requestAcceptance(min, token);
      throw new Error("should fail");
    } catch (e) {
      expect((e as Error).message).toContain("이 초대는 사용할 수 없어요");
    }
  });
});

describe("연결 해제 (SEC-08, 19)", () => {
  it("한 사람이 혼자 해제하면 두 사람 모두 기존 세션으로 공동 데이터를 쓰거나 실시간 조회할 수 없다", () => {
    const store = setup();
    const min = as(store, "u_min");
    const jiwoo = as(store, "u_jiwoo"); // 해제 전에 만든 세션
    leaveHousehold(min, { redactText: false, blockPartner: false });
    expectCode(() => monthSummary(jiwoo, MONTH), "access_revoked");
    expectCode(() => createExpense(jiwoo, newExpense("u_jiwoo")), "access_revoked");
    expectCode(() => completeTask(jiwoo, "t_dishes"), "access_revoked");
  });

  it("해제 후 30일 동안은 종료 시점 기록을 읽기 전용으로 볼 수 있고, 그 뒤에는 볼 수 없다", () => {
    const store = setup();
    const min = as(store, "u_min");
    leaveHousehold(min, { redactText: true, blockPartner: false });
    const jiwoo = as(store, "u_jiwoo");
    const snap = endedSnapshot(jiwoo)!;
    expect(snap.expenses.length).toBe(4);
    expect(snap.expenses[0]!.description).toBe("(내용 숨김)");
    const t0 = store.clock();
    store.clock = () => t0 + 31 * 24 * 60 * 60 * 1000;
    expect(endedSnapshot(jiwoo)).toBeNull();
  });

  it("해제 후 새 공간을 만들어도 이전 기록은 승계되지 않는다", () => {
    const store = setup();
    const min = as(store, "u_min");
    leaveHousehold(min, { redactText: false, blockPartner: false });
    createHousehold(min);
    expect(listAgreements(min)).toEqual([]);
  });
});

describe("정산 (SEC-14)", () => {
  it("같은 멱등 키로 두 번 보내도 지출은 하나만 생긴다", () => {
    const store = setup();
    const min = as(store, "u_min");
    const a = createExpense(min, newExpense("u_min", "same-key-123"));
    const b = createExpense(min, newExpense("u_min", "same-key-123"));
    expect(a.id).toBe(b.id);
    expect(store.expenses.filter((e) => e.idempotencyKey === "same-key-123")).toHaveLength(1);
  });

  it("오래된 화면(버전)으로 덮어쓸 수 없다", () => {
    const store = setup();
    const min = as(store, "u_min");
    const input = { amount: 25000, description: "세제", paidBy: "u_min", spentOn: "2026-10-23", split: { mode: "rule" as const } };
    updateExpense(min, "e_4", 1, input);
    expectCode(() => updateExpense(min, "e_4", 1, input), "conflict");
  });

  it("상대가 쓴 지출은 수정할 수 없고 '확인 필요'만 표시할 수 있으며, 확인 필요가 있으면 정산을 시작할 수 없다", () => {
    const store = setup();
    const min = as(store, "u_min");
    expectCode(() => deleteExpense(min, "e_2", 1), "invalid_state");
    setDispute(min, "e_2", true);
    expectCode(() => startSettlement(min, MONTH), "invalid_state");
    setDispute(min, "e_2", false);
    expect(startSettlement(min, MONTH).settlementId).toBeTruthy();
  });

  it("두 사람이 같은 스냅샷을 확인해야 확정되고, 중간에 지출이 바뀌면 다시 확인해야 한다", () => {
    const store = setup();
    const min = as(store, "u_min", { stepUp: true });
    const jiwoo = as(store, "u_jiwoo", { stepUp: true });
    const s1 = startSettlement(min, MONTH);
    expect(confirmSettlement(min, s1.settlementId, s1.snapshotHash).status).toBe("pending");
    expect(confirmSettlement(min, s1.settlementId, s1.snapshotHash).status).toBe("pending"); // 재시도해도 같음

    createExpense(jiwoo, newExpense("u_jiwoo"));
    expectCode(() => confirmSettlement(jiwoo, s1.settlementId, s1.snapshotHash), "stale_content");

    const s2 = startSettlement(jiwoo, MONTH);
    confirmSettlement(min, s2.settlementId, s2.snapshotHash);
    expect(confirmSettlement(jiwoo, s2.settlementId, s2.snapshotHash).status).toBe("confirmed");
    // 확정된 지출은 수정할 수 없다
    expectCode(() => deleteExpense(min, "e_4", 1), "invalid_state");
  });

  it("정산 확정에는 단계 인증이 필요하다", () => {
    const store = setup();
    const min = as(store, "u_min");
    const s = startSettlement(min, MONTH);
    expectCode(() => confirmSettlement(min, s.settlementId, s.snapshotHash), "step_up_required");
  });
});

describe("세션·내보내기 (SEC-05, 13)", () => {
  it("다른 기기 로그아웃과 내보내기는 단계 인증이 필요하다", () => {
    const store = setup();
    const min = as(store, "u_min");
    expectCode(() => revokeOtherSessions(min), "step_up_required");
    expectCode(() => exportMyData(min), "step_up_required");
  });

  it("SEC-05 내보내기에는 상대의 이메일이 없다", () => {
    const store = setup();
    const data = exportMyData(as(store, "u_min", { stepUp: true }));
    expect(JSON.stringify(data)).not.toContain("jiwoo@example.test");
    expect(JSON.stringify(data)).toContain("min@example.test");
  });

  it("다른 기기 로그아웃 후 그 세션은 쓸 수 없다", () => {
    const store = setup();
    const other = as(store, "u_min");
    const current = as(store, "u_min", { stepUp: true });
    expect(revokeOtherSessions(current)).toBe(1);
    expectCode(() => monthSummary(other, MONTH), "unauthenticated");
    logout(current);
    expectCode(() => monthSummary(current, MONTH), "unauthenticated");
  });
});
