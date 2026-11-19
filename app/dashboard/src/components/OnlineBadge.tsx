import { FC } from "react";
import { Dot } from "./ui";

type UserStatusProps = {
  lastOnline?: string | null;
};

export const secondsSince = (lastOnline?: string | null): number | null => {
  if (!lastOnline) return null;
  return Math.floor((Date.now() - new Date(`${lastOnline}Z`).getTime()) / 1000);
};

/** Green when seen in the last minute, grey otherwise, hollow if never connected. */
export const OnlineBadge: FC<UserStatusProps> = ({ lastOnline }) => {
  const since = secondsSince(lastOnline);
  if (since === null)
    return <Dot color="transparent" borderWidth="1.5px" borderColor="neutral-dot" title="Never connected" />;
  if (since <= 60) return <Dot color="success-dot" title="Online" />;
  return <Dot color="neutral-dot" title="Offline" />;
};
