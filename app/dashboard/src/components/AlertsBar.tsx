import { Button, Wrap } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useDashboard } from "contexts/DashboardContext";
import { AlertsQueryKey } from "contexts/FeaturesContext";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { SystemAlerts } from "types/Management";

const QUICK_FILTER_RESET = {
  status: undefined,
  expire_before: undefined,
  usage_percent_above: undefined,
  online_within: undefined,
  offset: 0,
};

/** Things that need attention; each one filters the users table when clicked. */
export const AlertsBar: FC = () => {
  const { t } = useTranslation();
  const { onFilterChange, onEditingNodes } = useDashboard();
  const { data } = useQuery({
    queryKey: AlertsQueryKey,
    queryFn: () => fetch<SystemAlerts>("/system/alerts"),
    refetchInterval: 60_000,
  });
  if (!data) return null;

  const items = [
    {
      count: data.expiring_soon,
      label: t("alerts.expiringSoon", { count: data.expiring_soon, days: data.days }),
      color: "orange",
      onClick: () =>
        onFilterChange({
          ...QUICK_FILTER_RESET,
          status: "active",
          expire_before: Math.floor(Date.now() / 1000) + data.days * 86400,
        }),
    },
    {
      count: data.near_limit,
      label: t("alerts.nearLimit", { count: data.near_limit, percent: data.percent }),
      color: "orange",
      onClick: () =>
        onFilterChange({ ...QUICK_FILTER_RESET, status: "active", usage_percent_above: data.percent }),
    },
    {
      count: data.limited,
      label: t("alerts.limited", { count: data.limited }),
      color: "red",
      onClick: () => onFilterChange({ ...QUICK_FILTER_RESET, status: "limited" }),
    },
    {
      count: data.expired,
      label: t("alerts.expired", { count: data.expired }),
      color: "red",
      onClick: () => onFilterChange({ ...QUICK_FILTER_RESET, status: "expired" }),
    },
    {
      count: data.disconnected_nodes.length,
      label: t("alerts.nodesDown", { names: data.disconnected_nodes.join(", ") }),
      color: "red",
      onClick: () => onEditingNodes(true),
    },
  ].filter((item) => item.count > 0);

  if (!items.length) return null;
  return (
    <Wrap mt={4} spacing={2} data-testid="alerts-bar">
      {items.map((item) => (
        <Button
          key={item.label}
          size="xs"
          variant="subtle"
          colorScheme={item.color}
          bg={`${item.color}.100`}
          color={`${item.color}.800`}
          _dark={{ bg: `${item.color}.900`, color: `${item.color}.100` }}
          onClick={item.onClick}
        >
          {item.label}
        </Button>
      ))}
    </Wrap>
  );
};
