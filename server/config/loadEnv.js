const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

let loaded = false;

const candidateEnvPaths = () => {
  const rootEnv = path.resolve(__dirname, "../../.env");
  const serverEnv = path.resolve(__dirname, "../.env");
  const cwdEnv = path.resolve(process.cwd(), ".env");

  return [...new Set([rootEnv, serverEnv, cwdEnv])];
};

const ensureEnvLoaded = () => {
  if (loaded) return;

  for (const envPath of candidateEnvPaths()) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath });
    loaded = true;

    if (process.env.JWT_SECRET) return;
  }
};

module.exports = { ensureEnvLoaded };
