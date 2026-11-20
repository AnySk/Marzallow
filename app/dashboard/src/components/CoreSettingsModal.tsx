import {
  Badge,
  Box,
  Button,
  chakra,
  CircularProgress,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Text,
  Tooltip,
  useToast,
  useColorMode
} from "@chakra-ui/react";
import {
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { joinPaths } from "utils/joinPaths";
import classNames from "classnames";
import { useCoreSettings } from "contexts/CoreSettingsContext";
import { useDashboard } from "contexts/DashboardContext";
import debounce from "lodash.debounce";
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ReadyState } from "react-use-websocket";
import { useWebSocket } from "react-use-websocket/dist/lib/use-websocket";
import { getAuthToken } from "utils/authStorage";
import { Icon } from "./Icon";
import { Help, PageHeader, Panel, Pill } from "./ui";
import { CoreConfigEditor } from "./CoreConfigEditor";
import { useNodesQuery } from "contexts/NodesContext";

export const MAX_NUMBER_OF_LOGS = 500;

const UsageIcon = chakra(Cog6ToothIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});
export const ReloadIcon = chakra(ArrowPathIcon, {
  baseStyle: {
    w: 4,
    h: 4,
  },
});

export const FullScreenIcon = chakra(ArrowsPointingOutIcon, {
  baseStyle: {
    w: 4,
    h: 4,
  },
});
export const ExitFullScreenIcon = chakra(ArrowsPointingInIcon, {
  baseStyle: {
    w: 3,
    h: 3,
  },
});

const getStatus = (status: string) => {
  return {
    [ReadyState.CONNECTING]: "connecting",
    [ReadyState.OPEN]: "connected",
    [ReadyState.CLOSING]: "closed",
    [ReadyState.CLOSED]: "closed",
    [ReadyState.UNINSTANTIATED]: "closed",
  }[status];
};

const getWebsocketUrl = (nodeID: string) => {
  try {
    let baseURL = new URL(
      import.meta.env.VITE_BASE_API.startsWith("/")
        ? window.location.origin + import.meta.env.VITE_BASE_API
        : import.meta.env.VITE_BASE_API
    );

    return (
      (baseURL.protocol === "https:" ? "wss://" : "ws://") +
      joinPaths([
        baseURL.host + baseURL.pathname,
        !nodeID ? "/core/logs" : `/node/${nodeID}/logs`,
      ]) +
      "?interval=1&token=" +
      getAuthToken()
    );
  } catch (e) {
    console.error("Unable to generate websocket url");
    console.error(e);
    return null;
  }
};

