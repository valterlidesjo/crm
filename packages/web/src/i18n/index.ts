import { useTranslation } from "react-i18next";
import i18n, {
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  type Language,
} from "./config";

export { default } from "./config";
export { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES, type Language } from "./config";

/**
 * Read and change the active UI language. Persists the choice to localStorage and
 * switches i18next live, which re-renders every component using `useTranslation`.
 */
export function useLanguage() {
  const { i18n: instance } = useTranslation();
  const language = (instance.language?.startsWith("sv") ? "sv" : "en") as Language;

  const setLanguage = (next: Language) => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // ignore persistence failure
    }
    void instance.changeLanguage(next);
  };

  return { language, setLanguage, languages: SUPPORTED_LANGUAGES };
}

/** Current locale string for Intl formatting (e.g. "sv-SE" / "en-US"). */
export function currentLocale(): string {
  return i18n.language?.startsWith("sv") ? "sv-SE" : "en-US";
}
