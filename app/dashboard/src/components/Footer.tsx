import { BoxProps, HStack, Link, Text } from "@chakra-ui/react";
import { REPO_URL, UPSTREAM_URL } from "constants/Project";
import { useDashboard } from "contexts/DashboardContext";
import { FC } from "react";

export const Footer: FC<BoxProps> = (props) => {
  const { version } = useDashboard();
  return (
    <HStack w="full" py="0" position="relative" {...props}>
      <Text
        display="inline-block"
        flexGrow={1}
        textAlign="center"
        color="gray.500"
        fontSize="xs"
      >
        <Link color="blue.400" href={REPO_URL} isExternal>
          MarzbanV2
        </Link>
        {version ? ` v${version}` : ""} · based on{" "}
        <Link color="blue.400" href={UPSTREAM_URL} isExternal>
          Marzban by Gozargah
        </Link>
      </Text>
    </HStack>
  );
};
