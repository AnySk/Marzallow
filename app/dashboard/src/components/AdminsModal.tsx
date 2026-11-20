/* Admins page: who manages which users (sudo only). */
import {
  Box,
  Button,
  chakra,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  SimpleGrid,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { EllipsisHorizontalIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useDashboard } from "contexts/DashboardContext";
import { AdminsQueryKey } from "contexts/FeaturesContext";
import dayjs from "dayjs";
import useGetUser from "hooks/useGetUser";
import { FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { AdminInfo } from "types/Management";
import { formatBytes } from "utils/formatByte";
import { queryClient } from "utils/react-query";
import { generateErrorMessage, generateSuccessMessage } from "utils/toastHandler";
import { ConfirmDialog } from "./ConfirmDialog";
import { Help, PageHeader, Panel, Pill } from "./ui";

const MoreIcon = chakra(EllipsisHorizontalIcon, { baseStyle: { w: 4, h: 4 } });
const AddIcon = chakra(PlusIcon, { baseStyle: { w: 4, h: 4, strokeWidth: 2 } });

type Overview = { username: string; users: number; active_users: number; traffic_30d: number; last_login_at: string | null };
const OverviewKey = ["admins-overview"];

type AdminForm = { username: string; password: string; is_sudo: boolean; telegram_id: string; discord_webhook: string };
const emptyForm: AdminForm = { username: "", password: "", is_sudo: false, telegram_id: "", discord_webhook: "" };

/** Rough guide only; the server has the real rules. */
const strength = (pw: string): { level: 0 | 1 | 2 | 3; key: string } => {
  if (!pw) return { level: 0, key: "" };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^\w]/].filter((r) => r.test(pw)).length;
  if (pw.length >= 14 && kinds >= 3) return { level: 3, key: "admins.pwStrong" };
  if (pw.length >= 10 && kinds >= 2) return { level: 2, key: "admins.pwOkay" };
  return { level: 1, key: "admins.pwWeak" };
};

const RoleCard: FC<{ on: boolean; title: string; help: string; onClick: () => void; disabled?: boolean }> = ({
  on,
  title,
  help,
  onClick,
  disabled,
}) => (
  <Box
    as="button"
    type="button"
    role="radio"
    aria-checked={on}
    disabled={disabled}
    onClick={onClick}
    textAlign="left"
    px="14px"
    py={3}
    borderWidth="1px"
    borderRadius="10px"
    borderColor={on ? "accent" : "border-strong"}
    bg={on ? "surface-selected" : "surface"}
    opacity={disabled ? 0.6 : 1}
    cursor={disabled ? "not-allowed" : "pointer"}
    _focusVisible={{ boxShadow: "outline", outline: "none" }}
  >
    <Text fontWeight={600}>{title}</Text>
    <Help>{help}</Help>
  </Box>
);

