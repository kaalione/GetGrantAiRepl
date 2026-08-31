import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import sv from './sv.json';
import en from './en.json';
import no from './no.json';
import fi from './fi.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      sv: { translation: sv },
      en: { translation: en },
      no: { translation: no },
      fi: { translation: fi },
    },
    fallbackLng: 'sv',
    interpolation: {
      escapeValue: false,
      // Marketing copy quotes how many grants and sources the platform has.
      // Those numbers used to be written into every translated string, so they
      // drifted — the site said 1 700 grants and 39 sources while the database
      // held 2 103 and 66. The strings now interpolate {{grants}} and
      // {{sources}}, and these defaults are replaced with live figures once
      // /api/stats responds (see applyPlatformStats). They are deliberately
      // conservative so an unavailable API understates rather than overpromises.
      defaultVariables: {
        grants: '2 000+',
        sources: '60+',
      },
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

export default i18n;

/**
 * Swaps in the live counts. Re-selecting the current language is what makes
 * every mounted t() call re-render — i18next only notifies consumers on its own
 * events, and mutating defaultVariables alone would leave the old text on screen.
 */
export function applyPlatformStats(stats: { grants: string; sources: string }): void {
  const interpolation = i18n.options.interpolation;
  if (!interpolation) return;
  const current = interpolation.defaultVariables as Record<string, string> | undefined;
  if (current?.grants === stats.grants && current?.sources === stats.sources) return;

  interpolation.defaultVariables = { ...current, ...stats };
  void i18n.changeLanguage(i18n.language);
}