let logsTmp: string[] = [];
const CoreSettingModalContent: FC = () => {

  const { colorMode } = useColorMode();

  const { data: nodes } = useNodesQuery();
  const disabled = false;
  const [searchParams] = useSearchParams();
  const [selectedNode, setNode] = useState<string>(searchParams.get("node") || "");

  const handleLog = (id: string, title: string) => {
    if (id === selectedNode) return;
    else if (id === "host") {
      setNode("");
      setLogs([]);
    } else {
      setNode(id);
      setLogs([]);
    }
  };

  const { isEditingCore } = useDashboard();
  const {
    fetchCoreSettings,
    updateConfig,
    isLoading,
    config,
    isPostLoading,
    version,
    restartCore,
  } = useCoreSettings();
  const logsDiv = useRef<HTMLDivElement | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const { t } = useTranslation();
  const toast = useToast();
  // the editor works on text; it is parsed (and must be valid JSON) on save
  const configText = config ? JSON.stringify(config, null, 2) : "";
  const form = useForm({
    defaultValues: { config: configText },
  });

  useEffect(() => {
    if (config) form.setValue("config", configText);
  }, [config]);

  useEffect(() => {
    fetchCoreSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  "".startsWith;
  const scrollShouldStayOnEnd = useRef(true);
  const updateLogs = useCallback(
    debounce((logs: string[]) => {
      const isScrollOnEnd =
        Math.abs(
          (logsDiv.current?.scrollTop || 0) -
            (logsDiv.current?.scrollHeight || 0) +
            (logsDiv.current?.offsetHeight || 0)
        ) < 10;
      if (logsDiv.current && isScrollOnEnd)
        scrollShouldStayOnEnd.current = true;
      else scrollShouldStayOnEnd.current = false;
      if (logs.length < 40) setLogs(logs);
    }, 300),
    []
  );

  const { readyState } = useWebSocket(getWebsocketUrl(selectedNode), {
    onMessage: (e: any) => {
      logsTmp.push(e.data);
      if (logsTmp.length > MAX_NUMBER_OF_LOGS)
        logsTmp = logsTmp.splice(0, logsTmp.length - MAX_NUMBER_OF_LOGS);
      updateLogs([...logsTmp]);
    },
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: 1000,
  });

  useEffect(() => {
    if (logsDiv.current && scrollShouldStayOnEnd.current)
      logsDiv.current.scrollTop = logsDiv.current?.scrollHeight;
  }, [logs]);

  useEffect(() => {
    return () => {
      logsTmp = [];
    };
  }, []);

  const status = getStatus(readyState.toString());

  const { mutate: handleRestartCore, isPending: isRestarting } = useMutation({
    mutationFn: restartCore,
  });

  const handleOnSave = ({ config: text }: { config: string }) => {
    let config;
    try {
      config = JSON.parse(text);
    } catch (e) {
      toast({
        title: t("core.invalidJson", { error: (e as Error).message }),
        status: "error",
        isClosable: true,
        position: "top",
        duration: 5000,
      });
      return;
    }
    updateConfig(config)
      .then(() => {
        toast({
          title: t("core.successMessage"),
          status: "success",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
      })
      .catch((e) => {
        let message = t("core.generalErrorMessage");
        if (typeof e.response._data.detail === "object")
          message =
            e.response._data.detail[Object.keys(e.response._data.detail)[0]];
        if (typeof e.response._data.detail === "string")
          message = e.response._data.detail;

        toast({
          title: message,
          status: "error",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
      });
  };
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setFullScreen] = useState(false);
  const handleFullScreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setFullScreen(false);
    } else {
      editorRef.current?.requestFullscreen();
      setFullScreen(true);
    }
  };
  const text = form.watch("config");
  const changes = useMemo(() => (configText && text ? lineDiff(configText, text) : []), [configText, text]);
  const changed = changes.filter((c) => c.type !== "same").length;
  const [reviewing, setReviewing] = useState(false);
  const format = () => {
    try {
      form.setValue("config", JSON.stringify(JSON.parse(text), null, 2));
      setFormatted((n) => n + 1);
    } catch (e) {
      toast({ title: t("core.invalidJson", { error: (e as Error).message }), status: "error", position: "top", duration: 4000 });
    }
  };
  const [formatted, setFormatted] = useState(0);

  return (
    <form onSubmit={form.handleSubmit(handleOnSave)} style={{ display: "contents" }}>
      <PageHeader
        title={t("nav.core")}
        meta={
          version && (
            <Pill tone={isLoading ? "neutral" : "success"}>
              Xray {version} {t("core.running")}
            </Pill>
          )
        }
        subtitle={t("core.subtitle")}
        actions={
          <>
            <Button variant="outline" onClick={format} isDisabled={!text}>
              {t("core.format")}
            </Button>
            <Button variant="outline" onClick={() => setReviewing(true)} isDisabled={!changed}>
              {t("core.review")}
              {changed > 0 && (
                <Text as="span" ml={2} px="6px" borderRadius="full" bg="accent-soft" color="accent-text" fontSize="12px">
                  {changed}
                </Text>
              )}
            </Button>
            <Button colorScheme="primary" type="submit" isDisabled={isLoading || isPostLoading || !changed} isLoading={isPostLoading}>
              {t("core.saveRestart")}
            </Button>
          </>
        }
      />
      <Box position="relative" ref={editorRef} bg="canvas" p={isFullScreen ? 4 : 0}>
        <HStack justify="space-between" mb={2}>
          <Text fontSize="12px" color="text-muted" fontFamily="mono">
            {changed ? t("core.edited") : "xray_config.json"}
            {isLoading && " · …"}
          </Text>
          <HStack spacing={2}>
            <Help display={{ base: "none", md: "block" }}>{t("core.editorHint")}</Help>
            <IconButton size="xs" aria-label={t("core.fullScreen")} variant="ghost" onClick={handleFullScreen}>
              {!isFullScreen ? <FullScreenIcon /> : <ExitFullScreenIcon />}
            </IconButton>
          </HStack>
        </HStack>
        <Controller
          control={form.control}
          name="config"
          render={({ field }) => (
            <CoreConfigEditor
              key={formatted}
              value={formatted ? field.value : configText}
              onChange={field.onChange}
              height={isFullScreen ? "calc(100vh - 4rem)" : "max(360px, calc(100vh - 470px))"}
            />
          )}
        />
      </Box>

      <Panel p={4}>
        <HStack justify="space-between" mb={3} flexWrap="wrap" gap={2}>
          <HStack spacing={3}>
            <Text fontWeight={650}>{t("core.logs")}</Text>
            {nodes?.[0] && (
              <Select size="sm" w="auto" value={selectedNode || "host"} onChange={(v) => handleLog(v.currentTarget.value, v.currentTarget.selectedOptions[0].text)}>
                <option value="host">{t("core.panelServer")}</option>
                {nodes.map((n) => (
                  <option key={n.address} value={String(n.id)}>
                    {n.name}
                  </option>
                ))}
              </Select>
            )}
          </HStack>
          <HStack spacing={3}>
            <Text fontSize="13px" color="text-muted">
              {t(`core.socket.${status}`)}
            </Text>
            <Button size="sm" variant="outline" leftIcon={<ReloadIcon className={classNames({ "animate-spin": isRestarting })} />}
              onClick={() => handleRestartCore()}>
              {t(isRestarting ? "core.restarting" : "core.restartCore")}
            </Button>
          </HStack>
        </HStack>
        <Box borderWidth="1px" borderColor="border" bg="surface-subtle" borderRadius="md" minH="160px" maxH="240px" p={2} overflowY="auto" ref={logsDiv}>
          {logs.map((message, i) => (
            <Text fontSize="12px" fontFamily="mono" color="text-2" key={i} whiteSpace="pre-wrap">
              {message}
            </Text>
          ))}
        </Box>
      </Panel>

      <Modal isOpen={reviewing} onClose={() => setReviewing(false)} size="4xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent mx={3}>
          <ModalHeader>
            <Text fontSize="17px" fontWeight={700}>{t("core.reviewTitle", { count: changed })}</Text>
            <Text fontSize="13px" fontWeight={400} color="text-muted">{t("core.reviewHelp")}</Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Box fontFamily="mono" fontSize="12px" borderWidth="1px" borderColor="border" borderRadius="md" overflow="hidden">
              {collapse(changes).map((c, i) =>
                c.type === "gap" ? (
                  <Text key={i} px={3} py={1} bg="surface-subtle" color="text-muted">⋯ {t("core.unchangedLines", { count: c.count })}</Text>
                ) : (
                  <Flex key={i} bg={c.type === "add" ? "success-bg" : c.type === "del" ? "danger-bg" : "transparent"}
                    color={c.type === "add" ? "success-fg" : c.type === "del" ? "danger-fg" : "text-2"}>
                    <Text w="44px" flex="none" textAlign="right" pr={2} color="text-muted" userSelect="none">{c.line ?? ""}</Text>
                    <Text w="16px" flex="none" userSelect="none">{c.type === "add" ? "+" : c.type === "del" ? "−" : " "}</Text>
                    <Text whiteSpace="pre-wrap" wordBreak="break-all">{c.text}</Text>
                  </Flex>
                )
              )}
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setReviewing(false)}>{t("core.keepEditing")}</Button>
            <Button colorScheme="primary" onClick={() => { setReviewing(false); form.handleSubmit(handleOnSave)(); }} isLoading={isPostLoading}>
              {t("core.saveRestart")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </form>
  );
};

type DiffLine = { type: "same" | "add" | "del"; text: string; line?: number };

/** Line diff (longest common subsequence); fine for config-sized files. */
export const lineDiff = (before: string, after: string): DiffLine[] => {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > 4_000_000) {
    return [...a.map((text) => ({ type: "del" as const, text })), ...b.map((text, i) => ({ type: "add" as const, text, line: i + 1 }))];
  }
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "same", text: a[i], line: j + 1 }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ type: "del", text: a[i++] });
    else { out.push({ type: "add", text: b[j], line: j + 1 }); j++; }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) { out.push({ type: "add", text: b[j], line: j + 1 }); j++; }
  return out;
};

/** Keep 2 lines of context around changes. */
const collapse = (lines: DiffLine[]) => {
  const keep = lines.map((l, i) => l.type !== "same" || lines.slice(Math.max(0, i - 2), i + 3).some((x) => x.type !== "same"));
  const out: (DiffLine | { type: "gap"; count: number })[] = [];
  let gap = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (gap) out.push({ type: "gap", count: gap });
      gap = 0;
      out.push(l);
    } else gap++;
  });
  if (gap) out.push({ type: "gap", count: gap });
  return out;
};

export const CoreSettingsModal: FC = () => <CoreSettingModalContent />;

export default CoreSettingsModal;
