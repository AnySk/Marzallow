/*
 * Subscription templates: the base config each client app downloads (see
 * app/subscription/templates.py). A list per format, an editor with live
 * validation and a preview, and deleting with somewhere to move the users and
 * hosts that used it.
 */
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Box,
  Button,
  chakra,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Spinner,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  useToast,
  VStack,
} from "@chakra-ui/react";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  EllipsisHorizontalIcon,
  ExclamationCircleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useFeatures } from "contexts/FeaturesContext";
import { kindInfo, SubTemplatesQueryKey, useSubTemplates } from "contexts/SubscriptionTemplates";
import dayjs from "dayjs";
import debounce from "lodash.debounce";
import { FC, lazy, ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import CopyToClipboard from "react-copy-to-clipboard";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import {
  SubTemplateDetail,
  SubTemplateInfo,
  TemplateKind,
  TemplateKindInfo,
  ValidateResult,
} from "types/SubscriptionTemplate";
import { User } from "types/User";
import { generateErrorMessage, generateSuccessMessage } from "utils/toastHandler";
import { CodeEditor } from "./CodeEditor";
import { Chip, Help, Panel } from "./ui";

const CoreConfigEditor = lazy(() => import("./CoreConfigEditor"));

const ic = (c: typeof PlusIcon) => chakra(c, { baseStyle: { w: 4, h: 4 } });
const Icons = {
  plus: ic(PlusIcon),
  back: ic(ArrowLeftIcon),
  more: ic(EllipsisHorizontalIcon),
  copy: ic(DocumentDuplicateIcon),
  ok: ic(CheckCircleIcon),
  err: ic(ExclamationCircleIcon),
};

const EDITOR_H = "max(280px, calc(100vh - 480px))"; // leaves room for the validation bar and footer

const KINDS: TemplateKind[] = ["v2ray_json", "singbox", "clash", "subscription_page"];

const VARIABLES = [
  "user.username",
  "user.status",
  "user.note",
  "user.data_limit",
  "user.used_traffic",
  "user.expire",
  "info.DATA_LEFT",
  "info.DAYS_LEFT",
  "info.EXPIRE_DATE",
  "info.TIME_LEFT",
  "info.STATUS_TEXT",
  "now()",
];

type Target =
  | { mode: "edit"; id: number }
  | { mode: "new"; kind: TemplateKind; content: string; name: string }
  | { mode: "builtin"; kind: TemplateKind };

const invalidate = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: SubTemplatesQueryKey });

const SourceChip: FC<{ source: "dashboard" | "built-in" | "file" }> = ({ source }) => {
  const { t } = useTranslation();
  return <Chip fontFamily="body">{t(`subTpl.source.${source}`)}</Chip>;
};

const DefaultBadge: FC = () => {
  const { t } = useTranslation();
  return (
    <Badge bg="accent-soft" color="accent-text" fontSize="11px">
      {t("subTpl.default")}
    </Badge>
  );
};

const usageText = (u: SubTemplateInfo["usage"], t: (k: string, o?: object) => string) => {
  const parts = [];
  if (u.hosts) parts.push(t("subTpl.usage.hosts", { count: u.hosts }));
  if (u.users) parts.push(t("subTpl.usage.users", { count: u.users }));
  if (u.user_templates) parts.push(t("subTpl.usage.userTemplates", { count: u.user_templates }));
  return parts.join(" · ");
};

/* ------------------------------------------------------------------ list ------- */

