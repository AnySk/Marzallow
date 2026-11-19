import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Relative asset URLs: the built dashboard works under any DASHBOARD_PATH
  // and its assets are only served below it (nothing at /statics/).
  base: command === "build" ? "./" : "/",
  resolve: { tsconfigPaths: true },
  plugins: [
    react(),
    svgr(),
    // `ANALYZE=1 npm run build` writes stats.html with a bundle treemap
    process.env.ANALYZE && visualizer({ open: false }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks so app releases don't bust the whole cache.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/, priority: 40 },
            { name: "ui", test: /node_modules[\\/](@chakra-ui|@emotion|framer-motion|@popperjs|@zag-js)[\\/]/, priority: 30 },
            { name: "charts", test: /node_modules[\\/](apexcharts|react-apexcharts)[\\/]/, priority: 20 },
            { name: "editor", test: /node_modules[\\/](@codemirror|@lezer|codemirror|crelt|style-mod|w3c-keyname|jsonc-parser)[\\/]/, priority: 20 },
            { name: "vendor", test: /node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
}));
