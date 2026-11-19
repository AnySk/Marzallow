import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  IconButton,
  Input as ChakraInput,
  InputGroup,
  InputRightElement,
  Switch,
  Text,
  Textarea,
  Tooltip,
  VStack,
  chakra,
  useColorMode,
  useToast,
} from "@chakra-ui/react";
import { ChartPieIcon } from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetStrategy } from "constants/UserSettings";
import { FilterUsageType, useDashboard } from "contexts/DashboardContext";
import dayjs from "dayjs";
import { FC, ReactNode, useEffect, useState } from "react";
import ReactApexChart from "react-apexcharts";
import ReactDatePicker from "react-datepicker";
import {
  Controller,
  FormProvider,
  Resolver,
  useForm,
  useWatch,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  ProxyKeys,
  ProxyType,
  User,
  UserCreate,
  UserInbounds,
} from "types/User";
import { relativeExpiryDate } from "utils/dateFormatter";
import { z } from "zod";
import { DeleteIcon } from "./DeleteUserModal";
import { Input } from "./Input";
import { RadioGroup } from "./RadioGroup";
import { UsageFilter, createUsageConfig } from "./UsageFilter";
import { TemplatePicker } from "./TemplatesModal";
import { UserExtras } from "./UserExtras";
import { UserTemplate } from "types/Management";
import { ReloadIcon } from "./Filters";
import classNames from "classnames";

