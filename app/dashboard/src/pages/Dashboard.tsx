import { Box, VStack } from "@chakra-ui/react";
import { AlertsBar } from "components/AlertsBar";
import { BulkActionsBar } from "components/BulkActionsBar";
import { DeleteUserModal } from "components/DeleteUserModal";
import { Filters } from "components/Filters";
import { Footer } from "components/Footer";
import { Header } from "components/Header";
import { QRCodeDialog } from "components/QRCodeDialog";
import { ResetAllUsageModal } from "components/ResetAllUsageModal";
import { ResetUserUsageModal } from "components/ResetUserUsageModal";
import { RevokeSubscriptionModal } from "components/RevokeSubscriptionModal";
import { UserDialog } from "components/UserDialog";
import { UsersTable } from "components/UsersTable";
import { fetchInbounds, useDashboard } from "contexts/DashboardContext";
import { FC, lazy, Suspense, useEffect } from "react";
import { Statistics } from "../components/Statistics";

// Heavy, rarely-opened dialogs (JSON editor, charts) load as separate chunks.
const CoreSettingsModal = lazy(() =>
  import("components/CoreSettingsModal").then((m) => ({ default: m.CoreSettingsModal }))
);
const HostsDialog = lazy(() =>
  import("components/HostsDialog").then((m) => ({ default: m.HostsDialog }))
);
const NodesDialog = lazy(() =>
  import("components/NodesModal").then((m) => ({ default: m.NodesDialog }))
);
const AdminsModal = lazy(() =>
  import("components/AdminsModal").then((m) => ({ default: m.AdminsModal }))
);
const TemplatesModal = lazy(() =>
  import("components/TemplatesModal").then((m) => ({ default: m.TemplatesModal }))
);
const SettingsModal = lazy(() =>
  import("components/SettingsModal").then((m) => ({ default: m.SettingsModal }))
);
const AnalyticsModal = lazy(() =>
  import("components/AnalyticsModal").then((m) => ({ default: m.AnalyticsModal }))
);
const ExpiredCleanupModal = lazy(() =>
  import("components/ExpiredCleanupModal").then((m) => ({ default: m.ExpiredCleanupModal }))
);
const NodesUsage = lazy(() =>
  import("components/NodesUsage").then((m) => ({ default: m.NodesUsage }))
);

export const Dashboard: FC = () => {
  useEffect(() => {
    useDashboard.getState().refetchUsers();
    fetchInbounds();
  }, []);
  return (
    <VStack justifyContent="space-between" minH="100vh" p="6" rowGap={4}>
      <Box w="full">
        <Header />
        <Statistics mt="4" />
        <AlertsBar />
        <Filters />
        <UsersTable />
        <BulkActionsBar />
        <UserDialog />
        <DeleteUserModal />
        <QRCodeDialog />
        <ResetUserUsageModal />
        <RevokeSubscriptionModal />
        <ResetAllUsageModal />
        <Suspense fallback={null}>
          <HostsDialog />
          <NodesDialog />
          <NodesUsage />
          <CoreSettingsModal />
          <AdminsModal />
          <TemplatesModal />
          <AnalyticsModal />
          <ExpiredCleanupModal />
          <SettingsModal />
        </Suspense>
      </Box>
      <Footer />
    </VStack>
  );
};

export default Dashboard;
