import {
  Box,
  Button,
  chakra,
  Checkbox,
  Flex,
  HStack,
  IconButton,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  VStack,
} from "@chakra-ui/react";
import { CheckIcon, ChevronUpDownIcon, ClipboardDocumentIcon, LinkIcon, QrCodeIcon, UserPlusIcon } from "@heroicons/react/24/outline";
import classNames from "classnames";
import { useDashboard } from "contexts/DashboardContext";
import { useFeatures } from "contexts/FeaturesContext";
import React, { FC, ReactNode, useEffect, useState } from "react";
import CopyToClipboard from "react-copy-to-clipboard";
import { useTranslation } from "react-i18next";
import { User } from "types/User";
import { formatBytes } from "utils/formatByte";
import { OnlineBadge } from "./OnlineBadge";
import { onlineText, OnlineStatus } from "./OnlineStatus";
import { Pagination } from "./Pagination";
import { StatusBadge } from "./StatusBadge";
import { Bar, Chip, Help, Muted, Pill, statusTone, usageTone } from "./ui";

const ic = (c: typeof LinkIcon) => chakra(c, { baseStyle: { w: 4, h: 4 } });
const Icons = {
  link: ic(LinkIcon),
  copy: ic(ClipboardDocumentIcon),
  copied: ic(CheckIcon),
  qr: ic(QrCodeIcon),
  sort: ic(ChevronUpDownIcon),
  empty: chakra(UserPlusIcon, { baseStyle: { w: 8, h: 8, strokeWidth: 1.5 } }),
};

const PROTOCOL_LABEL: Record<string, string> = { vless: "VLESS", vmess: "VMess", trojan: "Trojan", shadowsocks: "SS" };

const RESET_KEY: Record<string, string> = { day: "daily", week: "weekly", month: "monthly", year: "yearly" };

/** "12.4 / 50 GB" style numbers, the bar and a helper line. */
const Usage: FC<{ user: User; compact?: boolean }> = ({ user, compact }) => {
  const { t } = useTranslation();
  const unlimited = !user.data_limit;
  const percent = unlimited ? 0 : (user.used_traffic / (user.data_limit as number)) * 100;
  const tone = usageTone(percent);
  const reset = user.data_limit_reset_strategy && RESET_KEY[user.data_limit_reset_strategy];
  return (
    <VStack align="stretch" spacing="5px" w="full">
      <Flex justify="space-between" fontSize="13px" gap={2}>
        <Text as="span" whiteSpace="nowrap">
          {formatBytes(user.used_traffic)}{" "}
          <Muted>/ {unlimited ? t("usersTable.unlimited") : formatBytes(user.data_limit as number)}</Muted>
        </Text>
        {!unlimited && (
          <Text as="span" color={tone.text || "text-muted"} fontWeight={tone.text ? 600 : 400}>
            {Math.min(999, Math.round(percent))} %
          </Text>
        )}
      </Flex>
      <Bar value={unlimited ? 100 : percent} color={unlimited ? "border-strong" : tone.bar} />
      {!compact && (
        <Help>
          {reset ? t(`usersTable.resets.${reset}`) : t("usersTable.noReset")}
          {" · "}
          {t("usersTable.lifetime", { total: formatBytes(user.lifetime_used_traffic) })}
        </Help>
      )}
    </VStack>
  );
};

const statusDetail = (user: User, t: (k: string, o?: object) => string): string | null => {
  if (user.status === "on_hold" && user.on_hold_expire_duration)
    return t("usersTable.onHoldDays", { count: Math.round(user.on_hold_expire_duration / 86400) });
  if (user.status === "limited") return t("usersTable.limitReached");
  if (!user.expire) return t("usersTable.neverExpires");
  return null;
};

const Status: FC<{ user: User }> = ({ user }) => {
  const { t } = useTranslation();
  const detail = statusDetail(user, t);
  return (
    <VStack align="flex-start" spacing={1}>
      <StatusBadge status={user.status} expiryDate={user.expire} stacked />
      {detail && <Help>{detail}</Help>}
    </VStack>
  );
};

const Protocols: FC<{ user: User }> = ({ user }) => (
  <Flex gap={1} wrap="wrap">
    {Object.keys(user.proxies || {}).map((p) => (
      <Chip key={p}>{PROTOCOL_LABEL[p] || p}</Chip>
    ))}
  </Flex>
);

const RowCheckbox: FC<{ username: string }> = ({ username }) => {
  const isSelected = useFeatures((s) => s.selected.includes(username));
  const toggle = useFeatures((s) => s.toggleSelected);
  return <Checkbox aria-label={`select ${username}`} isChecked={isSelected} onChange={() => toggle(username)} />;
};