const TemplateList: FC<{
  kinds: TemplateKindInfo[];
  kind: TemplateKind;
  setKind: (k: TemplateKind) => void;
  open: (t: Target) => void;
  onDelete: (t: SubTemplateInfo) => void;
}> = ({ kinds, kind, setKind, open, onDelete }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const info = kindInfo(kinds, kind)!;

  const duplicate = async (id: number | null) => {
    try {
      const content = id
        ? (await fetch<SubTemplateDetail>(`/subscription-templates/${id}`)).content
        : (await fetch<{ content: string }>(`/subscription-templates/builtin/${kind}`)).content;
      const base = id ? info.templates.find((x) => x.id === id)?.name : t("subTpl.builtin");
      open({ mode: "new", kind, content, name: t("subTpl.copyOf", { name: base }) });
    } catch (e) {
      generateErrorMessage(e, toast);
    }
  };
  const setDefault = async (tpl: SubTemplateInfo | null) => {
    try {
      if (tpl) await fetch(`/subscription-templates/${tpl.id}`, { method: "PUT", body: { is_default: true } });
      else {
        const current = info.templates.find((x) => x.is_default);
        if (current) await fetch(`/subscription-templates/${current.id}`, { method: "PUT", body: { is_default: false } });
      }
      invalidate(qc);
    } catch (e) {
      generateErrorMessage(e, toast);
    }
  };

  return (
    <VStack align="stretch" spacing={4}>
      <Flex gap={1} wrap="wrap" role="tablist" aria-label={t("subTpl.formats")}>
        {KINDS.map((k) => {
          const on = k === kind;
          const n = (kindInfo(kinds, k)?.templates.length || 0) + 1;
          return (
            <Button
              key={k}
              role="tab"
              aria-selected={on}
              size="sm"
              variant="unstyled"
              display="inline-flex"
              gap="6px"
              h="32px"
              px={3}
              borderRadius="md"
              fontWeight={500}
              fontSize="13px"
              bg={on ? "inverse" : "transparent"}
              color={on ? "inverse-text" : "text-2"}
              _hover={on ? {} : { bg: "surface-hover" }}
              onClick={() => setKind(k)}
            >
              {kindInfo(kinds, k)?.label}
              <Text as="span" fontSize="12px" opacity={0.75}>
                {n}
              </Text>
            </Button>
          );
        })}
      </Flex>
      <Help>{t(`subTpl.order.${kind}`)}</Help>

      <Panel overflowX="auto">
        <Table size="md" minW="760px">
          <Thead>
            <Tr>
              <Th>{t("subTpl.template")}</Th>
              <Th>{t("subTpl.usedBy")}</Th>
              <Th>{t("subTpl.sourceCol")}</Th>
              <Th>{t("subTpl.lastEdited")}</Th>
              <Th textAlign="right">{t("usersTable.actions")}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {info.templates.map((tpl) => (
              <Tr key={tpl.id} className="interactive" onClick={() => open({ mode: "edit", id: tpl.id })}>
                <Td maxW="340px">
                  <HStack spacing={2}>
                    <Text fontWeight={600}>{tpl.name}</Text>
                    {tpl.is_default && <DefaultBadge />}
                  </HStack>
                  {tpl.description && (
                    <Help noOfLines={2} title={tpl.description}>
                      {tpl.description}
                    </Help>
                  )}
                </Td>
                <Td color={usageText(tpl.usage, t) ? "text" : "text-muted"} fontSize="13px">
                  {usageText(tpl.usage, t) || (tpl.is_default ? t("subTpl.usage.everyoneElse") : t("subTpl.usage.none"))}
                </Td>
                <Td>
                  <SourceChip source="dashboard" />
                </Td>
                <Td fontSize="13px" color="text-muted" whiteSpace="nowrap">
                  {tpl.updated_at ? dayjs.utc(tpl.updated_at).local().fromNow() : "—"}
                  {tpl.updated_by ? ` · ${tpl.updated_by}` : ""}
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <HStack justify="flex-end" spacing={1}>
                    <Button size="sm" variant="ghost" onClick={() => open({ mode: "edit", id: tpl.id })}>
                      {t("subTpl.edit")}
                    </Button>
                    <Menu placement="bottom-end">
                      <MenuButton as={IconButton} size="sm" variant="ghost" aria-label={t("subTpl.more")} icon={<Icons.more />} />
                      <MenuList>
                        <MenuItem onClick={() => duplicate(tpl.id)}>{t("subTpl.duplicate")}</MenuItem>
                        {!tpl.is_default && <MenuItem onClick={() => setDefault(tpl)}>{t("subTpl.setDefault")}</MenuItem>}
                        <MenuItem color="danger-fg" onClick={() => onDelete(tpl)}>
                          {t("delete")}
                        </MenuItem>
                      </MenuList>
                    </Menu>
                  </HStack>
                </Td>
              </Tr>
            ))}
            <Tr className="interactive" onClick={() => open({ mode: "builtin", kind })}>
              <Td>
                <HStack spacing={2}>
                  <Text fontWeight={600}>{info.builtin.source === "file" ? t("subTpl.file") : t("subTpl.builtin")}</Text>
                  {info.builtin.is_default && <DefaultBadge />}
                </HStack>
                <Help>
                  {info.builtin.source === "file"
                    ? t("subTpl.fileHelp", { path: info.builtin.path })
                    : t("subTpl.builtinHelp", { path: info.builtin.path })}
                </Help>
              </Td>
              <Td fontSize="13px" color={info.builtin.is_default ? "text" : "text-muted"}>
                {info.builtin.is_default ? t("subTpl.usage.everyoneElse") : t("subTpl.usage.none")}
              </Td>
              <Td>
                <SourceChip source={info.builtin.source} />
              </Td>
              <Td color="text-muted">—</Td>
              <Td onClick={(e) => e.stopPropagation()}>
                <HStack justify="flex-end" spacing={1}>
                  <Button size="sm" variant="ghost" onClick={() => open({ mode: "builtin", kind })}>
                    {t("subTpl.view")}
                  </Button>
                  <Menu placement="bottom-end">
                    <MenuButton as={IconButton} size="sm" variant="ghost" aria-label={t("subTpl.more")} icon={<Icons.more />} />
                    <MenuList>
                      <MenuItem onClick={() => duplicate(null)}>{t("subTpl.duplicate")}</MenuItem>
                      {!info.builtin.is_default && <MenuItem onClick={() => setDefault(null)}>{t("subTpl.setDefault")}</MenuItem>}
                    </MenuList>
                  </Menu>
                </HStack>
              </Td>
            </Tr>
          </Tbody>
        </Table>
      </Panel>

      {info.templates.length === 0 && (
        <Panel p={5} display="flex" flexDirection={{ base: "column", sm: "row" }} gap={4} alignItems={{ sm: "center" }}>
          <Box flex={1}>
            <Text fontWeight={600}>{t("subTpl.emptyTitle", { format: info.label })}</Text>
            <Help>{t("subTpl.emptyHelp")}</Help>
          </Box>
          <Button colorScheme="primary" variant="outline" leftIcon={<Icons.copy />} onClick={() => duplicate(null)}>
            {t("subTpl.duplicateBuiltin")}
          </Button>
        </Panel>
      )}

      <Panel p={4} bg="surface-subtle">
        <Text fontSize="13px" fontWeight={600} mb={1}>
          {t("subTpl.about", { format: info.label })}
        </Text>
        <Help>{t(`subTpl.aboutText.${kind}`)}</Help>
      </Panel>
    </VStack>
  );
};

