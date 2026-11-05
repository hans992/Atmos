import { build } from "esbuild";
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
await mkdir("public/icons", { recursive: true });
const svg = await readFile("public/icon.svg");
await Promise.all(
  [192, 512].map((size) =>
    sharp(svg).resize(size, size).png().toFile(`public/icons/icon-${size}.png`),
  ),
);
const maskable = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#c8e794"/><path d="M135 266h70l30-90 54 168 36-102h53" fill="none" stroke="#253526" stroke-width="25" stroke-linecap="round" stroke-linejoin="round"/></svg>',
);
await sharp(maskable).png().toFile("public/icons/maskable-512.png");
await build({
  entryPoints: ["src/service-worker.ts"],
  outfile: "public/sw.js",
  bundle: true,
  minify: true,
  target: "es2020",
});