export const AdminsModal: FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const { userData } = useGetUser();
  const [editing, setEditing] = useState<string | null>(null); // username, or "" for new
  const [form, setForm] = useState<AdminForm>(emptyForm);

  const { data: admins, isLoading } = useQuery({ queryKey: AdminsQueryKey, queryFn: () => fetch<AdminInfo[]>("/admins") });
  const { data: overview } = useQuery({ queryKey: OverviewKey, queryFn: () => fetch<Overview[]>("/admins/overview") });
  const stats = new Map((overview || []).map((o) => [o.username, o]));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: AdminsQueryKey });
    queryClient.invalidateQueries({ queryKey: OverviewKey });
  };
  const call = (path: string, method: string, success?: string) =>
    fetch(path, { method })
      .then(() => {
        if (success) generateSuccessMessage(success, toast);
        refresh();
        useDashboard.getState().refetchUsers();
      })
      .catch((e) => generateErrorMessage(e, toast));
  const [pending, setPending] = useState<{ message: string; run: () => void } | null>(null);
  const confirmCall = (message: string, path: string, method: string, success?: string) =>
    setPending({ message, run: () => call(path, method, success) });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        password: form.password || undefined,
        is_sudo: form.is_sudo,
        telegram_id: form.telegram_id ? Number(form.telegram_id) : null,
        discord_webhook: form.discord_webhook || null,
      };
      return editing
        ? fetch(`/admin/${editing}`, { method: "PUT", body })
        : fetch("/admin", { method: "POST", body: { ...body, username: form.username } });
    },
    onSuccess: () => {
      generateSuccessMessage(t(editing ? "admins.updated" : "admins.created"), toast);
      setEditing(null);
      refresh();
    },
    onError: (e) => generateErrorMessage(e, toast),
  });

  const startEdit = (admin?: AdminInfo) => {
    setEditing(admin ? admin.username : "");
    setForm(
      admin
        ? {
            username: admin.username,
            password: "",
            is_sudo: admin.is_sudo,
            telegram_id: admin.telegram_id ? String(admin.telegram_id) : "",
            discord_webhook: admin.discord_webhook || "",
          }
        : emptyForm
    );
  };
  const pw = strength(form.password);
  const isSelf = editing === userData.username;

  return (
    <>
      <PageHeader
        title={t("admins.title")}
        subtitle={t("admins.description")}
        actions={
          <Button colorScheme="primary" leftIcon={<AddIcon />} onClick={() => startEdit()}>
            {t("admins.add")}
          </Button>
        }
      />
      <Panel overflowX="auto">
        {isLoading ? (
          <Flex p={8} justify="center">
            <Spinner />
          </Flex>
        ) : (
          <Table minW="760px">
            <Thead>
              <Tr>
                <Th>{t("admins.admin")}</Th>
                <Th>{t("admins.role")}</Th>
                <Th isNumeric>{t("users")}</Th>
                <Th isNumeric>{t("admins.traffic30")}</Th>
                <Th>{t("admins.lastSignIn")}</Th>
                <Th textAlign="right">{t("usersTable.actions")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {admins?.map((admin) => {
                const o = stats.get(admin.username);
                const self = admin.username === userData.username;
                return (
                  <Tr key={admin.username} className="interactive" onClick={() => startEdit(admin)}>
                    <Td>
                      <HStack spacing="10px">
                        <Flex w="32px" h="32px" borderRadius="full" bg="accent-soft" color="accent-text" align="center" justify="center" fontWeight={600} flex="none">
                          {admin.username.slice(0, 1).toUpperCase()}
                        </Flex>
                        <VStack align="flex-start" spacing={0}>
                          <Text fontWeight={600}>
                            {admin.username}
                            {self && (
                              <Text as="span" color="text-muted" fontWeight={400}>
                                {" "}
                                {t("admins.you")}
                              </Text>
                            )}
                          </Text>
                          <Help>{admin.telegram_id || admin.discord_webhook ? t("admins.notifyLinked") : t("admins.noNotify")}</Help>
                        </VStack>
                      </HStack>
                    </Td>
                    <Td>
                      <Pill tone={admin.is_sudo ? "accent" : "neutral"}>{t(admin.is_sudo ? "admins.sudo" : "admins.admin")}</Pill>
                    </Td>
                    <Td isNumeric>
                      {o?.users ?? "—"}
                      {o && o.users > 0 && <Help>{t("admins.activeCount", { count: o.active_users })}</Help>}
                    </Td>
                    <Td isNumeric>{o ? formatBytes(o.traffic_30d) : "—"}</Td>
                    <Td color="text-muted" fontSize="13px">
                      {o?.last_login_at ? dayjs.utc(o.last_login_at).local().fromNow() : t("admins.never")}
                    </Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <HStack justify="flex-end" spacing={1}>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(admin)}>
                          {t("admins.edit")}
                        </Button>
                        <Menu placement="bottom-end">
                          <MenuButton as={IconButton} size="sm" variant="ghost" aria-label={t("subTpl.more")} icon={<MoreIcon />} />
                          <MenuList>
                            <MenuItem onClick={() => call(`/admin/${admin.username}/users/activate`, "POST", t("admins.usersActivated"))}>
                              {t("admins.activateUsers")}
                            </MenuItem>
                            <MenuItem
                              onClick={() =>
                                confirmCall(t("admins.confirmDisableUsers", { name: admin.username }), `/admin/${admin.username}/users/disable`, "POST", t("admins.usersDisabled"))
                              }
                            >
                              {t("admins.disableUsers")}
                            </MenuItem>
                            <MenuItem
                              onClick={() => confirmCall(t("admins.confirmResetUsage", { name: admin.username }), `/admin/usage/reset/${admin.username}`, "POST")}
                            >
                              {t("admins.resetUsage")}
                            </MenuItem>
                            {!self && (
                              <>
                                <MenuDivider />
                                <MenuItem
                                  color="danger-fg"
                                  onClick={() => confirmCall(t("admins.confirmDelete", { name: admin.username }), `/admin/${admin.username}`, "DELETE", t("admins.deleted"))}
                                >
                                  {t("delete")}
                                </MenuItem>
                              </>
                            )}
                          </MenuList>
                        </Menu>
                      </HStack>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </Panel>
      <Help>{t("admins.envSudoNote")}</Help>

      <ConfirmDialog
        message={pending?.message}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          pending?.run();
          setPending(null);
        }}
      />

      <Drawer isOpen={editing !== null} onClose={() => setEditing(null)} placement="right" size="md">
        <DrawerOverlay />
        <DrawerContent maxW="480px">
          <chakra.form display="flex" flexDirection="column" h="full" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <DrawerHeader borderBottomWidth="1px" borderColor="border">
              <Text fontSize="18px" fontWeight={700}>
                {editing ? editing : t("admins.add")}
              </Text>
            </DrawerHeader>
            <DrawerCloseButton top={4} />
            <DrawerBody py={5}>
              <VStack align="stretch" spacing={5}>
                <FormControl isRequired>
                  <FormLabel>{t("username")}</FormLabel>
                  <Input name="admin-username" fontFamily="mono" value={form.username} isDisabled={!!editing}
                    onChange={(e) => setForm({ ...form, username: e.target.value })} />
                  {editing && <FormHelperText>{t("userDialog.usernameFixed")}</FormHelperText>}
                </FormControl>
                <FormControl isRequired={!editing}>
                  <FormLabel>{t(editing ? "admins.newPassword" : "password")}</FormLabel>
                  <Input type="password" name="admin-password" autoComplete="new-password" value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  {pw.level > 0 ? (
                    <HStack mt="6px" spacing={2}>
                      <Flex gap="3px" w="90px">
                        {[1, 2, 3].map((i) => (
                          <Box key={i} flex={1} h="4px" borderRadius="2px"
                            bg={i <= pw.level ? (pw.level === 1 ? "danger-dot" : pw.level === 2 ? "warning-dot" : "success-dot") : "bar-track"} />
                        ))}
                      </Flex>
                      <Text fontSize="12px" color="text-muted">{t(pw.key)}</Text>
                    </HStack>
                  ) : (
                    <FormHelperText>{editing ? t("admins.keepPassword") : t("admins.sharePassword")}</FormHelperText>
                  )}
                </FormControl>
                <FormControl>
                  <FormLabel>{t("admins.role")}</FormLabel>
                  <SimpleGrid columns={2} spacing={3} role="radiogroup">
                    <RoleCard on={!form.is_sudo} title={t("admins.admin")} help={t("admins.adminHelp")} disabled={isSelf} onClick={() => setForm({ ...form, is_sudo: false })} />
                    <RoleCard on={form.is_sudo} title={t("admins.sudo")} help={t("admins.sudoHelp")} disabled={isSelf} onClick={() => setForm({ ...form, is_sudo: true })} />
                  </SimpleGrid>
                  {isSelf && <FormHelperText>{t("admins.ownRole")}</FormHelperText>}
                </FormControl>
                <FormControl>
                  <FormLabel>
                    {t("admins.telegramId")} <Text as="span" color="text-muted" fontWeight={400}>{t("userDialog.optional")}</Text>
                  </FormLabel>
                  <Input inputMode="numeric" value={form.telegram_id}
                    onChange={(e) => setForm({ ...form, telegram_id: e.target.value.replace(/\D/g, "") })} />
                  <FormHelperText>{t("admins.telegramHelp")}</FormHelperText>
                </FormControl>
                <FormControl>
                  <FormLabel>
                    {t("admins.discordWebhook")} <Text as="span" color="text-muted" fontWeight={400}>{t("userDialog.optional")}</Text>
                  </FormLabel>
                  <Input placeholder="https://discord.com/api/webhooks/…" value={form.discord_webhook}
                    onChange={(e) => setForm({ ...form, discord_webhook: e.target.value })} />
                </FormControl>
              </VStack>
            </DrawerBody>
            <DrawerFooter borderTopWidth="1px" borderColor="border" gap={2}>
              <Button variant="outline" onClick={() => setEditing(null)}>{t("cancel")}</Button>
              <Button colorScheme="primary" type="submit" isLoading={save.isPending}>
                {t(editing ? "admins.save" : "admins.create")}
              </Button>
            </DrawerFooter>
          </chakra.form>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default AdminsModal;
