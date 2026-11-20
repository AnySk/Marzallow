export type TemplateKind = "v2ray_json" | "singbox" | "clash" | "subscription_page";

export type TemplateUsage = { users: number; hosts: number; user_templates: number };

export type SubTemplateInfo = {
  id: number;
  kind: TemplateKind;
  name: string;
  description: string | null;
  is_default: boolean;
  updated_at: string | null;
  updated_by: string | null;
  usage: TemplateUsage;
};

export type SubTemplateDetail = SubTemplateInfo & { content: string };

export type TemplateKindInfo = {
  kind: TemplateKind;
  label: string;
  syntax: "json" | "yaml" | "html";
  builtin: { source: "built-in" | "file"; path: string; is_default: boolean };
  templates: SubTemplateInfo[];
};

export type ValidateResult = { ok: boolean; message: string; line: number | null };

/** user / user-template fields that pick a template per format */
export const USER_TEMPLATE_FIELDS = {
  v2ray_json: "v2ray_json_template_id",
  singbox: "singbox_template_id",
  clash: "clash_template_id",
} as const;

export type UserTemplateRefs = {
  v2ray_json_template_id?: number | null;
  singbox_template_id?: number | null;
  clash_template_id?: number | null;
};
