import { defineConfig } from "@anaemia/core/config";
import { anaemiaLightningCssPlugin } from "@anaemia/core/plugins";

export default defineConfig({
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
