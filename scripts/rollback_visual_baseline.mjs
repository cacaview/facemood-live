import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(
  repositoryRoot,
  "reports",
  "visual-baseline-manifest.json",
);
const baselineRef = "aacb705";

export function hashDirectory(directory) {
  const hash = createHash("sha256");
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const absolute = join(current, entry.name);
      const name = relative(directory, absolute).split(sep).join("/");
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        hash.update(name);
        hash.update("\0");
        hash.update(readFileSync(absolute));
        hash.update("\0");
      } else {
        throw Error(`Unsupported rollback artifact entry: ${name}`);
      }
    }
  };
  visit(directory);
  return hash.digest("hex");
}

export function verifyBaselineDigest(manifest, sourceCommit, outputSha256) {
  return (
    manifest?.sourceCommit === sourceCommit &&
    typeof manifest.outputSha256 === "string" &&
    manifest.outputSha256 === outputSha256
  );
}

export function isAllowedOutputDirectory(outputDirectory) {
  const standardOutputs = [
    join(repositoryRoot, "dist"),
    join(repositoryRoot, "dist-visual-baseline"),
  ];
  if (standardOutputs.includes(outputDirectory)) return true;
  const scratchRoot = join(repositoryRoot, ".superpowers", "sdd");
  return (
    outputDirectory.startsWith(`${scratchRoot}${sep}`) &&
    /^(baseline-dist|rollback-[a-z0-9-]+)$/.test(basename(outputDirectory))
  );
}

function run(command, args, options = {}) {
  const executionOptions = {
    cwd: repositoryRoot,
    stdio: "inherit",
    ...options,
  };
  if (Object.hasOwn(options, "input"))
    executionOptions.stdio = ["pipe", "inherit", "inherit"];
  const result = spawnSync(command, args, {
    ...executionOptions,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(
      `${command} ${args.join(" ")} failed with status ${result.status}`,
    );
}

function getOption(args, option, fallback) {
  const index = args.indexOf(option);
  return index < 0 ? fallback : args[index + 1];
}

function restoreBaseline() {
  const args = process.argv.slice(2);
  const capture = args.includes("--capture");
  const requestedOutput = getOption(
    args,
    "--out",
    capture ? "dist-visual-baseline" : "dist",
  );
  if (!requestedOutput) throw Error("--out must include a directory");
  const outputDirectory = resolve(repositoryRoot, requestedOutput);
  if (!isAllowedOutputDirectory(outputDirectory))
    throw Error("Rollback output must be a disposable build directory.");

  const sourceCommit = execFileSync(
    "git",
    ["rev-parse", `${baselineRef}^{commit}`],
    { cwd: repositoryRoot, encoding: "utf8" },
  ).trim();
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "facemood-visual-baseline-"),
  );
  try {
    const archive = execFileSync("git", ["archive", sourceCommit], {
      cwd: repositoryRoot,
      maxBuffer: 256 * 1024 * 1024,
    });
    run("tar", ["-x", "-C", temporaryDirectory], {
      input: archive,
      maxBuffer: 256 * 1024 * 1024,
    });
    const dependencyDirectory = join(repositoryRoot, "node_modules");
    if (!existsSync(dependencyDirectory))
      throw Error(
        "Install project dependencies before building the visual baseline.",
      );
    symlinkSync(
      dependencyDirectory,
      join(temporaryDirectory, "node_modules"),
      "dir",
    );
    run("npm", ["run", "build"], { cwd: temporaryDirectory });

    const buildDirectory = join(temporaryDirectory, "dist");
    const outputSha256 = hashDirectory(buildDirectory);
    if (capture) {
      writeFileSync(
        manifestPath,
        `${JSON.stringify(
          {
            sourceRef: baselineRef,
            sourceCommit,
            outputSha256,
            buildCommand: "npm run build",
          },
          null,
          2,
        )}\n`,
      );
    } else {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (!verifyBaselineDigest(manifest, sourceCommit, outputSha256))
        throw Error(
          "Visual baseline build digest mismatch; refusing to replace the output directory.",
        );
    }

    if (
      existsSync(outputDirectory) &&
      !lstatSync(outputDirectory).isDirectory()
    )
      throw Error("Rollback output path exists and is not a directory.");
    rmSync(outputDirectory, { recursive: true, force: true });
    mkdirSync(dirname(outputDirectory), { recursive: true });
    cpSync(buildDirectory, outputDirectory, { recursive: true });
    console.log(
      `Visual baseline ${capture ? "captured" : "restored"} at ${relative(repositoryRoot, outputDirectory)}\nSource commit: ${sourceCommit}\nBuild SHA-256: ${outputSha256}`,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  restoreBaseline();
