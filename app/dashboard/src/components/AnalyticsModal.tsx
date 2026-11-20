/* Analytics page: traffic over a period, the heaviest users and nodes. */
import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  SimpleGrid,
  Skeleton,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorMode,
  VStack,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useDashboard } from "contexts/DashboardContext";
import dayjs from "dayjs";
import useGetUser from "hooks/useGetUser";
import { FC, ReactNode, useMemo, useState } from "react";
import ReactApexChart from "react-apexcharts";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { formatBytes } from "utils/formatByte";
import { Bar, Help, PageHeader, Panel } from "./ui";

type DailyUsage = { date: string; used_traffic: number };
type Summary = {
  total: number;
  previous_total: number;
  users_with_traffic: number;
  average_per_user: number;
  median_per_user: number;
  busiest_day: DailyUsage | null;
  new_users: number;
  top_users: { username: string; used_traffic: number }[];
};
type NodeUsage = { node_id: number | null; node_name: string; uplink: number; downlink: number };

const RANGES = [7, 30, 90];

const Kpi: FC<{ label: string; value: ReactNode; help?: ReactNode; loading: boolean }> = ({ label, value, help, loading }) => (
  <Panel px="18px" py={4} display="flex" flexDirection="column" gap={2}>
    <Text color="text-muted" fontSize="13px" fontWeight={500}>
      {label}
    </Text>
    {loading ? (
      <Skeleton h="28px" w="60%" />
    ) : (
      <>
        <Text fontSize="26px" fontWeight={700} letterSpacing="-.02em" lineHeight="1.1">
          {value}
        </Text>
        {help && <Help>{help}</Help>}
      </>
    )}
  </Panel>
);

const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

