import { build } from "esbuild";
import { copyFile } from "node:fs/promises";

await build({
  entryPoints: ["src/game/engine.js"],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  outfile: "public/game/engine.js",
});
await copyFile("src/game/shell.html", "public/game/index.html");
console.log("Playable game bundled with local Three.js dependencies.");
