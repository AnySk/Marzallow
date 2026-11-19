import { BoxProps, Link, Text } from "@chakra-ui/react";
import { REPO_URL, UPSTREAM_URL } from "constants/Project";
import { useDashboard } from "contexts/DashboardContext";
import { FC } from "react";

export const Footer: FC<BoxProps> = (props) => {
  const { version } = useDashboard();
  return (
    <Text as="footer" w="full" textAlign="center" color="text-muted" fontSize="12px" {...props}>
      <Link color="link" href={REPO_URL} isExternal>
        Marzallow
      </Link>
      {version ? ` v${version}` : ""} · based on{" "}
      <Link color="link" href={UPSTREAM_URL} isExternal>
        Marzban by Gozargah
      </Link>
    </Text>
  );
};
