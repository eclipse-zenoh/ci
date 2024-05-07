import * as fs from "fs/promises";

import { sh } from "./command";

function setupAgent(): NodeJS.ProcessEnv {
  const commands = sh("ssh-agent -s");
  return Object.fromEntries([...commands.matchAll(/([A-Z_]+)=([^;]+);/g)].map(m => [m[1], m[2]]));
}

export async function withIdentity(privateKey: string, passphrase: string, fn: (env: NodeJS.ProcessEnv) => void) {
  const env = setupAgent();
  const passphrasePath = "./.ssh_askpass";
  await fs.writeFile(passphrasePath, `echo '${passphrase}'`, { mode: fs.constants.S_IRWXU });
  sh("ssh-add -", {
    input: privateKey.trim().concat("\n"),
    env: { DISPLAY: "NONE", SSH_ASKPASS: passphrasePath, ...env },
  });
  fn(env);
  await fs.rm(passphrasePath);
  sh("ssh-add -D", { env });
}
