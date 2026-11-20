import { useQuery } from "@tanstack/react-query";
import { fetch } from "service/http";
import { TemplateKind, TemplateKindInfo } from "types/SubscriptionTemplate";

export const SubTemplatesQueryKey = ["subscription-templates"];

/** All subscription templates by format (sudo admins only). */
export const useSubTemplates = (enabled = true) =>
  useQuery({
    queryKey: SubTemplatesQueryKey,
    queryFn: () => fetch<TemplateKindInfo[]>("/subscription-templates"),
    enabled,
    staleTime: 30_000,
  });

export const kindInfo = (kinds: TemplateKindInfo[] | undefined, kind: TemplateKind) =>
  kinds?.find((k) => k.kind === kind);

/** Name shown for "no template chosen": the default for that format. */
export const defaultName = (kinds: TemplateKindInfo[] | undefined, kind: TemplateKind) => {
  const info = kindInfo(kinds, kind);
  const own = info?.templates.find((t) => t.is_default);
  if (own) return own.name;
  return info?.builtin.source === "file" ? "File" : "Built-in";
};
