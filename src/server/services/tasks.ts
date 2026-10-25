import "server-only";
import { z } from "zod";
import { fail } from "../errors";
import { newId, weekday } from "../store";
import type { ISODate, Task } from "../types";
import { findInHousehold, requireHousehold, today, type Ctx } from "./access";

const createSchema = z.object({
  title: z.string().trim().min(1).max(40),
  criteria: z.string().trim().max(200),
  assignee: z.string().max(80),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
});

export function createTask(ctx: Ctx, input: z.input<typeof createSchema>): { id: string } {
  const { household, memberIds } = requireHousehold(ctx);
  const data = createSchema.parse(input);
  if (!memberIds.includes(data.assignee)) fail("validation");
  const task: Task = {
    id: newId("t"),
    householdId: household.id,
    title: data.title,
    criteria: data.criteria,
    assignee: data.assignee,
    weekdays: [...new Set(data.weekdays)].sort(),
    completions: [],
    swapRequest: null,
  };
  ctx.store.tasks.push(task);
  return { id: task.id };
}

/** 완료는 '날짜'만 기록한다. 몇 시에 했는지는 저장하지도, 보여주지도 않는다. */
export function completeTask(ctx: Ctx, taskId: string): void {
  const { user, household } = requireHousehold(ctx);
  const task = findInHousehold(ctx.store.tasks, taskId, household.id);
  const t = today(ctx);
  if (!task.completions.some((c) => c.on === t)) task.completions.push({ on: t, by: user.id });
}

export function undoComplete(ctx: Ctx, taskId: string): void {
  const { user, household } = requireHousehold(ctx);
  const task = findInHousehold(ctx.store.tasks, taskId, household.id);
  const t = today(ctx);
  const i = task.completions.findIndex((c) => c.on === t && c.by === user.id);
  if (i < 0) fail("invalid_state");
  task.completions.splice(i, 1);
}

/** 담당 교환 요청. 상대가 받아들이기 전까지 기존 담당이 유지된다. */
export function requestSwap(ctx: Ctx, taskId: string): void {
  const { user, household, partnerId } = requireHousehold(ctx);
  if (!partnerId) fail("invalid_state");
  const task = findInHousehold(ctx.store.tasks, taskId, household.id);
  if (task.swapRequest) fail("invalid_state");
  // from: 요청한 사람, to: 받아들여야 하는 사람. 받아들이면 담당이 다른 사람으로 바뀐다.
  task.swapRequest = { from: user.id, to: partnerId };
}

export function answerSwap(ctx: Ctx, taskId: string, accept: boolean): void {
  const { user, household } = requireHousehold(ctx);
  const task = findInHousehold(ctx.store.tasks, taskId, household.id);
  const req = task.swapRequest;
  if (!req) fail("invalid_state");
  if (accept) {
    if (req.to !== user.id) fail("invalid_state");
    task.assignee = task.assignee === req.from ? req.to : req.from;
    // 담당이 바뀌어도 이미 완료한 기록은 그대로 둔다.
  } else if (req.to !== user.id && req.from !== user.id) {
    fail("invalid_state");
  }
  task.swapRequest = null;
}

export interface TaskView {
  id: string;
  title: string;
  criteria: string;
  assignee: string;
  weekdays: number[];
  dueToday: boolean;
  doneToday: boolean;
  doneTodayByMe: boolean;
  lastDoneOn: ISODate | null;
  swapRequest: { requestedByMe: boolean; waitingForMe: boolean } | null;
}

export function listTasks(ctx: Ctx): TaskView[] {
  const { user, household } = requireHousehold(ctx);
  const t = today(ctx);
  const wd = weekday(t);
  return ctx.store.tasks
    .filter((x) => x.householdId === household.id)
    .map((x) => {
      const doneToday = x.completions.find((c) => c.on === t);
      return {
        id: x.id,
        title: x.title,
        criteria: x.criteria,
        assignee: x.assignee,
        weekdays: x.weekdays,
        dueToday: x.weekdays.includes(wd),
        doneToday: Boolean(doneToday),
        doneTodayByMe: doneToday?.by === user.id,
        lastDoneOn: x.completions.map((c) => c.on).sort().at(-1) ?? null,
        swapRequest: x.swapRequest
          ? { requestedByMe: x.swapRequest.from === user.id, waitingForMe: x.swapRequest.to === user.id }
          : null,
      };
    });
}
