/* Access lists: which sites users may reach, enforced by the server (sudo only). */
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  chakra,
  Collapse,
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
  MenuItem,
  MenuList,
  SimpleGrid,
  Spinner,
  Text,
  Textarea,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { EllipsisHorizontalIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { generateErrorMessage, generateSuccessMessage } from "utils/toastHandler";
import { CodeEditor } from "./CodeEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import { Chip, Help, PageHeader, Panel } from "./ui";

const MoreIcon = chakra(EllipsisHorizontalIcon, { baseStyle: { w: 4, h: 4 } });
const AddIcon = chakra(PlusIcon, { baseStyle: { w: 4, h: 4, strokeWidth: 2 } });

export type AccessPolicy = "all" | "except_listed" | "none";
export type AccessListInfo = {
  id: number;
  name: string;
  description: string | null;
  domains: string[];
  ips: string[];
  users: number;
  user_templates: number;
};
export type AccessOverview = { policy: AccessPolicy; unrestricted_users: number; lists: AccessListInfo[]; warnings: string[] };
export const AccessQueryKey = ["access-lists"];

export const useAccess = (enabled = true) =>
  useQuery({ queryKey: AccessQueryKey, queryFn: () => fetch<AccessOverview>("/access-lists"), enabled });

const POLICIES: AccessPolicy[] = ["all", "except_listed", "none"];
const lines = (text: string) => text.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const show = (entry: string) => entry.replace(/^domain:/, "");

const Editor: FC<{ list: AccessListInfo | "new" | null; onClose: () => void }> = ({ list, onClose }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const isNew = list === "new";
  const current = isNew || !list ? null : list;
  const [name, setName] = useState(current?.name || "");
  const [description, setDescription] = useState(current?.description || "");
  const [domains, setDomains] = useState((current?.domains || []).map(show).join("\n"));
  const [ips, setIps] = useState((current?.ips || []).join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setSaving(true);
    setError(null);
    const body = { name, description, domains: lines(domains), ips: lines(ips) };
    (isNew ? fetch("/access-lists", { method: "POST", body }) : fetch(`/access-lists/${current!.id}`, { method: "PUT", body }))
      .then(() => {
        qc.invalidateQueries({ queryKey: AccessQueryKey });
        generateSuccessMessage(t("access.saved"), toast);
        onClose();
      })
      .catch((e) => {
        const detail = e?.response?._data?.detail;
        if (Array.isArray(detail)) setError(detail.map((d: any) => d.msg?.replace(/^Value error, /, "")).join("; "));
        else generateErrorMessage(e, toast);
      })
      .finally(() => setSaving(false));
  };

  return (
    <Drawer isOpen={!!list} onClose={onClose} placement="right" size="md">
      <DrawerOverlay />
      <DrawerContent maxW="520px">
        <DrawerHeader borderBottomWidth="1px" borderColor="border">
          <Text fontSize="18px" fontWeight={700}>{isNew ? t("access.new") : current?.name}</Text>
          <Text fontSize="13px" fontWeight={400} color="text-muted">{t("access.editorHelp")}</Text>
        </DrawerHeader>
        <DrawerCloseButton top={5} />
        <DrawerBody py={5}>
          <VStack align="stretch" spacing={5}>
            <FormControl isRequired>
              <FormLabel>{t("access.name")}</FormLabel>
              <Input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
            </FormControl>
            <FormControl>
              <FormLabel>
                {t("access.description")} <Text as="span" color="text-muted" fontWeight={400}>{t("userDialog.optional")}</Text>
              </FormLabel>
              <Input value={description} maxLength={256} onChange={(e) => setDescription(e.target.value)} />
            </FormControl>
            <FormControl>
              <FormLabel>{t("access.domains")}</FormLabel>
              <Textarea rows={7} fontFamily="mono" fontSize="13px" value={domains} onChange={(e) => setDomains(e.target.value)}
                placeholder={"qwer.qwer\nfull:exact.example.com\ngeosite:youtube"} />
              <FormHelperText>{t("access.domainsHelp")}</FormHelperText>
            </FormControl>
            <FormControl>
              <FormLabel>
                {t("access.ips")} <Text as="span" color="text-muted" fontWeight={400}>{t("userDialog.optional")}</Text>
              </FormLabel>
              <Textarea rows={3} fontFamily="mono" fontSize="13px" value={ips} onChange={(e) => setIps(e.target.value)}
                placeholder={"203.0.113.0/24\ngeoip:ru"} />
              <FormHelperText>{t("access.ipsHelp")}</FormHelperText>
            </FormControl>
            {error && (
              <Alert status="error">
                <AlertIcon />
                {error}
              </Alert>
            )}
          </VStack>
        </DrawerBody>
        <DrawerFooter borderTopWidth="1px" borderColor="border" gap={2}>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button colorScheme="primary" onClick={save} isLoading={saving} isDisabled={!name.trim()}>{t("access.save")}</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export const AccessListsPage: FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useAccess();
  const [editing, setEditing] = useState<AccessListInfo | "new" | null>(null);
  const [deleting, setDeleting] = useState<AccessListInfo | null>(null);
  const [showRules, setShowRules] = useState(false);
  const { data: rules, refetch: refetchRules, isFetching } = useQuery({
    queryKey: ["access-rules"],
    queryFn: () => fetch<{ rules: unknown[] }>("/access-lists/rules"),
    enabled: showRules,
  });

  const [fixing, setFixing] = useState(false);
  const enableSniffing = () => {
    setFixing(true);
    fetch<{ changed: string[] }>("/access-lists/enable-sniffing", { method: "POST" })
      .then((r) => {
        qc.invalidateQueries({ queryKey: AccessQueryKey });
        generateSuccessMessage(t("access.sniffingDone", { count: r.changed.length }), toast);
      })
      .catch((e) => generateErrorMessage(e, toast))
      .finally(() => setFixing(false));
  };
  const setPolicy = (policy: AccessPolicy) =>
    fetch("/settings", { method: "PUT", body: { ACCESS_DEFAULT_POLICY: policy } })
      .then(() => {
        qc.invalidateQueries({ queryKey: AccessQueryKey });
        generateSuccessMessage(t("access.policySaved"), toast);
        if (showRules) setTimeout(() => refetchRules(), 300);
      })
      .catch((e) => generateErrorMessage(e, toast));

  return (
    <>
      <PageHeader
        title={t("access.title")}
        subtitle={t("access.subtitle")}
        actions={
          <Button colorScheme="primary" leftIcon={<AddIcon />} onClick={() => setEditing("new")}>
            {t("access.new")}
          </Button>
        }
      />
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          {data.warnings.some((w) => /sniffing/.test(w)) && (
            <Alert status="warning" alignItems="flex-start">
              <AlertIcon />
              <Box flex={1}>
                <Text fontWeight={600}>{t("access.sniffingTitle")}</Text>
                {data.warnings.filter((w) => /sniffing/.test(w)).map((w) => <Text key={w}>{w}</Text>)}
              </Box>
              <Button size="sm" colorScheme="primary" ml={3} isLoading={fixing} onClick={enableSniffing}>
                {t("access.enableSniffing")}
              </Button>
            </Alert>
          )}
          {data.warnings.filter((w) => !/sniffing/.test(w)).map((w) => (
            <Alert key={w} status="warning">
              <AlertIcon />
              {w}
            </Alert>
          ))}

          <Panel p={5}>
            <Text fontWeight={650} fontSize="15px">{t("access.defaultTitle")}</Text>
            <Help mb={3}>{t("access.defaultHelp")}</Help>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} role="radiogroup" aria-label={t("access.defaultTitle")}>
              {POLICIES.map((p) => {
                const on = data.policy === p;
                return (
                  <Box key={p} as="button" type="button" role="radio" aria-checked={on} textAlign="left" px="14px" py={3}
                    borderWidth="1px" borderRadius="10px" borderColor={on ? "accent" : "border-strong"} bg={on ? "surface-selected" : "surface"}
                    _hover={{ borderColor: on ? "accent" : "gray.400" }} onClick={() => !on && setPolicy(p)}>
                    <Text fontWeight={600}>{t(`access.policy.${p}`)}</Text>
                    <Help>{t(`access.policyHelp.${p}`)}</Help>
                  </Box>
                );
              })}
            </SimpleGrid>
            <Help mt={3}>{t("access.order", { count: data.unrestricted_users })}</Help>
          </Panel>

          {data.lists.length === 0 ? (
            <Panel p={8} textAlign="center">
              <Text fontWeight={600}>{t("access.emptyTitle")}</Text>
              <Help mb={4}>{t("access.emptyHelp")}</Help>
              <Button colorScheme="primary" onClick={() => setEditing("new")}>{t("access.new")}</Button>
            </Panel>
          ) : (
            <SimpleGrid minChildWidth="300px" spacing={4}>
              {data.lists.map((list) => (
                <Panel key={list.id} p={4} display="flex" flexDirection="column" gap={3}>
                  <Flex justify="space-between" align="flex-start" gap={2}>
                    <Box minW={0}>
                      <Text fontWeight={650} fontSize="15px" noOfLines={1}>{list.name}</Text>
                      {list.description && <Help noOfLines={2}>{list.description}</Help>}
                    </Box>
                    <Menu placement="bottom-end">
                      <MenuButton as={IconButton} size="sm" variant="ghost" aria-label={t("subTpl.more")} icon={<MoreIcon />} mt={-1} mr={-2} />
                      <MenuList>
                        <MenuItem onClick={() => setEditing(list)}>{t("admins.edit")}</MenuItem>
                        <MenuItem color="danger-fg" onClick={() => setDeleting(list)}>{t("delete")}</MenuItem>
                      </MenuList>
                    </Menu>
                  </Flex>
                  <Flex gap={1} wrap="wrap">
                    {[...list.domains, ...list.ips].slice(0, 8).map((d) => <Chip key={d}>{show(d)}</Chip>)}
                    {list.domains.length + list.ips.length > 8 && <Chip>+{list.domains.length + list.ips.length - 8}</Chip>}
                    {!list.domains.length && !list.ips.length && <Help>{t("access.blocksAll")}</Help>}
                  </Flex>
                  <HStack mt="auto" justify="space-between">
                    <Help>{t("access.usersCount", { count: list.users })} · {t("access.templatesCount", { count: list.user_templates })}</Help>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(list)}>{t("admins.edit")}</Button>
                  </HStack>
                </Panel>
              ))}
            </SimpleGrid>
          )}

          <Panel p={4}>
            <HStack justify="space-between">
              <Box>
                <Text fontWeight={650}>{t("access.rulesTitle")}</Text>
                <Help>{t("access.rulesHelp")}</Help>
              </Box>
              <Button size="sm" variant="outline" onClick={() => setShowRules(!showRules)} isLoading={isFetching}>
                {showRules ? t("userDialog.hide") : t("userDialog.show")}
              </Button>
            </HStack>
            <Collapse in={showRules} animateOpacity>
              <Box pt={3}>
                {rules && (rules.rules.length ? (
                  <CodeEditor value={JSON.stringify(rules.rules, null, 2)} language="json" readOnly h="320px" />
                ) : (
                  <Help>{t("access.noRules")}</Help>
                ))}
              </Box>
            </Collapse>
          </Panel>
        </>
      )}

      {editing && <Editor key={editing === "new" ? "new" : editing.id} list={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        message={deleting ? t("access.confirmDelete", { name: deleting.name, count: deleting.users }) : undefined}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const id = deleting!.id;
          setDeleting(null);
          fetch(`/access-lists/${id}`, { method: "DELETE" })
            .then(() => qc.invalidateQueries({ queryKey: AccessQueryKey }))
            .catch((e) => generateErrorMessage(e, toast));
        }}
      />
    </>
  );
};

