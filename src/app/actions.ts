"use server";

// Server Action은 화면에 버튼이 없어도 누구나 호출할 수 있는 공개 엔드포인트다.
// 그래서 여기서는 입력을 그대로 서비스 계층에 넘기고, 인증·인가·검증은 모두 서비스가 한다.
// 사용자 ID는 받지 않는다. 세션 쿠키에서만 정한다.

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError, type ErrorCode } from "@/server/errors";
import { cookieOptions, getCtx, INVITE_COOKIE, SESSION_COOKIE } from "@/server/session";
import { resetStore } from "@/server/store";
import type { Ctx } from "@/server/services/access";
import * as authSvc from "@/server/services/auth";
import * as agreementSvc from "@/server/services/agreements";
import * as expenseSvc from "@/server/services/expenses";
import * as taskSvc from "@/server/services/tasks";
import * as householdSvc from "@/server/services/household";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string };

async function run<T>(fn: (ctx: Ctx) => T): Promise<ActionResult<T>> {
  const ctx = await getCtx();
  try {
    const data = fn(ctx);
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, code: e.code, message: e.message };
    if (e instanceof ZodError) return { ok: false, code: "validation", message: "입력한 내용을 확인해 주세요." };
    // 예상하지 못한 오류는 내용을 사용자에게 보내지 않는다(로그에도 입력값을 남기지 않음).
    console.error("action failed", (e as Error)?.name);
    return { ok: false, code: "invalid_state", message: "저장하지 못했어요. 다시 시도해 주세요." };
  }
}

// --- 인증(데모) -------------------------------------------------------------

export async function demoLoginAction(userId: string): Promise<void> {
  const ctx = await getCtx();
  const ua = (await headers()).get("user-agent") ?? "";
  const device = /iphone|android|mobile/i.test(ua) ? "휴대폰 브라우저" : "컴퓨터 브라우저";
  const sid = authSvc.demoLogin(ctx, String(userId), device);
  (await cookies()).set(SESSION_COOKIE, sid, cookieOptions);
  redirect((await cookies()).get(INVITE_COOKIE) ? "/invite" : "/");
}

export async function logoutAction(): Promise<void> {
  const ctx = await getCtx();
  authSvc.logout(ctx);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function resetDemoAction(): Promise<void> {
  resetStore();
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function stepUpAction() {
  return run((ctx) => authSvc.stepUp(ctx));
}

export async function revokeOtherSessionsAction() {
  return run((ctx) => authSvc.revokeOtherSessions(ctx));
}

// --- 약속 -------------------------------------------------------------------

export async function proposeAction(input: agreementSvc.ProposeInput) {
  return run((ctx) => agreementSvc.proposeVersion(ctx, input));
}

export async function approveAction(versionId: string, contentHash: string) {
  return run((ctx) => agreementSvc.approveVersion(ctx, String(versionId), String(contentHash)));
}

export async function cancelProposalAction(versionId: string) {
  return run((ctx) => agreementSvc.cancelProposal(ctx, String(versionId)));
}

export async function withdrawAction(versionId: string) {
  return run((ctx) => agreementSvc.withdrawAgreement(ctx, String(versionId)));
}

// --- 생활비 -----------------------------------------------------------------

export async function createExpenseAction(input: expenseSvc.ExpenseInput & { idempotencyKey: string }) {
  return run((ctx) => expenseSvc.createExpense(ctx, input));
}

export async function updateExpenseAction(id: string, version: number, input: expenseSvc.ExpenseInput) {
  return run((ctx) => expenseSvc.updateExpense(ctx, String(id), Number(version), input));
}

export async function deleteExpenseAction(id: string, version: number) {
  return run((ctx) => expenseSvc.deleteExpense(ctx, String(id), Number(version)));
}

export async function disputeAction(id: string, disputed: boolean) {
  return run((ctx) => expenseSvc.setDispute(ctx, String(id), Boolean(disputed)));
}

export async function startSettlementAction(month: string) {
  return run((ctx) => expenseSvc.startSettlement(ctx, String(month)));
}

export async function confirmSettlementAction(id: string, hash: string) {
  return run((ctx) => expenseSvc.confirmSettlement(ctx, String(id), String(hash)));
}

// --- 집안일 -----------------------------------------------------------------

export async function completeTaskAction(id: string) {
  return run((ctx) => taskSvc.completeTask(ctx, String(id)));
}

export async function undoTaskAction(id: string) {
  return run((ctx) => taskSvc.undoComplete(ctx, String(id)));
}

export async function requestSwapAction(id: string) {
  return run((ctx) => taskSvc.requestSwap(ctx, String(id)));
}

export async function answerSwapAction(id: string, accept: boolean) {
  return run((ctx) => taskSvc.answerSwap(ctx, String(id), Boolean(accept)));
}

export async function createTaskAction(input: Parameters<typeof taskSvc.createTask>[1]) {
  return run((ctx) => taskSvc.createTask(ctx, input));
}

// --- 공간·초대·연결 해제 -----------------------------------------------------

export async function updateProfileAction(input: Parameters<typeof householdSvc.updateProfile>[1]) {
  return run((ctx) => householdSvc.updateProfile(ctx, input));
}

export async function createHouseholdAction() {
  return run((ctx) => householdSvc.createHousehold(ctx));
}

export async function createInvitationAction() {
  const result = await run((ctx) => householdSvc.createInvitation(ctx));
  if (!result.ok) return result;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return { ok: true as const, data: { url: `${origin}/invite/${result.data.token}`, expiresAt: result.data.expiresAt } };
}

export async function revokeInvitationAction(id: string) {
  return run((ctx) => householdSvc.revokeInvitation(ctx, String(id)));
}

export async function requestAcceptanceAction() {
  const jar = await cookies();
  const token = jar.get(INVITE_COOKIE)?.value ?? "";
  const result = await run((ctx) => householdSvc.requestAcceptance(ctx, token));
  return result;
}

export async function confirmInvitationAction(id: string, code: string) {
  const result = await run((ctx) => householdSvc.confirmInvitation(ctx, String(id), String(code)));
  return result;
}

export async function leaveHouseholdAction(input: { redactText: boolean; blockPartner: boolean }) {
  return run((ctx) => householdSvc.leaveHousehold(ctx, input));
}

export async function exportAction() {
  return run((ctx) => householdSvc.exportMyData(ctx));
}

export async function clearInviteCookieAction(): Promise<void> {
  (await cookies()).delete(INVITE_COOKIE);
  redirect("/");
}
