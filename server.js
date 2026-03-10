/**
 * Serveur de production pour Railway.
 * Écoute explicitement sur 0.0.0.0:PORT pour accepter les connexions externes.
 */
import { createRequestHandler } from "@remix-run/express";
import compression from "compression";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const port = Number(process.env.PORT) || 3000;
const host = "0.0.0.0";

const buildPath = path.join(__dirname, "build", "server", "index.js");
const build = (await import(buildPath)).default;

const app = express();
app.disable("x-powered-by");
app.use(compression());
if (build.publicPath && build.assetsBuildDirectory) {
  app.use(build.publicPath, express.static(build.assetsBuildDirectory, { immutable: true, maxAge: "1y" }));
}
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));
app.all("*", createRequestHandler({ build, mode: "production" }));

app.listen(port, host, () => {
  console.log(`[server] Listening on http://${host}:${port} (PORT=${port})`);
});
