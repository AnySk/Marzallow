import {
  Box,
  Button,
  ButtonGroup,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Progress,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorMode,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useFeatures } from "contexts/FeaturesContext";
import dayjs from "dayjs";
import { FC, useState } from "react";
import ReactApexChart from "react-apexcharts";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { User } from "types/User";
import { formatBytes } from "utils/formatByte";

type DailyUsage = { date: string; used_traffic: number };
const RANGES = [7, 30, 90];

/** Traffic per day and the heaviest users. */
export const AnalyticsModal: FC = () => {
  const { openModal, setModal } = useFeatures();
  const isOpen = openModal === "analytics";
  const { t } = useTranslation();
  const { colorMode } = useColorMode();
  const [days, setDays] = useState(30);

  const { data: daily, isLoading } = useQuery({
    queryKey: ["daily-usage", days],
    queryFn: () =>
      fetch<DailyUsage[]>("/users/usage/daily", {
        query: { start: dayjs().utc().subtract(days, "day").format("YYYY-MM-DDTHH:mm:ss") },
      }),
    enabled: isOpen,
  });
  const { data: top } = useQuery({
    queryKey: ["top-users"],
    queryFn: () => fetch<{ users: User[] }>("/users", { query: { sort: "-used_traffic", limit: 10 } }),
    enabled: isOpen,
  });

  // fill days without traffic so the chart has a continuous axis
  const byDate = new Map((daily || []).map((d) => [d.date, d.used_traffic]));
  const dates = Array.from({ length: days }, (_, i) =>
    dayjs().utc().subtract(days - 1 - i, "day").format("YYYY-MM-DD")
  );
  const values = dates.map((d) => byDate.get(d) || 0);
  const total = values.reduce((a, b) => a + b, 0);
  const maxTop = Math.max(1, ...(top?.users || []).map((u) => u.used_traffic));

  return (
    <Modal isOpen={isOpen} onClose={() => setModal(null)} size="3xl" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      <ModalContent mx="3">
        <ModalHeader>{t("analytics.title")}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <HStack justifyContent="space-between" mb={2} flexWrap="wrap" gap={2}>
            <Stat size="sm">
              <StatLabel>{t("analytics.total", { days })}</StatLabel>
              <StatNumber>{formatBytes(total)}</StatNumber>
            </Stat>
            <ButtonGroup size="xs" isAttached variant="outline">
              {RANGES.map((range) => (
                <Button key={range} isActive={days === range} onClick={() => setDays(range)}>
                  {t("analytics.lastDays", { count: range })}
                </Button>
              ))}
            </ButtonGroup>
          </HStack>
          <Box minH="260px" data-testid="daily-usage-chart">
            {isLoading ? (
              <Spinner />
            ) : (
              <ReactApexChart
                type="bar"
                height={260}
                series={[{ name: t("analytics.traffic"), data: values }]}
                options={{
                  chart: { toolbar: { show: false }, background: "transparent" },
                  theme: { mode: colorMode },
                  dataLabels: { enabled: false },
                  xaxis: { categories: dates.map((d) => dayjs(d).format("MMM D")), tickAmount: 10 },
                  yaxis: { labels: { formatter: (v: number) => String(formatBytes(v, 1)) } },
                  tooltip: { y: { formatter: (v: number) => String(formatBytes(v)) } },
                  colors: ["#3B81F6"],
                }}
              />
            )}
          </Box>
          <Text fontWeight="semibold" mt={4} mb={2}>
            {t("analytics.topUsers")}
          </Text>
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>{t("username")}</Th>
                <Th w="50%">{t("analytics.usedTraffic")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {(top?.users || []).map((user) => (
                <Tr key={user.username}>
                  <Td>{user.username}</Td>
                  <Td>
                    <HStack>
                      <Progress value={(user.used_traffic / maxTop) * 100} size="sm" flex={1} borderRadius="sm" />
                      <Text fontSize="xs" minW="70px" textAlign="right">
                        {formatBytes(user.used_traffic)}
                      </Text>
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};
