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
import { AlertsQueryKey, useFeatures } from "contexts/FeaturesContext";
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
  const { openModal, setModal } = useFeatures();
  const isOpen = openModal === "settings";
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
    const label = (
      <HStack spacing={2} align="baseline" flexWrap="wrap">
        <Text>{setting.description}</Text>
        {overridden ? (
          <Badge colorScheme="purple" fontSize="0.6rem">{t("settings.changed")}</Badge>
        ) : (
          <Badge fontSize="0.6rem">{t("settings.fromEnv")}</Badge>
        )}
        {overridden && (
          <Link fontSize="xs" color="primary.500" onClick={() => reset(setting)}>
            {t("settings.resetToEnv")}
          </Link>
        )}
      </HStack>
    );
    const help = <FormHelperText fontSize="xs" fontFamily="mono">{setting.key}</FormHelperText>;

    if (setting.type === "bool")
      return (
        <FormControl key={setting.key} display="flex" alignItems="flex-start" gap={3} isInvalid={!!errors[setting.key]}>
          <Switch id={setting.key} mt={1} isChecked={!!current}
            onChange={(e) => edit(setting.key, e.target.checked)} />
          <VStack align="start" spacing={0}>
            <FormLabel htmlFor={setting.key} m={0} fontWeight="normal">{label}</FormLabel>
            {help}
            <FormErrorMessage>{errors[setting.key]}</FormErrorMessage>
          </VStack>
        </FormControl>
      );

    return (
      <FormControl key={setting.key} isInvalid={!!errors[setting.key]}>
        <FormLabel fontWeight="normal">{label}</FormLabel>
        {setting.type === "int" ? (
          <NumberInput size="sm" maxW="200px" value={current ?? ""}
            onChange={(_, n) => edit(setting.key, Number.isNaN(n) ? current : n)}>
            <NumberInputField name={setting.key} />
          </NumberInput>
        ) : setting.secret ? (
          <Input size="sm" type="password" name={setting.key} autoComplete="new-password"
            placeholder={setting.has_value ? t("settings.secretSet") : t("settings.secretNotSet")}
            value={typeof pending === "string" ? pending : ""}
            onChange={(e) => edit(setting.key, e.target.value)} />
        ) : (
          <Input size="sm" name={setting.key}
            value={typeof pending === "string" ? pending : toText(setting, current)}
            placeholder={setting.type.endsWith("_list") ? t("settings.commaSeparated") : ""}
            onChange={(e) => edit(setting.key, e.target.value)} />
        )}
        {help}
        <FormErrorMessage>{errors[setting.key]}</FormErrorMessage>
      </FormControl>
    );
  };

  const errorGroups = new Set((items || []).filter((s) => errors[s.key]).map((s) => s.group));

  return (
    <Modal isOpen={isOpen} onClose={() => setModal(null)} size="2xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent mx="3">
        <ModalHeader>
          {t("settings.title")}
          <Text fontSize="sm" fontWeight="normal" color="text-muted" mt={1}>
            {t("settings.description")}
          </Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {isLoading || !items ? (
            <Spinner />
          ) : (
            <Tabs size="sm" variant="soft-rounded" colorScheme="primary" isLazy={false}>
              <TabList flexWrap="wrap" gap={1}>
                {GROUPS.map((group) => (
                  <Tab key={group} color={errorGroups.has(group) ? "red.500" : undefined}>
                    {t(`settings.group.${group}`)}
                  </Tab>
                ))}
              </TabList>
              <TabPanels>
                {GROUPS.map((group) => (
                  <TabPanel key={group} px={0}>
                    <VStack align="stretch" spacing={4}>
                      {items.filter((s) => s.group === group).map(field)}
                    </VStack>
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          )}
        </ModalBody>
        <ModalFooter>
          <HStack>
            <Text fontSize="xs" color="text-muted">
              {changed.length ? t("settings.unsaved", { count: changed.length }) : ""}
            </Text>
            <Button size="sm" variant="ghost" onClick={() => setModal(null)}>
              {t("cancel")}
            </Button>
            <Button size="sm" colorScheme="primary" isDisabled={!changed.length} isLoading={saving} onClick={save}>
              {t("settings.save")}
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
