import { UserInbounds } from "./User";

export type AdminInfo = {
  username: string;
  is_sudo: boolean;
  telegram_id?: number | null;
  discord_webhook?: string | null;
  users_usage?: number | null;
};

export type UserTemplate = {
  id: number;
  name: string | null;
  data_limit: number | null;
  expire_duration: number | null;
  username_prefix: string | null;
  username_suffix: string | null;
  inbounds: UserInbounds;
};

export type BulkAction =
  | "disable"
  | "enable"
  | "delete"
  | "reset_usage"
  | "revoke_sub"
  | "extend"
  | "add_data";

export type BulkResult = { done: string[]; skipped: Record<string, string> };

export type SystemAlerts = {
  expiring_soon: number;
  near_limit: number;
  limited: number;
  expired: number;
  disconnected_nodes: string[];
  days: number;
  percent: number;
};
