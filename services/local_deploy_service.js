import fs from "node:fs";
import path from "path";

import { dependenciesChanged } from "../utils/pathMatcher.js";
import { CICDError } from "../utils/CICDError.js";
import {
  runCommands,
  toCommandList,
} from "../utils/commandRunner.js";

const NODE_COMMAND_STEPS = ["install", "build", "test"];

export const runLocalDeployment = async (component, project, files) => {
  const cwd = getComponentCwd(project, component);
  const commands = component.commands || {};

  validateComponentPath(cwd, project, component);
  validatePackageFileIfNeeded(cwd, commands, project, component);

  if (shouldInstallDependencies(cwd, component, files) && commands.install) {
    await runCommands(
      commands.install,
      cwd,
      buildContext("install", project, component)
    );
  }

  await runLifecycleCommand("test", commands.test, cwd, project, component);
  await runLifecycleCommand("build", commands.build, cwd, project, component);
  await runLifecycleCommand("deploy", commands.deploy, cwd, project, component);
};

const getComponentCwd = (project, component) => {
  return path.join(project.localPath, component.path || "");
};

const validateComponentPath = (cwd, project, component) => {
  if (fs.existsSync(cwd)) return;

  throw new CICDError({
    stage: "preflight",
    project: project.name,
    component: component.name,
    originalError: `Component path does not exist: ${cwd}`,
  });
};

const validatePackageFileIfNeeded = (cwd, commands, project, component) => {
  if (!usesNodeCommands(commands)) return;

  const pkgPath = path.join(cwd, "package.json");
  if (fs.existsSync(pkgPath)) return;

  throw new CICDError({
    stage: "preflight",
    project: project.name,
    component: component.name,
    originalError: `package.json not found at ${pkgPath}`,
  });
};

const usesNodeCommands = (commands) => {
  return NODE_COMMAND_STEPS.some((step) => {
    return toCommandList(commands[step]).some((cmd) => {
      return cmd.trim().startsWith("npm ");
    });
  });
};

const shouldInstallDependencies = (cwd, component, files) => {
  const nodeModulesPath = path.join(cwd, "node_modules");
  const depsChanged =
    hasDependencyFiles(component) && dependenciesChanged(component, files);

  return !fs.existsSync(nodeModulesPath) || depsChanged;
};

const hasDependencyFiles = (component) => {
  return (component.dependencyFiles?.length || 0) > 0;
};

const runLifecycleCommand = async (stage, commands, cwd, project, component) => {
  if (!commands) return;

  await runCommands(commands, cwd, buildContext(stage, project, component));
};

const buildContext = (stage, project, component) => ({
  stage,
  project: project.name,
  component: component.name,
});
