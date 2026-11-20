import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  Button,
  Select as ChakraSelect,
  Checkbox,
  Container,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  IconButton,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverCloseButton,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Switch,
  Text,
  Tooltip,
  VStack,
  chakra,
  useToast,
} from "@chakra-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DocumentDuplicateIcon,
  InformationCircleIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  proxyALPN,
  proxyFingerprint,
  proxyHostSecurity,
} from "constants/Proxies";
import { useHosts } from "contexts/HostsContext";
import { motion } from "framer-motion";
import { FC, useEffect, useState } from "react";
import {
  Controller,
  FormProvider,
  useFieldArray,
  Resolver,
  useForm,
  useFormContext,
} from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import "slick-carousel/slick/slick-theme.css";
import "slick-carousel/slick/slick.css";
import { z } from "zod";
import { useDashboard } from "../contexts/DashboardContext";
import { DeleteIcon } from "./DeleteUserModal";
import { Icon } from "./Icon";
import { PageHeader, Panel } from "./ui";
import { TemplateSelect } from "./TemplateSelects";
import { Input as CustomInput } from "./Input";

export const DuplicateIcon = chakra(DocumentDuplicateIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

export const UpIcon = chakra(ArrowUpIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

export const DownIcon = chakra(ArrowDownIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

const Select = chakra(ChakraSelect, {
  baseStyle: {
    bg: "surface",
  },
});

const Input = chakra(CustomInput, {
  baseStyle: {
    bg: "surface",
  },
});

const ModalIcon = chakra(LinkIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

const InfoIcon = chakra(InformationCircleIcon, {
  baseStyle: {
    w: 4,
    h: 4,
    color: "text-muted",
    cursor: "pointer",
  },
});

const hostsSchema = z.record(
  z.string().min(1),
  z.array(
    z.object({
      remark: z.string().min(1, "Remark is required"),
      address: z.string().min(1, "Address is required"),
      port: z
        .string()
        .or(z.number())
        .nullable()
        .transform((value) => {
          if (typeof value === "number") return value;
          if (value !== null && !isNaN(parseInt(value)))
            return Number(parseInt(value));
          return null;
        }),
      path: z.string().nullable(),
      sni: z.string().nullable(),
      host: z.string().nullable(),
      mux_enable: z.boolean().default(false),
      allowinsecure: z.boolean().nullable().default(false),
      pinned_peer_cert_sha256: z.string().nullable().optional(),
      verify_peer_cert_by_name: z.string().nullable().optional(),
      is_disabled: z.boolean().default(true),
      fragment_setting: z.string().nullable(),
      noise_setting: z.string().nullable(),
      random_user_agent: z.boolean().default(false),
      security: z.string(),
      alpn: z.string(),
      fingerprint: z.string(),
      use_sni_as_host: z.boolean().default(false),
      v2ray_json_template_id: z.number().nullable().optional(),
    })
  )
);

const Error = chakra(FormErrorMessage, {
  baseStyle: {
    color: "red.400",
    display: "block",
    textAlign: "left",
    w: "100%",
  },
});

const REMARK_VARS = ["USERNAME", "DATA_LEFT", "DAYS_LEFT", "EXPIRE_DATE", "PROTOCOL", "TRANSPORT"];

type AccordionInboundType = {
  hostKey: string;
  isOpen: boolean;
  toggleAccordion: () => void;
};

const AccordionInbound: FC<AccordionInboundType> = ({
  hostKey,
  isOpen,
  toggleAccordion,
}) => {
  const { inbounds } = useDashboard();
  const inbound = [...inbounds.values()]
    .flat()
    .filter((inbound) => inbound.tag === hostKey)[0];

  const form = useFormContext<z.infer<typeof hostsSchema>>();
  const {
    fields: hosts,
    append: addHost,
    remove: removeHost,
    insert: insertHost,
    move: moveHost,
  } = useFieldArray({
    control: form.control,
    name: hostKey,
  });
  const { errors } = form.formState;
  const { t } = useTranslation();
  const accordionErrors = errors[hostKey];
  const handleAddHost = () => {
    addHost({
      host: "",
      sni: "",
      port: null,
      path: null,
      address: "",
      remark: "",
      mux_enable: false,
      allowinsecure: false,
      pinned_peer_cert_sha256: "",
      verify_peer_cert_by_name: "",
      is_disabled: false,
      fragment_setting: "",
      noise_setting: "",
      random_user_agent: false,
      security: "inbound_default",
      alpn: "",
      fingerprint: "",
      use_sni_as_host: false,
      v2ray_json_template_id: null,
    });
  };
  const duplicateHost = (index: number) => {
    if (index < 0 || index >= hosts.length) return;
    const hostToDuplicate = hosts[index];
    insertHost(index + 1, hostToDuplicate);
  };
  useEffect(() => {
    if (accordionErrors && !isOpen) {
      toggleAccordion();
    }
  }, [accordionErrors]);

  const moveHostPosition = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index > 0) {
      moveHost(index, index - 1);
    } else if (direction === "down" && index < hosts.length - 1) {
      moveHost(index, index + 1);
    }
  };

  return (
    <Box w="full">
      <Flex justify="space-between" align="center" mb={3} gap={3} wrap="wrap">
        <Box>
          <Text fontWeight={650} fontSize="15px" fontFamily="mono">
            {hostKey}
          </Text>
          <Text fontSize="12px" color="text-muted">
            {t("hostsPage.hostsCount", { count: hosts.length })} · {t("hostsPage.reorderHint")}
          </Text>
        </Box>
        <Button size="sm" colorScheme="primary" variant="outline" onClick={handleAddHost}>
          {t("hostsDialog.addHost")}
        </Button>
      </Flex>
      {hosts.length === 0 && (
        <Box borderWidth="1px" borderStyle="dashed" borderColor="warning-border" bg="warning-bg" color="warning-fg" borderRadius="md" p={4} fontSize="13px">
          {t("hostsPage.noHosts", { protocol: inbound?.protocol?.toUpperCase?.() || "" })}
        </Box>
      )}
      <Box>
        <VStack gap={3}>
          {hosts.map((host, index) => {
            return (
              <motion.div
                key={host.id}
                layout
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  layout: { type: "spring", stiffness: 500, damping: 30 },
                  opacity: { duration: 0.1 },
                }}
                id={host.id}
                whileDrag={{ scale: 1.05, zIndex: 10 }}
                style={{
                  width: "100%",
                }}
              >
                <VStack
                  id={host.id}
                  key={host.id}
                  border="1px solid"
                  borderColor="border" bg="surface-subtle"
                  p={2}
                  w="full"
                  borderRadius="4px"
                >
                  <HStack w="100%" alignItems="flex-start">
                    <FormControl
                      position="relative"
                      zIndex={10}
                      isInvalid={
                        !!(accordionErrors && accordionErrors[index]?.remark)
                      }
                    >
                      <InputGroup>
                        <Input
                          {...form.register(hostKey + "." + index + ".remark")}
                          size="sm"
                          borderRadius="4px"
                          placeholder="Remark"
                        />
                        <InputRightElement>
                          <Popover isLazy placement="right">
                            <PopoverTrigger>
                              <Box mt="-8px">
                                <InfoIcon />
                              </Box>
                            </PopoverTrigger>
                            <Portal>
                              <PopoverContent>
                                <PopoverArrow />
                                <PopoverCloseButton />
                                <PopoverBody>
                                  <Box fontSize="xs">
                                    <Text pr="20px">
                                      {t("hostsDialog.desc")}
                                    </Text>
                                    <Text>
                                      <Badge>
                                        {"{"}SERVER_IP{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.currentServer")}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}SERVER_IPV6{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.currentServerv6")}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}USERNAME{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.username")}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}DATA_USAGE{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.dataUsage")}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}DATA_LEFT{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.remainingData")}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}DATA_LIMIT{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.dataLimit")}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}DAYS_LEFT{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.remainingDays")}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}EXPIRE_DATE{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.expireDate")}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}JALALI_EXPIRE_DATE{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.jalaliExpireDate")}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}TIME_LEFT{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.remainingTime")}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}STATUS_TEXT{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.statusText")}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}STATUS_EMOJI{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.statusEmoji")}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}PROTOCOL{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.proxyProtocol")}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}TRANSPORT{"}"}
                                      </Badge>{" "}
                                      {t("hostsDialog.proxyMethod")}
                                    </Text>
                                  </Box>
                                </PopoverBody>
                              </PopoverContent>
                            </Portal>
                          </Popover>
                        </InputRightElement>
                      </InputGroup>
                      {accordionErrors && accordionErrors[index]?.remark && (
                        <Error>{accordionErrors[index]?.remark?.message}</Error>
                      )}
                      <Flex gap={1} wrap="wrap" mt="6px" align="center">
                        <Text fontSize="11px" color="text-muted" mr={1}>
                          {t("hostsPage.insert")}
                        </Text>
                        {REMARK_VARS.map((v) => (
                          <Button key={v} size="xs" h="20px" px="6px" variant="outline" fontFamily="mono" fontSize="11px" fontWeight={500}
                            onClick={() => {
                              const field = (hostKey + "." + index + ".remark") as any;
                              (form.setValue as any)(field, (((form.getValues as any)(field) as string) || "") + `{${v}}`, { shouldDirty: true });
                            }}>
                            {`{${v}}`}
                          </Button>
                        ))}
                      </Flex>
                    </FormControl>
                  </HStack>
                  <FormControl
                    isInvalid={
                      !!(accordionErrors && accordionErrors[index]?.address)
                    }
                  >
                    <InputGroup>
                      <Input
                        size="sm"
                        borderRadius="4px"
                        placeholder="Address (e.g. example.com)"
                        {...form.register(hostKey + "." + index + ".address")}
                      />
                      <InputRightElement>
                        <Popover isLazy placement="right">
                          <PopoverTrigger>
                            <Box mt="-8px">
                              <InfoIcon />
                            </Box>
                          </PopoverTrigger>
                          <Portal>
                            <PopoverContent>
                              <PopoverArrow />
                              <PopoverCloseButton />
                              <PopoverBody>
                                <Box fontSize="xs">
                                  <Text pr="20px">{t("hostsDialog.desc")}</Text>
                                  <Text>
                                    <Badge>
                                      {"{"}SERVER_IP{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.currentServer")}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}SERVER_IPV6{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.currentServerv6")}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}USERNAME{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.username")}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}DATA_USAGE{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.dataUsage")}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}DATA_LEFT{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.remainingData")}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}DATA_LIMIT{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.dataLimit")}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}DAYS_LEFT{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.remainingDays")}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}EXPIRE_DATE{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.expireDate")}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}JALALI_EXPIRE_DATE{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.jalaliExpireDate")}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}TIME_LEFT{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.remainingTime")}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}STATUS_TEXT{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.statusText")}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}STATUS_EMOJI{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.statusEmoji")}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}PROTOCOL{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.proxyProtocol")}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}TRANSPORT{"}"}
                                    </Badge>{" "}
                                    {t("hostsDialog.proxyMethod")}
                                  </Text>
                                </Box>
                              </PopoverBody>
                            </PopoverContent>
                          </Portal>
                        </Popover>
                      </InputRightElement>
                    </InputGroup>
                    {accordionErrors && accordionErrors[index]?.address && (
                      <Error>{accordionErrors[index]?.address?.message}</Error>
                    )}
                  </FormControl>

                  <Accordion w="full" allowToggle>
                    <AccordionItem border="0">
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <AccordionButton
                          display="flex"
                          px={0}
                          py={1}
                          borderRadius={3}
                          _hover={{ bg: "transparent" }}
                        >
                          <Text
                            flex="3"
                            align="start"
                            fontSize="xs"
                            color="text-muted"
                            pl={1}
                          >
                            {t("hostsDialog.advancedOptions")}
                            <AccordionIcon fontSize="sm" ml={1} />
                          </Text>

                          <Container flex="1" px="0" display={"contents"}>
                            <Controller
                              control={form.control}
                              name={`${hostKey}.${index}.is_disabled`}
                              render={({ field }) => {
                                return (
                                  <Switch
                                    mx="1.5"
                                    colorScheme="primary"
                                    {...field}
                                    value={undefined}
                                    isChecked={!field.value}
                                    onChange={(e) => {
                                      console.log(e.target.checked);
                                      field.onChange(!e.target.checked);
                                    }}
                                  />
                                );
                              }}
                            />
                            <Tooltip label="Delete" placement="top">
                              <IconButton
                                aria-label="Delete"
                                size="sm"
                                colorScheme="red"
                                variant="ghost"
                                onClick={removeHost.bind(null, index)}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </Container>
                        </AccordionButton>
                        <Tooltip label="Duplicate" placement="top">
                          <IconButton
                            aria-label="Duplicate"
                            size="sm"
                            colorScheme="white"
                            variant="ghost"
                            onClick={() => duplicateHost(index)}
                          >
                            <DuplicateIcon />
                          </IconButton>
                        </Tooltip>
                        {index < hosts.length - 1 && (
                          <Tooltip label="Move Down" placement="top">
                            <IconButton
                              aria-label="DownIcon"
                              size="sm"
                              colorScheme="white"
                              variant="ghost"
                              onClick={() => moveHostPosition(index, "down")}
                            >
                              <DownIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {index > 0 && (
                          <Tooltip label="Move Up" placement="top">
                            <IconButton
                              aria-label="UpIcon"
                              size="sm"
                              colorScheme="white"
                              variant="ghost"
                              onClick={() => moveHostPosition(index, "up")}
                            >
                              <UpIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </div>
                      <AccordionPanel w="full" p={1}>
                        <VStack key={index} w="full" borderRadius="4px">
                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors && accordionErrors[index]?.port
                              )
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              justifyContent="space-between"
                              gap={1}
                              m="0"
                            >
                              <span>{t("hostsDialog.port")}</span>
                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {t("hostsDialog.port.info")}
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder={String(inbound.port || "8080")}
                              type="number"
                              {...form.register(
                                hostKey + "." + index + ".port"
                              )}
                            />
                          </FormControl>
                          <FormControl
                            isInvalid={
                              !!(accordionErrors && accordionErrors[index]?.sni)
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{t("hostsDialog.sni")}</span>

                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {t("hostsDialog.sni.info")}
                                    </Text>
                                    <Text fontSize="xs" mt="2">
                                      <Trans
                                        i18nKey="hostsDialog.host.wildcard"
                                        components={{
                                          badge: <Badge />,
                                        }}
                                      />
                                    </Text>
                                    <Text fontSize="xs">
                                      <Trans
                                        i18nKey="hostsDialog.host.multiHost"
                                        components={{
                                          badge: <Badge />,
                                        }}
                                      />
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder="SNI (e.g. example.com)"
                              {...form.register(hostKey + "." + index + ".sni")}
                            />
                            {accordionErrors && accordionErrors[index]?.sni && (
                              <Error>
                                {accordionErrors[index]?.sni?.message}
                              </Error>
                            )}
                          </FormControl>
                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors && accordionErrors[index]?.host
                              )
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{t("hostsDialog.host")}</span>

                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {t("hostsDialog.host.info")}
                                    </Text>
                                    <Text fontSize="xs" mt="2">
                                      <Trans
                                        i18nKey="hostsDialog.host.wildcard"
                                        components={{
                                          badge: <Badge />,
                                        }}
                                      />
                                    </Text>
                                    <Text fontSize="xs">
                                      <Trans
                                        i18nKey="hostsDialog.host.multiHost"
                                        components={{
                                          badge: <Badge />,
                                        }}
                                      />
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder="Host (e.g. example.com)"
                              {...form.register(
                                hostKey + "." + index + ".host"
                              )}
                            />
                            {accordionErrors &&
                              accordionErrors[index]?.host && (
                                <Error>
                                  {accordionErrors[index]?.host?.message}
                                </Error>
                              )}
                          </FormControl>

                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors && accordionErrors[index]?.path
                              )
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{t("hostsDialog.path")}</span>

                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {t("hostsDialog.path.info")}
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder="path (e.g. /vless)"
                              {...form.register(
                                hostKey + "." + index + ".path"
                              )}
                            />
                            {accordionErrors &&
                              accordionErrors[index]?.path && (
                                <Error>
                                  {accordionErrors[index]?.path?.message}
                                </Error>
                              )}
                          </FormControl>

                          <FormControl height="66px">
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{t("hostsDialog.security")}</span>

                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {t("hostsDialog.security.info")}
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Select
                              size="sm"
                              {...form.register(
                                hostKey + "." + index + ".security"
                              )}
                            >
                              {proxyHostSecurity.map((s) => {
                                return (
                                  <option key={s.value} value={s.value}>
                                    {s.title}
                                  </option>
                                );
                              })}
                            </Select>
                          </FormControl>

                          <FormControl height="66px">
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{t("hostsDialog.alpn")}</span>
                            </FormLabel>
                            <Select
                              size="sm"
                              {...form.register(
                                hostKey + "." + index + ".alpn"
                              )}
                            >
                              {proxyALPN.map((s) => {
                                return (
                                  <option key={s.value} value={s.value}>
                                    {s.title}
                                  </option>
                                );
                              })}
                            </Select>
                          </FormControl>

                          <FormControl height="66px">
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{t("hostsDialog.fingerprint")}</span>
                            </FormLabel>
                            <Select
                              size="sm"
                              {...form.register(
                                hostKey + "." + index + ".fingerprint"
                              )}
                            >
                              {proxyFingerprint.map((s) => {
                                return (
                                  <option key={s.value} value={s.value}>
                                    {s.title}
                                  </option>
                                );
                              })}
                            </Select>
                          </FormControl>

                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.fragment_setting
                              )
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{t("hostsDialog.fragment")}</span>

                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {t("hostsDialog.fragment.info")}
                                    </Text>
                                    <Text fontSize="xs" pr={5} pt={2} pb={1}>
                                      {t("hostsDialog.fragment.info.examples")}
                                    </Text>
                                    <Text fontSize="xs" pr={5}>
                                      100-200,10-20,tlshello
                                    </Text>
                                    <Text fontSize="xs" pr={5}>
                                      100-200,10-20,1-3
                                    </Text>
                                    <Text fontSize="xs" pr={5} pt="3">
                                      {t("hostsDialog.fragment.info.attention")}
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder="Fragment settings by pattern"
                              {...form.register(
                                hostKey + "." + index + ".fragment_setting"
                              )}
                            />
                            {accordionErrors &&
                              accordionErrors[index]?.fragment_setting && (
                                <Error>
                                  {
                                    accordionErrors[index]?.fragment_setting
                                      ?.message
                                  }
                                </Error>
                              )}
                          </FormControl>

                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.noise_setting
                              )
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{t("hostsDialog.noise")}</span>

                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {t("hostsDialog.noise.info")}
                                    </Text>
                                    <Text fontSize="xs" pr={5} pt={2} pb={1}>
                                      {t("hostsDialog.noise.info.examples")}
                                    </Text>
                                    <Text fontSize="xs" pr={5}>
                                      rand:10-20,10-20
                                    </Text>
                                    <Text fontSize="xs" pr={5}>
                                      rand:10-20,10-20&base64:7nQBAAABAAAAAAAABnQtcmluZwZtc2VkZ2UDbmV0AAABAAE=,10-25
                                    </Text>
                                    <Text fontSize="xs" pr={5} pt="3">
                                      {t("hostsDialog.noise.info.attention")}
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder="Noise settings by pattern"
                              {...form.register(
                                hostKey + "." + index + ".noise_setting"
                              )}
                            />
                            {accordionErrors &&
                              accordionErrors[index]?.noise_setting && (
                                <Error>
                                  {
                                    accordionErrors[index]?.noise_setting
                                      ?.message
                                  }
                                </Error>
                              )}
                          </FormControl>


                          <TemplateSelect
                            kind="v2ray_json"
                            size="sm"
                            label={t("subTpl.hostField")}
                            help={t("subTpl.hostFieldHelp")}
                            value={form.watch((hostKey + "." + index + ".v2ray_json_template_id") as any) as any}
                            onChange={(id) =>
                              form.setValue((hostKey + "." + index + ".v2ray_json_template_id") as any, id as any, { shouldDirty: true })
                            }
                          />
                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.use_sni_as_host
                              )
                            }
                          >
                            <Checkbox
                              {...form.register(
                                hostKey + "." + index + ".use_sni_as_host"
                              )}
                            >
                              <FormLabel>
                                {t("hostsDialog.useSniAsHost")}
                              </FormLabel>
                            </Checkbox>
                            {accordionErrors &&
                              accordionErrors[index]?.use_sni_as_host && (
                                <Error>
                                  {
                                    accordionErrors[index]?.use_sni_as_host
                                      ?.message
                                  }
                                </Error>
                              )}
                        </FormControl>
                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.pinned_peer_cert_sha256
                              )
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{t("hostsDialog.pinnedPeerCert")}</span>
                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {t("hostsDialog.pinnedPeerCert.info")}
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder="e.g. 6f3c…a91d (SHA-256 hex)"
                              {...form.register(
                                hostKey + "." + index + ".pinned_peer_cert_sha256"
                              )}
                            />
                            {accordionErrors &&
                              accordionErrors[index]?.pinned_peer_cert_sha256 && (
                                <Error>
                                  {accordionErrors[index]?.pinned_peer_cert_sha256?.message}
                                </Error>
                              )}
                          </FormControl>
                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.verify_peer_cert_by_name
                              )
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{t("hostsDialog.verifyPeerCertByName")}</span>
                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {t("hostsDialog.verifyPeerCertByName.info")}
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder="e.g. example.com"
                              {...form.register(
                                hostKey + "." + index + ".verify_peer_cert_by_name"
                              )}
                            />
                            {accordionErrors &&
                              accordionErrors[index]?.verify_peer_cert_by_name && (
                                <Error>
                                  {accordionErrors[index]?.verify_peer_cert_by_name?.message}
                                </Error>
                              )}
                          </FormControl>
                         <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.allowinsecure
                              )
                            }
                          >
                            <Checkbox
                              {...form.register(
                                hostKey + "." + index + ".allowinsecure"
                              )}
                              name={hostKey + "." + index + ".allowinsecure"}
                            >
                              <FormLabel>
                                {t("hostsDialog.allowinsecure")}
                              </FormLabel>
                              {accordionErrors &&
                                accordionErrors[index]?.allowinsecure && (
                                  <Error>
                                    {
                                      accordionErrors[index]?.allowinsecure
                                        ?.message
                                    }
                                  </Error>
                                )}
                            </Checkbox>
                          </FormControl>
                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.mux_enable
                              )
                            }
                          >
                            <Checkbox
                              {...form.register(
                                hostKey + "." + index + ".mux_enable"
                              )}
                            >
                              <FormLabel>
                                {t("hostsDialog.muxEnable")}
                              </FormLabel>
                            </Checkbox>
                            {accordionErrors &&
                              accordionErrors[index]?.mux_enable && (
                                <Error>
                                  {accordionErrors[index]?.mux_enable?.message}
                                </Error>
                              )}
                          </FormControl>
                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.random_user_agent
                              )
                            }
                          >
                            <Checkbox
                              {...form.register(
                                hostKey + "." + index + ".random_user_agent"
                              )}
                            >
                              <FormLabel>
                                {t("hostsDialog.randomUserAgent")}
                              </FormLabel>
                            </Checkbox>
                            {accordionErrors &&
                              accordionErrors[index]?.random_user_agent && (
                                <Error>
                                  {
                                    accordionErrors[index]?.random_user_agent
                                      ?.message
                                  }
                                </Error>
                              )}
                          </FormControl>
                        </VStack>
                      </AccordionPanel>
                    </AccordionItem>
                  </Accordion>
                </VStack>
              </motion.div>
            );
          })}
          <Button
            variant="outline"
            w="full"
            size="sm"
            color=""
            fontWeight={"normal"}
            onClick={handleAddHost}
          >
            {t("hostsDialog.addHost")}
          </Button>
        </VStack>
      </Box>
    </Box>
  );
};