/** The user form / user template choice: default policy, unrestricted, or a list. */
export const AccessSelect: FC<{
  listId: number | null | undefined;
  unrestricted: boolean | null | undefined;
  onChange: (listId: number | null, unrestricted: boolean) => void;
}> = ({ listId, unrestricted, onChange }) => {
  const { t } = useTranslation();
  const { data } = useAccess();
  const mode = unrestricted ? "all" : listId ? "list" : "default";
  const Option: FC<{ value: string; title: string; help: string; onPick: () => void }> = ({ value, title, help, onPick }) => (
    <Box as="button" type="button" role="radio" aria-checked={mode === value} textAlign="left" px="14px" py={3}
      borderWidth="1px" borderRadius="10px" borderColor={mode === value ? "accent" : "border-strong"}
      bg={mode === value ? "surface-selected" : "surface"} onClick={onPick}>
      <Text fontWeight={600} fontSize="14px">{title}</Text>
      <Help>{help}</Help>
    </Box>
  );
  return (
    <VStack align="stretch" spacing={3}>
      <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={2} role="radiogroup">
        <Option value="default" title={t("access.mode.default")} help={t(`access.policy.${data?.policy || "all"}`)} onPick={() => onChange(null, false)} />
        <Option value="all" title={t("access.mode.all")} help={t("access.mode.allHelp")} onPick={() => onChange(null, true)} />
        <Option value="list" title={t("access.mode.list")} help={t("access.mode.listHelp")}
          onPick={() => onChange(listId || data?.lists[0]?.id || null, false)} />
      </SimpleGrid>
      {mode === "list" && (
        <FormControl>
          <chakra.select
            value={listId || ""}
            onChange={(e) => onChange(Number(e.target.value) || null, false)}
            h="36px" px={3} borderWidth="1px" borderColor="border-strong" borderRadius="md" bg="surface" fontSize="14px" w="full"
          >
            {!data?.lists.length && <option value="">{t("access.noLists")}</option>}
            {data?.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} — {l.domains.slice(0, 3).map(show).join(", ")}{l.domains.length > 3 ? "…" : ""}
              </option>
            ))}
          </chakra.select>
        </FormControl>
      )}
    </VStack>
  );
};

export default AccessListsPage;
