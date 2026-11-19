import {
  BoxProps,
  Button,
  chakra,
  Grid,
  GridItem,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Select,
  Spinner,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import classNames from "classnames";
import { FilterType, useDashboard } from "contexts/DashboardContext";
import { AdminsQueryKey } from "contexts/FeaturesContext";
import useGetUser from "hooks/useGetUser";
import debounce from "lodash.debounce";
import { fetch } from "service/http";
import { AdminInfo } from "types/Management";
import { exportUsersCsv } from "utils/exportUsers";
import { generateErrorMessage } from "utils/toastHandler";
import React, { FC, useState } from "react";
import { useTranslation } from "react-i18next";

const iconProps = {
  baseStyle: {
    w: 4,
    h: 4,
  },
};

const SearchIcon = chakra(MagnifyingGlassIcon, iconProps);
const ClearIcon = chakra(XMarkIcon, iconProps);
export const ReloadIcon = chakra(ArrowPathIcon, iconProps);
const ExportIcon = chakra(ArrowDownTrayIcon, iconProps);

// "Show" presets; each maps to users-list query parameters
const QUICK_FILTERS: Record<string, () => Partial<FilterType>> = {
  all: () => ({}),
  active: () => ({ status: "active" }),
  disabled: () => ({ status: "disabled" }),
  limited: () => ({ status: "limited" }),
  expired: () => ({ status: "expired" }),
  on_hold: () => ({ status: "on_hold" }),
  expiring: () => ({ status: "active", expire_before: Math.floor(Date.now() / 1000) + 3 * 86400 }),
  near_limit: () => ({ status: "active", usage_percent_above: 80 }),
  online: () => ({ online_within: 300 }),
  recent: () => ({ sort: "-online_at" }),
};
const QUICK_RESET: Partial<FilterType> = {
  status: undefined,
  expire_before: undefined,
  usage_percent_above: undefined,
  online_within: undefined,
};

const currentQuickFilter = (filters: FilterType): string => {
  if (filters.online_within) return "online";
  if (filters.usage_percent_above) return "near_limit";
  if (filters.expire_before) return "expiring";
  if (filters.status) return filters.status;
  if (filters.sort === "-online_at") return "recent";
  return "all";
};

export type FilterProps = {} & BoxProps;
const setSearchField = debounce((search: string) => {
  useDashboard.getState().onFilterChange({
    ...useDashboard.getState().filters,
    offset: 0,
    search,
  });
}, 300);

export const Filters: FC<FilterProps> = ({ ...props }) => {
  const { loading, filters, onFilterChange, refetchUsers, onCreateUser } =
    useDashboard();
  const { t } = useTranslation();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const { userData } = useGetUser();
  const { data: admins } = useQuery({
    queryKey: AdminsQueryKey,
    queryFn: () => fetch<AdminInfo[]>("/admins"),
    enabled: userData.is_sudo,
  });
  const applyQuickFilter = (key: string) => {
    const sort = key === "recent" ? "-online_at" : filters.sort === "-online_at" ? "-created_at" : filters.sort;
    onFilterChange({ ...QUICK_RESET, sort, offset: 0, ...QUICK_FILTERS[key]() });
  };
  const onExport = () => {
    setExporting(true);
    exportUsersCsv(filters)
      .catch((e) => generateErrorMessage(e, toast))
      .finally(() => setExporting(false));
  };
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setSearchField(e.target.value);
  };
  const clear = () => {
    setSearch("");
    onFilterChange({
      ...filters,
      offset: 0,
      search: "",
    });
  };
  return (
    <Grid
      id="filters"
      templateColumns={{
        lg: "repeat(3, 1fr)",
        md: "repeat(4, 1fr)",
        base: "repeat(1, 1fr)",
      }}
      position="sticky"
      top={0}
      mx="-6"
      px="6"
      rowGap={4}
      gap={{
        lg: 4,
        base: 0,
      }}
      bg="var(--chakra-colors-chakra-body-bg)"
      py={4}
      zIndex="docked"
      {...props}
    >
      <GridItem colSpan={{ base: 1, md: 2, lg: 1 }} order={{ base: 2, md: 1 }}>
        <InputGroup>
          <InputLeftElement pointerEvents="none" children={<SearchIcon />} />
          <Input
            placeholder={t("search")}
            value={search}
            borderColor="light-border"
            onChange={onChange}
          />

          <InputRightElement>
            {loading && <Spinner size="xs" />}
            {filters.search && filters.search.length > 0 && (
              <IconButton
                onClick={clear}
                aria-label="clear"
                size="xs"
                variant="ghost"
              >
                <ClearIcon />
              </IconButton>
            )}
          </InputRightElement>
        </InputGroup>
      </GridItem>
      <GridItem colSpan={2} order={{ base: 1, md: 2 }}>
        <HStack justifyContent="flex-end" alignItems="center" h="full" flexWrap="wrap">
          <Select
            size="sm"
            maxW="190px"
            aria-label={t("filters.show")}
            value={currentQuickFilter(filters)}
            onChange={(e) => applyQuickFilter(e.target.value)}
          >
            {Object.keys(QUICK_FILTERS).map((key) => (
              <option key={key} value={key}>
                {t(`filters.${key}`)}
              </option>
            ))}
          </Select>
          {userData.is_sudo && !!admins?.length && (
            <Select
              size="sm"
              maxW="150px"
              aria-label={t("filters.owner")}
              value={filters.admin || ""}
              onChange={(e) => onFilterChange({ admin: e.target.value || undefined, offset: 0 })}
            >
              <option value="">{t("filters.allOwners")}</option>
              {admins.map((admin) => (
                <option key={admin.username} value={admin.username}>
                  {admin.username}
                </option>
              ))}
            </Select>
          )}
          <Tooltip label={t("filters.exportCsv")}>
            <IconButton
              aria-label={t("filters.exportCsv")}
              size="sm"
              variant="outline"
              isLoading={exporting}
              onClick={onExport}
            >
              <ExportIcon />
            </IconButton>
          </Tooltip>
          <IconButton
            aria-label="refresh users"
            disabled={loading}
            onClick={refetchUsers}
            size="sm"
            variant="outline"
          >
            <ReloadIcon
              className={classNames({
                "animate-spin": loading,
              })}
            />
          </IconButton>
          <Button
            colorScheme="primary"
            size="sm"
            onClick={() => onCreateUser(true)}
            px={5}
          >
            {t("createUser")}
          </Button>
        </HStack>
      </GridItem>
    </Grid>
  );
};
