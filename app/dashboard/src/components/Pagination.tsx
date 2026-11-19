import {
  Button,
  ButtonGroup,
  chakra,
  HStack,
  IconButton,
  Select,
  Text,
} from "@chakra-ui/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useDashboard } from "contexts/DashboardContext";
import { ChangeEvent, FC } from "react";
import { useTranslation } from "react-i18next";
import { setUsersPerPageLimitSize } from "utils/userPreferenceStorage";

const PrevIcon = chakra(ChevronLeftIcon, {
  baseStyle: {
    w: 4,
    h: 4,
  },
});
const NextIcon = chakra(ChevronRightIcon, {
  baseStyle: {
    w: 4,
    h: 4,
  },
});

export type PaginationType = {
  count: number;
  perPage: number;
  page: number;
  onChange?: (page: number) => void;
};

const MINIMAL_PAGE_ITEM_COUNT = 5;

/**
 * Generate numeric page items around current page.
 *   - Always include first and last page
 *   - Add ellipsis if needed
 */
function generatePageItems(total: number, current: number, width: number) {
  if (width < MINIMAL_PAGE_ITEM_COUNT) {
    throw new Error(
      `Must allow at least ${MINIMAL_PAGE_ITEM_COUNT} page items`
    );
  }
  if (width % 2 === 0) {
    throw new Error(`Must allow odd number of page items`);
  }
  if (total < width) {
    return [...new Array(total).keys()];
  }
  const left = Math.max(
    0,
    Math.min(total - width, current - Math.floor(width / 2))
  );
  const items: (string | number)[] = new Array(width);
  for (let i = 0; i < width; i += 1) {
    items[i] = i + left;
  }
  // replace non-ending items with placeholders
  if ((items[0] as number) > 0) {
    items[0] = 0;
    items[1] = "prev-more";
  }
  if ((items[items.length - 1] as number) < total - 1) {
    items[items.length - 1] = total - 1;
    items[items.length - 2] = "next-more";
  }
  return items;
}

export const Pagination: FC = () => {
  const {
    filters,
    onFilterChange,
    users: { total },
  } = useDashboard();
  const { limit: perPage, offset } = filters;

  const page = (offset || 0) / (perPage || 1);
  const noPages = Math.ceil(total / (perPage || 1));
  const pages = generatePageItems(noPages, page, 7);

  const changePage = (page: number) => {
    onFilterChange({
      ...filters,
      offset: page * (perPage as number),
    });
  };

  const handlePageSizeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({
      ...filters,
      limit: parseInt(e.target.value),
    });
    setUsersPerPageLimitSize(e.target.value);
  };

  const { t } = useTranslation();
  const from = total ? (offset || 0) + 1 : 0;
  const to = Math.min(total, (offset || 0) + (perPage || 0));

  return (
    <HStack
      justifyContent="space-between"
      w="full"
      px={4}
      py={3}
      borderTopWidth="1px"
      borderColor="border"
      flexWrap="wrap"
      gap={3}
    >
      <HStack spacing={3}>
        <Text fontSize="13px" color="text-muted" whiteSpace="nowrap">
          {t("pagination.showing", { from, to, total })}
        </Text>
        <Select
          w="auto"
          value={perPage}
          onChange={handlePageSizeChange}
          size="sm"
          aria-label={t("itemsPerPage")}
          display={{ base: "none", sm: "block" }}
        >
          {[10, 20, 30, 50, 100].map((n) => (
            <option key={n} value={n}>
              {t("pagination.perPage", { count: n })}
            </option>
          ))}
        </Select>
      </HStack>

      <ButtonGroup size="sm" variant="outline" spacing={1}>
        <IconButton
          aria-label={t("previous")}
          icon={<PrevIcon />}
          onClick={changePage.bind(null, page - 1)}
          isDisabled={page === 0 || noPages === 0}
        />
        {pages.map((pageIndex) => {
          if (typeof pageIndex === "string")
            return (
              <Text key={pageIndex} px={1} color="text-muted" alignSelf="center">
                …
              </Text>
            );
          const on = (pageIndex as number) === page;
          return (
            <Button
              key={pageIndex}
              variant={on ? "solid" : "ghost"}
              colorScheme={on ? "primary" : "gray"}
              aria-current={on ? "page" : undefined}
              minW="30px"
              px={2}
              onClick={changePage.bind(null, pageIndex)}
            >
              {(pageIndex as number) + 1}
            </Button>
          );
        })}
        <IconButton
          aria-label={t("next")}
          icon={<NextIcon />}
          onClick={changePage.bind(null, page + 1)}
          isDisabled={page + 1 === noPages || noPages === 0}
        />
      </ButtonGroup>
    </HStack>
  );
};
