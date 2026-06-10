/**
 * Node modules
 */
import { exec } from "child_process";
import path from "path";
import fs from "node:fs";

/**
 * Custom modules
 */
import {
  componentChanged,
  dependenciesChanged,
  getChangedFiles,
} from "../utils/pathMatcher.js";
import { validateEnv } from "../utils/validateEnv.js";
import { CICDError } from "../utils/CICDError.js";
import { sendTelegramAlert, sendTelegramSuccess } from "./telegram_service.js";
import { runSSHCommands } from "./ssh_service.js";
import { saveLKG } from "./lkg_service.js";
import { rollbackToLKG } from "./rollback_service.js";
import { runHealthCheck } from "./health_service.js";

/**
 * Processes deployment for a given project and its components
 * @param {Object} project - The project configuration object
 * @param {Array} commits - List of commits from the webhook payload
 * @param {Object} metadata - Additional metadata such as commit message and author
 */
export const processDeployment = async (project, commits, metadata) => {
  // Get the list of changed files from the commits
  const files = getChangedFiles(commits);

  // Iterate over each component in the project and deploy if changed
  for (const component of project.components) {
    // Skip deployment if the component has not changed
    if (!componentChanged(component, files)) continue;

    if (!component.mode) {
      throw new CICDError({
        stage: "mode-detection",
        project: project.name,
        component: component.name,
        originalError: "component mode is required",
      });
    }

    // Validate environment variables if specified
    if (component.env && component.env.length > 0) {
      validateEnv(component.env, {
        project: project.name,
        component: component.name,
      });
    }

    // Deploy the component
    await deployComponent(component, project, files, metadata);
  }
};

/**
 * Deploys a single component with LKG tracking and rollback
 * @param {Object} component - Component configuration
 * @param {Object} project - Project configuration
 * @param {Array} files - Changed files
 * @param {Object} metadata - Commit metadata
 */
const deployComponent = async (component, project, files, metadata) => {
  const componentId = `${project.name}/${component.name}`;

  try {
    console.log(`[Deploy] Starting deployment for ${componentId}`);

    // Run deployment based on mode
    if (component.mode === "local") {
      await runLocal(component, project, files);
    } else if (component.mode === "remote") {
      await runRemote(component, project, files);
    }

    // Run health check if configured
    const isHealthy = await runHealthCheck(component, project);

    if (!isHealthy) {
      throw new CICDError({
        stage: "health-check",
        project: project.name,
        component: component.name,
        originalError: "Health check failed after deployment, rollback initiated",
      });
    }

    // Save current commit as LKG (deployment + health check passed)
    const currentSha = await getCurrentSha(project, component);
    console.log(`[Deploy] Saving LKG for ${componentId}: ${currentSha}`);
    saveLKG(project.name, component.name, currentSha);

    // Send success notification
    await sendTelegramSuccess({
      project: project.name,
      component: component.name,
      commitMessage: metadata?.commitMessage,
      commitAuthor: metadata?.commitAuthor,
    });
  } catch (error) {
    console.error(`[Deploy] Failed: ${componentId} - ${error.message}`);

    // Send alert notification via Telegram
    await sendTelegramAlert(
      new CICDError({
        stage: "deployment-failure",
        project: project.name,
        component: component.name,
        originalError: error.message,
      })
    );

    // Attempt rollback
    const rollbackSuccess = await rollbackToLKG(project, component);

    if(rollbackSuccess) {
      error.message += " | Rollback succeeded";
    } else {
      error.message += " | Rollback failed, manual intervention required";
    }

    // Re-throw with rollback status
    error.rollbackAttempted = true;
    error.rollbackSuccess = rollbackSuccess;
    throw error;
  }
};

/**
 * Gets current commit SHA (works for both local and remote)
 */
const getCurrentSha = async (project, component) => {
  if (component.mode === "local") {
    return await run("git rev-parse HEAD", project.localPath, {
      stage: "get-sha",
      project: project.name,
    });
  } else {
    // For remote, execute via SSH
    const ssh = component.ssh;
    // Use single quotes for the remote command to prevent local shell expansion/splitting
    const command = `ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
   -i "${ssh.keyPath}" -p 22 ${ssh.user}@${ssh.host} \
   'cd "${ssh.remotePath}" && git rev-parse HEAD'`;

    const result = await run(
      command,
      undefined,
      { stage: "get-sha", project: project.name }
    );

    return result.trim();
  }
};

