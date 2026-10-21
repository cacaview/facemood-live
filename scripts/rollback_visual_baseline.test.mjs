import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hashDirectory,
  isAllowedOutputDirectory,
  verifyBaselineDigest,
} from "./rollback_visual_baseline.mjs";

test("hashes sorted relative paths and file bytes reproducibly", () => {
  const temp = mkdtempSync(join(tmpdir(), "facemood-rollback-"));
  try {
    const first = join(temp, "first");
    const second = join(temp, "second");
    mkdirSync(join(first, "assets"), { recursive: true });
    mkdirSync(join(second, "assets"), { recursive: true });
    writeFileSync(join(first, "index.html"), "baseline");
    writeFileSync(join(first, "assets", "app.js"), "body");
    writeFileSync(join(second, "assets", "app.js"), "body");
    writeFileSync(join(second, "index.html"), "baseline");
    assert.equal(hashDirectory(first), hashDirectory(second));
    writeFileSync(join(second, "index.html"), "changed");
    assert.notEqual(hashDirectory(first), hashDirectory(second));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("rejects a different source commit or build digest", () => {
  const manifest = { sourceCommit: "abc123", outputSha256: "deadbeef" };
  assert.equal(verifyBaselineDigest(manifest, "abc123", "deadbeef"), true);
  assert.equal(verifyBaselineDigest(manifest, "other", "deadbeef"), false);
  assert.equal(verifyBaselineDigest(manifest, "abc123", "changed"), false);
});

test("allows only named build outputs and rollback scratch paths", () => {
  const root = process.cwd();
  assert.equal(isAllowedOutputDirectory(join(root, "dist")), true);
  assert.equal(
    isAllowedOutputDirectory(
      join(root, ".superpowers", "sdd", "plan", "rollback-final"),
    ),
    true,
  );
  assert.equal(
    isAllowedOutputDirectory(join(root, ".superpowers", "sdd")),
    false,
  );
  assert.equal(
    isAllowedOutputDirectory(join(root, ".superpowers", "sdd", "plan")),
    false,
  );
  assert.equal(
    isAllowedOutputDirectory(join(root, "..", "rollback-outside")),
    false,
  );
  assert.equal(
    isAllowedOutputDirectory(
      join(root, ".superpowers", "sdd", "plan", "notes"),
    ),
    false,
  );
});

test("rejects rollback outputs beneath a symlinked scratch directory", () => {
  const root = process.cwd();
  const scratch = join(root, ".superpowers", "sdd");
  const external = mkdtempSync(join(tmpdir(), "facemood-rollback-target-"));
  const link = join(scratch, "rollback-symlink-test");
  mkdirSync(scratch, { recursive: true });
  try {
    symlinkSync(external, link, "dir");
    assert.equal(isAllowedOutputDirectory(join(link, "rollback-probe")), false);
  } finally {
    unlinkSync(link);
    rmSync(external, { recursive: true, force: true });
  }
});
