import path from "path";

import {
  runCommand,
  runCommands,
  toCommandList,
} from "../utils/commandRunner.js";
import { getLKG } from "./lkg_service.js";
import { runSSHCommands } from "./ssh_service.js";
import { sendRollbackEmail } from "./email_service.js";

export const rollbackToLKG = async (project, component) => {
  const lkg = getLKG(project.name, component.name);

  if (!lkg) {
    console.error(
      `[Rollback] No LKG found for ${project.name}/${component.name}`
    );
    console.error(`[Rollback] Manual intervention required!`);
    await sendRollbackEmail({
      project: project.name,
      component: component.name,
      lkgSha: null,
      lkgDeployedAt: null,
      success: false,
      errorMessage: "No LKG found, manual intervention required",
    });
    return false;
  }

  console.log(
    `[Rollback] Rolling back ${component.name} to LKG: ${lkg.sha.slice(0, 7)}`
  );
  console.log(`[Rollback] LKG was deployed at: ${lkg.deployedAt}`);

  try {
    if (component.mode === "local") {
      await rollbackLocal(project, component, lkg.sha);
    } else if (component.mode === "remote") {
      await rollbackRemote(project, component, lkg.sha);
    }

    console.log(`[Rollback] ✓ Successfully rolled back ${component.name}`);
    await sendRollbackEmail({
      project: project.name,
      component: component.name,
      lkgSha: lkg.sha.slice(0, 7),
      lkgDeployedAt: lkg.deployedAt,
      success: true,
    });
    return true;
  } catch (err) {
    console.error(`[Rollback] ✗ Rollback failed: ${err.message}`);
    await sendRollbackEmail({
      project: project.name,
      component: component.name,
      lkgSha: lkg.sha.slice(0, 7),
      lkgDeployedAt: lkg.deployedAt,
      success: false,
      errorMessage: err.message,
    });
    return false;
  }
};

const rollbackLocal = async (project, component, sha) => {
  const cwd = path.join(project.localPath, component.path || "");
  const commands = component.commands || {};

  await runCommand(`git reset --hard ${sha}`, cwd, {
    stage: "rollback-reset",
    project: project.name,
    component: component.name,
  });

  if (commands.install) {
    await runCommands(
      commands.install,
      cwd,
      buildContext("rollback-install", project, component)
    );
  }

  if (commands.build) {
    await runCommands(
      commands.build,
      cwd,
      buildContext("rollback-build", project, component)
    );
  }

  if (commands.deploy) {
    await runCommands(
      commands.deploy,
      cwd,
      buildContext("rollback-deploy", project, component)
    );
  }
};

const rollbackRemote = async (project, component, sha) => {
  const commands = component.commands || {};
  const rollbackCommands = [];

  rollbackCommands.push("git fetch --all");
  rollbackCommands.push(`git reset --hard ${sha}`);

  if (commands.install) {
    rollbackCommands.push(...toCommandList(commands.install));
  }

  if (commands.build) {
    rollbackCommands.push(...toCommandList(commands.build));
  }

  if (commands.deploy) {
    rollbackCommands.push(...toCommandList(commands.deploy));
  }

  await runSSHCommands(project, component, rollbackCommands, {
    env: component.env || [],
  });
};

const buildContext = (stage, project, component) => ({
  stage,
  project: project.name,
  component: component.name,
});
