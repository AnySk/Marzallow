import {
  Button,
  FormControl,
  FormLabel,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Spinner,
  Tag,
  Text,
  useToast,
  Wrap,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { StatisticsQueryKey } from "components/Statistics";
import { useDashboard } from "contexts/DashboardContext";
import { AlertsQueryKey, useFeatures } from "contexts/FeaturesContext";
import dayjs from "dayjs";
import { FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { queryClient } from "utils/react-query";
import { generateErrorMessage, generateSuccessMessage } from "utils/toastHandler";
import { ConfirmButton } from "./ConfirmButton";

/** Delete users that expired (or hit their limit) more than N days ago. */
export const ExpiredCleanupModal: FC = () => {
  const { openModal, setModal } = useFeatures();
  const isOpen = openModal === "cleanup";
  const { t } = useTranslation();
  const toast = useToast();
  const [olderThan, setOlderThan] = useState("30");
  const [deleting, setDeleting] = useState(false);
  const expiredBefore = dayjs().utc().subtract(parseInt(olderThan), "day").format("YYYY-MM-DDTHH:mm:ss");

  const { data: usernames, isFetching, refetch } = useQuery({
    queryKey: ["expired-users", olderThan],
    queryFn: () => fetch<string[]>("/users/expired", { query: { expired_before: expiredBefore } }),
    enabled: isOpen,
  });

  const onDelete = () => {
    setDeleting(true);
    fetch<string[]>("/users/expired", { method: "DELETE", query: { expired_before: expiredBefore } })
      .then((deleted) => {
        generateSuccessMessage(t("cleanup.deleted", { count: deleted.length }), toast);
        useDashboard.getState().refetchUsers();
        queryClient.invalidateQueries({ queryKey: StatisticsQueryKey });
        queryClient.invalidateQueries({ queryKey: AlertsQueryKey });
        refetch();
      })
      .catch((e) => generateErrorMessage(e, toast))
      .finally(() => setDeleting(false));
  };

  return (
    <Modal isOpen={isOpen} onClose={() => setModal(null)} size="lg" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent mx="3">
        <ModalHeader>{t("cleanup.title")}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" color="text-muted" mb={3}>
            {t("cleanup.description")}
          </Text>
          <FormControl mb={4}>
            <FormLabel>{t("cleanup.olderThan")}</FormLabel>
            <Select size="sm" value={olderThan} onChange={(e) => setOlderThan(e.target.value)}>
              {["0", "7", "30", "90", "180"].map((d) => (
                <option key={d} value={d}>
                  {d === "0" ? t("cleanup.any") : t("templates.days", { count: parseInt(d) })}
                </option>
              ))}
            </Select>
          </FormControl>
          {isFetching ? (
            <Spinner />
          ) : (
            <>
              <Text fontSize="sm" fontWeight="medium" mb={2} data-testid="cleanup-count">
                {t("cleanup.matching", { count: usernames?.length || 0 })}
              </Text>
              <Wrap spacing={1} maxH="200px" overflowY="auto">
                {(usernames || []).slice(0, 200).map((u) => (
                  <Tag key={u} size="sm">
                    {u}
                  </Tag>
                ))}
              </Wrap>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <HStack>
            <Button size="sm" variant="ghost" onClick={() => setModal(null)}>
              {t("cancel")}
            </Button>
            <ConfirmButton
              size="sm"
              isDisabled={!usernames?.length || deleting}
              isLoading={deleting}
              message={t("cleanup.confirm", { count: usernames?.length || 0 })}
              onConfirm={onDelete}
            >
              {t("cleanup.delete", { count: usernames?.length || 0 })}
            </ConfirmButton>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
