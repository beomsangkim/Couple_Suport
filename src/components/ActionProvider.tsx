"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { stepUpAction, type ActionResult } from "@/app/actions";

type Run = <T>(fn: () => Promise<ActionResult<T>>, opts?: { success?: string }) => Promise<ActionResult<T>>;

const ActionContext = createContext<{ run: Run; pending: boolean } | null>(null);

export function useAction() {
  const ctx = useContext(ActionContext);
  if (!ctx) throw new Error("ActionProvider missing");
  return ctx;
}

/**
 * 서버 작업 호출을 한곳에서 처리한다.
 * - 본인 확인(step_up_required)이 필요하면 확인 창을 띄우고, 확인 후 같은 작업을 다시 보낸다.
 * - 결과는 서버 응답 후에만 성공으로 표시한다(낙관적 성공 표시 없음).
 */
export function ActionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const askStepUp = () =>
    new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      dialogRef.current?.showModal();
    });

  const closeStepUp = (ok: boolean) => {
    dialogRef.current?.close();
    resolverRef.current?.(ok);
    resolverRef.current = null;
  };

  const run: Run = useCallback(async (fn, opts) => {
    setPending(true);
    try {
      let r = await fn();
      if (!r.ok && r.code === "step_up_required") {
        if (!(await askStepUp())) {
          setToast({ text: "본인 확인을 취소해서 진행하지 않았어요.", error: false });
          return r;
        }
        const s = await stepUpAction();
        if (!s.ok) {
          setToast({ text: s.message, error: true });
          return r;
        }
        r = await fn();
      }
      if (!r.ok) {
        if (r.code === "unauthenticated") router.push("/login");
        else if (r.code === "access_revoked") router.push("/ended");
        setToast({ text: r.message, error: true });
      } else {
        if (opts?.success) setToast({ text: opts.success, error: false });
        router.refresh();
      }
      return r;
    } catch {
      setToast({ text: "연결이 끊겼어요. 저장되지 않았을 수 있으니 다시 확인해 주세요.", error: true });
      return { ok: false, code: "invalid_state", message: "network" } as const;
    } finally {
      setPending(false);
    }
  }, [router]);

  return (
    <ActionContext.Provider value={{ run, pending }}>
      {children}
      <div aria-live="polite" role="status">
        {toast && <div className={`toast${toast.error ? " toast-error" : ""}`}>{toast.text}</div>}
      </div>
      <dialog ref={dialogRef} aria-labelledby="stepup-title" onCancel={() => closeStepUp(false)}>
        <div className="stack">
          <h2 id="stepup-title">본인 확인</h2>
          <p className="muted">
            돈이나 계정에 관한 작업은 한 번 더 확인해요. 실제 앱에서는 패스키(지문·얼굴 인식)로 확인해요.
          </p>
          <button className="btn btn-block" onClick={() => closeStepUp(true)} autoFocus>
            패스키로 확인하기 (시뮬레이션)
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => closeStepUp(false)}>
            취소
          </button>
        </div>
      </dialog>
    </ActionContext.Provider>
  );
}
