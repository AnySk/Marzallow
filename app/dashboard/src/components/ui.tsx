/*
 * Small building blocks of the Marzallow design (see chakra.config.ts for the
 * tokens): status pills, usage bars, protocol chips and flat cards.
 */
import { Box, BoxProps, Flex, Heading, HStack, Text, TextProps, VStack } from "@chakra-ui/react";
import { FC, ReactNode } from "react";

export type Tone = "success" | "warning" | "danger" | "neutral" | "hold" | "accent";

const toneTokens: Record<Tone, { bg: string; fg: string; dot: string }> = {
  success: { bg: "success-bg", fg: "success-fg", dot: "success-dot" },
  warning: { bg: "warning-bg", fg: "warning-fg", dot: "warning-dot" },
  danger: { bg: "danger-bg", fg: "danger-fg", dot: "danger-dot" },
  neutral: { bg: "neutral-bg", fg: "neutral-fg", dot: "neutral-dot" },
  hold: { bg: "hold-bg", fg: "hold-fg", dot: "hold-dot" },
  accent: { bg: "accent-soft", fg: "accent-text", dot: "accent" },
};

export const statusTone: Record<string, Tone> = {
  active: "success",
  connected: "success",
  limited: "warning",
  connecting: "warning",
  expired: "danger",
  error: "danger",
  disabled: "neutral",
  on_hold: "hold",
};

export const toneColor = (tone: Tone) => toneTokens[tone];

/** A status label: always a dot plus text, never colour alone. */
export const Pill: FC<{ tone: Tone; children: ReactNode } & BoxProps> = ({ tone, children, ...props }) => {
  const t = toneTokens[tone];
  return (
    <HStack
      as="span"
      display="inline-flex"
      spacing="6px"
      h="22px"
      px={2}
      borderRadius="full"
      bg={t.bg}
      color={t.fg}
      fontSize="12px"
      fontWeight={600}
      whiteSpace="nowrap"
      {...props}
    >
      <Box as="span" w="6px" h="6px" borderRadius="full" bg="currentColor" flex="none" />
      <span>{children}</span>
    </HStack>
  );
};

export const Dot: FC<{ color: string; title?: string } & BoxProps> = ({ color, title, ...props }) => (
  <Box as="span" display="inline-block" w="8px" h="8px" borderRadius="full" bg={color} flex="none" title={title} {...props} />
);

/** Usage thresholds from the design: < 80 % accent, 80–95 % orange, ≥ 95 % red. */
export const usageTone = (percent: number): { bar: string; text?: string } => {
  if (percent >= 95) return { bar: "danger-dot", text: "danger-fg" };
  if (percent >= 80) return { bar: "warning-dot", text: "warning-fg" };
  return { bar: "accent" };
};

export const Bar: FC<{ value: number; color?: string; h?: string } & BoxProps> = ({ value, color = "accent", h = "6px", ...props }) => (
  <Box h={h} borderRadius="3px" bg="bar-track" overflow="hidden" {...props}>
    <Box h="full" borderRadius="3px" bg={color} w={`${Math.max(0, Math.min(100, value))}%`} transition="width .3s ease" />
  </Box>
);

export const Chip: FC<{ children: ReactNode } & BoxProps> = ({ children, ...props }) => (
  <Box
    as="span"
    display="inline-flex"
    alignItems="center"
    h="20px"
    px="6px"
    borderRadius="5px"
    borderWidth="1px"
    borderColor="border"
    bg="surface-subtle"
    color="text-2"
    fontFamily="mono"
    fontSize="11px"
    fontWeight={500}
    whiteSpace="nowrap"
    {...props}
  >
    {children}
  </Box>
);

export const Panel: FC<BoxProps> = (props) => (
  <Box bg="surface" borderWidth="1px" borderColor="border" borderRadius="lg" {...props} />
);

export const Help: FC<TextProps> = (props) => <Text fontSize="12px" color="text-muted" {...props} />;

export const Muted: FC<TextProps> = (props) => <Text as="span" color="text-muted" {...props} />;

/** Title, one-line explanation and the page's actions (one primary at most). */
export const PageHeader: FC<{ title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; meta?: ReactNode }> = ({
  title,
  subtitle,
  actions,
  meta,
}) => (
  <Flex as="header" wrap="wrap" align="center" justify="space-between" gap={4}>
    <VStack align="flex-start" spacing="2px" minW={0}>
      <HStack spacing={3} flexWrap="wrap">
        <Heading as="h1" fontSize={{ base: "22px", md: "24px" }} fontWeight={700} letterSpacing="-.01em">
          {title}
        </Heading>
        {meta}
      </HStack>
      {subtitle && <Text color="text-muted">{subtitle}</Text>}
    </VStack>
    {actions && (
      <Flex gap="10px" align="center" wrap="wrap">
        {actions}
      </Flex>
    )}
  </Flex>
);
