import {
  Alert,
  AlertDescription,
  AlertIcon,
  Button,
  chakra,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Heading,
  HStack,
  IconButton,
  Input as ChakraInput,
  InputGroup,
  InputRightElement,
  Text,
  VStack,
} from "@chakra-ui/react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import { FC, useEffect, useState } from "react";
import { FieldValues, useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Footer } from "components/Footer";
import { fetch } from "service/http";
import { removeAuthToken, setAuthToken } from "utils/authStorage";
import Logo from "assets/logo.svg?react";
import { useTranslation } from "react-i18next";

const schema = z.object({
  username: z.string().min(1, "login.fieldRequired"),
  password: z.string().min(1, "login.fieldRequired"),
});

export const LogoIcon = chakra(Logo, {
  baseStyle: {
    w: 12,
    h: 12,
  },
});

const ShowIcon = chakra(EyeIcon, { baseStyle: { w: "18px", h: "18px" } });
const HideIcon = chakra(EyeSlashIcon, { baseStyle: { w: "18px", h: "18px" } });

export const Login: FC = () => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  let location = useLocation();
  const {
    register,
    formState: { errors },
    handleSubmit,
  } = useForm({
    resolver: zodResolver(schema),
  });
  useEffect(() => {
    removeAuthToken();
    if (location.pathname !== "/login") {
      navigate("/login", { replace: true });
    }
  }, []);
  const login = (values: FieldValues) => {
    setError("");
    const formData = new FormData();
    formData.append("username", values.username);
    formData.append("password", values.password);
    formData.append("grant_type", "password");
    setLoading(true);
    fetch("/admin/token", { method: "post", body: formData })
      .then(({ access_token: token }) => {
        setAuthToken(token);
        navigate("/");
      })
      .catch((err) => {
        setError(err.response._data.detail);
      })
      .finally(setLoading.bind(null, false));
  };
  return (
    <Flex minH="100vh" wrap="wrap" bg="canvas">
      <Flex
        as="section"
        aria-label={t("login.about")}
        flex="1 1 420px"
        display={{ base: "none", md: "flex" }}
        direction="column"
        gap={8}
        bg="#111827"
        color="#E5E7EB"
        px={14}
        py={12}
        _dark={{ bg: "#111A2B", borderRightWidth: "1px", borderColor: "border" }}
      >
        <HStack spacing={3}>
          <Flex w="36px" h="36px" borderRadius="9px" bg="white" color="#111827" align="center" justify="center">
            <LogoIcon w="22px" h="22px" />
          </Flex>
          <Text fontWeight={700} fontSize="17px" color="white">
            Marzallow
          </Text>
        </HStack>
        <VStack align="flex-start" spacing={3} mt="auto" maxW="440px">
          <Heading as="h2" fontSize="32px" lineHeight="1.15" fontWeight={700} letterSpacing="-.02em" color="white">
            {t("login.tagline")}
          </Heading>
          <Text color="#B4BCC8" fontSize="15px">
            {t("login.pitch")}
          </Text>
        </VStack>
        <Footer textAlign="left" color="#B4BCC8" sx={{ a: { color: "#8AABF6" } }} />
      </Flex>

      <Flex as="section" aria-labelledby="login-title" flex="1 1 420px" align="center" justify="center" px={6} py={12}>
        <VStack as="form" onSubmit={handleSubmit(login)} w="full" maxW="380px" align="stretch" spacing={5} noValidate>
          <HStack spacing={3} display={{ base: "flex", md: "none" }}>
            <Flex w="36px" h="36px" borderRadius="9px" bg="inverse" color="inverse-text" align="center" justify="center">
              <LogoIcon w="22px" h="22px" />
            </Flex>
            <Text fontWeight={700} fontSize="17px">
              Marzallow
            </Text>
          </HStack>
          <VStack align="flex-start" spacing={1}>
            <Heading as="h1" id="login-title" fontSize="26px" fontWeight={700} letterSpacing="-.01em">
              {t("login.title")}
            </Heading>
            <Text color="text-muted">{t("login.welcomeBack")}</Text>
          </VStack>
          {error && (
            <Alert status="error">
              <AlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FormControl isInvalid={!!errors.username}>
            <FormLabel htmlFor="login-username">{t("username")}</FormLabel>
            <ChakraInput id="login-username" size="lg" autoComplete="username" autoFocus {...register("username")} />
            <FormErrorMessage>{t(errors?.username?.message as string)}</FormErrorMessage>
          </FormControl>
          <FormControl isInvalid={!!errors.password}>
            <FormLabel htmlFor="login-password">{t("password")}</FormLabel>
            <InputGroup size="lg">
              <ChakraInput
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                pr="52px"
                {...register("password")}
              />
              <InputRightElement>
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                  icon={showPassword ? <HideIcon /> : <ShowIcon />}
                  onClick={() => setShowPassword(!showPassword)}
                />
              </InputRightElement>
            </InputGroup>
            <FormErrorMessage>{t(errors?.password?.message as string)}</FormErrorMessage>
          </FormControl>
          <Button isLoading={loading} type="submit" size="lg" colorScheme="primary" w="full">
            {t("login.submit")}
          </Button>
          <Text fontSize="12px" color="text-muted">
            {t("login.forgot")}{" "}
            <Text as="span" fontFamily="mono">
              marzallow-cli admin update
            </Text>
            .
          </Text>
          <Footer display={{ base: "block", md: "none" }} pt={6} />
        </VStack>
      </Flex>
    </Flex>
  );
};

export default Login;
