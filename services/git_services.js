/**
 * Node modules
*/
import fs from "node:fs";
import path from "path";

/**
 * Custom modules
*/
import { CICDError } from "../utils/CICDError.js";
import { run } from "./deploy_service.js";

/**
 * Syncs the local repository with the remote repository.
 * If the local repository does not exist, it clones it.
 * If it exists, it fetches the latest changes and resets the local branch.
 * @param {Object} project - The project configuration object.
 * @param {string} clone_url - The URL to clone the repository from.
*/
export const syncRepo = async (project, clone_url) => {

  // Ensure the localPath directory exists and is writable
  try {
    fs.mkdirSync(project.localPath, { recursive: true });
    fs.accessSync(project.localPath, fs.constants.W_OK);
  } catch (err) {
    throw new CICDError({
      stage: "workspace-permission",
      project: project.name,
      originalError: `No write access to localPath: ${project.localPath}`,
    });
  }

  // Check if the .git directory exists in the localPath
  const gitDir = path.join(project.localPath, ".git");
  if (!fs.existsSync(gitDir)) {
    await run(
      `git clone -b ${project.branch} ${clone_url} ${project.localPath}`,
      undefined,
      {
        stage: "git-clone",
        project: project.name,
      }
    );
    return;
  }

  // Verify the remote URL matches the expected repository
  const remote = await run(
    `git config --get remote.origin.url`,
    project.localPath,
    {
      stage: "git-remote-check",
      project: project.name,
    }
  );

  if (!remote.includes(project.repository)) {
    throw new CICDError({
      stage: "sync-repository",
      project: project.name,
      originalError: "Repository mismatch in localPath",
    });
  }


  // Fetch the latest changes from the remote repository
  await run(`git fetch origin`, project.localPath, {
    stage: "git-fetch",
    project: project.name,
  });

  // Reset the local branch to match the remote branch
  await run(`git reset --hard origin/${project.branch}`, project.localPath, {
    stage: "git-reset",
    project: project.name,
  });

  // Clean untracked files
  await run(`git clean -fd`, project.localPath, {
    stage: "git-clean",
    project: project.name,
  });
};
