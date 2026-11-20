import {
  Box,
  Button,
  chakra,
  Checkbox,
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
  InputGroup,
  InputRightElement,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Select,
  SimpleGrid,
  Spinner,
  Text,
  useToast,
  VStack,
  Wrap,
} from "@chakra-ui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useDashboard } from "contexts/DashboardContext";
import { TemplatesQueryKey, useFeatures } from "contexts/FeaturesContext";
import { FC, useState } from "react";
import { EllipsisHorizontalIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { UserTemplate } from "types/Management";
import { UserInbounds } from "types/User";
import { formatBytes } from "utils/formatByte";
import { queryClient } from "utils/react-query";
import { generateErrorMessage, generateSuccessMessage } from "utils/toastHandler";
import { ConfirmDialog } from "./ConfirmDialog";
import { Chip, Help, PageHeader, Panel } from "./ui";
import { UserTemplateSelects } from "./TemplateSelects";
import { AccessSelect } from "./AccessListsPage";
import { UserTemplateRefs } from "types/SubscriptionTemplate";

const MoreIcon = chakra(EllipsisHorizontalIcon, { baseStyle: { w: 4, h: 4 } });
const AddIcon = chakra(PlusIcon, { baseStyle: { w: 4, h: 4, strokeWidth: 2 } });

const GB = 1024 ** 3;
const DAY = 86400;

type TemplateForm = {
  name: string;
  data_limit_gb: string;
  duration_days: string;
  username_prefix: string;
  username_suffix: string;
  inbounds: UserInbounds;
  refs: UserTemplateRefs;
  access_list_id: number | null;
  access_unrestricted: boolean;
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

const PROTO: Record<string, string> = { vless: "VLESS", vmess: "VMess", trojan: "Trojan", shadowsocks: "SS" };

const Chips: FC<{ options: { label: string; on: boolean; onClick: () => void }[] }> = ({ options }) => (
  <Flex wrap="wrap" gap="6px" mt={2}>
    {options.map((o) => (
      <Button key={o.label} type="button" size="xs" h="28px" px="10px" borderRadius="full" variant="outline" fontSize="12px"
        aria-pressed={o.on} bg={o.on ? "accent-soft" : "surface"} borderColor={o.on ? "primary.200" : "border-strong"}
        color={o.on ? "accent-text" : "text-2"} onClick={o.onClick}>
        {o.label}
      </Button>
    ))}
  </Flex>
);

/** User templates: ready-made plans for new users (sudo only). */
export const TemplatesModal: FC = () => {
  const { inbounds, onCreateUser } = useDashboard();
  const { t } = useTranslation();
  const toast = useToast();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [deleting, setDeleting] = useState<UserTemplate | null>(null);
  const { data: templates, isLoading } = useTemplates(true);
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
      refs: {
        v2ray_json_template_id: template?.v2ray_json_template_id || null,
        singbox_template_id: template?.singbox_template_id || null,
        clash_template_id: template?.clash_template_id || null,
      },
      access_list_id: template?.access_list_id || null,
      access_unrestricted: !!template?.access_unrestricted,
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
        // 0 resets to the default (null would mean "unchanged" on edit)
        v2ray_json_template_id: form!.refs.v2ray_json_template_id || 0,
        singbox_template_id: form!.refs.singbox_template_id || 0,
        clash_template_id: form!.refs.clash_template_id || 0,
        access_list_id: form!.access_list_id || 0,
        access_unrestricted: form!.access_unrestricted,
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
  const createFrom = (template: UserTemplate) => {
    useFeatures.getState().setCreateFrom(template);
    onCreateUser(true);
  };
  const protocols = (template: UserTemplate) => {
    const keys = Object.keys(template.inbounds || {});
    return keys.length ? keys : [...inbounds.keys()];
  };

  return (
    <>
      <PageHeader
        title={t("templates.title")}
        subtitle={t("templates.description")}
        actions={
          <Button colorScheme="primary" leftIcon={<AddIcon />} onClick={() => startEdit()}>
            {t("templates.add")}
          </Button>
        }
      />
      {isLoading ? (
        <Spinner />
      ) : !templates?.length ? (
        <Panel p={8} textAlign="center">
          <Text fontWeight={600}>{t("templates.emptyTitle")}</Text>
          <Help mb={4}>{t("templates.emptyHelp")}</Help>
          <Button colorScheme="primary" onClick={() => startEdit()}>
            {t("templates.add")}
          </Button>
        </Panel>
      ) : (
        <SimpleGrid minChildWidth="280px" spacing={4}>
          {templates.map((template) => (
            <Panel key={template.id} p={4} display="flex" flexDirection="column" gap={3}>
              <Flex justify="space-between" align="flex-start" gap={2}>
                <Text fontWeight={650} fontSize="15px" noOfLines={1}>
                  {template.name}
                </Text>
                <Menu placement="bottom-end">
                  <MenuButton as={IconButton} size="sm" variant="ghost" aria-label={t("subTpl.more")} icon={<MoreIcon />} mt={-1} mr={-2} />
                  <MenuList>
                    <MenuItem onClick={() => startEdit(template)}>{t("admins.edit")}</MenuItem>
                    <MenuItem color="danger-fg" onClick={() => setDeleting(template)}>
                      {t("delete")}
                    </MenuItem>
                  </MenuList>
                </Menu>
              </Flex>
              <SimpleGrid columns={2} spacingY={2} spacingX={3} fontSize="13px">
                <Text color="text-muted">{t("templates.data")}</Text>
                <Text>{template.data_limit ? formatBytes(template.data_limit) : t("usersTable.unlimited")}</Text>
                <Text color="text-muted">{t("templates.durationShort")}</Text>
                <Text>
                  {template.expire_duration ? t("templates.days", { count: Math.round(template.expire_duration / DAY) }) : t("templates.noExpiry")}
                </Text>
                {(template.username_prefix || template.username_suffix) && (
                  <>
                    <Text color="text-muted">{t("username")}</Text>
                    <Text fontFamily="mono" fontSize="12px">
                      {template.username_prefix || ""}…{template.username_suffix || ""}
                    </Text>
                  </>
                )}
              </SimpleGrid>
              <Flex gap={1} wrap="wrap">
                {protocols(template).map((p) => (
                  <Chip key={p}>{PROTO[p] || p}</Chip>
                ))}
              </Flex>
              <HStack mt="auto" pt={1} spacing={2}>
                <Button size="sm" colorScheme="primary" variant="outline" onClick={() => createFrom(template)}>
                  {t("createUser")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => startEdit(template)}>
                  {t("admins.edit")}
                </Button>
              </HStack>
            </Panel>
          ))}
        </SimpleGrid>
      )}

      <ConfirmDialog
        message={deleting ? t("templates.confirmDelete", { name: deleting.name }) : undefined}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const id = deleting!.id;
          setDeleting(null);
          fetch(`/user_template/${id}`, { method: "DELETE" }).then(refresh).catch((e) => generateErrorMessage(e, toast));
        }}
      />

      <Drawer isOpen={editing !== null && !!form} onClose={() => setEditing(null)} placement="right" size="md">
        <DrawerOverlay />
        <DrawerContent maxW="560px">
          {form && (
            <chakra.form display="flex" flexDirection="column" h="full" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
              <DrawerHeader borderBottomWidth="1px" borderColor="border">
                <Text fontSize="18px" fontWeight={700}>
                  {editing === "new" ? t("templates.add") : t("templates.editTitle", { name: form.name })}
                </Text>
                <Text fontSize="13px" fontWeight={400} color="text-muted">
                  {t("templates.appliesToNew")}
                </Text>
              </DrawerHeader>
              <DrawerCloseButton top={5} />
              <DrawerBody py={5}>
                <VStack align="stretch" spacing={5}>
                  <FormControl isRequired>
                    <FormLabel>{t("templates.name")}</FormLabel>
                    <Input name="template-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("userDialog.dataLimit")}</FormLabel>
                    <InputGroup maxW="200px">
                      <Input name="template-data-limit" inputMode="decimal" placeholder={t("usersTable.unlimited")} value={form.data_limit_gb}
                        onChange={(e) => setForm({ ...form, data_limit_gb: e.target.value.replace(/[^\d.]/g, "") })} />
                      <InputRightElement color="text-muted" pointerEvents="none">GB</InputRightElement>
                    </InputGroup>
                    <Chips
                      options={[10, 50, 100, 500].map((gb) => ({ label: `${gb} GB`, on: form.data_limit_gb === String(gb), onClick: () => setForm({ ...form, data_limit_gb: String(gb) }) }))
                        .concat([{ label: t("userDialog.unlimited"), on: !form.data_limit_gb, onClick: () => setForm({ ...form, data_limit_gb: "" }) }])}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("templates.duration")}</FormLabel>
                    <InputGroup maxW="200px">
                      <Input name="template-duration" inputMode="numeric" placeholder={t("userDialog.never")} value={form.duration_days}
                        onChange={(e) => setForm({ ...form, duration_days: e.target.value.replace(/\D/g, "") })} />
                      <InputRightElement w="56px" color="text-muted" pointerEvents="none">{t("userDialog.days")}</InputRightElement>
                    </InputGroup>
                    <Chips
                      options={[7, 30, 90, 365].map((d) => ({ label: t("userDialog.nDays", { count: d }), on: form.duration_days === String(d), onClick: () => setForm({ ...form, duration_days: String(d) }) }))
                        .concat([{ label: t("userDialog.never"), on: !form.duration_days, onClick: () => setForm({ ...form, duration_days: "" }) }])}
                    />
                  </FormControl>
                  <SimpleGrid columns={2} spacing={3}>
                    <FormControl>
                      <FormLabel>{t("templates.prefix")}</FormLabel>
                      <Input fontFamily="mono" value={form.username_prefix} onChange={(e) => setForm({ ...form, username_prefix: e.target.value })} />
                    </FormControl>
                    <FormControl>
                      <FormLabel>{t("templates.suffix")}</FormLabel>
                      <Input fontFamily="mono" value={form.username_suffix} onChange={(e) => setForm({ ...form, username_suffix: e.target.value })} />
                    </FormControl>
                  </SimpleGrid>
                  <FormControl>
                    <FormLabel>{t("templates.inbounds")}</FormLabel>
                    <FormHelperText mt={0} mb={2}>{t("templates.inboundsHelp")}</FormHelperText>
                    <VStack align="start" spacing={2}>
                      {[...inbounds.entries()].map(([protocol, list]) => (
                        <Wrap key={protocol} spacing={3} align="center">
                          <Text fontSize="13px" fontWeight={600} minW="90px">
                            {PROTO[protocol] || protocol}
                          </Text>
                          {list.map((inbound) => (
                            <Checkbox key={inbound.tag} size="sm" isChecked={(form.inbounds[protocol] || []).includes(inbound.tag)}
                              onChange={(e) => toggleInbound(protocol, inbound.tag, e.target.checked)}>
                              <Text as="span" fontFamily="mono" fontSize="12px">{inbound.tag}</Text>
                            </Checkbox>
                          ))}
                        </Wrap>
                      ))}
                    </VStack>
                  </FormControl>
                  <Box pt={2} borderTopWidth="1px" borderColor="border-subtle">
                    <UserTemplateSelects compact value={form.refs}
                      onChange={(field, id) => setForm({ ...form, refs: { ...form.refs, [field]: id } })} />
                  </Box>
                  <FormControl>
                    <FormLabel>{t("access.sectionTitle")}</FormLabel>
                    <AccessSelect listId={form.access_list_id} unrestricted={form.access_unrestricted}
                      onChange={(listId, free) => setForm({ ...form, access_list_id: listId, access_unrestricted: free })} />
                  </FormControl>
                  <Help>{templateSummary(form, t)}</Help>
                </VStack>
              </DrawerBody>
              <DrawerFooter borderTopWidth="1px" borderColor="border" gap={2}>
                <Button variant="outline" onClick={() => setEditing(null)}>{t("cancel")}</Button>
                <Button colorScheme="primary" type="submit" isLoading={save.isPending}>{t("templates.save")}</Button>
              </DrawerFooter>
            </chakra.form>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default TemplatesModal;

const templateSummary = (form: TemplateForm, t: (k: string, o?: any) => string) =>
  t("templates.summary", {
    data: form.data_limit_gb ? `${form.data_limit_gb} GB` : t("usersTable.unlimited").toLowerCase(),
    duration: form.duration_days ? t("templates.days", { count: Number(form.duration_days) }) : t("templates.noExpiry").toLowerCase(),
  });

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
