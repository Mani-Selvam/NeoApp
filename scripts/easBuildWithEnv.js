const path = require("path");
const { spawn } = require("child_process");
const dotenv = require("dotenv");

const envPath = path.join(__dirname, "..", ".env");
dotenv.config({ path: envPath, debug: false });

const args = ["build", "--platform", process.argv[2] || "android"];
const profile = process.argv[3] || "preview";
args.push("--profile", profile);

const result = spawn("eas", args, {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    EAS_NO_DEFAULT_CLI_CONFIG: "true",
  },
});

result.on("close", (code) => {
  process.exit(code);
});
