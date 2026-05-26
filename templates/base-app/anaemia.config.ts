import { defineConfig } from "@anaemia/core";

export default defineConfig({
  port: 4444,
  i18n: {
    locales: ["en", "es"],
    defaultLocale: "en",
  },
  styles: {
    sass: true,
    modules: true,
  },
});
