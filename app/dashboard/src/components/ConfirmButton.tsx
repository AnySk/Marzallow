import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogOverlay,
  Button,
  ButtonProps,
  useDisclosure,
} from "@chakra-ui/react";
import { FC, ReactNode, useRef } from "react";
import { useTranslation } from "react-i18next";

type ConfirmButtonProps = ButtonProps & {
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
};

/**
 * A button that asks for confirmation before acting. Uses an AlertDialog,
 * which stacks correctly on top of other modals (a popover inside a modal
 * could have its clicks swallowed by the modal's backdrop).
 */
export const ConfirmButton: FC<ConfirmButtonProps> = ({
  message,
  confirmLabel,
  onConfirm,
  colorScheme = "red",
  children,
  ...props
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation();
  return (
    <>
      <Button colorScheme={colorScheme} {...props} onClick={onOpen}>
        {children}
      </Button>
      <AlertDialog
        isOpen={isOpen}
        leastDestructiveRef={cancelRef}
        onClose={onClose}
        isCentered
        size="sm"
      >
        <AlertDialogOverlay bg="blackAlpha.300">
          <AlertDialogContent mx={3}>
            <AlertDialogBody pt={5} fontSize="sm">
              {message}
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} size="sm" variant="ghost" onClick={onClose}>
                {t("cancel")}
              </Button>
              <Button
                size="sm"
                colorScheme={colorScheme}
                onClick={() => {
                  onClose();
                  onConfirm();
                }}
              >
                {confirmLabel || t("confirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  );
};
