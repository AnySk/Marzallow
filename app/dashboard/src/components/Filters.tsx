import {
  Box,
  Button,
  chakra,
  Flex,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItemOption,
  MenuList,
  MenuOptionGroup,
  MenuDivider,
  Text,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  BarsArrowDownIcon,
  ChevronDownIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";
import classNames from "classnames";
import { FilterType, useDashboard } from "contexts/DashboardContext";
import { AdminsQueryKey } from "contexts/FeaturesContext";
import useGetUser from "hooks/useGetUser";
import { FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { AdminInfo } from "types/Management";
import { exportUsersCsv } from "utils/exportUsers";
import { generateErrorMessage } from "utils/toastHandler";
import { useAlerts } from "./AlertsBar";
import { useSystemStats } from "./Statistics";

const ic = (c: typeof FunnelIcon) => chakra(c, { baseStyle: { w: 4, h: 4 } });
const FilterIcon = ic(FunnelIcon);
const SortIcon = ic(BarsArrowDownIcon);
const DownIcon = ic(ChevronDownIcon);
const ExportIcon = ic(ArrowDownTrayIcon);
export const ReloadIcon = ic(ArrowPathIcon);

// Quick filters; each maps to users-list query parameters.
const QUICK_FILTERS: Record<string, () => Partial<FilterType>> = {
  all: () => ({}),
  active: () => ({ status: "active" }),
  expiring: () => ({ status: "active", expire_before: Math.floor(Date.now() / 1000) + 3 * 86400 }),
  near_limit: () => ({ status: "active", usage_percent_above: 80 }),
  limited: () => ({ status: "limited" }),
  expired: () => ({ status: "expired" }),
  disabled: () => ({ status: "disabled" }),
  on_hold: () => ({ status: "on_hold" }),
  online: () => ({ online_within: 300 }),
};
const QUICK_RESET: Partial<FilterType> = {
  status: undefined,
  expire_before: undefined,
  usage_percent_above: undefined,
  online_within: undefined,
};

export const currentQuickFilter = (filters: FilterType): string => {
  if (filters.online_within) return "online";
  if (filters.usage_percent_above) return "near_limit";
  if (filters.expire_before) return "expiring";
  if (filters.status) return filters.status;
  return "all";
};

const SORTS = ["-created_at", "created_at", "username", "expire", "-used_traffic", "-online_at"];

/** Status tabs with counts, then owner filter, sort, export and refresh. */
export const Filters: FC = () => {
  const { loading, filters, onFilterChange, refetchUsers } = useDashboard();
  const { t } = useTranslation();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const { userData } = useGetUser();
  const { data: stats } = useSystemStats();
  const { data: alerts } = useAlerts();
  const { data: admins } = useQuery({
    queryKey: AdminsQueryKey,
    queryFn: () => fetch<AdminInfo[]>("/admins"),
    enabled: userData.is_sudo,
  });

  const counts: Record<string, number | undefined> = {
    all: stats?.total_user,
    active: stats?.users_active,
    expiring: alerts?.expiring_soon,
    near_limit: alerts?.near_limit,
    limited: stats?.users_limited,
    expired: stats?.users_expired,
    disabled: stats?.users_disabled,
    on_hold: stats?.users_on_hold,
    online: stats?.online_users,
  };
  const current = currentQuickFilter(filters);
  const apply = (key: string) => onFilterChange({ ...QUICK_RESET, offset: 0, ...QUICK_FILTERS[key]() });

  const onExport = () => {
    setExporting(true);
    exportUsersCsv(filters)
      .catch((e) => generateErrorMessage(e, toast))
      .finally(() => setExporting(false));
  };

  return (
    <Flex
      id="filters"
      wrap="wrap"
      align="center"
      justify="space-between"
      gap={3}
      px={4}
      py={3}
      borderBottomWidth="1px"
      borderColor="border"
    >
      <Box
        as="nav"
        aria-label={t("filters.byStatus")}
        display="flex"
        gap={1}
        overflowX="auto"
        mx={{ base: -4, md: 0 }}
        px={{ base: 4, md: 0 }}
        sx={{ scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}
        maxW="full"
      >
        {Object.keys(QUICK_FILTERS).map((key) => {
          const on = key === current;
          return (
            <Button
              key={key}
              size="sm"
              variant="unstyled"
              display="inline-flex"
              alignItems="center"
              gap="6px"
              h="32px"
              px={3}
              borderRadius="md"
              fontWeight={500}
              fontSize="13px"
              flex="none"
              bg={on ? "inverse" : "transparent"}
              color={on ? "inverse-text" : "text-2"}
              _hover={on ? {} : { bg: "surface-hover", color: "text" }}
              _focusVisible={{ boxShadow: "outline" }}
              aria-current={on ? "true" : undefined}
              onClick={() => apply(key)}
            >
              {t(`filters.${key}`)}
              {counts[key] !== undefined && (
                <Text as="span" fontSize="12px" opacity={0.75}>
                  {counts[key]}
                </Text>
              )}
            </Button>
          );
        })}
      </Box>
      <HStack spacing={2}>
        {userData.is_sudo && !!admins?.length && (
          <Menu closeOnSelect>
            <MenuButton as={Button} size="sm" variant="outline" leftIcon={<FilterIcon />} rightIcon={<DownIcon />}>
              {filters.admin || t("filters.allOwners")}
            </MenuButton>
            <MenuList maxH="320px" overflowY="auto">
              <MenuOptionGroup
                type="radio"
                title={t("filters.owner")}
                value={filters.admin || ""}
                onChange={(v) => onFilterChange({ admin: (v as string) || undefined, offset: 0 })}
              >
                <MenuItemOption value="">{t("filters.allOwners")}</MenuItemOption>
                <MenuDivider />
                {admins.map((a) => (
                  <MenuItemOption key={a.username} value={a.username}>
                    {a.username}
                  </MenuItemOption>
                ))}
              </MenuOptionGroup>
            </MenuList>
          </Menu>
        )}
        <Menu closeOnSelect>
          <MenuButton as={Button} size="sm" variant="outline" leftIcon={<SortIcon />} rightIcon={<DownIcon />}>
            <Text as="span" display={{ base: "none", lg: "inline" }}>
              {t("sort.label")}:{" "}
            </Text>
            {t(`sort.${filters.sort}`, { defaultValue: filters.sort })}
          </MenuButton>
          <MenuList>
            <MenuOptionGroup type="radio" value={filters.sort} onChange={(v) => onFilterChange({ sort: v as string, offset: 0 })}>
              {SORTS.map((s) => (
                <MenuItemOption key={s} value={s}>
                  {t(`sort.${s}`)}
                </MenuItemOption>
              ))}
            </MenuOptionGroup>
          </MenuList>
        </Menu>
        <Tooltip label={t("filters.exportCsv")}>
          <IconButton aria-label={t("filters.exportCsv")} size="sm" variant="outline" isLoading={exporting} onClick={onExport} icon={<ExportIcon />} />
        </Tooltip>
        <Tooltip label={t("filters.refresh")}>
          <IconButton
            aria-label={t("filters.refresh")}
            size="sm"
            variant="outline"
            isDisabled={loading}
            onClick={refetchUsers}
            icon={<ReloadIcon className={classNames({ "animate-spin": loading })} />}
          />
        </Tooltip>
      </HStack>
    </Flex>
  );
};
