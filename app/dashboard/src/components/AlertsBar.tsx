import { chakra, Flex, HStack, Text } from "@chakra-ui/react";
import { ClockIcon, ExclamationTriangleIcon, ServerStackIcon, ChartBarIcon, NoSymbolIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useDashboard } from "contexts/DashboardContext";
import { AlertsQueryKey } from "contexts/FeaturesContext";
import { FC, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { fetch } from "service/http";
import { SystemAlerts } from "types/Management";

const QUICK_FILTER_RESET = {
  status: undefined,
  expire_before: undefined,
  usage_percent_above: undefined,
  online_within: undefined,
  offset: 0,
};

const ic = (c: typeof ClockIcon) => chakra(c, { baseStyle: { w: "18px", h: "18px", flex: "none" } });
const Icons = { clock: ic(ClockIcon), chart: ic(ChartBarIcon), warn: ic(ExclamationTriangleIcon), node: ic(ServerStackIcon), stop: ic(NoSymbolIcon) };

export const useAlerts = () =>
  useQuery({
    queryKey: AlertsQueryKey,
    queryFn: () => fetch<SystemAlerts>("/system/alerts"),
    refetchInterval: 60_000,
  });

type Item = { key: string; count: number; text: ReactNode; tone: "warning" | "danger"; icon: ReactNode; action: string; onClick: () => void };

/** Things that need attention; each one filters the users table (or opens nodes). */
export const AlertsBar: FC = () => {
  const { t } = useTranslation();
  const { onFilterChange } = useDashboard();
  const navigate = useNavigate();
  const { data } = useAlerts();
  if (!data) return null;

  const review = t("alerts.review");
  const items: Item[] = [
    {
      key: "expiring",
      count: data.expiring_soon,
      tone: "warning",
      icon: <Icons.clock />,
      text: t("alerts.expiringSoon", { count: data.expiring_soon, days: data.days }),
      action: review,
      onClick: () =>
        onFilterChange({ ...QUICK_FILTER_RESET, status: "active", expire_before: Math.floor(Date.now() / 1000) + data.days * 86400 }),
    },
    {
      key: "near",
      count: data.near_limit,
      tone: "warning",
      icon: <Icons.chart />,
      text: t("alerts.nearLimit", { count: data.near_limit, percent: data.percent }),
      action: review,
      onClick: () => onFilterChange({ ...QUICK_FILTER_RESET, status: "active", usage_percent_above: data.percent }),
    },
    {
      key: "limited",
      count: data.limited,
      tone: "danger",
      icon: <Icons.stop />,
      text: t("alerts.limited", { count: data.limited }),
      action: review,
      onClick: () => onFilterChange({ ...QUICK_FILTER_RESET, status: "limited" }),
    },
    {
      key: "expired",
      count: data.expired,
      tone: "danger",
      icon: <Icons.clock />,
      text: t("alerts.expired", { count: data.expired }),
      action: review,
      onClick: () => onFilterChange({ ...QUICK_FILTER_RESET, status: "expired" }),
    },
    {
      key: "nodes",
      count: data.disconnected_nodes.length,
      tone: "danger",
      icon: <Icons.node />,
      text: t("alerts.nodesDown", { count: data.disconnected_nodes.length, names: data.disconnected_nodes.join(", ") }),
      action: t("alerts.open"),
      onClick: () => navigate("/nodes"),
    },
  ].filter((item) => item.count > 0) as Item[];

  if (!items.length) return null;
  return (
    <Flex
      as="section"
      aria-label={t("alerts.title")}
      wrap={{ base: "nowrap", md: "wrap" }}
      overflowX={{ base: "auto", md: "visible" }}
      mx={{ base: -4, md: 0 }}
      px={{ base: 4, md: 0 }}
      gap="10px"
      sx={{ scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}
      data-testid="alerts-bar"
    >
      {items.map((item) => (
        <HStack
          key={item.key}
          as="button"
          type="button"
          onClick={item.onClick}
          spacing="10px"
          px={3}
          py={2}
          borderRadius="10px"
          borderWidth="1px"
          fontSize="13px"
          textAlign="left"
          bg={`${item.tone}-bg`}
          color={`${item.tone}-fg`}
          borderColor={`${item.tone}-border`}
          flex="none"
          _hover={{ filter: "brightness(0.98)" }}
          _focusVisible={{ boxShadow: "outline", outline: "none" }}
        >
          {item.icon}
          <Text as="span">{item.text}</Text>
          <Text as="span" fontWeight={600} textDecoration="underline">
            {item.action}
          </Text>
        </HStack>
      ))}
    </Flex>
  );
};
