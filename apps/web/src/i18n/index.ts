import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import he from './locales/he.json';
import en from './locales/en.json';

const savedLang = localStorage.getItem('lang') ?? 'he';

i18n.use(initReactI18next).init({
  resources: { he: { translation: he }, en: { translation: en } },
  lng: savedLang,
  fallbackLng: 'he',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: 'he' | 'en') {
  i18n.changeLanguage(lang);
  localStorage.setItem('lang', lang);
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}

// Set initial direction
document.documentElement.dir = savedLang === 'he' ? 'rtl' : 'ltr';
document.documentElement.lang = savedLang;

export default i18n;
