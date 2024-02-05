import { spawnSync } from "child_process";
import * as core from "@actions/core";

export type RunOptions = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  check?: boolean;
};

export function run(cmd: string, args: string[], options?: RunOptions): string {
  options = options != null ? options : {};
  options.env = options.env != null ? options.env : {};
  options.cwd = options.cwd != null ? options.cwd : ".";
  options.check = options.check != null ? options.check : true;

  core.startGroup(`\u001b[1m\u001b[35m(${options.cwd}) ${cmd} ${args.join(" ")}\u001b[0m`);

  const returns = spawnSync(cmd, args, {
    env: {
      ...options.env,
      PATH: process.env.PATH,
    },
    cwd: options.cwd,
    stdio: "pipe",
    encoding: "utf-8",
  });

  if (returns.stdout != "") {
    core.info(`\u001b[1mstdout:\u001b[0m`);
    core.info(returns.stdout);
  }

  if (returns.stderr != "") {
    core.info(`\u001b[1mstderr:\u001b[0m`);
    core.info(returns.stderr);
  }

  core.endGroup();

  if (options.check && returns.status != 0) {
    throw new Error(
      `\`${cmd} ${args.join(" ")}\` failed with status code ${returns.status}:\n${returns.stderr}`,
    );
  }

  return returns.stdout;
}