const SelectAllCheckbox: FC<{ usernames: string[] }> = ({ usernames }) => {
  const { selected, setSelected } = useFeatures();
  const onPage = usernames.filter((u) => selected.includes(u)).length;
  return (
    <Checkbox
      aria-label="select all users on this page"
      isChecked={usernames.length > 0 && onPage === usernames.length}
      isIndeterminate={onPage > 0 && onPage < usernames.length}
      onChange={(e) =>
        setSelected(
          e.target.checked
            ? Array.from(new Set([...selected, ...usernames]))
            : selected.filter((u) => !usernames.includes(u))
        )
      }
    />
  );
};

const SortHeader: FC<{ column: string; children: ReactNode; w?: string }> = ({ column, children, w }) => {
  const { filters, onFilterChange } = useDashboard();
  const active = filters.sort.replace("-", "") === column;
  const next = () => {
    let sort = filters.sort;
    if (sort.includes(column)) sort = sort.startsWith("-") ? "-created_at" : "-" + column;
    else sort = column;
    onFilterChange({ sort });
  };
  return (
    <Th w={w} aria-sort={active ? (filters.sort.startsWith("-") ? "descending" : "ascending") : undefined}>
      <HStack as="button" type="button" spacing={1} onClick={next} color={active ? "text" : undefined} _hover={{ color: "text" }}>
        <span>{children}</span>
        <Icons.sort opacity={active ? 1 : 0.5} transform={active && !filters.sort.startsWith("-") ? "scaleY(-1)" : undefined} />
      </HStack>
    </Th>
  );
};

