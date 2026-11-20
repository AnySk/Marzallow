import {
  Box,
  Button,
  chakra,
  Flex,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { QRCodeCanvas } from "qrcode.react";
import { FC, useEffect, useRef, useState } from "react";
import { useFeatures } from "contexts/FeaturesContext";
import CopyToClipboard from "react-copy-to-clipboard";
import { useTranslation } from "react-i18next";
import { useDashboard } from "../contexts/DashboardContext";

const QRCode = chakra(QRCodeCanvas);
const ic = (c: typeof CheckIcon) => chakra(c, { baseStyle: { w: 4, h: 4 } });
const Icons = { prev: ic(ChevronLeftIcon), next: ic(ChevronRightIcon), copy: ic(ClipboardDocumentIcon), copied: ic(CheckIcon) };

const linkName = (link: string) => {
  const hash = link.indexOf("#");
  if (hash >= 0) {
    try {
      return decodeURIComponent(link.slice(hash + 1));
    } catch {
      return link.slice(hash + 1);
    }
  }
  return link.split("://")[0].toUpperCase();
};

const CopyButton: FC<{ text: string; label: string; primary?: boolean }> = ({ text, label, primary }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <CopyToClipboard text={text} onCopy={() => setCopied(true)}>
      <Button size="sm" colorScheme={primary ? "primary" : "gray"} variant={primary ? "solid" : "outline"} leftIcon={copied ? <Icons.copied /> : <Icons.copy />}>
        {copied ? t("usersTable.copied") : label}
      </Button>
    </CopyToClipboard>
  );
};

/** Share a user's subscription link (or single config links) as text and QR code. */
export const QRCodeDialog: FC = () => {
  const { QRcodeLinks, setQRCode, setSubLink, subscribeUrl } = useDashboard();
  const isOpen = QRcodeLinks !== null;
  const [tab, setTab] = useState<"sub" | "links">("sub");
  const [index, setIndex] = useState(0);
  const { t } = useTranslation();
  const links = QRcodeLinks || [];
  useEffect(() => {
    setIndex(0);
    setTab(subscribeUrl ? "sub" : "links");
  }, [QRcodeLinks, subscribeUrl]);

  const sharing = useFeatures((s) => s.sharing);
  const qrBox = useRef<HTMLDivElement>(null);
  const onClose = () => {
    setQRCode(null);
    setSubLink(null);
    useFeatures.getState().setSharing(null);
  };
  const downloadQr = () => {
    const canvas = qrBox.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${sharing?.username || "subscription"}${tab === "links" ? `-${index + 1}` : ""}.png`;
    a.click();
  };
  const subLink = String(subscribeUrl).startsWith("/") ? window.location.origin + subscribeUrl : String(subscribeUrl);
  const value = tab === "sub" ? subLink : links[index] || "";

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent mx={3}>
        <ModalHeader pr={12}>
          <VStack align="flex-start" spacing="2px">
            <Text fontSize="17px" fontWeight={700}>
              {t("qrcodeDialog.title")}
              {sharing && (
                <Text as="span" fontFamily="mono" fontWeight={600}>
                  {" "}
                  {sharing.username}
                </Text>
              )}
            </Text>
            <Text fontSize="12px" fontWeight={400} color="text-muted">
              {t("qrcodeDialog.help")}
            </Text>
          </VStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody display="flex" flexDirection="column" gap={4}>
          {subscribeUrl && links.length > 0 && (
            <Flex role="tablist" bg="chakra-subtle-bg" borderRadius="9px" p="3px" gap="2px">
              {(["sub", "links"] as const).map((k) => (
                <Button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  flex={1}
                  h="32px"
                  variant="unstyled"
                  fontSize="13px"
                  fontWeight={500}
                  borderRadius="7px"
                  bg={tab === k ? "surface" : "transparent"}
                  boxShadow={tab === k ? "0 1px 2px rgba(16,24,40,.12)" : "none"}
                  onClick={() => setTab(k)}
                >
                  {k === "sub" ? t("qrcodeDialog.subscription") : t("qrcodeDialog.singleLinks", { count: links.length })}
                </Button>
              ))}
            </Flex>
          )}
          <Flex gap={4} align="center" direction={{ base: "column", sm: "row" }}>
            <Box ref={qrBox} p={2} bg="white" borderRadius="md" borderWidth="1px" borderColor="border" flex="none">
              <QRCode size={168} level="L" includeMargin={false} value={value} />
            </Box>
            <VStack align="stretch" spacing={2} minW={0} flex={1} w="full">
              <Text fontSize="13px" fontWeight={600}>
                {tab === "sub" ? t("qrcodeDialog.sublink") : linkName(value)}
              </Text>
              <Box
                fontFamily="mono"
                fontSize="12px"
                bg="surface-subtle"
                borderWidth="1px"
                borderColor="border"
                borderRadius="md"
                px="10px"
                py={2}
                wordBreak="break-all"
                maxH="96px"
                overflowY="auto"
              >
                {value}
              </Box>
              <HStack spacing={2} flexWrap="wrap">
                <CopyButton text={value} label={tab === "sub" ? t("qrcodeDialog.copyLink") : t("qrcodeDialog.copyConfig")} primary />
                <Button size="sm" variant="outline" onClick={downloadQr}>
                  {t("qrcodeDialog.downloadQr")}
                </Button>
                {tab === "links" && links.length > 1 && (
                  <HStack spacing={1} ml="auto">
                    <IconButton size="sm" variant="outline" aria-label={t("previous")} icon={<Icons.prev />} isDisabled={index === 0} onClick={() => setIndex(index - 1)} />
                    <Text fontSize="13px" color="text-muted" minW="44px" textAlign="center">
                      {index + 1} / {links.length}
                    </Text>
                    <IconButton size="sm" variant="outline" aria-label={t("next")} icon={<Icons.next />} isDisabled={index === links.length - 1} onClick={() => setIndex(index + 1)} />
                  </HStack>
                )}
              </HStack>
            </VStack>
          </Flex>
          {tab === "sub" && links.length > 0 && (
            <VStack align="stretch" spacing={0}>
              <Text fontSize="11px" fontWeight={600} letterSpacing=".05em" textTransform="uppercase" color="text-muted" pb={1}>
                {t("qrcodeDialog.includes", { count: links.length })}
              </Text>
              {links.map((l, i) => (
                <Text key={i} fontFamily="mono" fontSize="12px" py="6px" borderBottomWidth={i === links.length - 1 ? 0 : "1px"} borderColor="border-subtle" noOfLines={1}>
                  {linkName(l)}
                </Text>
              ))}
            </VStack>
          )}
        </ModalBody>
        <ModalFooter justifyContent="space-between">
          {sharing ? (
            <Button variant="ghost" colorScheme="red" onClick={() => {
              const user = sharing;
              onClose();
              useDashboard.setState({ revokeSubscriptionUser: user });
            }}>
              {t("qrcodeDialog.revoke")}
            </Button>
          ) : <span />}
          <Button variant="outline" onClick={onClose}>
            {t("qrcodeDialog.done")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
