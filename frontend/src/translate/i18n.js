import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import { messages } from "./languages";

i18n.use(LanguageDetector).init({
	debug: false,
	defaultNS: ["translations"],
	lng: "pt",
	fallbackLng: "pt",
	supportedLngs: ["pt", "en", "es"],
	load: "languageOnly",
	detection: {
		order: ["localStorage", "navigator"],
		caches: ["localStorage"],
	},
	ns: ["translations"],
	resources: messages,
});

export { i18n };
