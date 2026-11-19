import { HStack, Text, VStack } from "@chakra-ui/react";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Status as UserStatusType } from "types/User";
import { relativeExpiryDate } from "utils/dateFormatter";
import { Pill, statusTone } from "./ui";

type UserStatusProps = {
  expiryDate?: number | null;
  status: UserStatusType;
  compact?: boolean;
  showDetail?: boolean;
  extraText?: string | null;
  /** put the expiry line under the pill instead of next to it */
  stacked?: boolean;
};

const SOON = 3 * 86400;

export const StatusBadge: FC<UserStatusProps> = ({
  expiryDate,
  status,
  showDetail = true,
  extraText,
  stacked = false,
}) => {
  const { t } = useTranslation();
  const dateInfo = relativeExpiryDate(expiryDate);
  const soon =
    status === "active" && !!expiryDate && expiryDate * 1000 - Date.now() < SOON * 1000;
  const Wrap = stacked ? VStack : HStack;
  return (
    <Wrap spacing={stacked ? 1 : 2} align={stacked ? "flex-start" : "center"} display="inline-flex">
      <Pill tone={statusTone[status] || "neutral"}>
        {t(`status.${status}`)}
        {extraText && `: ${extraText}`}
      </Pill>
      {showDetail && expiryDate ? (
        <Text
          as="span"
          fontSize="12px"
          color={soon ? "warning-fg" : "text-muted"}
          fontWeight={soon ? 500 : 400}
        >
          {t(dateInfo.status, { time: dateInfo.time })}
        </Text>
      ) : null}
    </Wrap>
  );
};
