// src/publish-crates-eclipse.ts
import * as path from "path";
import * as core5 from "@actions/core";
import { DefaultArtifactClient as DefaultArtifactClient3 } from "@actions/artifact";

// src/ssh.ts
import * as fs from "fs/promises";

// src/command.ts
import { spawnSync } from "child_process";
import * as core from "@actions/core";
var MAX_BUFFER = 10 * 1024 * 1024;
function sh(cmd, options) {
  options = options != null ? options : {};
  options.env = options.env != null ? options.env : {};
  options.cwd = options.cwd != null ? options.cwd : ".";
  options.check = options.check != null ? options.check : true;
  options.input = options.input != null ? options.input : "";
  options.quiet = options.quiet != null ? options.quiet : false;
  core.startGroup(`\x1B[1m\x1B[35m${cmd}\x1B[0m`);
  const returns = spawnSync(cmd, {
    // NOTE: Environment variables defined in `options.env` take precedence over
    // the parent process's environment, thus the destructuring order is important
    env: {
      ...process.env,
      ...options.env
    },
    stdio: "pipe",
    shell: true,
    encoding: "utf-8",
    cwd: options.cwd,
    input: options.input,
    maxBuffer: MAX_BUFFER
  });
  if (returns.stdout != "" && !options.quiet) {
    core.info(`\x1B[1mstdout:\x1B[0m`);
    core.info(returns.stdout);
  }
  if (returns.stderr != "" && !options.quiet) {
    core.info(`\x1B[1mstderr:\x1B[0m`);
    core.info(returns.stderr);
  }
  core.endGroup();
  if (options.check && returns.status != 0) {
    throw new Error(`\`${cmd}\` failed with status code ${returns.status}:
${returns.stderr}`);
  }
  return returns.stdout;
}
function exec(program, args, options) {
  options = options != null ? options : {};
  options.env = options.env != null ? options.env : {};
  options.cwd = options.cwd != null ? options.cwd : ".";
  options.check = options.check != null ? options.check : true;
  options.input = options.input != null ? options.input : "";
  core.startGroup(`\x1B[1m\x1B[35m${program}(${args.join(", ")})\x1B[0m`);
  const returns = spawnSync(program, args, {
    // NOTE: Environment variables defined in `options.env` take precedence over
    // the parent process's environment, thus the destructuring is order is
    // important
    env: {
      ...process.env,
      ...options.env
    },
    stdio: "pipe",
    shell: false,
    encoding: "utf-8",
    cwd: options.cwd,
    input: options.input,
    maxBuffer: MAX_BUFFER
  });
  if (returns.stdout != "") {
    core.info(`\x1B[1mstdout:\x1B[0m`);
    core.info(returns.stdout);
  }
  if (returns.stderr != "") {
    core.info(`\x1B[1mstderr:\x1B[0m`);
    core.info(returns.stderr);
  }
  core.endGroup();
  if (options.check && returns.status != 0) {
    throw new Error(`\`${program}(${args.join(", ")})\` failed with status code ${returns.status}:
${returns.stderr}`);
  }
  return returns.stdout;
}

// src/ssh.ts
function setupAgent() {
  const commands = sh("ssh-agent -s");
  return Object.fromEntries([...commands.matchAll(/([A-Z_]+)=([^;]+);/g)].map((m) => [m[1], m[2]]));
}
async function withIdentity(privateKey, passphrase, fn) {
  const env = setupAgent();
  const passphrasePath = "./.ssh_askpass";
  await fs.writeFile(passphrasePath, `echo '${passphrase}'`, { mode: fs.constants.S_IRWXU });
  sh("ssh-add -", {
    input: privateKey.trim().concat("\n"),
    env: { DISPLAY: "NONE", SSH_ASKPASS: passphrasePath, ...env }
  });
  fn(env);
  await fs.rm(passphrasePath);
  sh("ssh-add -D", { env });
}

// src/build-crates-debian.ts
import * as core3 from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";

// src/cargo.ts
import * as os from "os";
import { join } from "path";
import * as core2 from "@actions/core";
import * as cache from "@actions/cache";

// src/toml.ts
import * as fs2 from "fs/promises";
var TOML = class _TOML {
  static async init() {
    await installBinaryCached("toml-cli2");
    return new _TOML();
  }
  get(path2, key) {
    const query = key == void 0 ? "." : key.join(".");
    return JSON.parse(exec("toml", ["get", path2, query]));
  }
  async set(path2, key, value) {
    const query = key.join(".");
    await fs2.writeFile(path2, exec("toml", ["set", path2, query, value]));
  }
  async unset(path2, key) {
    const query = key.join(".");
    await fs2.writeFile(path2, exec("toml", ["unset", path2, query]));
  }
};

