export function Avatar({ name, color, small }: { name: string; color: string; small?: boolean }) {
  // 사진·외모 대신 이니셜과 사용자가 고른 색. 성별을 추론할 단서를 쓰지 않는다.
  return (
    <span className={`avatar c-${color}${small ? " avatar-sm" : ""}`} aria-hidden="true">
      {Array.from(name)[0] ?? "?"}
    </span>
  );
}

export function Person({ name, color, isMe }: { name: string; color: string; isMe?: boolean }) {
  return (
    <span className="row">
      <Avatar name={name} color={color} small />
      <span>{isMe ? `나(${name})` : name}</span>
    </span>
  );
}