const UserUsageIcon = chakra(ChartPieIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

export type UserDialogProps = {};

export type FormType = Pick<UserCreate, keyof UserCreate> & {
  selected_proxies: ProxyKeys;
};

const formatUser = (user: User): FormType => {
  return {
    ...user,
    data_limit: user.data_limit
      ? Number((user.data_limit / 1073741824).toFixed(5))
      : user.data_limit,
    on_hold_expire_duration: user.on_hold_expire_duration
      ? Number(user.on_hold_expire_duration / (24 * 60 * 60))
      : user.on_hold_expire_duration,
    selected_proxies: Object.keys(user.proxies) as ProxyKeys,
  };
};
const getDefaultValues = (): FormType => {
  const defaultInbounds = Object.fromEntries(useDashboard.getState().inbounds);
  const inbounds: UserInbounds = {};
  for (const key in defaultInbounds) {
    inbounds[key] = defaultInbounds[key].map((i) => i.tag);
  }
  return {
    selected_proxies: Object.keys(defaultInbounds) as ProxyKeys,
    data_limit: null,
    expire: null,
    username: "",
    data_limit_reset_strategy: "no_reset",
    status: "active",
    on_hold_expire_duration: null,
    note: "",
    inbounds,
    proxies: {
      vless: { id: "", flow: "" },
      vmess: { id: "" },
      trojan: { password: "" },
      shadowsocks: { password: "", method: "chacha20-ietf-poly1305" },
    },
  };
};

const mergeProxies = (
  proxyKeys: ProxyKeys,
  proxyType: ProxyType | undefined
): ProxyType => {
  const proxies: ProxyType = proxyKeys.reduce(
    (ac, a) => ({ ...ac, [a]: {} }),
    {}
  );
  if (!proxyType) return proxies;
  proxyKeys.forEach((proxy) => {
    if (proxyType[proxy]) {
      proxies[proxy] = proxyType[proxy];
    }
  });
  return proxies;
};

const baseSchema = {
  username: z.string().min(1, { message: "Required" }),
  selected_proxies: z.array(z.string()).refine((value) => value.length > 0, {
    message: "userDialog.selectOneProtocol",
  }),
  note: z.string().nullable(),
  proxies: z
    .record(z.string(), z.record(z.string(), z.any()))
    .transform((ins) => {
      const deleteIfEmpty = (obj: any, key: string) => {
        if (obj && obj[key] === "") {
          delete obj[key];
        }
      };
      deleteIfEmpty(ins.vmess, "id");
      deleteIfEmpty(ins.vless, "id");
      deleteIfEmpty(ins.trojan, "password");
      deleteIfEmpty(ins.shadowsocks, "password");
      deleteIfEmpty(ins.shadowsocks, "method");
      return ins;
    }),
  data_limit: z
    .string()
    .min(0)
    .or(z.number())
    .nullable()
    .transform((str) => {
      if (str) return Number((parseFloat(String(str)) * 1073741824).toFixed(5));
      return 0;
    }),
  expire: z.number().nullable(),
  data_limit_reset_strategy: z.string(),
  inbounds: z.record(z.string(), z.array(z.string())).transform((ins) => {
    Object.keys(ins).forEach((protocol) => {
      if (Array.isArray(ins[protocol]) && !ins[protocol]?.length)
        delete ins[protocol];
    });
    return ins;
  }),
};

const schema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("active"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("disabled"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("limited"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("expired"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("on_hold"),
    on_hold_expire_duration: z.coerce
      .number()
      .min(0.1, "Required")
      .transform((d) => {
        return d * (24 * 60 * 60);
      }),
    ...baseSchema,
  }),
]);

export const UserDialog: FC<UserDialogProps> = () => {
  const {
    editingUser,
    isCreatingNewUser,
    onCreateUser,
    editUser,
    fetchUserUsage,
    onEditingUser,
    createUser,
    onDeletingUser,
  } = useDashboard();
  const isEditing = !!editingUser;
  const isOpen = isCreatingNewUser || isEditing;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>("");
  const toast = useToast();
  const { t } = useTranslation();

  const { colorMode } = useColorMode();

  const [usageVisible, setUsageVisible] = useState(false);
  const handleUsageToggle = () => {
    setUsageVisible((current) => !current);
  };

  const form = useForm<FormType>({
    defaultValues: getDefaultValues(),
    resolver: zodResolver(schema) as unknown as Resolver<FormType>,
  });

  useEffect(
    () =>
      useDashboard.subscribe(
        (state) => state.inbounds,
        () => {
          form.reset(getDefaultValues());
        }
      ),
    []
  );

  const [dataLimit, userStatus] = useWatch({
    control: form.control,
    name: ["data_limit", "status"],
  });

  const usageTitle = t("userDialog.total");
  const [usage, setUsage] = useState(createUsageConfig(colorMode, usageTitle));
  const [usageFilter, setUsageFilter] = useState("1m");
  const fetchUsageWithFilter = (query: FilterUsageType) => {
    fetchUserUsage(editingUser!, query).then((data: any) => {
      const labels = [];
      const series = [];
      for (const key in data.usages) {
        series.push(data.usages[key].used_traffic);
        labels.push(data.usages[key].node_name);
      }
      setUsage(createUsageConfig(colorMode, usageTitle, series, labels));
    });
  };

  useEffect(() => {
    if (editingUser) {
      form.reset(formatUser(editingUser));

      fetchUsageWithFilter({
        start: dayjs().utc().subtract(30, "day").format("YYYY-MM-DDTHH:00:00"),
      });
    }
  }, [editingUser]);

  const applyTemplate = (template: UserTemplate) => {
    const options = { shouldDirty: true };
    form.setValue(
      "data_limit",
      template.data_limit ? Number((template.data_limit / 1073741824).toFixed(5)) : null,
      options
    );
    form.setValue(
      "expire",
      template.expire_duration ? dayjs().add(template.expire_duration, "second").unix() : null,
      options
    );
    if (template.inbounds && Object.keys(template.inbounds).length) {
      form.setValue("inbounds", template.inbounds, options);
      form.setValue("selected_proxies", Object.keys(template.inbounds) as ProxyKeys, options);
    }
    if (template.username_prefix || template.username_suffix) {
      const username = form.getValues("username") || "";
      form.setValue(
        "username",
        `${template.username_prefix || ""}${username}${template.username_suffix || ""}`,
        options
      );
    }
  };

  const submit = (values: FormType) => {
    setLoading(true);
    const methods = { edited: editUser, created: createUser };
    const method = isEditing ? "edited" : "created";
    setError(null);

    const { selected_proxies, ...rest } = values;

    let body: UserCreate = {
      ...rest,
      data_limit: values.data_limit,
      proxies: mergeProxies(selected_proxies, values.proxies),
      data_limit_reset_strategy:
        values.data_limit && values.data_limit > 0
          ? values.data_limit_reset_strategy
          : "no_reset",
      status:
        values.status === "active" ||
          values.status === "disabled" ||
          values.status === "on_hold"
          ? values.status
          : "active",
    };

    methods[method](body)
      .then(() => {
        toast({
          title: t(
            isEditing ? "userDialog.userEdited" : "userDialog.userCreated",
            { username: values.username }
          ),
          status: "success",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
        onClose();
      })
      .catch((err) => {
        if (err?.response?.status === 409 || err?.response?.status === 400)
          setError(err?.response?._data?.detail);
        if (err?.response?.status === 422) {
          Object.keys(err.response._data.detail).forEach((key) => {
            setError(err?.response._data.detail[key] as string);
            form.setError(
              key as "proxies" | "username" | "data_limit" | "expire",
              {
                type: "custom",
                message: err.response._data.detail[key],
              }
            );
          });
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const onClose = () => {
    form.reset(getDefaultValues());
    onCreateUser(false);
    onEditingUser(null);
    setError(null);
    setUsageVisible(false);
    setUsageFilter("1m");
  };

  const handleResetUsage = () => {
    useDashboard.setState({ resetUsageUser: editingUser });
  };

  const handleRevokeSubscription = () => {
    useDashboard.setState({ revokeSubscriptionUser: editingUser });
  };

  const disabled = loading;
  const isOnHold = userStatus === "on_hold";

  const [randomUsernameLoading, setrandomUsernameLoading] = useState(false);

  const createRandomUsername = (): string => {
    setrandomUsernameLoading(true);
    let result = "";
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < 6) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
  };

  const status = userStatus;
  const now = dayjs();
  const setExpireInDays = (days: number | null) => {
    form.setValue("on_hold_expire_duration", null);
    if (days === null) return form.setValue("expire", null, { shouldDirty: true });
    const current = form.getValues("expire");
    const base = current && dayjs.unix(current).isAfter(now) && isEditing ? dayjs.unix(current) : now;
    form.setValue("expire", base.add(days, "day").set("hour", 23).set("minute", 59).set("second", 59).utc().unix(), {
      shouldDirty: true,
    });
  };
  const expireValue = useWatch({ control: form.control, name: "expire" });
  const onHoldDays = useWatch({ control: form.control, name: "on_hold_expire_duration" });
  const resetValue = useWatch({ control: form.control, name: "data_limit_reset_strategy" });
  const unlimited = !(dataLimit && Number(dataLimit) > 0);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="md" blockScrollOnMount>
      <DrawerOverlay />
      <FormProvider {...form}>
        <DrawerContent maxW="620px" borderLeftWidth="1px" borderColor="border" boxShadow="float">
          <chakra.form display="flex" flexDirection="column" h="full" onSubmit={form.handleSubmit(submit)}>
            <DrawerHeader px={6} py={5} borderBottomWidth="1px" borderColor="border">
              <VStack align="flex-start" spacing="2px" pr={10}>
                <Text fontSize="18px" fontWeight={700}>
                  {isEditing ? editingUser?.username : t("createNewUser")}
                </Text>
                <Text fontSize="13px" color="text-muted" fontWeight={400}>
                  {isEditing ? t("userDialog.editSubtitle") : t("userDialog.createSubtitle")}
                </Text>
              </VStack>
            </DrawerHeader>
            <DrawerCloseButton top={5} right={5} isDisabled={disabled} />
            <DrawerBody p={0}>
              {!isEditing && <TemplatePicker onApply={applyTemplate} />}

              <FormSection title={t("userDialog.account")}>
                <FormControl isInvalid={!!form.formState.errors.username}>
                  <FormLabel>{t("username")}</FormLabel>
                  <HStack spacing={3}>
                    <InputGroup>
                      <ChakraInput
                        fontFamily="mono"
                        autoComplete="off"
                        isDisabled={disabled || isEditing}
                        {...form.register("username")}
                      />
                      {!isEditing && (
                        <InputRightElement>
                          <Tooltip label={t("userDialog.randomUsername")}>
                            <IconButton
                              size="sm"
                              variant="ghost"
                              aria-label={t("userDialog.randomUsername")}
                              icon={
                                <ReloadIcon
                                  className={classNames({ "animate-spin": randomUsernameLoading })}
                                />
                              }
                              onClick={() => {
                                form.setValue("username", createRandomUsername(), { shouldValidate: true });
                                setTimeout(() => setrandomUsernameLoading(false), 350);
                              }}
                            />
                          </Tooltip>
                        </InputRightElement>
                      )}
                    </InputGroup>
                    {isEditing && (status === "active" || status === "disabled") && (
                      <Controller
                        name="status"
                        control={form.control}
                        render={({ field }) => (
                          <HStack as="label" spacing={2} flex="none" cursor="pointer">
                            <Switch
                              colorScheme="primary"
                              isChecked={field.value === "active"}
                              onChange={(e) => field.onChange(e.target.checked ? "active" : "disabled")}
                            />
                            <Text fontSize="13px" fontWeight={500}>
                              {field.value === "active" ? t("userDialog.enabled") : t("status.disabled")}
                            </Text>
                          </HStack>
                        )}
                      />
                    )}
                  </HStack>
                  {isEditing ? (
                    <FormHelperText>{t("userDialog.usernameFixed")}</FormHelperText>
                  ) : null}
                  <FormErrorMessage>{form.formState.errors.username?.message as string}</FormErrorMessage>
                </FormControl>
                <FormControl isInvalid={!!form.formState.errors.note}>
                  <FormLabel>
                    {t("userDialog.note")}{" "}
                    <Text as="span" color="text-muted" fontWeight={400}>
                      {t("userDialog.optional")}
                    </Text>
                  </FormLabel>
                  <Textarea rows={2} {...form.register("note")} />
                  <FormHelperText>{t("userDialog.noteHelp")}</FormHelperText>
                  <FormErrorMessage>{form.formState.errors?.note?.message}</FormErrorMessage>
                </FormControl>
              </FormSection>

              <FormSection title={t("userDialog.dataLimit")} help={t("userDialog.dataLimitHelp")}>
                <Flex wrap="wrap" gap={3} align="flex-end">
                  <FormControl w="180px" isInvalid={!!form.formState.errors.data_limit}>
                    <FormLabel>{t("userDialog.limit")}</FormLabel>
                    <Controller
                      control={form.control}
                      name="data_limit"
                      render={({ field }) => (
                        <InputGroup>
                          <ChakraInput
                            inputMode="decimal"
                            type="number"
                            min={0}
                            step="any"
                            placeholder={t("usersTable.unlimited")}
                            value={field.value ? String(field.value) : ""}
                            onChange={field.onChange}
                            isDisabled={disabled}
                            pr="44px"
                          />
                          <InputRightElement color="text-muted" fontWeight={500} pointerEvents="none">
                            GB
                          </InputRightElement>
                        </InputGroup>
                      )}
                    />
                    <FormErrorMessage>{form.formState.errors.data_limit?.message as string}</FormErrorMessage>
                  </FormControl>
                  <QuickChips
                    label={t("userDialog.quickLimits")}
                    options={[10, 50, 100, 500].map((gb) => ({ label: `${gb} GB`, on: Number(dataLimit) === gb, onClick: () => form.setValue("data_limit", gb, { shouldDirty: true }) }))
                      .concat([{ label: t("userDialog.unlimited"), on: unlimited, onClick: () => form.setValue("data_limit", null, { shouldDirty: true }) }])}
                  />
                </Flex>
                <FormControl isDisabled={unlimited}>
                  <FormLabel>{t("userDialog.periodicUsageReset")}</FormLabel>
                  <Segmented
                    value={unlimited ? "no_reset" : resetValue || "no_reset"}
                    isDisabled={unlimited || disabled}
                    onChange={(v) => form.setValue("data_limit_reset_strategy", v as any, { shouldDirty: true })}
                    options={resetStrategy.map((r) => ({ value: r.value, label: t(`userDialog.reset.${r.value}`) }))}
                  />
                  <FormHelperText>
                    {unlimited ? t("userDialog.resetNeedsLimit") : t(`userDialog.resetHelp.${resetValue || "no_reset"}`)}
                  </FormHelperText>
                </FormControl>
              </FormSection>

              <FormSection title={t("userDialog.expiry")}>
                {(!isEditing || isOnHold) && (
                  <Controller
                    name="status"
                    control={form.control}
                    render={({ field }) => (
                      <Flex wrap="wrap" gap="10px" role="radiogroup" aria-label={t("userDialog.expiry")}>
                        <Choice
                          on={field.value !== "on_hold"}
                          title={t("userDialog.fixedDate")}
                          help={t("userDialog.fixedDateHelp")}
                          onClick={() => {
                            form.setValue("on_hold_expire_duration", null);
                            field.onChange("active");
                          }}
                        />
                        <Choice
                          on={field.value === "on_hold"}
                          title={t("userDialog.firstConnection")}
                          help={t("userDialog.firstConnectionHelp")}
                          onClick={() => {
                            form.setValue("expire", null);
                            if (!form.getValues("on_hold_expire_duration"))
                              form.setValue("on_hold_expire_duration", 30);
                            field.onChange("on_hold");
                          }}
                        />
                      </Flex>
                    )}
                  />
                )}
                {isOnHold ? (
                  <Flex wrap="wrap" gap={3} align="flex-end">
                    <FormControl w="200px" isInvalid={!!form.formState.errors.on_hold_expire_duration}>
                      <FormLabel>{t("userDialog.onHoldExpireDuration")}</FormLabel>
                      <Controller
                        control={form.control}
                        name="on_hold_expire_duration"
                        render={({ field }) => (
                          <InputGroup>
                            <ChakraInput
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={field.value ? String(field.value) : ""}
                              onChange={(e) => {
                                form.setValue("expire", null);
                                field.onChange(e);
                              }}
                              isDisabled={disabled}
                              pr="56px"
                            />
                            <InputRightElement w="56px" color="text-muted" fontWeight={500} pointerEvents="none">
                              {t("userDialog.days")}
                            </InputRightElement>
                          </InputGroup>
                        )}
                      />
                      <FormErrorMessage>{form.formState.errors.on_hold_expire_duration?.message as string}</FormErrorMessage>
                    </FormControl>
                    <QuickChips
                      label={t("userDialog.quickDurations")}
                      options={[7, 30, 90, 365].map((d) => ({
                        label: t("userDialog.nDays", { count: d }),
                        on: Number(onHoldDays) === d,
                        onClick: () => form.setValue("on_hold_expire_duration", d, { shouldDirty: true }),
                      }))}
                    />
                  </Flex>
                ) : (
                  <>
                    <Flex wrap="wrap" gap={3} align="flex-end">
                      <FormControl w="200px" isInvalid={!!form.formState.errors.expire}>
                        <FormLabel>{t("userDialog.expiryDate")}</FormLabel>
                        <Controller
                          name="expire"
                          control={form.control}
                          render={({ field }) => (
                            <ReactDatePicker
                              dateFormat={t("dateFormat")}
                              minDate={new Date()}
                              placeholderText={t("usersTable.neverExpires")}
                              selected={field.value ? dayjs(dayjs(field.value * 1000).utc()).toDate() : undefined}
                              onChange={(date: Date) => {
                                form.setValue("on_hold_expire_duration", null);
                                field.onChange({
                                  target: {
                                    value: date
                                      ? dayjs(dayjs(date).set("hour", 23).set("minute", 59).set("second", 59)).utc().valueOf() / 1000
                                      : 0,
                                    name: "expire",
                                  },
                                });
                              }}
                              customInput={
                                <Input type="text" clearable disabled={disabled} error={form.formState.errors.expire?.message} />
                              }
                            />
                          )}
                        />
                      </FormControl>
                      <QuickChips
                        label={t("userDialog.quickDurations")}
                        options={[
                          { label: t("userDialog.plusDays", { count: 7 }), onClick: () => setExpireInDays(7) },
                          { label: t("userDialog.plusDays", { count: 30 }), onClick: () => setExpireInDays(30) },
                          { label: t("userDialog.plusDays", { count: 90 }), onClick: () => setExpireInDays(90) },
                          { label: t("userDialog.plusYear"), onClick: () => setExpireInDays(365) },
                          { label: t("userDialog.never"), on: !expireValue, onClick: () => setExpireInDays(null) },
                        ]}
                      />
                    </Flex>
                    <Text fontSize="12px" color="text-muted">
                      {expireValue
                        ? t(relativeExpiryDate(expireValue).status, { time: relativeExpiryDate(expireValue).time }) +
                          " · " +
                          t("userDialog.atEndOfDay")
                        : t("userDialog.neverExpiresHelp")}
                    </Text>
                  </>
                )}
              </FormSection>

              <FormSection title={t("userDialog.protocols")} help={t("userDialog.protocolsHelp")} last={!isEditing}>
                <FormControl isInvalid={!!form.formState.errors.selected_proxies?.message}>
                  <Controller
                    control={form.control}
                    name="selected_proxies"
                    render={({ field }) => (
                      <RadioGroup
                        list={[
                          { title: "vless", description: "" },
                          { title: "vmess", description: "" },
                          { title: "trojan", description: "" },
                          { title: "shadowsocks", description: "" },
                        ]}
                        disabled={disabled}
                        {...field}
                      />
                    )}
                  />
                  <FormErrorMessage>{t(form.formState.errors.selected_proxies?.message as string)}</FormErrorMessage>
                </FormControl>
              </FormSection>

              {isEditing && editingUser && (
                <>
                  <FormSection
                    title={t("userDialog.usageByNode")}
                    action={
                      <Button size="sm" variant="ghost" onClick={handleUsageToggle} rightIcon={<UserUsageIcon />}>
                        {usageVisible ? t("userDialog.hide") : t("userDialog.show")}
                      </Button>
                    }
                  >
                    {usageVisible && (
                      <VStack gap={4}>
                        <UsageFilter
                          defaultValue={usageFilter}
                          onChange={(filter, query) => {
                            setUsageFilter(filter);
                            fetchUsageWithFilter(query);
                          }}
                        />
                        <Box width={{ base: "100%", md: "80%" }} justifySelf="center">
                          <ReactApexChart options={usage.options} series={usage.series} type="donut" />
                        </Box>
                      </VStack>
                    )}
                  </FormSection>
                  <FormSection title={t("userDialog.more")} last>
                    <UserExtras user={editingUser} />
                  </FormSection>
                </>
              )}
              {error && (
                <Box px={6} pb={5}>
                  <Alert status="error">
                    <AlertIcon />
                    {error}
                  </Alert>
                </Box>
              )}
            </DrawerBody>
            <DrawerFooter
              px={6}
              py="14px"
              borderTopWidth="1px"
              borderColor="border"
              bg="surface"
              justifyContent="space-between"
              flexWrap="wrap"
              gap={3}
            >
              <HStack spacing={2} flexWrap="wrap">
                {isEditing && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      colorScheme="red"
                      leftIcon={<DeleteIcon />}
                      onClick={() => {
                        onDeletingUser(editingUser);
                        onClose();
                      }}
                    >
                      {t("delete")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleResetUsage}>
                      {t("userDialog.resetUsage")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleRevokeSubscription}>
                      {t("userDialog.revokeSubscription")}
                    </Button>
                  </>
                )}
              </HStack>
              <HStack spacing={2} ml="auto">
                <Button variant="outline" onClick={onClose} isDisabled={disabled}>
                  {t("cancel")}
                </Button>
                <Button type="submit" colorScheme="primary" isLoading={loading} isDisabled={disabled}>
                  {isEditing ? t("userDialog.editUser") : t("createUser")}
                </Button>
              </HStack>
            </DrawerFooter>
          </chakra.form>
        </DrawerContent>
      </FormProvider>
    </Drawer>
  );
};


const FormSection: FC<{ title: string; help?: string; action?: ReactNode; last?: boolean; children: ReactNode }> = ({
  title,
  help,
  action,
  last,
  children,
}) => (
  <VStack
    as="section"
    align="stretch"
    spacing={4}
    px={6}
    py={5}
    borderBottomWidth={last ? 0 : "1px"}
    borderColor="border-subtle"
  >
    <HStack justify="space-between" align="flex-start">
      <VStack align="flex-start" spacing="2px">
        <Text as="h3" fontSize="15px" fontWeight={650}>
          {title}
        </Text>
        {help && (
          <Text fontSize="12px" color="text-muted">
            {help}
          </Text>
        )}
      </VStack>
      {action}
    </HStack>
    {children}
  </VStack>
);

const QuickChips: FC<{ label: string; options: { label: string; on?: boolean; onClick: () => void }[] }> = ({ label, options }) => (
  <Flex role="group" aria-label={label} wrap="wrap" gap="6px" pb="4px">
    {options.map((o) => (
      <Button
        key={o.label}
        type="button"
        size="xs"
        h="28px"
        px="10px"
        borderRadius="full"
        variant="outline"
        fontSize="12px"
        aria-pressed={!!o.on}
        bg={o.on ? "accent-soft" : "surface"}
        borderColor={o.on ? "primary.200" : "border-strong"}
        color={o.on ? "accent-text" : "text-2"}
        _hover={{ bg: o.on ? "accent-soft" : "surface-hover" }}
        onClick={o.onClick}
      >
        {o.label}
      </Button>
    ))}
  </Flex>
);

const Segmented: FC<{
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  isDisabled?: boolean;
}> = ({ value, options, onChange, isDisabled }) => (
  <Flex role="radiogroup" wrap="wrap" bg="chakra-subtle-bg" borderRadius="9px" p="3px" gap="2px" opacity={isDisabled ? 0.6 : 1}>
    {options.map((o) => {
      const on = o.value === value;
      return (
        <Button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={on}
          flex={1}
          h="32px"
          size="sm"
          variant="unstyled"
          borderRadius="7px"
          fontWeight={500}
          fontSize="13px"
          bg={on ? "surface" : "transparent"}
          color={on ? "text" : "text-2"}
          boxShadow={on ? "0 1px 2px rgba(16,24,40,.12)" : "none"}
          isDisabled={isDisabled}
          _focusVisible={{ boxShadow: "outline" }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      );
    })}
  </Flex>
);

const Choice: FC<{ on: boolean; title: string; help: string; onClick: () => void }> = ({ on, title, help, onClick }) => (
  <HStack
    as="button"
    type="button"
    role="radio"
    aria-checked={on}
    onClick={onClick}
    flex="1 1 220px"
    align="flex-start"
    spacing={3}
    px="14px"
    py={3}
    borderWidth="1px"
    borderRadius="10px"
    textAlign="left"
    borderColor={on ? "accent" : "border-strong"}
    bg={on ? "surface-selected" : "surface"}
    _hover={{ borderColor: on ? "accent" : "gray.400" }}
    _focusVisible={{ boxShadow: "outline", outline: "none" }}
  >
    <Box
      mt="2px"
      w="16px"
      h="16px"
      flex="none"
      borderRadius="full"
      borderWidth={on ? "5px" : "1.5px"}
      borderColor={on ? "primary.500" : "gray.400"}
      bg="surface"
    />
    <VStack align="flex-start" spacing="2px">
      <Text fontWeight={600}>{title}</Text>
      <Text fontSize="12px" color="text-muted">
        {help}
      </Text>
    </VStack>
  </HStack>
);
