/**
 * Express 5-compatible production server for Space SSR.
 * @react-router/serve uses app.all("*") which path-to-regexp v8 rejects;
 * this script mirrors that behavior with /{*splat} instead.
 */
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequestHandler } from "@react-router/express";
import { createRequestListener } from "@mjackson/node-fetch-server";
import compression from "compression";
import express from "express";
import getPort from "get-port";
import morgan from "morgan";
import sourceMapSupport from "source-map-support";

process.env.NODE_ENV ??= "production";

sourceMapSupport.install({
  retrieveSourceMap(source) {
    if (!source.startsWith("file://")) return null;
    const filePath = fileURLToPath(source);
    const sourceMapPath = `${filePath}.map`;
    if (!existsSync(sourceMapPath)) return null;
    return { url: source, map: readFileSync(sourceMapPath, "utf8") };
  },
});

function isRSCServerBuild(build) {
  return Boolean(
    typeof build === "object" &&
    build &&
    "default" in build &&
    typeof build.default === "object" &&
    build.default &&
    "fetch" in build.default &&
    typeof build.default.fetch === "function"
  );
}

function parseNumber(raw) {
  if (raw === undefined) return undefined;
  const maybe = Number(raw);
  return Number.isNaN(maybe) ? undefined : maybe;
}

const buildPathArg = process.argv[2];
if (!buildPathArg) {
  console.error("Usage: node server.mjs <server-build-path>");
  process.exit(1);
}

const buildPath = path.resolve(buildPathArg);
const buildModule = await import(pathToFileURL(buildPath).href);

let build;
let isRSCBuild = false;

if ((isRSCBuild = isRSCServerBuild(buildModule))) {
  const config = {
    publicPath: "/",
    assetsBuildDirectory: "../client",
    ...buildModule.unstable_reactRouterServeConfig,
  };
  build = {
    fetch: buildModule.default.fetch,
    publicPath: config.publicPath,
    assetsBuildDirectory: path.resolve(path.dirname(buildPath), config.assetsBuildDirectory),
  };
} else {
  build = buildModule;
}

const port = parseNumber(process.env.PORT) ?? (await getPort({ port: 3000 }));

const onListen = () => {
  const address =
    process.env.HOST ||
    Object.values(networkInterfaces())
      .flat()
      .find((ip) => String(ip?.family).includes("4") && !ip?.internal)?.address;

  if (!address) {
    console.log(`[space-serve] http://localhost:${port}`);
  } else {
    console.log(`[space-serve] http://localhost:${port} (http://${address}:${port})`);
  }
};

const app = express();
app.disable("x-powered-by");

if (!isRSCBuild) {
  app.use(compression());
}

app.use(
  path.posix.join(build.publicPath, "assets"),
  express.static(path.join(build.assetsBuildDirectory, "assets"), {
    immutable: true,
    maxAge: "1y",
  })
);
app.use(build.publicPath, express.static(build.assetsBuildDirectory));
app.use(express.static("public", { maxAge: "1h" }));
app.use(morgan("tiny"));

const requestHandler = build.fetch
  ? createRequestListener(build.fetch)
  : createRequestHandler({
      build: buildModule,
      mode: process.env.NODE_ENV,
    });

// Express 5 / path-to-regexp v8 requires named wildcards (not bare "*").
app.all("/{*splat}", requestHandler);

const server = process.env.HOST ? app.listen(port, process.env.HOST, onListen) : app.listen(port, onListen);

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => server?.close(console.error));
}
