import { exec } from "child_process";
import { CICDError } from "./CICDError.js";

export const toCommandList = (commands) => {
  if (!commands) return [];
  return Array.isArray(commands) ? commands : [commands];
};

export const runCommand = (command, cwd, context = {}) => {
  return new Promise((resolve, reject) => {
    exec(`bash -lc "${command}"`, { cwd }, (err, stdout, stderr) => {
      if (err) {
        return reject(
          new CICDError({
            ...context,
            command,
            originalError: stderr || err.message,
          })
        );
      }

      if (stdout) console.log(stdout.trim());
      resolve(stdout?.trim());
    });
  });
};

export const runCommands = async (commands, cwd, context = {}) => {
  for (const command of toCommandList(commands)) {
    await runCommand(command, cwd, context);
  }
};