export const AnalyticsModal: FC = () => {
  const { t } = useTranslation();
  const { colorMode } = useColorMode();
  const dark = colorMode === "dark";
  const muted = dark ? "#9AA4B2" : "#5F6B7A";
  const { userData } = useGetUser();
  const { onFilterChange } = useDashboard();
  const [days, setDays] = useState<number | "custom">(30);
  const [custom, setCustom] = useState({ from: dayjs().subtract(14, "day").format("YYYY-MM-DD"), to: dayjs().format("YYYY-MM-DD") });
  const [asTable, setAsTable] = useState(false);

  const { start, end, span } = useMemo(() => {
    if (days === "custom") {
      const s = dayjs.utc(custom.from).startOf("day");
      const e = dayjs.utc(custom.to).endOf("day");
      return { start: s, end: e, span: Math.max(1, e.diff(s, "day") + 1) };
    }
    return { start: dayjs().utc().subtract(days, "day"), end: dayjs().utc(), span: days };
  }, [days, custom]);
  const query = { start: start.format("YYYY-MM-DDTHH:mm:ss"), end: end.format("YYYY-MM-DDTHH:mm:ss") };

  const { data: daily, isLoading } = useQuery({
    queryKey: ["daily-usage", query],
    queryFn: () => fetch<DailyUsage[]>("/users/usage/daily", { query }),
  });
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["usage-summary", query],
    queryFn: () => fetch<Summary>("/users/usage/summary", { query }),
  });
  const { data: nodes } = useQuery({
    queryKey: ["nodes-usage", query],
    queryFn: () => fetch<{ usages: NodeUsage[] }>("/nodes/usage", { query }),
    enabled: userData.is_sudo,
  });

  // fill days without traffic so the chart has a continuous axis
  const byDate = new Map((daily || []).map((d) => [d.date, d.used_traffic]));
  const dates = Array.from({ length: span }, (_, i) => start.add(i, "day").format("YYYY-MM-DD")).filter(
    (d) => !dayjs(d).isAfter(end, "day")
  );
  const values = dates.map((d) => byDate.get(d) || 0);
  const change =
    summary && summary.previous_total > 0 ? Math.round(((summary.total - summary.previous_total) / summary.previous_total) * 100) : null;
  const topMax = Math.max(1, ...(summary?.top_users || []).map((u) => u.used_traffic));
  const nodeRows = (nodes?.usages || []).map((n) => ({ name: n.node_name, used: n.uplink + n.downlink })).sort((a, b) => b.used - a.used);
  const nodeMax = Math.max(1, ...nodeRows.map((n) => n.used));

  const exportCsv = () => {
    const rows: (string | number)[][] = [["date", "used_bytes"], ...dates.map((d, i) => [d, values[i]])];
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `traffic_${dates[0]}_${dates[dates.length - 1]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader
        title={t("analytics.title")}
        subtitle={`${start.format("MMM D")} – ${end.format("MMM D, YYYY")}`}
        actions={
          <>
            <Flex bg="chakra-subtle-bg" borderRadius="9px" p="3px" gap="2px" role="radiogroup" aria-label={t("analytics.range")}>
              {[...RANGES, "custom" as const].map((r) => (
                <Button
                  key={r}
                  role="radio"
                  aria-checked={days === r}
                  h="30px"
                  px={3}
                  variant="unstyled"
                  fontSize="13px"
                  fontWeight={500}
                  borderRadius="7px"
                  bg={days === r ? "surface" : "transparent"}
                  boxShadow={days === r ? "0 1px 2px rgba(16,24,40,.12)" : "none"}
                  onClick={() => setDays(r)}
                >
                  {r === "custom" ? t("analytics.custom") : t("analytics.lastDays", { count: r })}
                </Button>
              ))}
            </Flex>
            <Button variant="outline" onClick={exportCsv} isDisabled={!daily}>
              {t("filters.exportCsv")}
            </Button>
          </>
        }
      />
      {days === "custom" && (
        <HStack spacing={3} flexWrap="wrap">
          <Input type="date" w="180px" aria-label={t("analytics.from")} value={custom.from} max={custom.to}
            onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} />
          <Text color="text-muted">–</Text>
          <Input type="date" w="180px" aria-label={t("analytics.to")} value={custom.to} min={custom.from} max={dayjs().format("YYYY-MM-DD")}
            onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} />
        </HStack>
      )}

      <SimpleGrid minChildWidth="210px" spacing={4}>
        <Kpi
          label={t("analytics.traffic")}
          loading={summaryLoading}
          value={summary ? formatBytes(summary.total) : "—"}
          help={
            change === null ? (
              t("analytics.noPrevious")
            ) : (
              <Text as="span" color={change >= 0 ? "success-fg" : "warning-fg"} fontWeight={600}>
                {t("analytics.vsPrevious", { change: `${change >= 0 ? "+" : ""}${change}` })}
              </Text>
            )
          }
        />
        <Kpi
          label={t("analytics.perUser")}
          loading={summaryLoading}
          value={summary ? formatBytes(summary.average_per_user) : "—"}
          help={summary && t("analytics.median", { value: formatBytes(summary.median_per_user), count: summary.users_with_traffic })}
        />
        <Kpi
          label={t("analytics.busiestDay")}
          loading={summaryLoading}
          value={summary?.busiest_day ? formatBytes(summary.busiest_day.used_traffic) : "—"}
          help={summary?.busiest_day && dayjs(summary.busiest_day.date).format("ddd, MMM D")}
        />
        <Kpi label={t("analytics.newUsers")} loading={summaryLoading} value={summary?.new_users ?? "—"} help={t("analytics.createdInPeriod")} />
      </SimpleGrid>

      <Panel p={{ base: 3, md: 5 }}>
        <Flex justify="space-between" align="center" mb={2} gap={2} wrap="wrap">
          <Box>
            <Text fontWeight={650}>{t("analytics.daily")}</Text>
            <Help>{t("analytics.dailyHelp")}</Help>
          </Box>
          <Button size="sm" variant="ghost" onClick={() => setAsTable(!asTable)}>
            {asTable ? t("analytics.viewChart") : t("analytics.viewTable")}
          </Button>
        </Flex>
        <Box minH="260px" data-testid="daily-usage-chart">
          {isLoading ? (
            <Skeleton h="260px" />
          ) : asTable ? (
            <Box maxH="320px" overflowY="auto">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>{t("analytics.date")}</Th>
                    <Th isNumeric>{t("analytics.traffic")}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {dates.map((d, i) => (
                    <Tr key={d}>
                      <Td>{dayjs(d).format("ddd, MMM D")}</Td>
                      <Td isNumeric>{formatBytes(values[i])}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          ) : (
            <ReactApexChart
              type="bar"
              height={260}
              series={[{ name: t("analytics.traffic"), data: values }]}
              options={{
                chart: { toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
                theme: { mode: colorMode },
                dataLabels: { enabled: false },
                grid: { borderColor: dark ? "#1C2639" : "#EEF0F3", strokeDashArray: 0 },
                plotOptions: { bar: { borderRadius: 4, borderRadiusApplication: "end", columnWidth: "60%" } },
                xaxis: {
                  categories: dates.map((d) => dayjs(d).format("MMM D")),
                  tickAmount: Math.min(10, dates.length),
                  axisBorder: { color: dark ? "#243049" : "#E4E7EC" },
                  axisTicks: { color: dark ? "#243049" : "#E4E7EC" },
                  labels: { style: { colors: muted } },
                },
                yaxis: { labels: { formatter: (v: number) => String(formatBytes(v, 1)), style: { colors: muted } } },
                tooltip: { theme: colorMode, y: { formatter: (v: number) => String(formatBytes(v)) } },
                colors: [dark ? "#6E95F2" : "#2454D3"],
              }}
            />
          )}
        </Box>
      </Panel>

      <SimpleGrid columns={{ base: 1, lg: userData.is_sudo ? 2 : 1 }} spacing={4}>
        <Panel p={{ base: 3, md: 5 }}>
          <Flex justify="space-between" align="center" mb={3}>
            <Text fontWeight={650}>{t("analytics.topUsers")}</Text>
            <Button size="sm" variant="ghost" onClick={() => onFilterChange({ sort: "-used_traffic", offset: 0 })} as="a" href="#/">
              {t("analytics.allUsers")}
            </Button>
          </Flex>
          <VStack align="stretch" spacing={3}>
            {(summary?.top_users || []).map((u) => (
              <Box key={u.username}>
                <Flex justify="space-between" fontSize="13px" mb={1}>
                  <Text fontWeight={500}>{u.username}</Text>
                  <Text color="text-muted">{formatBytes(u.used_traffic)}</Text>
                </Flex>
                <Bar value={(u.used_traffic / topMax) * 100} />
              </Box>
            ))}
            {summary && !summary.top_users.length && <Help>{t("analytics.noTraffic")}</Help>}
          </VStack>
        </Panel>
        {userData.is_sudo && (
          <Panel p={{ base: 3, md: 5 }}>
            <Flex justify="space-between" align="center" mb={3}>
              <Text fontWeight={650}>{t("analytics.byNode")}</Text>
              <Button size="sm" variant="ghost" as="a" href="#/nodes">
                {t("nav.nodes")}
              </Button>
            </Flex>
            <VStack align="stretch" spacing={3}>
              {nodeRows.map((n) => (
                <Box key={n.name}>
                  <Flex justify="space-between" fontSize="13px" mb={1}>
                    <Text fontWeight={500}>{n.name}</Text>
                    <Text color="text-muted">{formatBytes(n.used)}</Text>
                  </Flex>
                  <Bar value={(n.used / nodeMax) * 100} />
                </Box>
              ))}
              {nodes && !nodeRows.length && <Help>{t("analytics.noTraffic")}</Help>}
            </VStack>
            <Help mt={3}>{t("analytics.nodeNote")}</Help>
          </Panel>
        )}
      </SimpleGrid>
    </>
  );
};

export default AnalyticsModal;
