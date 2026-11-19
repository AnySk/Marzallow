import {
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormLabel,
  HStack,
  Input,
  NumberInput,
  NumberInputField,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useDashboard } from "contexts/DashboardContext";
import { AdminsQueryKey } from "contexts/FeaturesContext";
import dayjs from "dayjs";
import useGetUser from "hooks/useGetUser";
import { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { AdminInfo } from "types/Management";
import { User } from "types/User";
import { formatBytes } from "utils/formatByte";
import { generateErrorMessage, generateSuccessMessage } from "utils/toastHandler";
import { ConfirmButton } from "./ConfirmButton";

const GB = 1024 ** 3;

type ResetLog = { used_traffic_at_reset: number; reset_at: string };

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Box>
    <Text fontWeight="semibold" fontSize="sm" mb={2}>
      {title}
    </Text>
    {children}
  </Box>
);

/** Extra details and actions for an existing user, shown in the edit dialog. */
export const UserExtras: FC<{ user: User }> = ({ user }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { userData } = useGetUser();
  const isSudo = userData.is_sudo;
  const { onEditingUser, refetchUsers } = useDashboard();

  const reloadUser = () =>
    fetch<User>(`/user/${user.username}`).then((fresh) => {
      onEditingUser(fresh);
      refetchUsers();
    });

  // --- client info -------------------------------------------------------------
  const lastUpdate = user.sub_updated_at ? dayjs.utc(user.sub_updated_at) : null;

  // --- owner -----------------------------------------------------------------------
  const { data: admins } = useQuery({
    queryKey: AdminsQueryKey,
    queryFn: () => fetch<AdminInfo[]>("/admins"),
    enabled: isSudo,
  });
  const [owner, setOwner] = useState(user.admin?.username || "");
  useEffect(() => setOwner(user.admin?.username || ""), [user.admin?.username]);

  // --- next plan ---------------------------------------------------------------------
  const [plan, setPlan] = useState({
    data_limit_gb: user.next_plan?.data_limit ? String(+(user.next_plan.data_limit / GB).toFixed(2)) : "",
    expire_date: user.next_plan?.expire ? dayjs.unix(user.next_plan.expire).format("YYYY-MM-DD") : "",
    add_remaining_traffic: user.next_plan?.add_remaining_traffic ?? false,
    fire_on_either: user.next_plan?.fire_on_either ?? true,
  });
  const savePlan = () =>
    fetch(`/user/${user.username}`, {
      method: "PUT",
      body: {
        next_plan: {
          data_limit: plan.data_limit_gb ? Math.round(parseFloat(plan.data_limit_gb) * GB) : 0,
          expire: plan.expire_date ? dayjs(plan.expire_date).endOf("day").unix() : 0,
          add_remaining_traffic: plan.add_remaining_traffic,
          fire_on_either: plan.fire_on_either,
        },
      },
    })
      .then(() => {
        generateSuccessMessage(t("nextPlan.saved"), toast);
        reloadUser();
      })
      .catch((e) => generateErrorMessage(e, toast));

  // --- reset history -------------------------------------------------------------------
  const { data: logs } = useQuery({
    queryKey: ["reset-logs", user.username],
    queryFn: () => fetch<ResetLog[]>(`/user/${user.username}/reset-logs`),
  });

  return (
    <Stack spacing={5} divider={<Divider />} data-testid="user-extras">
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
        <Section title={t("userExtras.client")}>
          <Text fontSize="sm">
            {lastUpdate
              ? t("userExtras.lastUpdate", { time: lastUpdate.fromNow() })
              : t("userExtras.neverUpdated")}
          </Text>
          {user.sub_last_user_agent && (
            <Text fontSize="xs" color="text-muted" wordBreak="break-all" mt={1}>
              {user.sub_last_user_agent}
            </Text>
          )}
        </Section>

        {isSudo && (
          <Section title={t("userExtras.owner")}>
            <HStack>
              <Select size="sm" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label={t("userExtras.owner")}>
                {!user.admin && <option value="">{t("userExtras.noOwner")}</option>}
                {admins?.map((admin) => (
                  <option key={admin.username} value={admin.username}>
                    {admin.username}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                isDisabled={!owner || owner === user.admin?.username}
                onClick={() =>
                  fetch(`/user/${user.username}/set-owner`, { method: "PUT", query: { admin_username: owner } })
                    .then(() => {
                      generateSuccessMessage(t("userExtras.ownerChanged"), toast);
                      reloadUser();
                    })
                    .catch((e) => generateErrorMessage(e, toast))
                }
              >
                {t("apply")}
              </Button>
            </HStack>
          </Section>
        )}
      </SimpleGrid>

      <Section title={t("nextPlan.title")}>
        <Text fontSize="xs" color="text-muted" mb={2}>
          {t("nextPlan.description")}
        </Text>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
          <FormControl>
            <FormLabel fontSize="sm">{t("userDialog.dataLimit")} (GB)</FormLabel>
            <NumberInput size="sm" min={0} value={plan.data_limit_gb} onChange={(v) => setPlan({ ...plan, data_limit_gb: v })}>
              <NumberInputField name="next-plan-data-limit" placeholder={t("nextPlan.unlimited")} />
            </NumberInput>
          </FormControl>
          <FormControl>
            <FormLabel fontSize="sm">{t("userDialog.expiryDate")}</FormLabel>
            <Input size="sm" type="date" value={plan.expire_date} onChange={(e) => setPlan({ ...plan, expire_date: e.target.value })} />
          </FormControl>
        </SimpleGrid>
        <Stack direction={{ base: "column", md: "row" }} mt={2} spacing={4}>
          <Checkbox size="sm" isChecked={plan.add_remaining_traffic}
            onChange={(e) => setPlan({ ...plan, add_remaining_traffic: e.target.checked })}>
            {t("nextPlan.addRemaining")}
          </Checkbox>
          <Checkbox size="sm" isChecked={plan.fire_on_either}
            onChange={(e) => setPlan({ ...plan, fire_on_either: e.target.checked })}>
            {t("nextPlan.fireOnEither")}
          </Checkbox>
        </Stack>
        <HStack mt={3}>
          <Button size="sm" onClick={savePlan}>
            {t("nextPlan.save")}
          </Button>
          {user.next_plan && (
            <ConfirmButton
              size="sm"
              variant="outline"
              colorScheme="primary"
              message={t("nextPlan.confirmActivate")}
              onConfirm={() =>
                fetch(`/user/${user.username}/active-next`, { method: "POST" })
                  .then(() => {
                    generateSuccessMessage(t("nextPlan.activated"), toast);
                    reloadUser();
                  })
                  .catch((e) => generateErrorMessage(e, toast))
              }
            >
              {t("nextPlan.activate")}
            </ConfirmButton>
          )}
        </HStack>
      </Section>

      <Section title={t("userExtras.resetHistory")}>
        {!logs?.length ? (
          <Text fontSize="sm" color="text-muted">
            {t("userExtras.noResets")}
          </Text>
        ) : (
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>{t("userExtras.resetAt")}</Th>
                <Th isNumeric>{t("userExtras.usedBeforeReset")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {logs.slice(0, 10).map((log) => (
                <Tr key={log.reset_at}>
                  <Td>{dayjs.utc(log.reset_at).local().format("YYYY-MM-DD HH:mm")}</Td>
                  <Td isNumeric>{formatBytes(log.used_traffic_at_reset)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Section>
    </Stack>
  );
};
