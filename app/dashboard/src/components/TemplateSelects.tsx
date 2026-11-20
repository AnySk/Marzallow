/* Choosing subscription templates for a user, a user template or a host. */
import { Box, Button, chakra, Collapse, FormControl, FormLabel, HStack, Select, SimpleGrid, Text, useDisclosure } from "@chakra-ui/react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { defaultName, kindInfo, useSubTemplates } from "contexts/SubscriptionTemplates";
import useGetUser from "hooks/useGetUser";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { TemplateKind, USER_TEMPLATE_FIELDS, UserTemplateRefs } from "types/SubscriptionTemplate";
import { Help } from "./ui";

const Chevron = chakra(ChevronDownIcon, { baseStyle: { w: 4, h: 4, transition: "transform .15s" } });

export const TemplateSelect: FC<{
  kind: TemplateKind;
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  label?: string;
  help?: string;
  size?: "sm" | "md";
}> = ({ kind, value, onChange, label, help, size = "md" }) => {
  const { t } = useTranslation();
  const { userData } = useGetUser();
  const { data: kinds } = useSubTemplates(userData.is_sudo);
  const info = kindInfo(kinds, kind);
  return (
    <FormControl>
      {label && <FormLabel>{label}</FormLabel>}
      <Select size={size} value={value || ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{t("subTpl.defaultOption", { name: defaultName(kinds, kind) })}</option>
        {info?.templates.map((tpl) => (
          <option key={tpl.id} value={tpl.id}>
            {tpl.name}
          </option>
        ))}
        {/* keep an id we can't list (non-sudo admins don't see the templates) */}
        {value && !info?.templates.some((x) => x.id === value) && <option value={value}>#{value}</option>}
      </Select>
      {help && <Help mt="6px">{help}</Help>}
    </FormControl>
  );
};

const KINDS = Object.keys(USER_TEMPLATE_FIELDS) as (keyof typeof USER_TEMPLATE_FIELDS)[];

/** Collapsed section with one select per format (user form and user templates). */
export const UserTemplateSelects: FC<{
  value: UserTemplateRefs;
  onChange: (field: keyof UserTemplateRefs, id: number | null) => void;
  compact?: boolean;
}> = ({ value, onChange, compact }) => {
  const { t } = useTranslation();
  const { userData } = useGetUser();
  const { data: kinds } = useSubTemplates(userData.is_sudo);
  const custom = KINDS.filter((k) => value[USER_TEMPLATE_FIELDS[k]]);
  const open = useDisclosure({ defaultIsOpen: custom.length > 0 && !compact });
  const nothingToPick = kinds && KINDS.every((k) => !kindInfo(kinds, k)?.templates.length) && !custom.length;
  const summary = custom.length
    ? t("subTpl.customSummary", { formats: custom.map((k) => kindInfo(kinds, k)?.label || k).join(", ") })
    : t("subTpl.defaultSummary");
  return (
    <Box>
      <HStack as="button" type="button" w="full" justify="space-between" onClick={open.onToggle} aria-expanded={open.isOpen} textAlign="left">
        <Box>
          <Text fontSize="13px" fontWeight={600}>
            {t("subTpl.sectionTitle")}
          </Text>
          <Help>{summary}</Help>
        </Box>
        <Chevron transform={open.isOpen ? "rotate(180deg)" : undefined} />
      </HStack>
      <Collapse in={open.isOpen} animateOpacity>
        <Box pt={3}>
          {nothingToPick ? (
            <Help>{t("subTpl.nothingToPick")}</Help>
          ) : (
            <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={3}>
              {KINDS.map((k) => (
                <TemplateSelect
                  key={k}
                  kind={k}
                  size="sm"
                  label={kindInfo(kinds, k)?.label || k}
                  value={value[USER_TEMPLATE_FIELDS[k]]}
                  onChange={(id) => onChange(USER_TEMPLATE_FIELDS[k], id)}
                />
              ))}
            </SimpleGrid>
          )}
          <Help mt={2}>{t("subTpl.hostWins")}</Help>
          {userData.is_sudo && (
            <Button size="xs" variant="link" mt={1} color="link" fontWeight={500} onClick={() => import("contexts/FeaturesContext").then((m) => m.useFeatures.getState().setModal("subTemplates"))}>
              {t("subTpl.manage")}
            </Button>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};