export const UsersTable: FC = () => {
  const {
    filters,
    users: { users, total },
    onEditingUser,
  } = useDashboard();
  const { t } = useTranslation();
  const selected = useFeatures((s) => s.selected);
  const isFiltered =
    !!(filters.search || filters.status || filters.expire_before || filters.usage_percent_above || filters.online_within || filters.admin) ||
    users.length !== total;

  return (
    <Box id="users-table">
      {/* desktop and tablets */}
      <Box display={{ base: "none", md: "block" }} overflowX="auto">
        <Table minW="980px">
          <Thead>
            <Tr>
              <Th w="20px" pr={0}>
                <SelectAllCheckbox usernames={users.map((u) => u.username)} />
              </Th>
              <SortHeader column="username">{t("usersTable.user")}</SortHeader>
              <SortHeader column="expire">{t("usersTable.status")}</SortHeader>
              <SortHeader column="used_traffic" w="240px">
                {t("usersTable.dataUsage")}
              </SortHeader>
              <Th>{t("usersTable.protocols")}</Th>
              <SortHeader column="online_at">{t("usersTable.lastOnline")}</SortHeader>
              <Th textAlign="right">{t("usersTable.actions")}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {users.map((user) => (
              <Tr
                key={user.username}
                className={classNames("interactive", { selected: selected.includes(user.username) })}
                onClick={() => onEditingUser(user)}
              >
                <Td pr={0} onClick={(e) => e.stopPropagation()}>
                  <RowCheckbox username={user.username} />
                </Td>
                <Td maxW="280px">
                  <HStack spacing="10px">
                    <OnlineBadge lastOnline={user.online_at} />
                    <VStack align="flex-start" spacing={0} minW={0}>
                      <Text fontWeight={600} noOfLines={1}>
                        {user.username}
                      </Text>
                      {user.note && (
                        <Help noOfLines={1} title={user.note}>
                          {user.note}
                        </Help>
                      )}
                    </VStack>
                  </HStack>
                </Td>
                <Td>
                  <Status user={user} />
                </Td>
                <Td>
                  <Usage user={user} />
                </Td>
                <Td>
                  <Protocols user={user} />
                </Td>
                <Td>
                  <OnlineStatus lastOnline={user.online_at} />
                </Td>
                <Td>
                  <ActionButtons user={user} />
                </Td>
              </Tr>
            ))}
            {users.length === 0 && (
              <Tr>
                <Td colSpan={7}>
                  <EmptySection isFiltered={isFiltered} />
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Box>

      {/* phones: one card per user */}
      <VStack display={{ base: "flex", md: "none" }} align="stretch" spacing="10px" p={3}>
        {users.map((user) => (
          <MobileCard key={user.username} user={user} onOpen={() => onEditingUser(user)} />
        ))}
        {users.length === 0 && <EmptySection isFiltered={isFiltered} />}
      </VStack>
      <Pagination />
    </Box>
  );
};

const MobileCard: FC<{ user: User; onOpen: () => void }> = ({ user, onOpen }) => {
  const { t } = useTranslation();
  const isSelected = useFeatures((s) => s.selected.includes(user.username));
  return (
    <Box
      as="article"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && onOpen()}
      bg={isSelected ? "surface-selected" : "surface"}
      borderWidth="1px"
      borderColor="border"
      borderRadius="lg"
      p="12px 14px"
      display="flex"
      flexDirection="column"
      gap="8px"
      _focusVisible={{ boxShadow: "outline", outline: "none" }}
    >
      <HStack spacing={2}>
        <Box onClick={(e) => e.stopPropagation()}>
          <RowCheckbox username={user.username} />
        </Box>
        <OnlineBadge lastOnline={user.online_at} />
        <Text fontWeight={600} flex={1} noOfLines={1}>
          {user.username}
        </Text>
        <Pill tone={statusTone[user.status] || "neutral"}>{t(`status.${user.status}`)}</Pill>
      </HStack>
      <Usage user={user} compact />
      <HStack justify="space-between" spacing={2}>
        <Help noOfLines={1}>
          {[mobileExpiry(user, t), onlineText(user.online_at, t, true)].filter(Boolean).join(" · ")}
        </Help>
        <ActionButtons user={user} />
      </HStack>
    </Box>
  );
};

const mobileExpiry = (user: User, t: (k: string, o?: object) => string) => {
  const detail = statusDetail(user, t);
  if (detail) return detail;
  if (!user.expire) return null;
  const days = Math.round((user.expire * 1000 - Date.now()) / 86400000);
  return days >= 0 ? t("usersTable.expiresInDays", { count: days }) : t("usersTable.expiredDaysAgo", { count: -days });
};

const ActionButtons: FC<{ user: User }> = ({ user }) => {
  const { t } = useTranslation();
  const { setQRCode, setSubLink } = useDashboard();
  const [copied, setCopied] = useState<number | null>(null);
  useEffect(() => {
    if (copied === null) return;
    const id = setTimeout(() => setCopied(null), 1200);
    return () => clearTimeout(id);
  }, [copied]);
  const subUrl = user.subscription_url.startsWith("/") ? window.location.origin + user.subscription_url : user.subscription_url;
  return (
    <HStack spacing={1} justify="flex-end" onClick={(e) => e.stopPropagation()}>
      <CopyToClipboard text={subUrl} onCopy={() => setCopied(0)}>
        <Box>
          <Tooltip label={copied === 0 ? t("usersTable.copied") : t("usersTable.copyLink")} placement="top">
            <IconButton size="sm" variant="ghost" aria-label={t("usersTable.copyLink")} icon={copied === 0 ? <Icons.copied /> : <Icons.link />} />
          </Tooltip>
        </Box>
      </CopyToClipboard>
      <CopyToClipboard text={user.links.join("\r\n")} onCopy={() => setCopied(1)}>
        <Box>
          <Tooltip label={copied === 1 ? t("usersTable.copied") : t("usersTable.copyConfigs")} placement="top">
            <IconButton size="sm" variant="ghost" aria-label={t("usersTable.copyConfigs")} icon={copied === 1 ? <Icons.copied /> : <Icons.copy />} />
          </Tooltip>
        </Box>
      </CopyToClipboard>
      <Tooltip label={t("usersTable.qrCode")} placement="top">
        <IconButton
          size="sm"
          variant="ghost"
          aria-label={t("usersTable.qrCode")}
          icon={<Icons.qr />}
          onClick={() => {
            useFeatures.getState().setSharing(user);
            setQRCode(user.links);
            setSubLink(user.subscription_url);
          }}
        />
      </Tooltip>
    </HStack>
  );
};

const EmptySection: FC<{ isFiltered: boolean }> = ({ isFiltered }) => {
  const { t } = useTranslation();
  const { onCreateUser } = useDashboard();
  return (
    <VStack py={10} spacing={3} w="full">
      <Flex w="56px" h="56px" borderRadius="full" bg="accent-soft" color="accent-text" align="center" justify="center">
        <Icons.empty />
      </Flex>
      <Text fontWeight={600}>{isFiltered ? t("usersTable.noUserMatched") : t("usersTable.noUser")}</Text>
      <Help textAlign="center" maxW="320px">
        {isFiltered ? t("usersTable.noUserMatchedHint") : t("usersTable.noUserHint")}
      </Help>
      {!isFiltered && (
        <Button size="sm" colorScheme="primary" onClick={() => onCreateUser(true)}>
          {t("createUser")}
        </Button>
      )}
    </VStack>
  );
};
