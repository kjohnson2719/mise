import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "./locales/en.json"

// Every word the app shows comes from a locale file, so Merran can be
// translated. English is the only language so far.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  // React already escapes what it renders.
  interpolation: { escapeValue: false },
})

// Makes t("…") check its keys against the English file: a missing string is
// a type error.
declare module "i18next" {
  interface CustomTypeOptions {
    resources: { translation: typeof en }
  }
}

export default i18n
