import { dependenciesChanged } from "../utils/pathMatcher.js";
import { toCommandList } from "../utils/commandRunner.js";
import { runSSHCommands } from "./ssh_service.js";

export const runRemoteDeployment = async (component, project, files) => {
  const remoteCommands = buildRemoteCommands(component, files);

  await runSSHCommands(project, component, remoteCommands, {
    env: component.env || [],
  });
};

const buildRemoteCommands = (component, files) => {
  const commands = component.commands || {};
  const remoteCommands = [];

  remoteCommands.push(...toCommandList(commands.pull));
  remoteCommands.push(...buildInstallCommands(component, files));
  remoteCommands.push(...toCommandList(commands.test));
  remoteCommands.push(...toCommandList(commands.build));
  remoteCommands.push(...toCommandList(commands.deploy));

  return remoteCommands;
};

const buildInstallCommands = (component, files) => {
  const installCommands = toCommandList(component.commands.install);
  if (installCommands.length === 0) return [];

  if (hasDependencyChanges(component, files)) {
    return installCommands;
  }

  return [`[ -d node_modules ] || ${installCommands.join(" && ")}`];
};

const hasDependencyChanges = (component, files) => {
  return (
    (component.dependencyFiles?.length || 0) > 0 &&
    dependenciesChanged(component, files)
  );
};
