/*
 * The page frame: a sidebar on desktop, a bottom tab bar plus a "More" drawer
 * on phones. Hosts, nodes, core config and the management pages open their
 * dialogs from here.
 */
import {
  Box,
  chakra,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerOverlay,
  Flex,
  HStack,
  IconButton,
  Text,
  Tooltip,
  useColorMode,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import {
  ArrowRightOnRectangleIcon,
  ChartBarIcon,
  ChartPieIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
  GlobeAltIcon,
  MoonIcon,
  RectangleStackIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  SunIcon,
  TrashIcon,
  AdjustmentsHorizontalIcon,
  ArrowUturnLeftIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import LogoIcon from "assets/logo.svg?react";
import { useDashboard } from "contexts/DashboardContext";
import { useFeatures } from "contexts/FeaturesContext";
import useGetUser from "hooks/useGetUser";
import { FC, PropsWithChildren, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { updateThemeColor } from "utils/themeColor";
import { useAlerts } from "./AlertsBar";
import { Footer } from "./Footer";
import { useSystemStats } from "./Statistics";

const icon = (c: typeof UsersIcon) => chakra(c, { baseStyle: { w: "18px", h: "18px", flex: "none", strokeWidth: 1.8 } });
const Icons = {
  users: icon(UsersIcon),
  hosts: icon(GlobeAltIcon),
  nodes: icon(ServerStackIcon),
  core: icon(CodeBracketIcon),
  templates: icon(RectangleStackIcon),
  subTemplates: icon(DocumentTextIcon),
  admins: icon(ShieldCheckIcon),
  analytics: icon(ChartBarIcon),
  nodesUsage: icon(ChartPieIcon),
  settings: icon(AdjustmentsHorizontalIcon),
  resetUsage: icon(ArrowUturnLeftIcon),
  cleanup: icon(TrashIcon),
  more: icon(EllipsisHorizontalIcon),
  dark: icon(MoonIcon),
  light: icon(SunIcon),
  logout: icon(ArrowRightOnRectangleIcon),
};
const Logo = chakra(LogoIcon);

type NavItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  badge?: ReactNode;
  active?: boolean;
  sudo?: boolean;
  section: "main" | "manage" | "tools";
  short?: string; // bottom bar label
  to?: string;
};

const useNavItems = (): NavItem[] => {
  const { t } = useTranslation();
  const { onResetAllUsage } = useDashboard();
  const setModal = useFeatures((s) => s.setModal);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: stats } = useSystemStats();
  const { data: alerts } = useAlerts();
  const down = alerts?.disconnected_nodes.length || 0;
  const go = (to: string) => ({
    to,
    active: to === "/" ? pathname === "/" : pathname.startsWith(to),
    onClick: () => {
      navigate(to);
      window.scrollTo({ top: 0 });
    },
  });
  return [
    {
      key: "users",
      label: t("users"),
      icon: <Icons.users />,
      ...go("/"),
      section: "main",
      badge: stats ? <Count>{stats.total_user}</Count> : null,
    },
    { key: "hosts", label: t("nav.hosts"), icon: <Icons.hosts />, ...go("/hosts"), sudo: true, section: "main" },
    {
      key: "nodes",
      label: t("nav.nodes"),
      icon: <Icons.nodes />,
      ...go("/nodes"),
      sudo: true,
      section: "main",
      badge: down ? <WarnPill>{t("nav.nodesDown", { count: down })}</WarnPill> : null,
    },
    { key: "core", label: t("nav.core"), icon: <Icons.core />, ...go("/core"), sudo: true, section: "main" },
    { key: "templates", label: t("header.templates"), icon: <Icons.templates />, ...go("/templates"), sudo: true, section: "manage" },
    { key: "subTemplates", label: t("subTpl.title"), icon: <Icons.subTemplates />, ...go("/subscription-templates"), sudo: true, section: "manage" },
    { key: "admins", label: t("header.admins"), icon: <Icons.admins />, ...go("/admins"), sudo: true, section: "manage" },
    { key: "analytics", label: t("header.analytics"), icon: <Icons.analytics />, ...go("/analytics"), section: "manage", short: t("nav.stats") },
    { key: "settings", label: t("header.settings"), icon: <Icons.settings />, ...go("/settings"), sudo: true, section: "manage" },
    { key: "cleanup", label: t("header.cleanup"), icon: <Icons.cleanup />, onClick: () => setModal("cleanup"), section: "tools" },
    { key: "resetUsage", label: t("resetAllUsage"), icon: <Icons.resetUsage />, onClick: () => onResetAllUsage(true), sudo: true, section: "tools" },
  ];
};

const Count: FC<{ children: ReactNode }> = ({ children }) => (
  <Text as="span" ml="auto" fontSize="12px" color="text-muted" fontWeight={500}>
    {children}
  </Text>
);

const WarnPill: FC<{ children: ReactNode }> = ({ children }) => (
  <Text as="span" ml="auto" fontSize="11px" fontWeight={600} color="warning-fg" bg="warning-bg" borderRadius="full" px="7px" lineHeight="18px">
    {children}
  </Text>
);

const NavButton: FC<{ item: NavItem; onDone?: () => void }> = ({ item, onDone }) => (
  <HStack
    as="button"
    type="button"
    w="full"
    h="38px"
    px="10px"
    spacing="10px"
    borderRadius="md"
    fontWeight={500}
    fontSize="14px"
    textAlign="left"
    color={item.active ? "accent-text" : "text-2"}
    bg={item.active ? "accent-soft" : "transparent"}
    _hover={{ bg: item.active ? "accent-soft" : "surface-hover", color: item.active ? "accent-text" : "text" }}
    _focusVisible={{ boxShadow: "outline", outline: "none" }}
    aria-current={item.active ? "page" : undefined}
    onClick={() => {
      item.onClick();
      onDone?.();
    }}
  >
    {item.icon}
    <Text as="span" noOfLines={1}>
      {item.label}
    </Text>
    {item.badge}
  </HStack>
);

const SectionLabel: FC<{ children: ReactNode }> = ({ children }) => (
  <Text fontSize="11px" fontWeight={600} letterSpacing=".06em" textTransform="uppercase" color="text-muted" px="10px" pt={4} pb="6px">
    {children}
  </Text>
);

const Brand: FC = () => {
  const { version } = useDashboard();
  return (
    <HStack spacing="10px" px={2} pt={1} pb="18px">
      <Flex w="32px" h="32px" borderRadius="md" bg="inverse" color="inverse-text" align="center" justify="center" flex="none">
        <Logo w="20px" h="20px" />
      </Flex>
      <VStack spacing={0} align="flex-start">
        <Text fontWeight={700} lineHeight="1.2">
          Marzallow
        </Text>
        {version && (
          <Text fontSize="12px" color="text-muted" lineHeight="1.2">
            v{version}
          </Text>
        )}
      </VStack>
    </HStack>
  );
};

const AccountBar: FC = () => {
  const { t } = useTranslation();
  const { userData } = useGetUser();
  const { colorMode, toggleColorMode } = useColorMode();
  const navigate = useNavigate();
  const name = userData?.username || "";
  return (
    <HStack spacing="10px" pt={3} px={2} borderTopWidth="1px" borderColor="border-subtle" mt="auto">
      <Flex w="32px" h="32px" borderRadius="full" bg="accent-soft" color="accent-text" align="center" justify="center" fontWeight={600} flex="none">
        {name.slice(0, 1).toUpperCase()}
      </Flex>
      <VStack spacing={0} align="flex-start" flex={1} minW={0}>
        <Text fontWeight={600} noOfLines={1}>
          {name}
        </Text>
        <Text fontSize="12px" color="text-muted">
          {userData?.is_sudo ? t("nav.sudoAdmin") : t("nav.admin")}
        </Text>
      </VStack>
      <Tooltip label={colorMode === "light" ? t("nav.darkMode") : t("nav.lightMode")}>
        <IconButton
          size="sm"
          variant="ghost"
          aria-label={colorMode === "light" ? t("nav.darkMode") : t("nav.lightMode")}
          icon={colorMode === "light" ? <Icons.dark /> : <Icons.light />}
          onClick={() => {
            updateThemeColor(colorMode === "dark" ? "light" : "dark");
            toggleColorMode();
          }}
        />
      </Tooltip>
      <Tooltip label={t("header.logout")}>
        <IconButton size="sm" variant="ghost" aria-label={t("header.logout")} icon={<Icons.logout />} onClick={() => navigate("/login")} />
      </Tooltip>
    </HStack>
  );
};

const NavList: FC<{ onDone?: () => void }> = ({ onDone }) => {
  const { t } = useTranslation();
  const { userData } = useGetUser();
  const items = useNavItems().filter((i) => !i.sudo || userData?.is_sudo);
  const section = (s: NavItem["section"]) => items.filter((i) => i.section === s);
  return (
    <VStack as="nav" aria-label={t("nav.main")} spacing="2px" align="stretch">
      {section("main").map((i) => (
        <NavButton key={i.key} item={i} onDone={onDone} />
      ))}
      <SectionLabel>{t("nav.manage")}</SectionLabel>
      {section("manage").map((i) => (
        <NavButton key={i.key} item={i} onDone={onDone} />
      ))}
      <SectionLabel>{t("nav.tools")}</SectionLabel>
      {section("tools").map((i) => (
        <NavButton key={i.key} item={i} onDone={onDone} />
      ))}
    </VStack>
  );
};

const MobileTabBar: FC = () => {
  const { t } = useTranslation();
  const { userData } = useGetUser();
  const more = useDisclosure();
  const items = useNavItems();
  const pick = ["users", ...(userData?.is_sudo ? ["hosts", "nodes"] : []), "analytics"]
    .map((k) => items.find((i) => i.key === k)!)
    .filter(Boolean);
  return (
    <>
      <HStack
        as="nav"
        aria-label={t("nav.main")}
        display={{ base: "flex", md: "none" }}
        position="fixed"
        left={0}
        right={0}
        bottom={0}
        zIndex="sticky"
        bg="surface"
        borderTopWidth="1px"
        borderColor="border"
        px={1}
        pt="6px"
        pb="calc(10px + env(safe-area-inset-bottom))"
        spacing={0}
      >
        {[...pick, { key: "more", label: t("nav.more"), icon: <Icons.more />, onClick: more.onOpen } as NavItem].map((i) => (
          <VStack
            key={i.key}
            as="button"
            type="button"
            flex={1}
            spacing="2px"
            py={1}
            borderRadius="md"
            fontSize="11px"
            fontWeight={500}
            color={i.active ? "accent-text" : "text-muted"}
            onClick={i.onClick}
            aria-current={i.active ? "page" : undefined}
          >
            {i.icon}
            <span>{i.short || i.label}</span>
          </VStack>
        ))}
      </HStack>
      <Drawer isOpen={more.isOpen} onClose={more.onClose} placement="bottom">
        <DrawerOverlay />
        <DrawerContent borderTopRadius="xl" pb="env(safe-area-inset-bottom)">
          <DrawerBody py={4}>
            <NavList onDone={more.onClose} />
            <Box mt={4}>
              <AccountBar />
            </Box>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export const AppShell: FC<PropsWithChildren> = ({ children }) => (
  <Flex minH="100vh" bg="canvas">
    <Flex
      as="aside"
      display={{ base: "none", md: "flex" }}
      direction="column"
      w="240px"
      flex="none"
      position="sticky"
      top={0}
      h="100vh"
      overflowY="auto"
      bg="surface"
      borderRightWidth="1px"
      borderColor="border"
      px="14px"
      py={5}
    >
      <Brand />
      <NavList />
      <Box pt={4} mt="auto">
        <AccountBar />
      </Box>
    </Flex>
    <Flex
      as="main"
      direction="column"
      flex={1}
      minW={0}
      gap={5}
      px={{ base: 4, md: 8 }}
      pt={{ base: 5, md: 7 }}
      pb={{ base: "96px", md: 10 }}
    >
      {children}
      <Footer mt="auto" pt={4} />
    </Flex>
    <MobileTabBar />
  </Flex>
);
