/** Resolve app-owned assets relative to the deployed app directory. */
export function appAsset(path: string, base: string): string {
  return new URL(path.replace(/^\/+/, ""), base).href;
}
