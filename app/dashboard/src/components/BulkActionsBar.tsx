import {
  Box,
  Button,
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

  if (!selected.length) return null;

  const run = (action: BulkAction, extra: { days?: number; data_limit?: number } = {}) => {
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
        <AmountAction
          label={t("bulk.extend")}
          unit={t("userDialog.days")}
          isDisabled={busy}
          onApply={(days) => run("extend", { days })}
        />
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
        <ConfirmButton
          size="sm"
          isDisabled={busy}
          message={t("bulk.confirmDelete", { count: selected.length })}
          onConfirm={() => run("delete")}
        >
          {t("delete")}
        </ConfirmButton>
        <Button size="sm" variant="ghost" onClick={clearSelected}>
          {t("bulk.clear")}
        </Button>
      </Wrap>
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