export const HostsDialog: FC = () => {
  const { refetchUsers, inbounds } = useDashboard();
  const { isLoading, hosts, fetchHosts, isPostLoading, setHosts } = useHosts();
  const toast = useToast();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetchHosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const form = useForm<z.infer<typeof hostsSchema>>({
    resolver: zodResolver(hostsSchema) as Resolver<z.infer<typeof hostsSchema>>,
  });
  useEffect(() => {
    if (hosts) {
      form.reset(hosts);
      if (!selected) setSelected(Object.keys(hosts)[0] || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hosts]);

  const values = form.watch();
  const dirty = form.formState.dirtyFields as Record<string, any[] | undefined>;
  const changedHosts = Object.entries(dirty).reduce((n, [, list]) => n + (Array.isArray(list) ? list.filter(Boolean).length : 0), 0);
  // added hosts show up as dirty entries; removals only as a shorter list
  const removed = hosts ? Object.keys(hosts).reduce((n, k) => n + Math.max(0, hosts[k].length - ((values as any)[k]?.length ?? 0)), 0) : 0;
  const unsaved = changedHosts + removed;
  const errors = form.formState.errors as Record<string, unknown>;
  const allInbounds = [...inbounds.values()].flat();

  const handleFormSubmit = (data: z.infer<typeof hostsSchema>) => {
    setHosts(data)
      .then(() => {
        toast({ title: t("hostsDialog.savedSuccess"), status: "success", isClosable: true, position: "top", duration: 3000 });
        refetchUsers();
      })
      .catch((err) => {
        if (err?.response?.status === 409 || err?.response?.status === 400)
          toast({ title: err.response?._data?.detail, status: "error", isClosable: true, position: "top", duration: 3000 });
        if (err?.response?.status === 422)
          Object.keys(err.response._data.detail).forEach((key) =>
            toast({ title: err.response._data.detail[key] + " (" + key + ")", status: "error", isClosable: true, position: "top", duration: 3000 })
          );
      });
  };
  // jump to the first inbound with an error when saving fails validation
  const onInvalid = (errs: Record<string, unknown>) => {
    const first = Object.keys(errs)[0];
    if (first) setSelected(first);
  };

  return (
    <FormProvider {...form}>
      <chakra.form display="contents" onSubmit={form.handleSubmit(handleFormSubmit, onInvalid as any)}>
        <PageHeader
          title={t("nav.hosts")}
          subtitle={t("hostsPage.subtitle")}
          actions={
            <>
              {unsaved > 0 && (
                <Text fontSize="13px" color="warning-fg">
                  {t("settings.unsaved", { count: unsaved })}
                </Text>
              )}
              <Button variant="outline" isDisabled={!unsaved} onClick={() => hosts && form.reset(hosts)}>
                {t("settings.discard")}
              </Button>
              <Button type="submit" colorScheme="primary" isLoading={isPostLoading} isDisabled={!unsaved}>
                {t("hostsPage.save")}
              </Button>
            </>
          }
        />
        {isLoading || !hosts ? (
          <Text color="text-muted">{t("hostsDialog.loading")}</Text>
        ) : Object.keys(hosts).length === 0 ? (
          <Panel p={6}>
            <Text>{t("hostsPage.noInbounds")}</Text>
          </Panel>
        ) : (
          <Flex gap={4} direction={{ base: "column", lg: "row" }} align="flex-start">
            <Panel as="nav" aria-label={t("hostsPage.inbounds")} w={{ base: "full", lg: "300px" }} flex="none" p={2} position={{ lg: "sticky" }} top={4}>
              <Text fontSize="11px" fontWeight={600} letterSpacing=".06em" textTransform="uppercase" color="text-muted" px={2} pt={1} pb={2}>
                {t("hostsPage.inbounds")}
              </Text>
              {Object.keys(hosts).map((tag) => {
                const inbound = allInbounds.find((i) => i.tag === tag);
                const count = ((values as any)[tag] || []).length;
                const on = tag === selected;
                return (
                  <Box key={tag} as="button" type="button" w="full" textAlign="left" px={3} py={2} borderRadius="md"
                    bg={on ? "accent-soft" : "transparent"} _hover={{ bg: on ? "accent-soft" : "surface-hover" }}
                    onClick={() => setSelected(tag)} aria-current={on ? "true" : undefined}>
                    <Flex justify="space-between" gap={2}>
                      <Text fontWeight={600} fontSize="13px" fontFamily="mono" color={on ? "accent-text" : "text"} noOfLines={1}>
                        {tag}
                      </Text>
                      <HStack spacing={1}>
                        {errors[tag] ? <Box w="8px" h="8px" borderRadius="full" bg="danger-dot" /> : null}
                        {(dirty[tag] || []).some(Boolean) ? <Box w="6px" h="6px" borderRadius="full" bg="warning-dot" /> : null}
                        <Text fontSize="12px" color={count ? "text-muted" : "warning-fg"} fontWeight={count ? 400 : 600}>
                          {count}
                        </Text>
                      </HStack>
                    </Flex>
                    {inbound && (
                      <Text fontSize="12px" color="text-muted">
                        {[inbound.protocol, inbound.network, inbound.tls, inbound.port && `:${inbound.port}`].filter(Boolean).join(" · ")}
                      </Text>
                    )}
                  </Box>
                );
              })}
            </Panel>
            <Panel flex={1} minW={0} w="full" p={{ base: 3, md: 5 }}>
              {selected && <AccordionInbound key={selected} hostKey={selected} isOpen toggleAccordion={() => {}} />}
            </Panel>
          </Flex>
        )}
      </chakra.form>
    </FormProvider>
  );
};

export default HostsDialog;
