import {
  Box,
  Button,
  chakra,
  Checkbox,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  HStack,
  NumberInput,
  NumberInputField,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Text,
  useToast,
  Wrap,
} from "@chakra-ui/react";
import { StatisticsQueryKey } from "components/Statistics";
import { useDashboard } from "contexts/DashboardContext";
import { AlertsQueryKey, useFeatures } from "contexts/FeaturesContext";
import { FC, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { TrashIcon as HeroTrash } from "@heroicons/react/24/outline";
import { User } from "types/User";
import { Icon } from "./Icon";
import { Help } from "./ui";

const TrashIcon = chakra(HeroTrash, { baseStyle: { w: 5, h: 5 } });
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { BulkAction, BulkResult } from "types/Management";
import { queryClient } from "utils/react-query";
import { generateErrorMessage } from "utils/toastHandler";
import { ConfirmButton } from "./ConfirmButton";

const GB = 1024 ** 3;

/** Action bar shown while users are selected in the users table. */
export const BulkActionsBar: FC = () => {
  const { selected, clearSelected } = useFeatures();
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const [dialog, setDialog] = useState<"extend" | "delete" | null>(null);

  if (!selected.length) return null;

  const run = (action: BulkAction, extra: { days?: number; data_limit?: number; expire?: number; reactivate_expired?: boolean } = {}) => {
    setBusy(true);
    fetch<BulkResult>("/users/bulk", {
      method: "POST",
      body: { usernames: selected, action, ...extra },
    })
      .then((result) => {
        const skipped = Object.entries(result.skipped);
        toast({
          title: t("bulk.result", { done: result.done.length, skipped: skipped.length }),
          description: skipped
            .slice(0, 5)
            .map(([user, reason]) => `${user}: ${reason}`)
            .join("\n"),
          status: skipped.length ? "warning" : "success",
          isClosable: true,
          position: "top",
          duration: 5000,
        });
        clearSelected();
        useDashboard.getState().refetchUsers();
        queryClient.invalidateQueries({ queryKey: StatisticsQueryKey });
        queryClient.invalidateQueries({ queryKey: AlertsQueryKey });
      })
      .catch((e) => generateErrorMessage(e, toast))
      .finally(() => setBusy(false));
  };

  return (
    <Box
      position="sticky"
      bottom={{ base: "84px", md: 4 }}
      zIndex="sticky"
      px={3}
      py="10px"
      borderWidth="1px"
      borderColor="border"
      borderRadius="xl"
      bg="surface"
      boxShadow="float"
      data-testid="bulk-actions"
    >
      <Wrap align="center" spacing={2}>
        <Text fontSize="14px" fontWeight={600} mr={2}>
          {t("bulk.selected", { count: selected.length })}
        </Text>
        <Button size="sm" variant="outline" isDisabled={busy} onClick={() => run("disable")}>
          {t("bulk.disable")}
        </Button>
        <Button size="sm" variant="outline" isDisabled={busy} onClick={() => run("enable")}>
          {t("bulk.enable")}
        </Button>
        <Button size="sm" variant="outline" isDisabled={busy} onClick={() => setDialog("extend")}>
          {t("bulk.extend")}
        </Button>
        <AmountAction
          label={t("bulk.addData")}
          unit="GB"
          isDisabled={busy}
          onApply={(gb) => run("add_data", { data_limit: Math.round(gb * GB) })}
        />
        <ConfirmButton
          size="sm"
          variant="outline"
          colorScheme="orange"
          isDisabled={busy}
          message={t("bulk.confirmReset", { count: selected.length })}
          onConfirm={() => run("reset_usage")}
        >
          {t("bulk.resetUsage")}
        </ConfirmButton>
        <ConfirmButton
          size="sm"
          variant="outline"
          colorScheme="orange"
          isDisabled={busy}
          message={t("bulk.confirmRevoke", { count: selected.length })}
          onConfirm={() => run("revoke_sub")}
        >
          {t("bulk.revoke")}
        </ConfirmButton>
        <Button size="sm" variant="outline" colorScheme="red" isDisabled={busy} onClick={() => setDialog("delete")}>
          {t("delete")}
        </Button>
        <Button size="sm" variant="ghost" onClick={clearSelected}>
          {t("bulk.clear")}
        </Button>
      </Wrap>
      <ExtendDialog
        isOpen={dialog === "extend"}
        usernames={selected}
        busy={busy}
        onClose={() => setDialog(null)}
        onApply={(extra) => {
          setDialog(null);
          run(extra.expire ? "set_expire" : "extend", extra);
        }}
      />
      <DeleteDialog
        isOpen={dialog === "delete"}
        usernames={selected}
        onClose={() => setDialog(null)}
        onDelete={() => {
          setDialog(null);
          run("delete");
        }}
        onDisable={() => {
          setDialog(null);
          run("disable");
        }}
      />
    </Box>
  );
};

const AmountAction: FC<{
  label: string;
  unit: string;
  isDisabled: boolean;
  onApply: (amount: number) => void;
}> = ({ label, unit, isDisabled, onApply }) => {
  const [value, setValue] = useState("30");
  const { t } = useTranslation();
  const amount = parseFloat(value);
  return (
    <Popover placement="top">
      {({ onClose }) => (
        <>
          <PopoverTrigger>
            <Button size="sm" variant="outline" isDisabled={isDisabled}>
              {label}
            </Button>
          </PopoverTrigger>
          <Portal>
            <PopoverContent w="auto">
              <PopoverArrow />
              <PopoverBody>
                <HStack>
                  <NumberInput size="sm" min={0} maxW="90px" value={value} onChange={setValue}>
                    <NumberInputField aria-label={`${label} (${unit})`} />
                  </NumberInput>
                  <Text fontSize="sm">{unit}</Text>
                  <Button
                    size="sm"
                    colorScheme="primary"
                    isDisabled={!(amount > 0)}
                    onClick={() => {
                      onClose();
                      onApply(amount);
                    }}
                  >
                    {t("apply")}
                  </Button>
                </HStack>
              </PopoverBody>
            </PopoverContent>
          </Portal>
        </>
      )}
    </Popover>
  );
};

const ExtendDialog: FC<{
  isOpen: boolean;
  usernames: string[];
  busy: boolean;
  onClose: () => void;
  onApply: (extra: { days?: number; expire?: number; reactivate_expired: boolean }) => void;
}> = ({ isOpen, usernames, busy, onClose, onApply }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"add" | "set">("add");
  const [days, setDays] = useState("30");
  const [date, setDate] = useState(dayjs().add(30, "day").format("YYYY-MM-DD"));
  const [reactivate, setReactivate] = useState(true);
  const { data } = useQuery({
    queryKey: ["bulk-preview", usernames],
    queryFn: () => fetch<{ users: User[] }>("/users", { query: { username: usernames.slice(0, 50), limit: 50 } }),
    enabled: isOpen,
  });
  const n = Number(days);
  const target = dayjs(date).endOf("day");
  const valid = mode === "add" ? n > 0 && n <= 3650 : target.isAfter(dayjs());
  const preview = (u: User): [string, string] | null => {
    const now = dayjs();
    if (u.status === "expired" && !reactivate) return null;
    if (mode === "add") {
      if (!u.expire) return null;
      const from = dayjs.unix(u.expire);
      return [from.format("MMM D"), (from.isAfter(now) ? from : now).add(n || 0, "day").format("MMM D")];
    }
    return [u.expire ? dayjs.unix(u.expire).format("MMM D") : "∞", target.format("MMM D")];
  };
  const chip = (label: string, value: string) => (
    <Button key={label} type="button" size="xs" h="28px" px="10px" borderRadius="full" variant="outline" fontSize="12px"
      aria-pressed={days === value} bg={days === value ? "accent-soft" : "surface"} borderColor={days === value ? "primary.200" : "border-strong"}
      color={days === value ? "accent-text" : "text-2"} onClick={() => setDays(value)}>
      {label}
    </Button>
  );
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalOverlay />
      <ModalContent mx={3}>
        <ModalHeader pr={12}>
          <Text fontSize="17px" fontWeight={700}>{t("bulk.extendTitle", { count: usernames.length })}</Text>
          <Text fontSize="12px" fontWeight={400} color="text-muted">{mode === "add" ? t("bulk.extendAddHelp") : t("bulk.extendSetHelp")}</Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody display="flex" flexDirection="column" gap={4}>
          <Flex bg="chakra-subtle-bg" borderRadius="9px" p="3px" gap="2px" role="radiogroup">
            {(["add", "set"] as const).map((m) => (
              <Button key={m} role="radio" aria-checked={mode === m} flex={1} h="32px" variant="unstyled" fontSize="13px" fontWeight={500} borderRadius="7px"
                bg={mode === m ? "surface" : "transparent"} boxShadow={mode === m ? "0 1px 2px rgba(16,24,40,.12)" : "none"} onClick={() => setMode(m)}>
                {m === "add" ? t("bulk.addTime") : t("bulk.setDate")}
              </Button>
            ))}
          </Flex>
          {mode === "add" ? (
            <Box>
              <Flex wrap="wrap" gap="6px">
                {chip(t("userDialog.plusDays", { count: 7 }), "7")}
                {chip(t("userDialog.plusDays", { count: 30 }), "30")}
                {chip(t("userDialog.plusDays", { count: 90 }), "90")}
                {chip(t("userDialog.plusYear"), "365")}
              </Flex>
              <HStack mt={3} spacing={2}>
                <NumberInput size="sm" min={1} max={3650} maxW="110px" value={days} onChange={setDays}>
                  <NumberInputField aria-label={t("bulk.extend")} />
                </NumberInput>
                <Text fontSize="13px" color="text-muted">{t("userDialog.days")}</Text>
              </HStack>
            </Box>
          ) : (
            <Input type="date" maxW="200px" value={date} min={dayjs().add(1, "day").format("YYYY-MM-DD")} onChange={(e) => setDate(e.target.value)} />
          )}
          <Box borderWidth="1px" borderColor="border" borderRadius="10px" px={3} py={1} maxH="220px" overflowY="auto">
            {(data?.users || []).map((u) => {
              const p = preview(u);
              return (
                <Flex key={u.username} align="center" gap={2} py="7px" borderBottomWidth="1px" borderColor="border-subtle" _last={{ borderBottomWidth: 0 }} fontSize="13px">
                  <Text fontWeight={600} flex={1} noOfLines={1}>{u.username}</Text>
                  {p ? (
                    <>
                      <Text color="text-muted">{p[0]}</Text>
                      <Text color="text-muted">→</Text>
                      <Text fontWeight={600}>{p[1]}</Text>
                    </>
                  ) : (
                    <Text color="text-muted">{u.status === "expired" ? t("bulk.skipExpired") : t("bulk.skipNoExpiry")}</Text>
                  )}
                </Flex>
              );
            })}
            {usernames.length > 50 && <Help py={2}>{t("bulk.andMore", { count: usernames.length - 50 })}</Help>}
          </Box>
          <Checkbox isChecked={reactivate} onChange={(e) => setReactivate(e.target.checked)} alignItems="flex-start">
            <Text fontWeight={500} fontSize="14px">{t("bulk.reactivate")}</Text>
            <Help>{t("bulk.reactivateHelp")}</Help>
          </Checkbox>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button colorScheme="primary" isDisabled={!valid || busy}
            onClick={() => onApply(mode === "add" ? { days: n, reactivate_expired: reactivate } : { expire: target.unix(), reactivate_expired: reactivate })}>
            {t("bulk.extendTitle", { count: usernames.length })}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const DeleteDialog: FC<{ isOpen: boolean; usernames: string[]; onClose: () => void; onDelete: () => void; onDisable: () => void }> = ({
  isOpen,
  usernames,
  onClose,
  onDelete,
  onDisable,
}) => {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const phrase = `delete ${usernames.length}`;
  const names = usernames.slice(0, 3).join(", ") + (usernames.length > 3 ? " " + t("bulk.andMore", { count: usernames.length - 3 }) : "");
  return (
    <Modal isOpen={isOpen} onClose={() => { setTyped(""); onClose(); }} size="md" isCentered>
      <ModalOverlay />
      <ModalContent mx={3}>
        <ModalBody pt={6} display="flex" flexDirection="column" gap={4}>
          <HStack align="flex-start" spacing={4}>
            <Icon color="red"><TrashIcon /></Icon>
            <Box>
              <Text fontSize="17px" fontWeight={700}>{t("bulk.deleteTitle", { count: usernames.length })}</Text>
              <Text fontSize="13px" color="text-muted" mt={1}>
                <Text as="strong" color="text">{names}</Text> {t("bulk.deleteBody")}
              </Text>
            </Box>
          </HStack>
          <FormControl>
            <FormLabel>
              {t("bulk.typeToConfirm.0")}{" "}
              <Text as="span" fontFamily="mono" bg="chakra-subtle-bg" px="5px" borderRadius="4px">{phrase}</Text>{" "}
              {t("bulk.typeToConfirm.1")}
            </FormLabel>
            <Input fontFamily="mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </FormControl>
          <Help>
            {t("bulk.keepHistory")}{" "}
            <Button variant="link" size="xs" color="link" onClick={() => { setTyped(""); onDisable(); }}>
              {t("bulk.disableInstead")}
            </Button>
          </Help>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => { setTyped(""); onClose(); }}>{t("cancel")}</Button>
          <Button colorScheme="red" isDisabled={typed.trim().toLowerCase() !== phrase} onClick={() => { setTyped(""); onDelete(); }}>
            {t("bulk.deleteTitle", { count: usernames.length }).replace("?", "")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
