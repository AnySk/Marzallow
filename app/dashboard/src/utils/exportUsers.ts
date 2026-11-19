import dayjs from "dayjs";
import { FilterType } from "contexts/DashboardContext";
import { fetch } from "service/http";
import { User } from "types/User";

const GB = 1024 ** 3;

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? "" : String(value);
  // Quote everything and neutralise spreadsheet formulas. Spreadsheets skip
  // leading whitespace/control characters, so check after them too.
  const safe = /^[\s\u0000-\u001f]*[=+\-@|]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Download all users matching the current filters (every page) as CSV. */
export const exportUsersCsv = async (filters: FilterType) => {
  const query: Record<string, unknown> = { ...filters };
  delete query.limit;
  delete query.offset;
  for (const key in query) if (query[key] === undefined || query[key] === "") delete query[key];
  const { users } = await fetch<{ users: User[] }>("/users", { query });

  const header = [
    "username", "status", "used_gb", "data_limit_gb", "expire", "online_at",
    "owner", "note", "subscription_url",
  ];
  const rows = users.map((u) => [
    u.username,
    u.status,
    (u.used_traffic / GB).toFixed(3),
    u.data_limit ? (u.data_limit / GB).toFixed(3) : "",
    u.expire ? dayjs.unix(u.expire).utc().format("YYYY-MM-DD HH:mm") : "",
    u.online_at ? dayjs.utc(u.online_at).format("YYYY-MM-DD HH:mm") : "",
    u.admin?.username || "",
    u.note || "",
    u.subscription_url,
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `users-${dayjs().format("YYYY-MM-DD")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  return users.length;
};
