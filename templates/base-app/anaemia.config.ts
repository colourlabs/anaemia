import { defineConfig } from "@anaemia/core";
import { anaemiaLightningCssPlugin } from "@anaemia/core/plugins";

export default defineConfig({
  port: 4444,
  styles: {
    sass: true,
    modules: true,
  },
  plugins: [
    anaemiaLightningCssPlugin({
      browserslist: ["last 2 versions"],
    })
  ]
});
