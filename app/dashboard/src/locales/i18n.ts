import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";

declare module "i18next" {
  interface CustomTypeOptions {
    returnNull: false;
  }
}

i18n.use(initReactI18next).init({
  debug: import.meta.env.DEV,
  lng: "en",
  fallbackLng: "en",
  returnNull: false,
  resources: { en: { translation: en } },
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
