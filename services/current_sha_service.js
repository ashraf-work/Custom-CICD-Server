import { runCommand } from "../utils/commandRunner.js";

export const getCurrentSha = async (project, component) => {
  if (component.mode === "local") {
    return runCommand("git rev-parse HEAD", project.localPath, {
      stage: "get-sha",
      project: project.name,
      component: component.name,
    });
  }

  const { host, user, port = 22, keyPath, remotePath } = component.ssh;
  const command = [
    "ssh",
    "-o BatchMode=yes",
    "-o StrictHostKeyChecking=no",
    "-o UserKnownHostsFile=/dev/null",
    `-i "${keyPath}"`,
    `-p ${port}`,
    `${user}@${host}`,
    `'cd "${remotePath}" && git rev-parse HEAD'`,
  ].join(" ");

  const result = await runCommand(command, undefined, {
    stage: "get-sha",
    project: project.name,
    component: component.name,
  });

  return result.trim();
};
