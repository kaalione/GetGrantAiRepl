import "dotenv/config";
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

// Vite inlines these into the client bundle. If they are absent the build
// still succeeds and produces a client that cannot reach Supabase, so sign-in
// fails at runtime with nothing in the build output to explain why.
function assertClientEnv() {
  const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length === 0) return;

  const message =
    `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not set. ` +
    `Vite inlines them at build time, so the client would ship unable to sign in.`;

  // A production build must not ship a broken client; a local build may want
  // to skip auth, so allow an explicit opt-out there.
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_MISSING_CLIENT_ENV) {
    console.error(`\nBuild aborted: ${message}\n`);
    process.exit(1);
  }
  console.warn(`[build] Warning: ${message}`);
}

async function buildAll() {
  assertClientEnv();
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
