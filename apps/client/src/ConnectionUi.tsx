import { useState } from "react";
import {
  SUPERSEDED_STATUS,
  inviteFromFragment,
  readInvite,
  writeInvite,
  type StatusAction,
} from "./network";

/** The hosted entrance asks for the tester's personal key instead of a mode. */
export function InviteField({ disabled }: { disabled?: boolean }) {
  const [invite, setInvite] = useState(
    () => inviteFromFragment() ?? readInvite(),
  );
  return (
    <>
      <label className="field-label" htmlFor="invite">
        Your invite key
      </label>
      <input
        id="invite"
        type="password"
        value={invite}
        onChange={(e) => {
          setInvite(e.target.value);
          writeInvite(e.target.value);
        }}
        disabled={disabled}
        placeholder="Paste the key your host sent you"
        maxLength={128}
        autoComplete="off"
        spellCheck={false}
      />
      <p className="mode-hint">
        Private playtest server. Your character is saved on the server.
      </p>
    </>
  );
}

/** In-world connection state: a spinner while retrying, otherwise one action. */
export function ConnectionBanner({
  status,
  action,
  onReconnect,
}: {
  status: string;
  action?: StatusAction;
  onReconnect: () => void;
}) {
  return (
    <div
      className={`connection-banner ${action === "wait" ? "waiting" : ""}`}
      role="alert"
    >
      {action === "wait" && <span className="spinner" />}
      <span>{status}</span>
      {action === "reload" ? (
        <button onClick={() => location.reload()}>
          {status === SUPERSEDED_STATUS ? "Play here" : "Reload"}
        </button>
      ) : (
        action !== "wait" && <button onClick={onReconnect}>Reconnect</button>
      )}
    </div>
  );
}
