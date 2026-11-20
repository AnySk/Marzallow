import {
  Badge,
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  NumberInput,
  NumberInputField,
  Spinner,
  Switch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { StatisticsQueryKey } from "components/Statistics";
import { AlertsQueryKey } from "contexts/FeaturesContext";
import { Chip, PageHeader, Panel } from "./ui";
import { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { queryClient } from "utils/react-query";
import { generateErrorMessage, generateSuccessMessage } from "utils/toastHandler";

type SettingType = "bool" | "int" | "str" | "int_list" | "str_list";
type SettingInfo = {
  key: string;
  group: string;
  type: SettingType;
  description: string;
  value: any;
  default: any;
  overridden: boolean;
  secret: boolean;
  has_value: boolean;
};

const GROUPS = ["notifications", "webhook", "subscription", "users", "security"];
const SettingsQueryKey = ["panel-settings"];
const RESET = Symbol("reset");

const toText = (setting: SettingInfo, value: any) =>
  setting.type.endsWith("_list") ? (value || []).join(", ") : value ?? "";

/** Panel settings stored in the database, overriding .env (sudo only). */
export const SettingsModal: FC = () => {
  const isOpen = true;
  const { t } = useTranslation();
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, any>>({}); // key -> edited value or RESET
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: SettingsQueryKey,
    queryFn: () => fetch<SettingInfo[]>("/settings"),
    enabled: isOpen,
  });
  useEffect(() => {
    if (!isOpen) {
      setDraft({});
      setErrors({});
    }
  }, [isOpen]);

  const changed = Object.keys(draft);
  const save = () => {
    const body: Record<string, any> = {};
    for (const key of changed) body[key] = draft[key] === RESET ? null : draft[key];
    setSaving(true);
    fetch<SettingInfo[]>("/settings", { method: "PUT", body })
      .then((fresh) => {
        queryClient.setQueryData(SettingsQueryKey, fresh);
        queryClient.invalidateQueries({ queryKey: AlertsQueryKey });
        queryClient.invalidateQueries({ queryKey: StatisticsQueryKey });
        setDraft({});
        setErrors({});
        generateSuccessMessage(t("settings.saved"), toast);
      })
      .catch((e) => {
        const detail = e?.response?._data?.detail;
        if (detail && typeof detail === "object") setErrors(detail);
        else generateErrorMessage(e, toast);
      })
      .finally(() => setSaving(false));
  };

  const edit = (key: string, value: any) => {
    setDraft({ ...draft, [key]: value });
    if (errors[key]) setErrors({ ...errors, [key]: "" });
  };
  const reset = (setting: SettingInfo) => edit(setting.key, RESET);

  const field = (setting: SettingInfo) => {
    const pending = draft[setting.key];
    const isReset = pending === RESET;
    const current = pending === undefined || isReset ? (isReset ? setting.default : setting.value) : pending;
    const overridden = isReset ? false : pending !== undefined || setting.overridden;
    const source = (
      <HStack spacing={2} flex="none">
        <Chip fontFamily="body" bg={overridden ? "accent-soft" : "surface-subtle"} color={overridden ? "accent-text" : "text-2"}>
          {overridden ? t("settings.changed") : t("settings.fromEnv")}
        </Chip>
        {overridden && (
          <Button size="xs" variant="ghost" onClick={() => reset(setting)}>
            {t("settings.resetToEnv")}
          </Button>
        )}
      </HStack>
    );
    const control =
      setting.type === "bool" ? (
        <Switch id={setting.key} colorScheme="primary" isChecked={!!current} onChange={(e) => edit(setting.key, e.target.checked)} />
      ) : setting.type === "int" ? (
        <NumberInput size="sm" w="160px" value={current ?? ""} onChange={(_, n) => edit(setting.key, Number.isNaN(n) ? current : n)}>
          <NumberInputField name={setting.key} id={setting.key} />
        </NumberInput>
      ) : setting.secret ? (
        <Input size="sm" w={{ base: "full", md: "320px" }} type="password" id={setting.key} name={setting.key} autoComplete="new-password"
          placeholder={setting.has_value ? t("settings.secretSet") : t("settings.secretNotSet")}
          value={typeof pending === "string" ? pending : ""}
          onChange={(e) => edit(setting.key, e.target.value)} />
      ) : (
        <Input size="sm" w={{ base: "full", md: "320px" }} id={setting.key} name={setting.key}
          value={typeof pending === "string" ? pending : toText(setting, current)}
          placeholder={setting.type.endsWith("_list") ? t("settings.commaSeparated") : ""}
          onChange={(e) => edit(setting.key, e.target.value)} />
      );
    return (
      <FormControl
        key={setting.key}
        isInvalid={!!errors[setting.key]}
        display="flex"
        flexDirection={{ base: "column", md: "row" }}
        alignItems={{ base: "stretch", md: "center" }}
        gap={3}
        px={4}
        py={3}
        borderBottomWidth="1px"
        borderColor="border-subtle"
        _last={{ borderBottomWidth: 0 }}
      >
        <VStack align="flex-start" spacing="2px" flex={1} minW={0}>
          <FormLabel htmlFor={setting.key} m={0} fontWeight={500} fontSize="14px">
            {setting.description}
          </FormLabel>
          <Text fontSize="12px" fontFamily="mono" color="text-muted">
            {setting.key}
          </Text>
          <FormErrorMessage mt={1}>{errors[setting.key]}</FormErrorMessage>
        </VStack>
        <HStack spacing={3} justify={{ base: "space-between", md: "flex-end" }}>
          {control}
          {source}
        </HStack>
      </FormControl>
    );
  };

  const errorGroups = new Set((items || []).filter((s) => errors[s.key]).map((s) => s.group));

  return (
    <>
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.description")}
        actions={
          <>
            {changed.length > 0 && (
              <Text fontSize="13px" color="warning-fg">
                {t("settings.unsaved", { count: changed.length })}
              </Text>
            )}
            <Button variant="outline" isDisabled={!changed.length} onClick={() => { setDraft({}); setErrors({}); }}>
              {t("settings.discard")}
            </Button>
            <Button colorScheme="primary" isDisabled={!changed.length} isLoading={saving} onClick={save}>
              {t("settings.save")}
            </Button>
          </>
        }
      />
      {isLoading || !items ? (
        <Spinner />
      ) : (
        <Tabs variant="line" isLazy={false}>
          <TabList flexWrap="wrap" overflowX="auto">
            {GROUPS.map((group) => (
              <Tab key={group} color={errorGroups.has(group) ? "danger-fg" : undefined}>
                {t(`settings.group.${group}`)}
              </Tab>
            ))}
          </TabList>
          <TabPanels>
            {GROUPS.map((group) => (
              <TabPanel key={group} px={0} pt={4}>
                <Panel>{items.filter((s) => s.group === group).map(field)}</Panel>
              </TabPanel>
            ))}
          </TabPanels>
        </Tabs>
      )}
    </>
  );
};

export default SettingsModal;
