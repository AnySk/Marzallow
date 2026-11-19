import { Text, TextProps } from "@chakra-ui/react";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { relativeExpiryDate } from "utils/dateFormatter";
import { secondsSince } from "./OnlineBadge";

type UserStatusProps = {
  lastOnline: string | null;
} & TextProps;

export const onlineText = (lastOnline: string | null, t: (key: string, o?: object) => string, seen = false) => {
  const since = secondsSince(lastOnline);
  if (since === null) return t("online.never");
  if (since <= 60) return t("online.now");
  const unix = Math.floor(Date.now() / 1000) - since;
  return t(seen ? "online.seen" : "online.ago", { time: relativeExpiryDate(unix).time.split(", ")[0] });
};

export const OnlineStatus: FC<UserStatusProps> = ({ lastOnline, ...props }) => {
  const { t } = useTranslation();
  const since = secondsSince(lastOnline);
  const online = since !== null && since <= 60;
  return (
    <Text
      as="span"
      fontSize="13px"
      color={online ? "success-fg" : "text-muted"}
      fontWeight={online ? 500 : 400}
      whiteSpace="nowrap"
      {...props}
    >
      {onlineText(lastOnline, t)}
    </Text>
  );
};
