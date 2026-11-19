import { Flex } from "@chakra-ui/react";
import { FC, PropsWithChildren } from "react";

export type IconType = {
  color: string;
};

const TONES: Record<string, [string, string]> = {
  red: ["danger-bg", "danger-fg"],
  orange: ["warning-bg", "warning-fg"],
  yellow: ["warning-bg", "warning-fg"],
  green: ["success-bg", "success-fg"],
  purple: ["hold-bg", "hold-fg"],
  primary: ["accent-soft", "accent-text"],
  blue: ["accent-soft", "accent-text"],
};

/** The round tinted icon at the top of dialogs. */
export const Icon: FC<PropsWithChildren<IconType>> = ({ children, color }) => {
  const [bg, fg] = TONES[color] || ["neutral-bg", "neutral-fg"];
  return (
    <Flex
      w="40px"
      h="40px"
      borderRadius="full"
      bg={bg}
      color={fg}
      align="center"
      justify="center"
      flex="none"
      sx={{ "& svg": { color: "currentColor", width: "20px", height: "20px" } }}
    >
      {children}
    </Flex>
  );
};