/**
 * Normalizes command input to an array
 * @param {string|Array} cmd - Command or array of commands
 * @returns {Array} - Normalized array of commands
 */
const normalize = (cmd) => (Array.isArray(cmd) ? cmd : [cmd]);

/**
 * Runs multiple commands sequentially
 * @param {Array} commands - List of commands to run
 * @param {string} cwd - Current working directory for the commands
 * @param {Object} context - Context information for error handling
 * @returns {Promise<void>}
 */
const runCommands = async (commands, cwd, context) => {
  for (const command of normalize(commands)) {
    await run(command, cwd, context);
  }
};

/**
 * Runs a shell command in a given directory
 * @param {string} command - The command to execute
 * @param {string} cwd - The current working directory
 * @param {Object} context - Context information for error handling
 * @returns {Promise<string>} - Resolves with command output or rejects with error
 */
export const run = (command, cwd, context) => {
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

/**
 * Runs deployment for a local component
 * @param {Object} component - The component configuration object
 * @param {Object} project - The project configuration object
 * @param {Array} files - List of changed files
 * @returns {Promise<void>}
 */
const runLocal = async (component, project, files) => {
  // Determine the component's working directory
  const componentCWD = path.join(project.localPath, component.path || "");

  if (!fs.existsSync(componentCWD)) {
    throw new CICDError({
      stage: "preflight",
      project: project.name,
      component: component.name,
      originalError: `Component path does not exist: ${componentCWD}`,
    });
  }

  const { commands } = component;

  // Check if any Node.js related commands are present
  const usesNode = ["install", "build", "test"].some(
    (step) =>
      commands[step] &&
      normalize(commands[step]).some((cmd) => cmd.trim().startsWith("npm "))
  );

  // If Node.js is used, ensure package.json exists
  if (usesNode) {
    const pkgPath = path.join(componentCWD, "package.json");
    if (!fs.existsSync(pkgPath)) {
      throw new CICDError({
        stage: "preflight",
        project: project.name,
        component: component.name,
        originalError: `package.json not found at ${pkgPath}`,
      });
    }
  }

  // Path to node_modules directory
  const nodeModulesPath = path.join(componentCWD, "node_modules");

  // Determine if dependencies have changed and if installation is needed
  const depsChanged =
    component.dependencyFiles.length > 0 &&
    dependenciesChanged(component, files);
  const needInstall = !fs.existsSync(nodeModulesPath) || depsChanged;

  if (needInstall && commands.install) {
    await run(commands.install, componentCWD, {
      stage: "install",
      project: project.name,
      component: component.name,
    });
  }

  if (commands.test) {
    await run(commands.test, componentCWD, {
      stage: "test",
      project: project.name,
      component: component.name,
    });
  }

  if (commands.build) {
    await run(commands.build, componentCWD, {
      stage: "build",
      project: project.name,
      component: component.name,
    });
  }

  if (commands.deploy) {
    await runCommands(commands.deploy, componentCWD, {
      stage: "deploy",
      project: project.name,
      component: component.name,
    });
  }
};

/**
 * Runs deployment for a remote component via SSH
 * @param {Object} component - The component configuration object
 * @param {Object} project - The project configuration object
 * @param {Array} files - List of changed files
 * @returns {Promise<void>}
 */
const runRemote = async (component, project, files) => {
  const { commands } = component;

  // Determine if dependencies have changed and if installation is needed
  const depsChanged =
    component.dependencyFiles.length > 0 &&
    dependenciesChanged(component, files);

  const remoteCommands = [];

  if (commands.pull) {
    remoteCommands.push(...normalize(commands.pull));
  }

  if (commands.install) {
    if (depsChanged) {
      remoteCommands.push(commands.install);
    } else {
      // Install only if node_modules does not exist
      remoteCommands.push(`[ -d node_modules ] || ${commands.install}`);
    }
  }

  if (commands.test) {
    remoteCommands.push(...normalize(commands.test));
  }

  if (commands.build) {
    remoteCommands.push(...normalize(commands.build));
  }

  if (commands.deploy) {
    remoteCommands.push(...normalize(commands.deploy));
  }

  // Execute the accumulated remote commands via SSH
  await runSSHCommands(project, component, remoteCommands, {
    env: component.env || [],
  });
};
