import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  ButtonProps,
  chakra,
  Checkbox,
  Collapse,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Switch,
  Text,
  Tooltip,
  useToast,
  VStack,
} from "@chakra-ui/react";
import {
  EyeIcon,
  EyeSlashIcon,
  PlusIcon as HeroIconPlusIcon,
  SquaresPlusIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FetchNodesQueryKey,
  getNodeDefaultValues,
  NodeSchema,
  NodeType,
  useNodes,
  useNodesQuery,
} from "contexts/NodesContext";
import { FC, ReactNode, useEffect, useState } from "react";
import CopyToClipboard from "react-copy-to-clipboard";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { formatBytes } from "utils/formatByte";
import { Help, PageHeader, Panel, Pill } from "./ui";
import { Controller, Resolver, useForm, UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  UseMutateFunction,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import "slick-carousel/slick/slick-theme.css";
import "slick-carousel/slick/slick.css";
import { Status } from "types/User";
import {
  generateErrorMessage,
  generateSuccessMessage,
} from "utils/toastHandler";
import { useDashboard } from "../contexts/DashboardContext";
import { DeleteNodeModal } from "./DeleteNodeModal";
import { DeleteIcon } from "./DeleteUserModal";
import { ReloadIcon } from "./Filters";
import { Icon } from "./Icon";
import { NodeModalStatusBadge } from "./NodeModalStatusBadge";

import { fetch } from "service/http";
import { Input } from "./Input";

const CustomInput = chakra(Input, {
  baseStyle: {
    bg: "surface",
  },
});

const ModalIcon = chakra(SquaresPlusIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

const PlusIcon = chakra(HeroIconPlusIcon, {
  baseStyle: {
    w: 5,
    h: 5,
    strokeWidth: 2,
  },
});

type NodeFormType = FC<{
  form: UseFormReturn<NodeType>;
  mutate: UseMutateFunction<unknown, unknown, any>;
  isLoading: boolean;
  submitBtnText: string;
  btnProps?: Partial<ButtonProps>;
  btnLeftAdornment?: ReactNode;
  addAsHost?: boolean;
}>;

const NodeForm: NodeFormType = ({
  form,
  mutate,
  isLoading,
  submitBtnText,
  btnProps = {},
  btnLeftAdornment,
  addAsHost = false,
}) => {
  const { t } = useTranslation();
  const [showCertificate, setShowCertificate] = useState(false);
  const { data: nodeSettings, isLoading: nodeSettingsLoading } = useQuery({
    queryKey: ["node-settings"],
    queryFn: () =>
      fetch<{
        min_node_version: string;
        certificate: string;
      }>("/node/settings"),
  });
  function selectText(node: HTMLElement) {
    // @ts-ignore
    if (document.body.createTextRange) {
      // @ts-ignore
      const range = document.body.createTextRange();
      range.moveToElementText(node);
      range.select();
    } else if (window.getSelection) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      selection!.removeAllRanges();
      selection!.addRange(range);
    } else {
      console.warn("Could not select text in node: Unsupported browser.");
    }
  }

  return (
    <form onSubmit={form.handleSubmit((v) => mutate(v))}>
      <VStack>
        {nodeSettings && nodeSettings.certificate && (
          <Alert status="info" alignItems="start">
            <AlertDescription
              display="flex"
              flexDirection="column"
              overflow="hidden"
            >
              <span>{t("nodes.connection-hint")}</span>
              <HStack justify="end" py={2}>
                <Button
                  as="a"
                  colorScheme="primary"
                  size="xs"
                  download="ssl_client_cert.pem"
                  href={URL.createObjectURL(
                    new Blob([nodeSettings.certificate], { type: "text/plain" })
                  )}
                >
                  {t("nodes.download-certificate")}
                </Button>
                <Tooltip
                  placement="top"
                  label={t(
                    !showCertificate
                      ? "nodes.show-certificate"
                      : "nodes.hide-certificate"
                  )}
                >
                  <IconButton
                    aria-label={t(
                      !showCertificate
                        ? "nodes.show-certificate"
                        : "nodes.hide-certificate"
                    )}
                    onClick={setShowCertificate.bind(null, !showCertificate)}
                    colorScheme="whiteAlpha"
                    color="primary"
                    size="xs"
                  >
                    {!showCertificate ? (
                      <EyeIcon width="15px" />
                    ) : (
                      <EyeSlashIcon width="15px" />
                    )}
                  </IconButton>
                </Tooltip>
              </HStack>
              <Collapse in={showCertificate} animateOpacity>
                <Text
                  bg="rgba(255,255,255,.5)"
                  _dark={{
                    bg: "rgba(255,255,255,.2)",
                  }}
                  rounded="md"
                  p="2"
                  lineHeight="1.2"
                  fontSize="10px"
                  fontFamily="Courier"
                  whiteSpace="pre"
                  overflow="auto"
                  onClick={(e) => {
                    selectText(e.target as HTMLElement);
                  }}
                >
                  {nodeSettings.certificate}
                </Text>
              </Collapse>
            </AlertDescription>
          </Alert>
        )}

        <HStack w="full">
          <FormControl>
            <CustomInput
              label={t("nodes.nodeName")}
              size="sm"
              placeholder="node-2"
              {...form.register("name")}
              error={form.formState?.errors?.name?.message}
            />
          </FormControl>
          <HStack px={1}>
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => {
                return (
                  <Tooltip
                    key={field.value}
                    placement="top"
                    label={
                      `${t("usersTable.status")}: ` +
                      (field.value !== "disabled" ? t("active") : t("disabled"))
                    }
                    textTransform="capitalize"
                  >
                    <Box mt="6">
                      <Switch
                        colorScheme="primary"
                        isChecked={field.value !== "disabled"}
                        onChange={(e) => {
                          if (e.target.checked) {
                            field.onChange("connecting");
                          } else {
                            field.onChange("disabled");
                          }
                        }}
                      />
                    </Box>
                  </Tooltip>
                );
              }}
            />
          </HStack>
        </HStack>
        <HStack alignItems="flex-start" w="100%">
          <Box w="100%">
            <CustomInput
              label={t("nodes.nodeAddress")}
              size="sm"
              placeholder="51.20.12.13"
              {...form.register("address")}
              error={form.formState?.errors?.address?.message}
            />
          </Box>
        </HStack>
        <HStack alignItems="flex-start" w="100%">
        <Box>
            <CustomInput
              label={t("nodes.nodePort")}
              size="sm"
              placeholder="62050"
              {...form.register("port")}
              error={form.formState?.errors?.port?.message}
            />
          </Box>
          <Box>
            <CustomInput
              label={t("nodes.nodeAPIPort")}
              size="sm"
              placeholder="62051"
              {...form.register("api_port")}
              error={form.formState?.errors?.api_port?.message}
            />
          </Box>
          <Box>
            <CustomInput
              label={t("nodes.usageCoefficient")}
              size="sm"
              placeholder="1"
              {...form.register("usage_coefficient")}
              error={form.formState?.errors?.usage_coefficient?.message}
            />
          </Box>
        </HStack>
        {addAsHost && (
          <FormControl py={1}>
            <Checkbox {...form.register("add_as_new_host")}>
              <FormLabel m={0}>{t("nodes.addHostForEveryInbound")}</FormLabel>
            </Checkbox>
          </FormControl>
        )}
        <HStack w="full">
          {btnLeftAdornment}
          <Button
            flexGrow={1}
            type="submit"
            colorScheme="primary"
            size="sm"
            px={5}
            w="full"
            isLoading={isLoading}
            {...btnProps}
          >
            {submitBtnText}
          </Button>
        </HStack>
      </VStack>
    </form>
  );
};

