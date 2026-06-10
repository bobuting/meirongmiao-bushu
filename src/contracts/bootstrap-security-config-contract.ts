export const BOOTSTRAP_SECURITY_CONFIG_CONTRACT_VERSION = "AT28-32.v1";

export const BOOTSTRAP_SECURITY_CONFIG_INVARIANTS = [
  "Production runtime must not rely on implicit fallback secrets.",
  "Dev bootstrap admin credentials are development/test-only and must stay explicitly namespaced.",
  ".env.example must include the minimum startup/runtime keys required for deterministic bootstrap.",
] as const;

export const BOOTSTRAP_ADMIN_ENV_KEYS = [
  "DEV_BOOTSTRAP_ADMIN_EMAIL",
  "DEV_BOOTSTRAP_ADMIN_PASSWORD",
] as const;

export const SECURITY_CRITICAL_ENV_KEYS = [
  "NODE_ENV",
  "PORT",
  "APP_SECRET_KEY",
  "PERSISTENCE_DRIVER",
  "PERSISTENCE_FLUSH_INTERVAL_MS",
  "OBJECT_STORAGE_DRIVER",
] as const;

export const ENV_EXAMPLE_REQUIRED_KEYS = [
  ...SECURITY_CRITICAL_ENV_KEYS,
  ...BOOTSTRAP_ADMIN_ENV_KEYS,
  "REVERSE_FETCH_STAGE_ORDER",
  "REVERSE_EXTERNAL_API_PRIORITY",
] as const;

interface BootstrapSecurityConfigContractInput {
  readonly envExampleContent: string;
  readonly nodeEnv: "development" | "test" | "production";
  readonly appSecretKey?: string | null;
  readonly bootstrapAdminEmail?: string | null;
  readonly bootstrapAdminPassword?: string | null;
}

interface EnvExampleIndex {
  readonly keys: readonly string[];
  readonly duplicateKeys: readonly string[];
}

function parseEnvExample(content: string): EnvExampleIndex {
  const keys: string[] = [];
  const duplicateKeys: string[] = [];
  const seen = new Set<string>();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized || normalized.startsWith("#")) {
      continue;
    }
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex < 1) {
      continue;
    }
    const key = normalized.slice(0, equalsIndex).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) {
      throw new Error(`Invalid env key shape in .env.example: ${key}`);
    }
    if (seen.has(key)) {
      duplicateKeys.push(key);
      continue;
    }
    seen.add(key);
    keys.push(key);
  }
  return {
    keys,
    duplicateKeys,
  };
}

function hasConfiguredValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isDevBootstrapDefault(email: string | null | undefined, password: string | null | undefined): boolean {
  return (email ?? "").trim() === "admin@example.com" || (password ?? "").trim() === "admin123";
}

export function assertBootstrapSecurityConfigContract(
  input: BootstrapSecurityConfigContractInput,
): {
  version: string;
  requiredEnvKeyCount: number;
  discoveredEnvKeyCount: number;
  invariantCount: number;
} {
  const envIndex = parseEnvExample(input.envExampleContent);
  if (envIndex.duplicateKeys.length > 0) {
    throw new Error(`Duplicate env keys in .env.example: ${envIndex.duplicateKeys.join(", ")}`);
  }

  for (const key of ENV_EXAMPLE_REQUIRED_KEYS) {
    if (!envIndex.keys.includes(key)) {
      throw new Error(`Missing required env key in .env.example: ${key}`);
    }
  }

  if (input.nodeEnv === "production") {
    if (!hasConfiguredValue(input.appSecretKey)) {
      throw new Error("Production contract requires explicit APP_SECRET_KEY.");
    }
    if (isDevBootstrapDefault(input.bootstrapAdminEmail, input.bootstrapAdminPassword)) {
      throw new Error("Production contract forbids dev bootstrap default admin credentials.");
    }
  }

  return {
    version: BOOTSTRAP_SECURITY_CONFIG_CONTRACT_VERSION,
    requiredEnvKeyCount: ENV_EXAMPLE_REQUIRED_KEYS.length,
    discoveredEnvKeyCount: envIndex.keys.length,
    invariantCount: BOOTSTRAP_SECURITY_CONFIG_INVARIANTS.length,
  };
}