// ci.config.json
var ci_config_default = {
  git: {
    user: {
      name: "eclipse-zenoh-bot",
      email: "eclipse-zenoh-bot@users.noreply.github.com"
    }
  },
  lock: {
    cratesio: {
      "cargo-deb": "2.1.0",
      estuary: "0.1.1",
      cross: "0.2.5",
      "toml-cli2": "0.3.2"
    }
  }
};

// src/config.ts
var config = ci_config_default;
var gitEnv = {
  GIT_AUTHOR_NAME: config.git.user.name,
  GIT_AUTHOR_EMAIL: config.git.user.email,
  GIT_COMMITTER_NAME: config.git.user.name,
  GIT_COMMITTER_EMAIL: config.git.user.email
};

// src/cargo.ts
var toml = await TOML.init();
async function installBinaryCached(name) {
  if (process.env["GITHUB_ACTIONS"] != void 0) {
    const paths = [join(os.homedir(), ".cargo", "bin")];
    const version = config.lock.cratesio[name];
    const key = `${os.platform()}-${os.release()}-${os.arch()}-${name}-${version}`;
    const hit = await cache.restoreCache(paths, key);
    if (hit == void 0) {
      sh(`cargo +stable install ${name} --force`);
      await cache.saveCache(paths, key);
    }
  } else {
    sh(`cargo +stable install ${name}`);
  }
}

// src/build-crates-debian.ts
var artifact = new DefaultArtifactClient();
var toml2 = await TOML.init();
var artifactRegExp = /^.*-debian\.zip$/;

// src/build-crates-standalone.ts
import * as core4 from "@actions/core";
import { DefaultArtifactClient as DefaultArtifactClient2 } from "@actions/artifact";
var artifact2 = new DefaultArtifactClient2();
var artifactRegExp2 = /^.*-standalone\.zip$/;

// src/checksum.ts
import * as crypto from "crypto";
import * as fs3 from "fs/promises";
async function sha256(path2) {
  const contents = await fs3.readFile(path2);
  return crypto.createHash("sha256").update(contents).digest("hex");
}

// src/publish-crates-eclipse.ts
import * as fs4 from "fs/promises";
var artifact3 = new DefaultArtifactClient3();
function setup() {
  const liveRun = core5.getBooleanInput("live-run", { required: true });
  const version = core5.getInput("version", { required: true });
  const sshHost = core5.getInput("ssh-host", { required: true });
  const sshHostPath = core5.getInput("ssh-host-path", { required: true });
  const sshPrivateKey = core5.getInput("ssh-private-key", { required: true });
  const sshPassphrase = core5.getInput("ssh-passphrase", { required: true });
  const archivePatterns = core5.getInput("archive-patterns", { required: false });
  return {
    liveRun,
    version,
    sshHost,
    sshHostPath,
    sshPrivateKey,
    sshPassphrase,
    archiveRegExp: archivePatterns == "" ? void 0 : new RegExp(archivePatterns.split("\n").join("|"))
  };
}
async function main(input) {
  try {
    const shouldPublishArtifact = (name) => {
      if (input.archiveRegExp == void 0) {
        return artifactRegExp2.test(name) || artifactRegExp.test(name);
      } else {
        return input.archiveRegExp.test(name);
      }
    };
    const checksumFile = "sha256sums.txt";
    const archiveDir = `${input.sshHostPath}/${input.version}`;
    const results = await artifact3.listArtifacts({ latest: true });
    for (const result of results.artifacts) {
      if (shouldPublishArtifact(result.name)) {
        const { downloadPath } = await artifact3.downloadArtifact(result.id);
        const archive = path.join(downloadPath, result.name);
        const checksum = await sha256(archive);
        await fs4.appendFile(checksumFile, `${checksum} ${archive}
`);
        if (input.liveRun) {
          core5.info(`Uploading ${archive} to download.eclipse.org`);
          await withIdentity(input.sshPrivateKey, input.sshPassphrase, (env) => {
            sh(`ssh -v -o StrictHostKeyChecking=no ${input.sshHost} mkdir -p ${archiveDir}`, { env });
            sh(`scp -v -o StrictHostKeyChecking=no -r ${archive} ${input.sshHost}:${archiveDir}`, { env });
          });
        }
      }
    }
    if (input.liveRun) {
      core5.info(`Uploading ${checksumFile} to download.eclipse.org`);
      await withIdentity(input.sshPrivateKey, input.sshPassphrase, (env) => {
        sh(`scp -v -o StrictHostKeyChecking=no -r ${checksumFile} ${input.sshHost}:${archiveDir}`, { env });
      });
    }
    cleanup();
  } catch (error) {
    cleanup();
    if (error instanceof Error) core5.setFailed(error.message);
  }
}
function cleanup() {
}

// src/publish-crates-eclipse-main.ts
await main(setup());
