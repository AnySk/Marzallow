import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
} from "@chakra-ui/react";
import { FC, ReactNode, useRef } from "react";
import { useTranslation } from "react-i18next";

/** A confirmation step for actions that are hard to undo; open while `message` is set. */
export const ConfirmDialog: FC<{
  message?: ReactNode;
  title?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ message, title, confirmLabel, danger = true, isLoading, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog isOpen={!!message} leastDestructiveRef={cancelRef} onClose={onCancel} isCentered>
      <AlertDialogOverlay>
        <AlertDialogContent mx={3}>
          <AlertDialogHeader fontSize="17px">{title || t("confirm.title")}</AlertDialogHeader>
          <AlertDialogBody color="text-muted" fontSize="14px">
            {message}
          </AlertDialogBody>
          <AlertDialogFooter gap={2}>
            <Button ref={cancelRef} variant="outline" onClick={onCancel}>
              {t("cancel")}
            </Button>
            <Button colorScheme={danger ? "red" : "primary"} onClick={onConfirm} isLoading={isLoading}>
              {confirmLabel || t("confirm.yes")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
};
