import { lazy, Suspense } from "react";
import { createHashRouter } from "react-router-dom";
import { fetch } from "../service/http";
import { getAuthToken } from "../utils/authStorage";
import { Login } from "./Login";

// The dashboard (tables, dialogs, charts, editor) is only needed after login.
const Dashboard = lazy(() => import("./Dashboard"));

const fetchAdminLoader = () => {
  return fetch("/admin", {
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });
};

export const router = createHashRouter([
  {
    path: "/",
    element: (
      <Suspense fallback={null}>
        <Dashboard />
      </Suspense>
    ),
    errorElement: <Login />,
    loader: fetchAdminLoader,
  },
  {
    path: "/login/",
    element: <Login />,
  },
]);
