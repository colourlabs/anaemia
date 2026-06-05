import { defineConfig } from "@anaemia/core/config";
import { anaemiaLightningCssPlugin } from "@anaemia/core/plugins";

export default defineConfig({
  port: 3000,
  styles: {
    sass: true,
    modules: true,
    typedModules: true,
  },
  plugins: [
    anaemiaLightningCssPlugin({
      browserslist: ["last 2 versions"],
    }),
  ],
});
