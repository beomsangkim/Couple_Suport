"use client";

import { useState } from "react";
import { updateProfileAction } from "@/app/actions";
import { useAction } from "./ActionProvider";
import { Avatar } from "./Avatar";

const COLOR_NAMES: Record<string, string> = {
  teal: "청록", amber: "호박", indigo: "남색", rose: "장미", olive: "올리브", slate: "회청",
};

export function ProfileForm({ displayName, color, colors }: { displayName: string; color: string; colors: string[] }) {
  const { run, pending } = useAction();
  const [name, setName] = useState(displayName);
  const [c, setC] = useState(color);
  return (
    <form
      className="panel stack"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateProfileAction({ displayName: name, color: c as "teal" }), { success: "저장했어요." });
      }}
    >
      <div className="field">
        <label htmlFor="pf-name">표시 이름</label>
        <input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required />
        <p className="hint">법적 이름일 필요는 없어요.</p>
      </div>
      <fieldset className="field">
        <legend className="small"><strong>내 색</strong></legend>
        <div className="row wrap">
          {colors.map((x) => (
            <label key={x} className="check">
              <input type="radio" name="color" value={x} checked={c === x} onChange={() => setC(x)} />
              <Avatar name={name || "?"} color={x} small /> {COLOR_NAMES[x] ?? x}
            </label>
          ))}
        </div>
      </fieldset>
      <button className="btn" disabled={pending || !name.trim()}>저장하기</button>
    </form>
  );
}
