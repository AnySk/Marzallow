import {
  Box,
  Button,
  chakra,
  Flex,
  Heading,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MagnifyingGlassIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useDashboard } from "contexts/DashboardContext";
import debounce from "lodash.debounce";
import { FC, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSystemStats } from "./Statistics";

const SearchIcon = chakra(MagnifyingGlassIcon, { baseStyle: { w: "18px", h: "18px" } });
const ClearIcon = chakra(XMarkIcon, { baseStyle: { w: 4, h: 4 } });
const AddIcon = chakra(PlusIcon, { baseStyle: { w: 4, h: 4, strokeWidth: 2 } });

const setSearchFilter = debounce((search: string) => {
  useDashboard.getState().onFilterChange({ offset: 0, search });
}, 300);

/** Page title, search ("/" focuses it) and the primary action. */
export const Header: FC = () => {
  const { t } = useTranslation();
  const { loading, filters, onCreateUser } = useDashboard();
  const { data: stats } = useSystemStats();
  const [search, setSearch] = useState(filters.search || "");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey) return;
      if (target.closest("input, textarea, select, [contenteditable=true], .cm-editor, [role=dialog]")) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clear = () => {
    setSearch("");
    setSearchFilter.cancel();
    useDashboard.getState().onFilterChange({ offset: 0, search: "" });
  };

  return (
    <Flex as="header" wrap="wrap" align="center" justify="space-between" gap={4}>
      <VStack align="flex-start" spacing="2px">
        <Heading as="h1" fontSize={{ base: "22px", md: "24px" }} fontWeight={700} letterSpacing="-.01em">
          {t("users")}
        </Heading>
        {stats && (
          <Text color="text-muted">
            {t("header.summary", { active: stats.users_active, total: stats.total_user, online: stats.online_users })}
          </Text>
        )}
      </VStack>
      <Flex gap="10px" align="center" w={{ base: "full", sm: "auto" }}>
        <InputGroup w={{ base: "full", sm: "300px" }}>
          <InputLeftElement pointerEvents="none" color="text-muted">
            <SearchIcon />
          </InputLeftElement>
          <Input
            ref={input}
            type="search"
            aria-label={t("search")}
            placeholder={t("header.searchPlaceholder")}
            value={search}
            pr="44px"
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchFilter(e.target.value);
            }}
            onKeyDown={(e) => e.key === "Escape" && clear()}
            sx={{ "&::-webkit-search-cancel-button": { display: "none" } }}
          />
          <InputRightElement w="44px">
            {loading ? (
              <Spinner size="xs" color="text-muted" />
            ) : search ? (
              <IconButton size="xs" variant="ghost" aria-label={t("header.clearSearch")} icon={<ClearIcon />} onClick={clear} />
            ) : (
              <Box
                as="kbd"
                fontFamily="mono"
                fontSize="11px"
                color="text-muted"
                borderWidth="1px"
                borderColor="border"
                borderRadius="4px"
                px="5px"
                lineHeight="18px"
                display={{ base: "none", md: "block" }}
              >
                /
              </Box>
            )}
          </InputRightElement>
        </InputGroup>
        <Button
          colorScheme="primary"
          leftIcon={<AddIcon />}
          onClick={() => onCreateUser(true)}
          display={{ base: "none", md: "inline-flex" }}
          flex="none"
        >
          {t("createUser")}
        </Button>
      </Flex>
      {/* phones: floating create button above the tab bar */}
      <IconButton
        aria-label={t("createUser")}
        colorScheme="primary"
        icon={<AddIcon w={6} h={6} />}
        display={{ base: "inline-flex", md: "none" }}
        position="fixed"
        right={4}
        bottom="84px"
        w="56px"
        h="56px"
        borderRadius="16px"
        boxShadow="0 8px 20px rgba(36, 84, 211, .35)"
        zIndex="sticky"
        onClick={() => onCreateUser(true)}
      />
    </Flex>
  );
};