/* ---------------------------------------------------------------- editor ------- */

const Variables: FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  return (
    <Box mt={4} pt={3} borderTopWidth="1px" borderColor="border-subtle">
      <Text fontSize="13px" fontWeight={600} mb={2}>
        {t("subTpl.variables")}
      </Text>
      <Flex wrap="wrap" gap="6px">
        {VARIABLES.map((v) => {
          const text = v === "now()" ? "{{ now() }}" : `{{ ${v} }}`;
          return (
            <CopyToClipboard key={v} text={text} onCopy={() => toast({ title: t("subTpl.copiedVar", { v: text }), status: "success", duration: 1200, position: "top" })}>
              <Chip as="button" cursor="pointer" _hover={{ borderColor: "accent" }}>
                {text}
              </Chip>
            </CopyToClipboard>
          );
        })}
      </Flex>
      <Help mt={2}>{t("subTpl.variablesHelp")}</Help>
    </Box>
  );
};

const PreviewPane: FC<{ kind: TemplateKind; content: string; syntax: string }> = ({ kind, content, syntax }) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [users, setUsers] = useState<string[]>([]);
  const [meta, setMeta] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch<{ users: User[] }>("/users", { query: { limit: 50, sort: "-online_at" } })
      .then((r) => {
        setUsers(r.users.map((u) => u.username));
        if (!username && r.users[0]) setUsername(r.users[0].username);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const render = () => {
    setLoading(true);
    setError(null);
    fetch<{ output: string }>("/subscription-templates/preview", {
      method: "POST",
      body: { kind, content, username, meta },
    })
      .then((r) => setOutput(r.output))
      .catch((e) => {
        setOutput(null);
        setError(e?.response?._data?.detail?.message || e?.response?._data?.detail || String(e));
      })
      .finally(() => setLoading(false));
  };

  const pretty = useMemo(() => {
    if (!output || syntax !== "json") return output;
    try {
      return JSON.stringify(JSON.parse(output), null, 2);
    } catch {
      return output;
    }
  }, [output, syntax]);

  return (
    <VStack align="stretch" spacing={3}>
      <Flex gap={3} wrap="wrap" align="flex-end">
        <FormControl w={{ base: "full", sm: "260px" }}>
          <FormLabel>{t("subTpl.sampleUser")}</FormLabel>
          <Input list="sub-tpl-users" value={username} onChange={(e) => setUsername(e.target.value)} fontFamily="mono" />
          <datalist id="sub-tpl-users">
            {users.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </FormControl>
        {kind === "clash" && (
          <HStack as="label" spacing={2} pb={2}>
            <Switch isChecked={meta} onChange={(e) => setMeta(e.target.checked)} />
            <Text fontSize="13px">Clash Meta</Text>
          </HStack>
        )}
        <Button colorScheme="primary" onClick={render} isLoading={loading} isDisabled={!username}>
          {t("subTpl.render")}
        </Button>
        {pretty && (
          <CopyToClipboard text={pretty}>
            <Button variant="outline" leftIcon={<Icons.copy />}>
              {t("subTpl.copy")}
            </Button>
          </CopyToClipboard>
        )}
      </Flex>
      <Help>{t(`subTpl.previewHelp.${kind}`)}</Help>
      {error && <ValidationBar result={{ ok: false, message: error, line: null }} />}
      {pretty !== null &&
        (kind === "subscription_page" ? (
          <Box as="iframe" title={t("subTpl.preview")} sandbox="" srcDoc={pretty} h="60vh" w="full" borderWidth="1px" borderColor="border" borderRadius="md" bg="white" />
        ) : (
          <CodeEditor value={pretty} language={syntax === "yaml" ? "yaml" : "json"} readOnly h="60vh" />
        ))}
    </VStack>
  );
};

const ValidationBar: FC<{ result: ValidateResult | null; checking?: boolean; extra?: ReactNode }> = ({ result, checking, extra }) => {
  const { t } = useTranslation();
  if (checking && !result)
    return (
      <HStack fontSize="13px" color="text-muted" spacing={2}>
        <Spinner size="xs" />
        <span>{t("subTpl.checking")}</span>
      </HStack>
    );
  if (!result) return null;
  return (
    <HStack
      px={3}
      py={2}
      borderRadius="md"
      borderWidth="1px"
      fontSize="13px"
      spacing={2}
      bg={result.ok ? "success-bg" : "danger-bg"}
      color={result.ok ? "success-fg" : "danger-fg"}
      borderColor={result.ok ? "transparent" : "danger-border"}
      role={result.ok ? "status" : "alert"}
    >
      {result.ok ? <Icons.ok /> : <Icons.err />}
      <Text flex={1}>
        {result.line ? `${t("subTpl.line", { line: result.line })}: ` : ""}
        {result.message}
      </Text>
      {checking && <Spinner size="xs" />}
      {extra}
    </HStack>
  );
};

const Editor: FC<{
  kinds: TemplateKindInfo[];
  target: Target;
  close: (saved?: SubTemplateDetail) => void;
  onDelete: (t: SubTemplateInfo) => void;
}> = ({ kinds, target, close, onDelete }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [detail, setDetail] = useState<SubTemplateDetail | null>(null);
  const [content, setContent] = useState<string>(target.mode === "new" ? target.content : "");
  const [name, setName] = useState(target.mode === "new" ? target.name : "");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [tab, setTab] = useState<"code" | "preview">("code");
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(target.mode === "new");
  const initial = useRef({ content: target.mode === "new" ? target.content : "", name: "", description: "", isDefault: false });

  const kind: TemplateKind = target.mode === "edit" ? (detail?.kind as TemplateKind) : target.kind;
  const info = kind ? kindInfo(kinds, kind) : undefined;
  const readOnly = target.mode === "builtin";

  const load = () => {
    if (target.mode === "edit")
      fetch<SubTemplateDetail>(`/subscription-templates/${target.id}`).then((d) => {
        setDetail(d);
        setContent(d.content);
        setName(d.name);
        setDescription(d.description || "");
        setIsDefault(d.is_default);
        initial.current = { content: d.content, name: d.name, description: d.description || "", isDefault: d.is_default };
        setConflict(null);
        setLoaded(true);
      });
    if (target.mode === "builtin")
      fetch<{ content: string }>(`/subscription-templates/builtin/${target.kind}`).then((d) => {
        setContent(d.content);
        initial.current.content = d.content;
        setLoaded(true);
      });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const validate = useMemo(
    () =>
      debounce((k: TemplateKind, text: string) => {
        setChecking(true);
        fetch<ValidateResult>("/subscription-templates/validate", { method: "POST", body: { kind: k, content: text } })
          .then(setValidation)
          .catch(() => {})
          .finally(() => setChecking(false));
      }, 500),
    []
  );
  useEffect(() => {
    if (loaded && kind) validate(kind, content);
  }, [content, kind, loaded, validate]);

  const dirty =
    !readOnly &&
    (content !== initial.current.content ||
      name !== initial.current.name ||
      description !== initial.current.description ||
      isDefault !== initial.current.isDefault);

  const save = async () => {
    if (!name.trim()) {
      toast({ title: t("subTpl.nameRequired"), status: "error", position: "top", duration: 3000 });
      return;
    }
    setSaving(true);
    try {
      const saved =
        target.mode === "new"
          ? await fetch<SubTemplateDetail>("/subscription-templates", {
              method: "POST",
              body: { kind, name, description, content, is_default: isDefault },
            })
          : await fetch<SubTemplateDetail>(`/subscription-templates/${detail!.id}`, {
              method: "PUT",
              body: { name, description, content, is_default: isDefault, expected_updated_at: detail!.updated_at },
            });
      invalidate(qc);
      generateSuccessMessage(t("subTpl.saved", { name: saved.name }), toast);
      close(saved);
    } catch (e: any) {
      const status = e?.response?.status;
      const detailMsg = e?.response?._data?.detail;
      if (status === 409 && target.mode === "edit" && String(detailMsg).includes("reload")) setConflict(String(detailMsg));
      else if (status === 422 && detailMsg?.message) setValidation({ ok: false, message: detailMsg.message, line: detailMsg.line });
      else generateErrorMessage(e, toast);
    } finally {
      setSaving(false);
    }
  };

  const resetToBuiltin = () =>
    fetch<{ content: string }>(`/subscription-templates/builtin/${kind}`).then((d) => setContent(d.content));

  if (!loaded || !info)
    return (
      <Flex justify="center" py={16}>
        <Spinner />
      </Flex>
    );

  const source = readOnly ? info.builtin.source : "dashboard";
  const title = readOnly ? (info.builtin.source === "file" ? t("subTpl.file") : t("subTpl.builtin")) : name || t("subTpl.untitled");

  return (
    <VStack align="stretch" spacing={4}>
      <Flex wrap="wrap" gap={3} align="center" justify="space-between">
        <HStack spacing={3} minW={0}>
          <IconButton size="sm" variant="ghost" aria-label={t("subTpl.backToList")} icon={<Icons.back />} onClick={() => close()} />
          <VStack align="flex-start" spacing={0} minW={0}>
            <Help>{info.label}</Help>
            <HStack spacing={2}>
              <Text fontWeight={700} fontSize="16px" noOfLines={1}>
                {title}
              </Text>
              {(readOnly ? info.builtin.is_default : isDefault) && <DefaultBadge />}
              <SourceChip source={source as "dashboard" | "built-in" | "file"} />
            </HStack>
          </VStack>
        </HStack>
        <Flex role="tablist" bg="chakra-subtle-bg" borderRadius="9px" p="3px" gap="2px">
          {(["code", "preview"] as const).map((k) => (
            <Button
              key={k}
              role="tab"
              aria-selected={tab === k}
              h="30px"
              px={4}
              variant="unstyled"
              fontSize="13px"
              fontWeight={500}
              borderRadius="7px"
              bg={tab === k ? "surface" : "transparent"}
              boxShadow={tab === k ? "0 1px 2px rgba(16,24,40,.12)" : "none"}
              onClick={() => setTab(k)}
            >
              {t(`subTpl.tab.${k}`)}
            </Button>
          ))}
        </Flex>
      </Flex>

      {conflict && (
        <ValidationBar
          result={{ ok: false, message: conflict, line: null }}
          extra={
            <Button size="xs" variant="outline" onClick={load}>
              {t("subTpl.reload")}
            </Button>
          }
        />
      )}

      {tab === "code" ? (
        <>
          {!readOnly && (
            <Flex gap={4} wrap="wrap" align="flex-end">
              <FormControl w={{ base: "full", md: "260px" }} isRequired>
                <FormLabel>{t("subTpl.name")}</FormLabel>
                <Input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
              </FormControl>
              <FormControl flex="1" minW="220px">
                <FormLabel>
                  {t("subTpl.description")}{" "}
                  <Text as="span" color="text-muted" fontWeight={400}>
                    {t("userDialog.optional")}
                  </Text>
                </FormLabel>
                <Input value={description} maxLength={256} onChange={(e) => setDescription(e.target.value)} />
              </FormControl>
              <FormControl w="auto">
                <FormLabel>{t("subTpl.format")}</FormLabel>
                <HStack h="36px">
                  <Chip fontFamily="body" h="24px">
                    {info.label}
                  </Chip>
                  <Help>{t("subTpl.formatFixed")}</Help>
                </HStack>
              </FormControl>
              <FormControl w="auto">
                <HStack as="label" spacing={2} h="36px" cursor="pointer">
                  <Switch colorScheme="primary" isChecked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                  <Box>
                    <Text fontSize="13px" fontWeight={600}>
                      {t("subTpl.useAsDefault")}
                    </Text>
                  </Box>
                </HStack>
                <FormHelperText mt={0}>{t(`subTpl.defaultHelp.${kind}`)}</FormHelperText>
              </FormControl>
            </Flex>
          )}
          {readOnly && <Help>{info.builtin.source === "file" ? t("subTpl.fileReadOnly") : t("subTpl.builtinReadOnly")}</Help>}

          {kind === "v2ray_json" && !readOnly ? (
            <Suspense fallback={<Spinner />}>
              <CoreConfigEditor value={content} onChange={setContent} height={EDITOR_H} aside={<Variables />} />
            </Suspense>
          ) : (
            <Flex direction={{ base: "column", lg: "row" }} gap={3}>
              <CodeEditor
                flex={1}
                h={readOnly ? "max(320px, calc(100vh - 380px))" : EDITOR_H}
                value={content}
                onChange={readOnly ? undefined : setContent}
                readOnly={readOnly}
                language={info.syntax}
              />
              {!readOnly && (
                <Panel w={{ base: "full", lg: "320px" }} p={3} flexShrink={0} maxH={EDITOR_H} overflowY="auto">
                  <Help>{t(`subTpl.aboutText.${kind}`)}</Help>
                  <Variables />
                </Panel>
              )}
            </Flex>
          )}
          <ValidationBar
            result={validation}
            checking={checking}
            extra={
              validation?.ok ? (
                <Button size="xs" variant="ghost" color="inherit" onClick={() => setTab("preview")}>
                  {t("subTpl.openPreview")}
                </Button>
              ) : null
            }
          />
        </>
      ) : (
        <PreviewPane kind={kind} content={content} syntax={info.syntax} />
      )}

      <Flex
        gap={2}
        wrap="wrap"
        align="center"
        pt={3}
        borderTopWidth="1px"
        borderColor="border-subtle"
        position="sticky"
        bottom={0}
        bg="surface"
        pb={1}
      >
        {readOnly ? (
          <>
            <Box flex={1} />
            <Button variant="outline" onClick={() => close()}>
              {t("subTpl.back")}
            </Button>
            <Button
              colorScheme="primary"
              leftIcon={<Icons.copy />}
              onClick={() => close({ duplicateOf: content } as any)}
            >
              {t("subTpl.duplicateToEdit")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={resetToBuiltin}>
              {t("subTpl.resetToBuiltin")}
            </Button>
            {target.mode === "edit" && detail && (
              <Button variant="ghost" colorScheme="red" onClick={() => onDelete(detail)}>
                {t("delete")}
              </Button>
            )}
            <Box flex={1} />
            {dirty && (
              <HStack spacing="6px" fontSize="13px" color="warning-fg">
                <Box w="6px" h="6px" borderRadius="full" bg="warning-dot" />
                <span>{t("subTpl.unsaved")}</span>
              </HStack>
            )}
            <Button variant="outline" onClick={() => close()} isDisabled={saving}>
              {t("cancel")}
            </Button>
            <Button colorScheme="primary" onClick={save} isLoading={saving}>
              {t("subTpl.save")}
            </Button>
          </>
        )}
      </Flex>
    </VStack>
  );
};

/* ---------------------------------------------------------------- delete ------- */

const DeleteDialog: FC<{
  kinds: TemplateKindInfo[];
  template: SubTemplateInfo | null;
  onClose: (deleted?: boolean) => void;
}> = ({ kinds, template, onClose }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [moveTo, setMoveTo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setMoveTo(""), [template]);
  if (!template) return null;
  const info = kindInfo(kinds, template.kind)!;
  const others = info.templates.filter((x) => x.id !== template.id);
  const used = template.usage.users + template.usage.hosts + template.usage.user_templates;
  const fallback = info.templates.find((x) => x.is_default && x.id !== template.id)?.name || t("subTpl.builtin");

  const remove = () => {
    setBusy(true);
    fetch(`/subscription-templates/${template.id}`, { method: "DELETE", query: moveTo ? { move_to: moveTo } : {} })
      .then(() => {
        invalidate(qc);
        generateSuccessMessage(t("subTpl.deleted", { name: template.name }), toast);
        onClose(true);
      })
      .catch((e) => generateErrorMessage(e, toast))
      .finally(() => setBusy(false));
  };

  return (
    <AlertDialog isOpen leastDestructiveRef={cancelRef} onClose={() => onClose()} isCentered>
      <AlertDialogOverlay>
        <AlertDialogContent mx={3}>
          <AlertDialogHeader fontSize="17px">{t("subTpl.deleteTitle", { name: template.name })}</AlertDialogHeader>
          <AlertDialogBody>
            <VStack align="stretch" spacing={3}>
              <Text color="text-muted" fontSize="13px">
                {used ? t("subTpl.deleteUsed", { usage: usageText(template.usage, t) }) : t("subTpl.deleteUnused")}
                {template.is_default ? " " + t("subTpl.deleteDefault", { fallback }) : ""}
              </Text>
              {used > 0 && (
                <FormControl>
                  <FormLabel>{t("subTpl.moveTo")}</FormLabel>
                  <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                    <option value="">{t("subTpl.defaultOption", { name: template.is_default ? fallback : defaultLabel(info, t) })}</option>
                    {others.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              )}
            </VStack>
          </AlertDialogBody>
          <AlertDialogFooter gap={2}>
            <Button ref={cancelRef} variant="outline" onClick={() => onClose()}>
              {t("cancel")}
            </Button>
            <Button colorScheme="red" onClick={remove} isLoading={busy}>
              {t("subTpl.deleteConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
};

const defaultLabel = (info: TemplateKindInfo, t: (k: string) => string) =>
  info.templates.find((x) => x.is_default)?.name || (info.builtin.source === "file" ? t("subTpl.file") : t("subTpl.builtin"));

/* ----------------------------------------------------------------- modal ------- */

export const SubscriptionTemplatesModal: FC = () => {
  const { openModal, setModal } = useFeatures();
  const isOpen = openModal === "subTemplates";
  const { t } = useTranslation();
  const { data: kinds, isLoading } = useSubTemplates(isOpen);
  const qc = useQueryClient();
  // usage counts change when users and hosts are edited elsewhere
  useEffect(() => {
    if (isOpen) invalidate(qc);
  }, [isOpen, qc]);
  const [kind, setKind] = useState<TemplateKind>("v2ray_json");
  const [target, setTarget] = useState<Target | null>(null);
  const [deleting, setDeleting] = useState<SubTemplateInfo | null>(null);

  const onClose = () => {
    setModal(null);
    setTarget(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside" closeOnOverlayClick={!target}>
      <ModalOverlay />
      <ModalContent mx={3} maxW="1200px">
        <ModalHeader pr={12}>
          <Flex wrap="wrap" gap={3} align="center" justify="space-between">
            <VStack align="flex-start" spacing="2px">
              <Text fontSize="18px" fontWeight={700}>
                {t("subTpl.title")}
              </Text>
              <Text fontSize="13px" fontWeight={400} color="text-muted">
                {t("subTpl.subtitle")}
              </Text>
            </VStack>
            {!target && (
              <Button
                colorScheme="primary"
                leftIcon={<Icons.plus />}
                onClick={() =>
                  fetch<{ content: string }>(`/subscription-templates/builtin/${kind}`).then((d) =>
                    setTarget({ mode: "new", kind, content: d.content, name: "" })
                  )
                }
              >
                {t("subTpl.new")}
              </Button>
            )}
          </Flex>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {isLoading || !kinds ? (
            <Flex justify="center" py={16}>
              <Spinner />
            </Flex>
          ) : target ? (
            <Editor
              key={JSON.stringify(target).slice(0, 80)}
              kinds={kinds}
              target={target}
              onDelete={setDeleting}
              close={(saved: any) => {
                if (saved?.duplicateOf !== undefined && target.mode === "builtin")
                  setTarget({ mode: "new", kind: target.kind, content: saved.duplicateOf, name: t("subTpl.copyOf", { name: t("subTpl.builtin") }) });
                else setTarget(null);
              }}
            />
          ) : (
            <TemplateList kinds={kinds} kind={kind} setKind={setKind} open={setTarget} onDelete={setDeleting} />
          )}
        </ModalBody>
        {!target && (
          <ModalFooter>
            <Tooltip label={t("subTpl.docsHint")}>
              <Text fontSize="12px" color="text-muted" mr="auto">
                {t("subTpl.footerHint")}
              </Text>
            </Tooltip>
            <Button variant="outline" onClick={onClose}>
              {t("qrcodeDialog.done")}
            </Button>
          </ModalFooter>
        )}
      </ModalContent>
      {kinds && (
        <DeleteDialog
          kinds={kinds}
          template={deleting}
          onClose={(deleted) => {
            setDeleting(null);
            if (deleted) setTarget(null);
          }}
        />
      )}
    </Modal>
  );
};

export default SubscriptionTemplatesModal;
