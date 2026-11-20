import { lazy, Suspense } from "react";
import { createHashRouter } from "react-router-dom";
import { fetch } from "../service/http";
import { getAuthToken } from "../utils/authStorage";
import { Login } from "./Login";

// The dashboard (tables, dialogs, charts, editor) is only needed after login.
const Dashboard = lazy(() => import("./Dashboard"));
const UsersPage = lazy(() => import("./UsersPage"));
const HostsPage = lazy(() => import("components/HostsDialog"));
const NodesPage = lazy(() => import("components/NodesModal"));
const CorePage = lazy(() => import("components/CoreSettingsModal"));
const SettingsPage = lazy(() => import("components/SettingsModal"));
const TemplatesPage = lazy(() => import("components/TemplatesModal"));
const SubTemplatesPage = lazy(() => import("components/SubscriptionTemplatesModal"));
const AdminsPage = lazy(() => import("components/AdminsModal"));
const AnalyticsPage = lazy(() => import("components/AnalyticsModal"));
const AccessPage = lazy(() => import("components/AccessListsPage"));

const fetchAdminLoader = () => {
  return fetch("/admin", {
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });
};

const page = (Element: React.ComponentType) => (
  <Suspense fallback={null}>
    <Element />
  </Suspense>
);

export const router = createHashRouter([
  {
    path: "/",
    element: page(Dashboard),
    errorElement: <Login />,
    loader: fetchAdminLoader,
    children: [
      { index: true, element: page(UsersPage) },
      { path: "hosts", element: page(HostsPage) },
      { path: "nodes", element: page(NodesPage) },
      { path: "core", element: page(CorePage) },
      { path: "settings", element: page(SettingsPage) },
      { path: "templates", element: page(TemplatesPage) },
      { path: "subscription-templates", element: page(SubTemplatesPage) },
      { path: "admins", element: page(AdminsPage) },
      { path: "analytics", element: page(AnalyticsPage) },
      { path: "access", element: page(AccessPage) },
    ],
  },
  {
    path: "/login/",
    element: <Login />,
  },
]);
