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
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

export default i18n;
