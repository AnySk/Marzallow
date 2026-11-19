import { Box, BoxProps, Flex, HStack, SimpleGrid, Skeleton, Text, VStack } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useDashboard } from "contexts/DashboardContext";
import { FC, ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { formatBytes, numberWithCommas } from "utils/formatByte";
import { Bar, Dot, Help, Panel } from "./ui";

export type SystemStats = {
  version: string;
  mem_total: number;
  mem_used: number;
  cpu_cores: number;
  cpu_usage: number;
  total_user: number;
  online_users: number;
  users_active: number;
  users_on_hold: number;
  users_disabled: number;
  users_expired: number;
  users_limited: number;
  incoming_bandwidth: number;
  outgoing_bandwidth: number;
  incoming_bandwidth_speed: number;
  outgoing_bandwidth_speed: number;
};

export const StatisticsQueryKey = ["statistics-query-key"];

export const useSystemStats = () =>
  useQuery({
    queryKey: StatisticsQueryKey,
    queryFn: () => fetch<SystemStats>("/system"),
    refetchInterval: 5000,
  });

const StatCard: FC<{ title: string; children: ReactNode; loading: boolean }> = ({ title, children, loading }) => (
  <Panel px="18px" py={4} display="flex" flexDirection="column" gap="10px" minH="132px">
    <Text color="text-muted" fontSize="13px" fontWeight={500}>
      {title}
    </Text>
    {loading ? (
      <VStack align="stretch" spacing={3}>
        <Skeleton h="28px" w="60%" />
        <Skeleton h="8px" />
      </VStack>
    ) : (
      children
    )}
  </Panel>
);

const Big: FC<{ children: ReactNode }> = ({ children }) => (
  <Text as="span" fontSize="28px" fontWeight={700} letterSpacing="-.02em" lineHeight="1.1">
    {children}
  </Text>
);

const Meter: FC<{ label: string; value: number; text: string }> = ({ label, value, text }) => (
  <Box display="grid" gridTemplateColumns="40px 1fr auto" alignItems="center" gap={2} fontSize="13px">
    <Text color="text-muted">{label}</Text>
    <Bar value={value} />
    <Text textAlign="right" whiteSpace="nowrap" sx={{ fontVariantNumeric: "tabular-nums" }}>
      {text}
    </Text>
  </Box>
);

export const Statistics: FC<BoxProps> = (props) => {
  const { version } = useDashboard();
  const { data: s, isLoading } = useSystemStats();
  const { t } = useTranslation();

  // react-query v5 removed per-query onSuccess; sync the core version here instead.
  useEffect(() => {
    if (s?.version && version !== s.version) useDashboard.setState({ version: s.version });
  }, [s?.version, version]);

  const segments = s
    ? [
        { n: s.users_active, color: "success-dot", label: t("status.active") },
        { n: s.users_limited, color: "warning-dot", label: t("status.limited") },
        { n: s.users_expired, color: "danger-dot", label: t("status.expired") },
        { n: s.users_disabled, color: "neutral-dot", label: t("status.disabled") },
        { n: s.users_on_hold, color: "hold-dot", label: t("status.on_hold") },
      ]
    : [];
  const speed = s ? s.incoming_bandwidth_speed + s.outgoing_bandwidth_speed : 0;

  return (
    <SimpleGrid
      as="section"
      aria-label={t("stats.overview")}
      minChildWidth="230px"
      spacing={4}
      display={{ base: "none", md: "grid" }}
      {...props}
    >
      <StatCard title={t("activeUsers")} loading={isLoading}>
        {s && (
          <>
            <HStack align="baseline" spacing="6px">
              <Big>{numberWithCommas(s.users_active)}</Big>
              <Text color="text-muted">{t("stats.of", { total: numberWithCommas(s.total_user) })}</Text>
            </HStack>
            <Flex
              h="8px"
              borderRadius="4px"
              overflow="hidden"
              gap="2px"
              bg="bar-track"
              role="img"
              aria-label={segments.map((x) => `${x.n} ${x.label}`).join(", ")}
            >
              {segments
                .filter((x) => x.n > 0)
                .map((x) => (
                  <Box key={x.label} flex={x.n} bg={x.color} />
                ))}
            </Flex>
            <Help>
              {segments
                .slice(1)
                .map((x) => `${x.n} ${x.label.toLowerCase()}`)
                .join(" · ")}
            </Help>
          </>
        )}
      </StatCard>
      <StatCard title={t("dataUsage")} loading={isLoading}>
        {s && (
          <>
            <Big>{formatBytes(s.incoming_bandwidth + s.outgoing_bandwidth)}</Big>
            <Help mt="auto">
              {t("stats.traffic", {
                down: formatBytes(s.incoming_bandwidth),
                up: formatBytes(s.outgoing_bandwidth),
              })}
            </Help>
            <Help>{t("stats.speed", { speed: formatBytes(speed) })}</Help>
          </>
        )}
      </StatCard>
      <StatCard title={t("stats.onlineNow")} loading={isLoading}>
        {s && (
          <>
            <HStack align="baseline" spacing={2}>
              <Big>{numberWithCommas(s.online_users)}</Big>
              <Text color="text-muted">{t("stats.onlineHint")}</Text>
            </HStack>
            <Help mt="auto">
              {s.total_user ? t("stats.onlineShare", { percent: Math.round((s.online_users / s.total_user) * 100) }) : ""}
            </Help>
          </>
        )}
      </StatCard>
      <StatCard title={t("stats.server")} loading={isLoading}>
        {s && (
          <VStack align="stretch" spacing={2}>
            <Meter label={t("stats.cpu")} value={s.cpu_usage} text={`${Math.round(s.cpu_usage)} %`} />
            <Meter
              label={t("stats.ram")}
              value={s.mem_total ? (s.mem_used / s.mem_total) * 100 : 0}
              text={`${formatBytes(s.mem_used, 1)} / ${formatBytes(s.mem_total, 1)}`}
            />
            <HStack spacing="6px" pt={1}>
              <Dot color="success-dot" />
              <Help>{t("stats.cores", { count: s.cpu_cores })}</Help>
            </HStack>
          </VStack>
        )}
      </StatCard>
    </SimpleGrid>
  );
};
