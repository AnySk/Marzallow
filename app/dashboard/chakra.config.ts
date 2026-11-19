import { extendTheme, type ThemeConfig } from "@chakra-ui/react";

/*
 * Marzallow design tokens (see the "Foundations" board of the design canvas).
 *
 * Calm and dense: one accent colour, flat cards with hairline borders, shadows
 * only on things that float (dialogs, menus, popovers). Dark mode has its own
 * picks from the same scale rather than an inverted light theme.
 *
 * Components use the semantic tokens below (surface, border, text-muted, …),
 * so they follow the colour mode without per-component _dark overrides.
 */

const config: ThemeConfig = { initialColorMode: "light", useSystemColorMode: false };

const v = (light: string, dark: string) => ({ default: light, _dark: dark });

export const theme = extendTheme({
  config,
  fonts: {
    body: `Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Ubuntu,"Helvetica Neue",sans-serif`,
    heading: `Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Ubuntu,"Helvetica Neue",sans-serif`,
    mono: `"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`,
  },
  fontSizes: { xs: "12px", sm: "13px", md: "14px", lg: "16px", xl: "18px", "2xl": "24px", "3xl": "28px" },
  radii: { sm: "6px", md: "8px", lg: "12px", xl: "14px" },
  shadows: {
    outline: "0 0 0 3px var(--chakra-colors-focus-ring)",
    float: "0 12px 32px -8px rgba(16, 24, 40, 0.18), 0 4px 8px -4px rgba(16, 24, 40, 0.08)",
  },
  colors: {
    primary: {
      50: "#EAF0FD",
      100: "#D3E0FB",
      200: "#A9C1F6",
      300: "#8AABF6",
      400: "#6E95F2",
      500: "#2454D3",
      600: "#1E46B3",
      700: "#1A3FA6",
      800: "#163386",
      900: "#10266A",
    },
    gray: {
      50: "#F6F7F9",
      100: "#F0F2F5",
      200: "#E4E7EC",
      300: "#D0D5DD",
      400: "#98A2B3",
      500: "#5F6B7A",
      600: "#4B5563",
      700: "#374151",
      750: "#1F2937",
      800: "#1F2937",
      900: "#111827",
    },
    // status colours (always paired with a label or icon)
    green: { 50: "#E5F5EE", 100: "#C9EBDC", 400: "#5CD6A0", 500: "#16A06C", 600: "#0F7A4F", 700: "#0B5E3D", 900: "#0F2E22" },
    orange: { 50: "#FDF1E4", 100: "#F8D9B8", 400: "#F6B26B", 500: "#E8892E", 600: "#A44B05", 700: "#7A3A04", 900: "#3A2A12" },
    red: { 50: "#FDECEA", 100: "#F6C7C1", 400: "#FF8A80", 500: "#D92D20", 600: "#B42318", 700: "#8A1C12", 900: "#3B1717" },
    purple: { 50: "#F0ECFD", 100: "#DDD3FC", 400: "#B4A2FF", 500: "#7A5AF8", 600: "#5B3FC4", 700: "#46309A", 900: "#2A2150" },
  },
  semanticTokens: {
    colors: {
      "chakra-body-bg": v("#F6F7F9", "#0B1220"),
      "chakra-body-text": v("#111827", "#E5E7EB"),
      "chakra-border-color": v("#E4E7EC", "#243049"),
      "chakra-placeholder-color": v("#98A2B3", "#6B7891"),
      "chakra-subtle-bg": v("#F0F2F5", "#18233A"),
      // surfaces
      canvas: v("#F6F7F9", "#0B1220"),
      surface: v("#FFFFFF", "#111A2B"),
      "surface-subtle": v("#FAFBFC", "#0F1828"),
      "surface-hover": v("#F2F4F7", "#1A2438"),
      "surface-selected": v("#F5F8FF", "#142036"),
      // lines
      border: v("#E4E7EC", "#243049"),
      "border-subtle": v("#EEF0F3", "#1C2639"),
      "border-strong": v("#D0D5DD", "#33415E"),
      "light-border": v("#E4E7EC", "#243049"), // legacy name used across components
      // text
      text: v("#111827", "#E5E7EB"),
      "text-2": v("#374151", "#C3CAD5"),
      "text-muted": v("#5F6B7A", "#9AA4B2"),
      // accent
      accent: v("#2454D3", "#6E95F2"),
      "accent-hover": v("#1A3FA6", "#8AABF6"),
      "accent-soft": v("#EAF0FD", "#1B2A4A"),
      "accent-text": v("#1E46B3", "#A9C1FF"),
      link: v("#2454D3", "#8AABF6"),
      "focus-ring": v("rgba(36, 84, 211, 0.25)", "rgba(110, 149, 242, 0.35)"),
      // inverse (selected tab, logo tile)
      inverse: v("#111827", "#E5E7EB"),
      "inverse-text": v("#FFFFFF", "#0B1220"),
      // status: soft background + strong text, used by badges and alerts
      "success-bg": v("#E5F5EE", "#0F2E22"),
      "success-fg": v("#0F7A4F", "#5CD6A0"),
      "success-dot": v("#16A06C", "#3CC48A"),
      "warning-bg": v("#FDF1E4", "#3A2A12"),
      "warning-fg": v("#A44B05", "#F6B26B"),
      "warning-border": v("#F8D9B8", "#5A4220"),
      "warning-dot": v("#E8892E", "#F0A04B"),
      "danger-bg": v("#FDECEA", "#3B1717"),
      "danger-fg": v("#B42318", "#FF8A80"),
      "danger-border": v("#F6C7C1", "#6B2A26"),
      "danger-dot": v("#D92D20", "#F2665C"),
      "neutral-bg": v("#F0F2F5", "#1E293B"),
      "neutral-fg": v("#4B5563", "#AEB6C2"),
      "neutral-dot": v("#98A2B3", "#5B6880"),
      "hold-bg": v("#F0ECFD", "#2A2150"),
      "hold-fg": v("#5B3FC4", "#B4A2FF"),
      "hold-dot": v("#7A5AF8", "#9B85FF"),
      "bar-track": v("#EEF0F3", "#1A2438"),
    },
  },
  styles: {
    global: {
      "html, body": {
        bg: "canvas",
        color: "text",
        fontSize: "14px",
        lineHeight: 1.45,
        fontFeatureSettings: '"cv11", "ss01"',
        WebkitFontSmoothing: "antialiased",
      },
      a: { color: "link" },
      "::selection": { bg: "accent-soft" },
    },
  },
  components: {
    Button: {
      baseStyle: { fontWeight: 500, borderRadius: "md", gap: 2, _focusVisible: { boxShadow: "outline" } },
      sizes: {
        xs: { h: "26px", minW: "26px", px: 2, fontSize: "12px" },
        sm: { h: "30px", minW: "30px", px: "10px", fontSize: "13px" },
        md: { h: "36px", minW: "36px", px: "14px", fontSize: "14px" },
        lg: { h: "44px", minW: "44px", px: "18px", fontSize: "15px" },
      },
      variants: {
        solid: (props: { colorScheme: string }) => {
          const c = props.colorScheme;
          if (c === "primary" || c === "blue")
            return {
              bg: "primary.500",
              color: "white",
              _hover: { bg: "primary.700", _disabled: { bg: "primary.500" } },
              _active: { bg: "primary.800" },
            };
          if (c === "red")
            return {
              bg: "red.600",
              color: "white",
              _hover: { bg: "red.700", _disabled: { bg: "red.600" } },
              _active: { bg: "red.700" },
            };
          if (c === "gray")
            return {
              bg: "surface",
              color: "text",
              border: "1px solid",
              borderColor: "border-strong",
              _hover: { bg: "surface-hover" },
              _active: { bg: "surface-hover" },
            };
          return {};
        },
        outline: (props: { colorScheme: string }) => ({
          bg: "surface",
          borderColor: props.colorScheme === "red" ? "danger-border" : "border-strong",
          color: props.colorScheme === "red" ? "danger-fg" : props.colorScheme === "primary" ? "accent-text" : "text",
          _hover: { bg: "surface-hover" },
          _active: { bg: "surface-hover" },
        }),
        ghost: (props: { colorScheme: string }) => ({
          color: props.colorScheme === "red" ? "danger-fg" : props.colorScheme === "primary" ? "accent-text" : "text-2",
          _hover: { bg: "surface-hover", color: props.colorScheme === "red" ? "danger-fg" : "text" },
          _active: { bg: "surface-hover" },
        }),
      },
      defaultProps: { variant: "solid", colorScheme: "gray", size: "md" },
    },
    Input: {
      sizes: {
        sm: { field: { h: "30px", fontSize: "13px", borderRadius: "md" }, addon: { h: "30px", borderRadius: "md" } },
        md: { field: { h: "36px", fontSize: "14px", borderRadius: "md", px: 3 }, addon: { h: "36px", borderRadius: "md" } },
        lg: { field: { h: "44px", fontSize: "15px", borderRadius: "md" }, addon: { h: "44px", borderRadius: "md" } },
      },
      variants: {
        outline: {
          field: {
            bg: "surface",
            borderColor: "border-strong",
            _hover: { borderColor: "gray.400" },
            _focusVisible: { borderColor: "accent", boxShadow: "outline", zIndex: 1 },
            _invalid: { borderColor: "danger-dot", boxShadow: "none" },
            _disabled: { bg: "surface-subtle", color: "text-muted", opacity: 1, cursor: "not-allowed" },
            _placeholder: { color: "chakra-placeholder-color" },
          },
          addon: { bg: "surface-subtle", borderColor: "border-strong", color: "text-muted", fontSize: "13px" },
        },
      },
      defaultProps: { size: "md", variant: "outline" },
    },
    NumberInput: {
      variants: {
        outline: {
          field: {
            bg: "surface",
            borderColor: "border-strong",
            borderRadius: "md",
            _focusVisible: { borderColor: "accent", boxShadow: "outline" },
          },
        },
      },
    },
    Textarea: {
      variants: {
        outline: {
          bg: "surface",
          borderColor: "border-strong",
          borderRadius: "md",
          _hover: { borderColor: "gray.400" },
          _focusVisible: { borderColor: "accent", boxShadow: "outline" },
          _placeholder: { color: "chakra-placeholder-color" },
        },
      },
    },
    Select: {
      sizes: {
        sm: { field: { h: "30px", fontSize: "13px", borderRadius: "md" } },
        md: { field: { h: "36px", fontSize: "14px", borderRadius: "md" } },
      },
      variants: {
        outline: {
          field: {
            bg: "surface",
            borderColor: "border-strong",
            _hover: { borderColor: "gray.400" },
            _focusVisible: { borderColor: "accent", boxShadow: "outline" },
          },
        },
      },
    },
    FormLabel: {
      baseStyle: { fontSize: "13px", fontWeight: 600, mb: "6px", color: "text" },
    },
    FormHelperText: { baseStyle: { fontSize: "12px" } },
    Form: { baseStyle: { helperText: { fontSize: "12px", color: "text-muted", mt: "6px" } } },
    FormError: { baseStyle: { text: { fontSize: "12px", color: "danger-fg", mt: "6px" } } },
    Checkbox: {
      baseStyle: {
        control: {
          borderRadius: "4px",
          borderWidth: "1.5px",
          borderColor: "gray.400",
          bg: "surface",
          _checked: { bg: "primary.500", borderColor: "primary.500", _hover: { bg: "primary.700", borderColor: "primary.700" } },
          _indeterminate: { bg: "primary.500", borderColor: "primary.500" },
          _focusVisible: { boxShadow: "outline" },
        },
      },
    },
    Switch: {
      baseStyle: {
        track: {
          bg: "gray.300",
          _checked: { bg: "primary.500" },
          _dark: { bg: "#33415E", _checked: { bg: "primary.500" } },
        },
      },
    },
    Badge: {
      baseStyle: { borderRadius: "full", textTransform: "none", fontWeight: 600, fontSize: "12px", px: 2 },
    },
    Tag: {
      baseStyle: { container: { borderRadius: "md", fontWeight: 500 } },
    },
    Card: {
      baseStyle: {
        container: { bg: "surface", borderWidth: "1px", borderColor: "border", borderRadius: "lg", boxShadow: "none" },
      },
    },
    Modal: {
      baseStyle: {
        overlay: { bg: "rgba(17, 24, 39, 0.45)", _dark: { bg: "rgba(3, 7, 18, 0.7)" } },
        dialog: { bg: "surface", borderRadius: "xl", boxShadow: "float", borderWidth: "1px", borderColor: "border" },
        header: { fontSize: "16px", fontWeight: 650, pt: 5, pb: 3 },
        closeButton: { borderRadius: "md", top: 4, insetEnd: 4 },
        footer: { gap: 2, borderTopWidth: "1px", borderColor: "border-subtle", mt: 2 },
      },
    },
    Drawer: {
      baseStyle: { dialog: { bg: "surface" } },
    },
    Menu: {
      baseStyle: {
        list: { bg: "surface", borderColor: "border", borderRadius: "lg", boxShadow: "float", py: 1, minW: "200px" },
        item: {
          bg: "surface",
          fontSize: "14px",
          px: 3,
          py: 2,
          gap: 1,
          _hover: { bg: "surface-hover" },
          _focus: { bg: "surface-hover" },
        },
        divider: { borderColor: "border-subtle" },
      },
    },
    Popover: {
      baseStyle: {
        content: { bg: "surface", borderColor: "border", borderRadius: "lg", boxShadow: "float" },
      },
    },
    Tooltip: {
      baseStyle: { bg: "inverse", color: "inverse-text", borderRadius: "md", fontSize: "12px", px: 2, py: 1 },
    },
    Alert: {
      baseStyle: { container: { borderRadius: "lg", fontSize: "13px", borderWidth: "1px" } },
      variants: {
        subtle: (props: { colorScheme: string }) => {
          const map: Record<string, [string, string, string]> = {
            blue: ["accent-soft", "accent-text", "primary.100"],
            primary: ["accent-soft", "accent-text", "primary.100"],
            green: ["success-bg", "success-fg", "green.100"],
            orange: ["warning-bg", "warning-fg", "warning-border"],
            yellow: ["warning-bg", "warning-fg", "warning-border"],
            red: ["danger-bg", "danger-fg", "danger-border"],
          };
          const [bg, fg, border] = map[props.colorScheme] || map.blue;
          return {
            container: { bg, color: fg, borderColor: border, _dark: { borderColor: "transparent" } },
            icon: { color: fg },
          };
        },
      },
    },
    Tabs: {
      variants: {
        line: {
          tablist: { borderBottom: "1px solid", borderColor: "border" },
          tab: {
            fontWeight: 500,
            fontSize: "14px",
            color: "text-muted",
            _selected: { color: "accent-text", borderColor: "accent" },
            _hover: { color: "text" },
          },
        },
      },
    },
    Divider: { baseStyle: { borderColor: "border" } },
    Skeleton: {
      baseStyle: { borderRadius: "md" },
    },
    Table: {
      baseStyle: {
        table: { borderCollapse: "separate", borderSpacing: 0, fontVariantNumeric: "tabular-nums" },
        th: {
          fontFamily: "body",
          textTransform: "none",
          letterSpacing: "normal",
          fontSize: "12px",
          fontWeight: 600,
          color: "text-muted",
          bg: "surface-subtle",
          borderBottom: "1px solid",
          borderColor: "border",
          whiteSpace: "nowrap",
        },
        td: { borderBottom: "1px solid", borderColor: "border-subtle", verticalAlign: "middle" },
        tr: {
          "&.interactive": {
            cursor: "pointer",
            _hover: { "& > td": { bg: "surface-hover" } },
          },
          "&.selected > td": { bg: "surface-selected" },
          _last: { "& > td": { borderBottom: 0 } },
        },
      },
      sizes: {
        md: {
          th: { px: 4, py: "10px", lineHeight: 1.4, fontSize: "12px" },
          td: { px: 4, py: 3, lineHeight: 1.45, fontSize: "14px" },
        },
        sm: {
          th: { px: 3, py: 2, fontSize: "12px" },
          td: { px: 3, py: 2, fontSize: "13px" },
        },
      },
      variants: { simple: { th: { borderColor: "border" }, td: { borderColor: "border-subtle" } } },
    },
  },
});
