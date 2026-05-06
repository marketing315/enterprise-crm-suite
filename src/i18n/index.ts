/**
 * H9 — i18next & SRI policy
 *
 * I bundle delle traduzioni sono importati staticamente (vedi sotto) e
 * compilati nel main bundle da Vite. NON usiamo `i18next-http-backend` né
 * un `loadPath` remoto: questo elimina la necessità di Subresource Integrity
 * per i locale, perché non vengono scaricati a runtime da una CDN esterna.
 *
 * Se in futuro si volesse caricare i locale da un CDN diverso dall'origin:
 *  1. Aggiungere `i18next-http-backend` con `loadPath` https://.
 *  2. Generare SRI hash (sha384) per ogni bundle e verificarli al fetch.
 *  3. Aggiungere il commento `// H9-SRI-REVIEWED` per soddisfare il guard CI
 *     `scripts/ci/check-sri-and-i18n.mjs`.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import itCommon from "./locales/it/common.json";
import enCommon from "./locales/en/common.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      it: { common: itCommon },
      en: { common: enCommon },
    },
    fallbackLng: "it",
    supportedLngs: ["it", "en"],
    defaultNS: "common",
    ns: ["common"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "ralph.lang",
      caches: ["localStorage"],
    },
  });

export default i18n;
