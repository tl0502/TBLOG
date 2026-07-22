/** Merge local process variables with Cloudflare bindings, preferring the deployed binding value. */
export function mergeCloudflareRuntimeEnv(
  baseEnv: Record<string, unknown>,
  cloudflareEnv?: Record<string, unknown>
): Record<string, unknown> {
  return { ...baseEnv, ...(cloudflareEnv ?? {}) }
}
