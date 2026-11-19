import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormHelperText,
  Flex,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  NumberInput,
  NumberInputField,
  Select,
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
  VStack,
  Wrap,
} from "@chakra-ui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useDashboard } from "contexts/DashboardContext";
import { TemplatesQueryKey, useFeatures } from "contexts/FeaturesContext";
import { FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { UserTemplate } from "types/Management";
import { UserInbounds } from "types/User";
import { formatBytes } from "utils/formatByte";
import { queryClient } from "utils/react-query";
import { generateErrorMessage, generateSuccessMessage } from "utils/toastHandler";
import { ConfirmButton } from "./ConfirmButton";

const GB = 1024 ** 3;
const DAY = 86400;

type TemplateForm = {
  name: string;
  data_limit_gb: string;
  duration_days: string;
  username_prefix: string;
  username_suffix: string;
  inbounds: UserInbounds;
};

export const useTemplates = (enabled = true) =>
  useQuery({
    queryKey: TemplatesQueryKey,
    queryFn: () => fetch<UserTemplate[]>("/user_template"),
    enabled,
  });

export const describeTemplate = (template: UserTemplate, t: (key: string, o?: any) => string) =>
  [
    template.data_limit ? formatBytes(template.data_limit) : t("templates.unlimitedData"),
    template.expire_duration
      ? t("templates.days", { count: Math.round(template.expire_duration / DAY) })
      : t("templates.noExpiry"),
  ].join(" · ");

/** Create / edit / delete user templates (sudo only). */
export const TemplatesModal: FC = () => {
  const { openModal, setModal } = useFeatures();
  const isOpen = openModal === "templates";
  const { inbounds } = useDashboard();
  const { t } = useTranslation();
  const toast = useToast();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<TemplateForm | null>(null);
  const { data: templates, isLoading } = useTemplates(isOpen);
  const refresh = () => queryClient.invalidateQueries({ queryKey: TemplatesQueryKey });

  const startEdit = (template?: UserTemplate) => {
    setEditing(template ? template.id : "new");
    setForm({
      name: template?.name || "",
      data_limit_gb: template?.data_limit ? String(+(template.data_limit / GB).toFixed(2)) : "",
      duration_days: template?.expire_duration ? String(Math.round(template.expire_duration / DAY)) : "",
      username_prefix: template?.username_prefix || "",
      username_suffix: template?.username_suffix || "",
      inbounds: template?.inbounds || {},
    });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form!.name,
        data_limit: form!.data_limit_gb ? Math.round(parseFloat(form!.data_limit_gb) * GB) : 0,
        expire_duration: form!.duration_days ? parseInt(form!.duration_days) * DAY : 0,
        username_prefix: form!.username_prefix || null,
        username_suffix: form!.username_suffix || null,
        inbounds: form!.inbounds,
      };
      return editing === "new"
        ? fetch("/user_template", { method: "POST", body })
        : fetch(`/user_template/${editing}`, { method: "PUT", body });
    },
    onSuccess: () => {
      generateSuccessMessage(t("templates.saved"), toast);
      setEditing(null);
      refresh();
    },
    onError: (e) => generateErrorMessage(e, toast),
  });

  const toggleInbound = (protocol: string, tag: string, checked: boolean) => {
    const current = form!.inbounds[protocol] || [];
    const next = { ...form!.inbounds, [protocol]: checked ? [...current, tag] : current.filter((i) => i !== tag) };
    if (!next[protocol].length) delete next[protocol];
    setForm({ ...form!, inbounds: next });
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { setModal(null); setEditing(null); }} size="2xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent mx="3">
        <ModalHeader>{t("templates.title")}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {editing !== null && form ? (
            <Box as="form" onSubmit={(e: any) => { e.preventDefault(); save.mutate(); }}>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl isRequired gridColumn={{ md: "span 2" }}>
                  <FormLabel>{t("templates.name")}</FormLabel>
                  <Input size="sm" name="template-name" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("userDialog.dataLimit")} (GB)</FormLabel>
                  <NumberInput size="sm" min={0} value={form.data_limit_gb}
                    onChange={(v) => setForm({ ...form, data_limit_gb: v })}>
                    <NumberInputField name="template-data-limit" />
                  </NumberInput>
                  <FormHelperText>{t("templates.emptyUnlimited")}</FormHelperText>
                </FormControl>
                <FormControl>
                  <FormLabel>{t("templates.duration")}</FormLabel>
                  <NumberInput size="sm" min={0} value={form.duration_days}
                    onChange={(v) => setForm({ ...form, duration_days: v })}>
                    <NumberInputField name="template-duration" />
                  </NumberInput>
                  <FormHelperText>{t("templates.emptyUnlimited")}</FormHelperText>
                </FormControl>
                <FormControl>
                  <FormLabel>{t("templates.prefix")}</FormLabel>
                  <Input size="sm" value={form.username_prefix}
                    onChange={(e) => setForm({ ...form, username_prefix: e.target.value })} />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("templates.suffix")}</FormLabel>
                  <Input size="sm" value={form.username_suffix}
                    onChange={(e) => setForm({ ...form, username_suffix: e.target.value })} />
                </FormControl>
              </SimpleGrid>
              <FormControl mt={3}>
                <FormLabel>{t("templates.inbounds")}</FormLabel>
                <FormHelperText mt={0} mb={2}>{t("templates.inboundsHelp")}</FormHelperText>
                <VStack align="start" spacing={1}>
                  {[...inbounds.entries()].map(([protocol, list]) => (
                    <Wrap key={protocol} spacing={3}>
                      <Text fontSize="sm" fontWeight="medium" minW="90px" textTransform="capitalize">
                        {protocol}
                      </Text>
                      {list.map((inbound) => (
                        <Checkbox key={inbound.tag} size="sm"
                          isChecked={(form.inbounds[protocol] || []).includes(inbound.tag)}
                          onChange={(e) => toggleInbound(protocol, inbound.tag, e.target.checked)}>
                          {inbound.tag}
                        </Checkbox>
                      ))}
                    </Wrap>
                  ))}
                </VStack>
              </FormControl>
              <HStack mt={4} justifyContent="flex-end">
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("cancel")}</Button>
                <Button size="sm" colorScheme="primary" type="submit" isLoading={save.isPending}>
                  {t("templates.save")}
                </Button>
              </HStack>
            </Box>
          ) : (
            <>
              <HStack justifyContent="space-between" mb={3}>
                <Text fontSize="sm" color="text-muted">{t("templates.description")}</Text>
                <Button size="sm" colorScheme="primary" onClick={() => startEdit()}>{t("templates.add")}</Button>
              </HStack>
              {isLoading ? <Spinner /> : !templates?.length ? (
                <Text fontSize="sm" color="text-muted">{t("templates.none")}</Text>
              ) : (
                <TableContainer>
                  <Table size="sm">
                    <Thead><Tr><Th>{t("templates.name")}</Th><Th>{t("templates.plan")}</Th><Th /></Tr></Thead>
                    <Tbody>
                      {templates.map((template) => (
                        <Tr key={template.id}>
                          <Td>{template.name}</Td>
                          <Td>{describeTemplate(template, t)}</Td>
                          <Td>
                            <HStack justifyContent="flex-end">
                              <Button size="xs" variant="outline" onClick={() => startEdit(template)}>
                                {t("admins.edit")}
                              </Button>
                              <ConfirmButton size="xs"
                                message={t("templates.confirmDelete", { name: template.name })}
                                onConfirm={() =>
                                  fetch(`/user_template/${template.id}`, { method: "DELETE" })
                                    .then(refresh)
                                    .catch((e) => generateErrorMessage(e, toast))
                                }>
                                {t("delete")}
                              </ConfirmButton>
                            </HStack>
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

/** "Apply template" select for the create-user form. */
export const TemplatePicker: FC<{ onApply: (template: UserTemplate) => void }> = ({ onApply }) => {
  const { t } = useTranslation();
  const { data: templates } = useTemplates();
  if (!templates?.length) return null;
  return (
    <Flex
      wrap="wrap"
      align="center"
      gap={3}
      px={6}
      py="14px"
      bg="surface-subtle"
      borderBottomWidth="1px"
      borderColor="border"
    >
      <FormLabel htmlFor="template-picker" m={0} fontSize="13px" fontWeight={600}>
        {t("templates.startFrom")}
      </FormLabel>
      <Select
        id="template-picker"
        flex="1"
        minW="220px"
        size="sm"
        placeholder={t("templates.none")}
        onChange={(e) => {
          const template = templates.find((tpl) => String(tpl.id) === e.target.value);
          if (template) onApply(template);
        }}
      >
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name} — {describeTemplate(template, t)}
          </option>
        ))}
      </Select>
    </Flex>
  );
};
