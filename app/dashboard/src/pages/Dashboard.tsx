import { AppShell } from "components/AppShell";
import { DeleteUserModal } from "components/DeleteUserModal";
import { QRCodeDialog } from "components/QRCodeDialog";
import { ResetAllUsageModal } from "components/ResetAllUsageModal";
import { ResetUserUsageModal } from "components/ResetUserUsageModal";
import { RevokeSubscriptionModal } from "components/RevokeSubscriptionModal";
import { UserDialog } from "components/UserDialog";
import { fetchInbounds, useDashboard } from "contexts/DashboardContext";
import { FC, lazy, Suspense, useEffect } from "react";
import { Outlet } from "react-router-dom";

const ExpiredCleanupModal = lazy(() =>
  import("components/ExpiredCleanupModal").then((m) => ({ default: m.ExpiredCleanupModal }))
);

/** The signed-in frame: sidebar, the current page, and dialogs any page can open. */
export const Dashboard: FC = () => {
  useEffect(() => {
    useDashboard.getState().refetchUsers();
    fetchInbounds();
  }, []);
  return (
    <AppShell>
      <Outlet />
      <UserDialog />
      <DeleteUserModal />
      <QRCodeDialog />
      <ResetUserUsageModal />
      <RevokeSubscriptionModal />
      <ResetAllUsageModal />
      <Suspense fallback={null}>
        <ExpiredCleanupModal />
      </Suspense>
    </AppShell>
  );
};

export default Dashboard;
