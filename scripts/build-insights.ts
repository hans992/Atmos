import { build } from "esbuild";
await build({
  entryPoints: ["src/server/insights-handler.ts"],
  outfile: "supabase/functions/home-insights/logic.js",
  bundle: true,
  platform: "neutral",
  format: "esm",
  target: "es2022",
  packages: "external",
});