type NodeUsage = { node_id: number | null; node_name: string; uplink: number; downlink: number };

const NODE_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  connected: "success",
  connecting: "warning",
  error: "danger",
  disabled: "neutral",
};

const Stat: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <VStack align="flex-start" spacing={0} minW="110px">
    <Text fontSize="12px" color="text-muted">
      {label}
    </Text>
    <Text fontSize="14px" fontWeight={500}>
      {children}
    </Text>
  </VStack>
);

const NodeCard: FC<{ node: NodeType; traffic?: number; onEdit: () => void }> = ({ node, traffic, onEdit }) => {
  const { reconnectNode, setDeletingNode } = useNodes();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isPending: isReconnecting, mutate: reconnect } = useMutation({
    mutationFn: reconnectNode.bind(null, node),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FetchNodesQueryKey }),
  });
  const status: string = isReconnecting ? "connecting" : node.status || "error";
  const error = status === "error";
  return (
    <Panel p={4} display="flex" flexDirection="column" gap={3} borderColor={error ? "danger-border" : "border"}>
      <Flex justify="space-between" align="flex-start" gap={3} wrap="wrap">
        <VStack align="flex-start" spacing={0} minW={0}>
          <Text fontWeight={650} fontSize="15px">
            {node.name}
          </Text>
          <Text fontFamily="mono" fontSize="12px" color="text-muted">
            {node.address}:{node.port}
          </Text>
        </VStack>
        <Pill tone={NODE_TONE[status] || "neutral"}>{t(`nodeStatus.${status}`, { defaultValue: status })}</Pill>
      </Flex>
      {error && (
        <Box borderRadius="md" bg="danger-bg" color="danger-fg" px={3} py={2} fontSize="13px">
          <Text fontWeight={600}>{node.message || t("nodes.unreachable")}</Text>
          <Text>{t("nodes.errorHelp")}</Text>
        </Box>
      )}
      <Flex gap={5} wrap="wrap">
        <Stat label={t("nodes.xray")}>{node.xray_version ? `Xray ${node.xray_version}` : "—"}</Stat>
        <Stat label={t("analytics.traffic30")}>{traffic !== undefined ? formatBytes(traffic) : "—"}</Stat>
        <Stat label={t("nodes.usageCoefficient")}>× {node.usage_coefficient ?? 1}</Stat>
      </Flex>
      <HStack spacing={2} mt="auto" flexWrap="wrap">
        {error || status === "disabled" ? (
          <Button size="sm" colorScheme="primary" isLoading={isReconnecting} onClick={() => reconnect()}>
            {t("nodes.retryNow")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" isLoading={isReconnecting} onClick={() => reconnect()}>
            {t("nodes.reconnect")}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onEdit}>
          {t("admins.edit")}
        </Button>
        {error && (
          <Button size="sm" variant="ghost" onClick={() => navigate(`/core?node=${node.id}`)}>
            {t("nodes.viewLogs")}
          </Button>
        )}
        <IconButton size="sm" variant="ghost" colorScheme="red" aria-label={t("delete")} icon={<DeleteIcon />} ml="auto"
          onClick={() => setDeletingNode(node)} />
      </HStack>
    </Panel>
  );
};

const NodeDrawer: FC<{ node: NodeType | "new" | null; onClose: () => void }> = ({ node, onClose }) => {
  const toast = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { addNode, updateNode } = useNodes();
  const isNew = node === "new";
  const form = useForm<NodeType>({
    resolver: zodResolver(NodeSchema) as Resolver<NodeType>,
    defaultValues: isNew || !node ? { ...getNodeDefaultValues(), add_as_new_host: false } : node,
  });
  useEffect(() => {
    form.reset(isNew || !node ? { ...getNodeDefaultValues(), add_as_new_host: false } : node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);
  const { isPending, mutate } = useMutation({
    mutationFn: isNew ? addNode : updateNode,
    onSuccess: () => {
      generateSuccessMessage(isNew ? t("nodes.addNodeSuccess", { name: form.getValues("name") }) : t("nodes.updated"), toast);
      queryClient.invalidateQueries({ queryKey: FetchNodesQueryKey });
      onClose();
    },
    onError: (e) => generateErrorMessage(e, toast, form),
  });
  return (
    <Drawer isOpen={!!node} onClose={onClose} placement="right" size="md">
      <DrawerOverlay />
      <DrawerContent maxW="480px">
        <DrawerHeader borderBottomWidth="1px" borderColor="border">
          <Text fontSize="18px" fontWeight={700}>
            {isNew ? t("nodes.addNode") : (node as NodeType)?.name}
          </Text>
        </DrawerHeader>
        <DrawerCloseButton top={4} />
        <DrawerBody py={5}>
          {node && (
            <NodeForm form={form} mutate={mutate} isLoading={isPending} submitBtnText={isNew ? t("nodes.addNode") : t("nodes.editNode")}
              btnProps={{ variant: "solid", colorScheme: "primary" }} addAsHost={isNew} />
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

const AddNodeGuide: FC<{ onAdd: () => void }> = ({ onAdd }) => {
  const { t } = useTranslation();
  const { data: settings } = useQuery({
    queryKey: ["node-settings"],
    queryFn: () => fetch<{ min_node_version: string; certificate: string }>("/node/settings"),
  });
  const compose = "curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/AnySk/Marzallow/master/docker-compose.node.yml";
  const Step: FC<{ n: number; title: string; children: ReactNode }> = ({ n, title, children }) => (
    <Flex gap={3}>
      <Flex w="24px" h="24px" borderRadius="full" bg="accent-soft" color="accent-text" align="center" justify="center" fontSize="12px" fontWeight={700} flex="none">
        {n}
      </Flex>
      <Box flex={1} minW={0}>
        <Text fontWeight={600} mb={1}>
          {title}
        </Text>
        {children}
      </Box>
    </Flex>
  );
  return (
    <Panel p={5}>
      <Text fontWeight={650} fontSize="15px">
        {t("nodes.guideTitle")}
      </Text>
      <Help mb={4}>{t("nodes.guideHelp")}</Help>
      <VStack align="stretch" spacing={4}>
        <Step n={1} title={t("nodes.step1")}>
          <HStack bg="surface-subtle" borderWidth="1px" borderColor="border" borderRadius="md" px={3} py={2} fontFamily="mono" fontSize="12px">
            <Text flex={1} wordBreak="break-all">{compose}</Text>
            <CopyToClipboard text={compose}>
              <Button size="xs" variant="outline">{t("subTpl.copy")}</Button>
            </CopyToClipboard>
          </HStack>
          <Help mt={1}>{t("nodes.step1Help")}</Help>
        </Step>
        <Step n={2} title={t("nodes.step2")}>
          <HStack spacing={2}>
            <Button size="sm" variant="outline" as="a" download="ssl_client_cert.pem" isDisabled={!settings?.certificate}
              href={settings?.certificate ? URL.createObjectURL(new Blob([settings.certificate], { type: "text/plain" })) : undefined}>
              {t("nodes.download-certificate")}
            </Button>
            {settings?.certificate && (
              <CopyToClipboard text={settings.certificate}>
                <Button size="sm" variant="ghost">{t("nodes.copyCertificate")}</Button>
              </CopyToClipboard>
            )}
          </HStack>
          <Help mt={1}>{t("nodes.step2Help")}</Help>
        </Step>
        <Step n={3} title={t("nodes.step3")}>
          <Button size="sm" colorScheme="primary" onClick={onAdd}>
            {t("nodes.addNode")}
          </Button>
          <Help mt={1}>{t("nodes.step3Help")}</Help>
        </Step>
      </VStack>
    </Panel>
  );
};

export const NodesDialog: FC = () => {
  const { t } = useTranslation();
  const { data: nodes, isLoading } = useNodesQuery();
  const [editing, setEditing] = useState<NodeType | "new" | null>(null);
  const since = dayjs().utc().subtract(30, "day").format("YYYY-MM-DDTHH:mm:ss");
  const { data: usage } = useQuery({
    queryKey: ["nodes-usage-30d"],
    queryFn: () => fetch<{ usages: NodeUsage[] }>("/nodes/usage", { query: { start: since } }),
  });
  const { data: core } = useQuery({ queryKey: ["core-status"], queryFn: () => fetch<{ version: string; started: boolean }>("/core") });
  const traffic = new Map((usage?.usages || []).map((u) => [u.node_id, u.uplink + u.downlink]));

  return (
    <>
      <PageHeader
        title={t("nav.nodes")}
        subtitle={t("nodes.subtitle")}
        actions={
          <Button colorScheme="primary" leftIcon={<PlusIcon w={4} h={4} />} onClick={() => setEditing("new")}>
            {t("nodes.addNode")}
          </Button>
        }
      />
      <SimpleGrid minChildWidth="300px" spacing={4}>
        <Panel p={4} display="flex" flexDirection="column" gap={3} bg="surface-subtle">
          <Flex justify="space-between" align="flex-start" gap={3}>
            <VStack align="flex-start" spacing={0}>
              <Text fontWeight={650} fontSize="15px">{t("nodes.panelServer")}</Text>
              <Help>{t("nodes.builtinCore")}</Help>
            </VStack>
            <Pill tone={core?.started ? "success" : "danger"}>{core?.started ? t("nodes.running") : t("nodes.stopped")}</Pill>
          </Flex>
          <Flex gap={5} wrap="wrap">
            <Stat label={t("nodes.xray")}>{core?.version ? `Xray ${core.version}` : "—"}</Stat>
            <Stat label={t("analytics.traffic30")}>{traffic.has(null) ? formatBytes(traffic.get(null) || 0) : "—"}</Stat>
            <Stat label={t("nodes.usageCoefficient")}>× 1.0</Stat>
          </Flex>
        </Panel>
        {isLoading && <Panel p={4}><Help>{t("loading")}</Help></Panel>}
        {nodes?.map((node) => (
          <NodeCard key={node.id ?? node.name} node={node} traffic={traffic.get(node.id ?? -1)} onEdit={() => setEditing(node)} />
        ))}
      </SimpleGrid>
      {!isLoading && <AddNodeGuide onAdd={() => setEditing("new")} />}
      <NodeDrawer node={editing} onClose={() => setEditing(null)} />
      <DeleteNodeModal deleteCallback={() => setEditing(null)} />
    </>
  );
};

export default NodesDialog;
