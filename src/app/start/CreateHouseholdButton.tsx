"use client";

import { useRouter } from "next/navigation";
import { createHouseholdAction } from "@/app/actions";
import { useAction } from "@/components/ActionProvider";

export function CreateHouseholdButton() {
  const { run, pending } = useAction();
  const router = useRouter();
  return (
    <button
      className="btn btn-block"
      disabled={pending}
      onClick={async () => {
        const r = await run(() => createHouseholdAction());
        if (r.ok) router.push("/settings#invite");
      }}
    >
      공간 만들기
    </button>
  );
}
