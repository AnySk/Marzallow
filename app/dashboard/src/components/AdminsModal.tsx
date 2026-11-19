import {
  Badge,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Spinner,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
  Wrap,
} from "@chakra-ui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useDashboard } from "contexts/DashboardContext";
import { AdminsQueryKey, useFeatures } from "contexts/FeaturesContext";
import { FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { AdminInfo } from "types/Management";
import { formatBytes } from "utils/formatByte";
import { queryClient } from "utils/react-query";
import { generateErrorMessage, generateSuccessMessage } from "utils/toastHandler";
import { ConfirmButton } from "./ConfirmButton";

type AdminForm = {
  username: string;
  password: string;
  is_sudo: boolean;
  telegram_id: string;
  discord_webhook: string;
};

const emptyForm: AdminForm = {
  username: "",
  password: "",
  is_sudo: false,
  telegram_id: "",
  discord_webhook: "",
};

/** Manage panel admins (sudo only). */
export const AdminsModal: FC = () => {
  const { openModal, setModal } = useFeatures();
  const isOpen = openModal === "admins";
  const { t } = useTranslation();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null); // username, or "" for new
  const [form, setForm] = useState<AdminForm>(emptyForm);

  const { data: admins, isLoading } = useQuery({
    queryKey: AdminsQueryKey,
    queryFn: () => fetch<AdminInfo[]>("/admins"),
    enabled: isOpen,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: AdminsQueryKey });
  const call = (path: string, method: string, body?: object, success?: string) =>
    fetch(path, { method, body })
      .then(() => {
        if (success) generateSuccessMessage(success, toast);
        refresh();
      })
      .catch((e) => generateErrorMessage(e, toast));

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

  const onClose = () => {
    setModal(null);
    setEditing(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent mx="3">
        <ModalHeader>{t("admins.title")}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {editing !== null ? (
            <Box as="form" onSubmit={(e: any) => { e.preventDefault(); save.mutate(); }}>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl isRequired>
                  <FormLabel>{t("username")}</FormLabel>
                  <Input
                    size="sm"
                    name="admin-username"
                    value={form.username}
                    isDisabled={!!editing}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                  />
                </FormControl>
                <FormControl isRequired={!editing}>
                  <FormLabel>{t(editing ? "admins.newPassword" : "password")}</FormLabel>
                  <Input
                    size="sm"
                    type="password"
                    name="admin-password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("admins.telegramId")}</FormLabel>
                  <Input
                    size="sm"
                    inputMode="numeric"
                    value={form.telegram_id}
                    onChange={(e) => setForm({ ...form, telegram_id: e.target.value.replace(/\D/g, "") })}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("admins.discordWebhook")}</FormLabel>
                  <Input
                    size="sm"
                    placeholder="https://discord.com/api/webhooks/…"
                    value={form.discord_webhook}
                    onChange={(e) => setForm({ ...form, discord_webhook: e.target.value })}
                  />
                </FormControl>
              </SimpleGrid>
              <Checkbox
                mt={3}
                isChecked={form.is_sudo}
                onChange={(e) => setForm({ ...form, is_sudo: e.target.checked })}
              >
                {t("admins.sudo")}
              </Checkbox>
              <HStack mt={4} justifyContent="flex-end">
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  {t("cancel")}
                </Button>
                <Button size="sm" colorScheme="primary" type="submit" isLoading={save.isPending}>
                  {t(editing ? "admins.save" : "admins.create")}
                </Button>
              </HStack>
            </Box>
          ) : (
            <>
              <HStack justifyContent="space-between" mb={3}>
                <Text fontSize="sm" color="text-muted">
                  {t("admins.description")}
                </Text>
                <Button size="sm" colorScheme="primary" onClick={() => startEdit()}>
                  {t("admins.add")}
                </Button>
              </HStack>
              {isLoading ? (
                <Spinner />
              ) : (
                <TableContainer>
                  <Table size="sm">
                    <Thead>
                      <Tr>
                        <Th>{t("username")}</Th>
                        <Th>{t("admins.role")}</Th>
                        <Th>{t("admins.usersUsage")}</Th>
                        <Th />
                      </Tr>
                    </Thead>
                    <Tbody>
                      {admins?.map((admin) => (
                        <Tr key={admin.username}>
                          <Td>{admin.username}</Td>
                          <Td>
                            <Badge colorScheme={admin.is_sudo ? "purple" : "gray"}>
                              {t(admin.is_sudo ? "admins.sudo" : "admins.admin")}
                            </Badge>
                          </Td>
                          <Td>{formatBytes(admin.users_usage || 0)}</Td>
                          <Td>
                            <Wrap justify="flex-end" spacing={1}>
                              <Button size="xs" variant="outline" onClick={() => startEdit(admin)}>
                                {t("admins.edit")}
                              </Button>
                              <ConfirmButton
                                size="xs"
                                variant="outline"
                                colorScheme="orange"
                                message={t("admins.confirmDisableUsers", { name: admin.username })}
                                onConfirm={() =>
                                  call(`/admin/${admin.username}/users/disable`, "POST", undefined,
                                    t("admins.usersDisabled")).then(() => useDashboard.getState().refetchUsers())
                                }
                              >
                                {t("admins.disableUsers")}
                              </ConfirmButton>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() =>
                                  call(`/admin/${admin.username}/users/activate`, "POST", undefined,
                                    t("admins.usersActivated")).then(() => useDashboard.getState().refetchUsers())
                                }
                              >
                                {t("admins.activateUsers")}
                              </Button>
                              <ConfirmButton
                                size="xs"
                                variant="outline"
                                colorScheme="orange"
                                message={t("admins.confirmResetUsage", { name: admin.username })}
                                onConfirm={() => call(`/admin/usage/reset/${admin.username}`, "POST")}
                              >
                                {t("admins.resetUsage")}
                              </ConfirmButton>
                              <ConfirmButton
                                size="xs"
                                message={t("admins.confirmDelete", { name: admin.username })}
                                onConfirm={() =>
                                  call(`/admin/${admin.username}`, "DELETE", undefined, t("admins.deleted"))
                                }
                              >
                                {t("delete")}
                              </ConfirmButton>
                            </Wrap>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};
