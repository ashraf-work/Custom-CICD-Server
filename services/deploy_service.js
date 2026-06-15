import { componentChanged, getChangedFiles } from "../utils/pathMatcher.js";
import { validateEnv } from "../utils/validateEnv.js";
import { CICDError } from "../utils/CICDError.js";
import {
  sendDeploymentFailureEmail,
  sendDeploymentSuccessEmail,
} from "./email_service.js";
import { saveLKG } from "./lkg_service.js";
import { rollbackToLKG } from "./rollback_service.js";
import { runHealthCheck } from "./health_service.js";
import { runLocalDeployment } from "./local_deploy_service.js";
import { runRemoteDeployment } from "./remote_deploy_service.js";
import { getCurrentSha } from "./current_sha_service.js";

export const processDeployment = async (project, commits, metadata) => {
  const files = getChangedFiles(commits);
  const changedComponents = getChangedComponents(project, files);

  for (const component of changedComponents) {
    validateComponent(component, project);
    await deployComponent(component, project, files, metadata);
  }
};

const getChangedComponents = (project, files) => {
  return project.components.filter((component) => {
    return componentChanged(component, files);
  });
};

const validateComponent = (component, project) => {
  if (!component.mode) {
    throw new CICDError({
      stage: "mode-detection",
      project: project.name,
      component: component.name,
      originalError: "component mode is required",
    });
  }

  validateEnv(component.env || [], {
    project: project.name,
    component: component.name,
  });
};

const deployComponent = async (component, project, files, metadata) => {
  const componentId = `${project.name}/${component.name}`;

  try {
    console.log(`[Deploy] Starting deployment for ${componentId}`);

    await runDeploymentByMode(component, project, files);
    await verifyDeployment(component, project);
    await markDeploymentSuccessful(component, project, metadata);
  } catch (error) {
    await handleDeploymentFailure(error, component, project, metadata);
  }
};

const runDeploymentByMode = async (component, project, files) => {
  if (component.mode === "local") {
    await runLocalDeployment(component, project, files);
    return;
  }

  if (component.mode === "remote") {
    await runRemoteDeployment(component, project, files);
    return;
  }

  throw new CICDError({
    stage: "mode-detection",
    project: project.name,
    component: component.name,
    originalError: `Unsupported deployment mode: ${component.mode}`,
  });
};

const verifyDeployment = async (component, project) => {
  const isHealthy = await runHealthCheck(component, project);
  if (isHealthy) return;

  throw new CICDError({
    stage: "health-check",
    project: project.name,
    component: component.name,
    originalError: "Health check failed after deployment",
  });
};

const markDeploymentSuccessful = async (component, project, metadata) => {
  const currentSha = await getCurrentSha(project, component);

  saveLKG(project.name, component.name, currentSha);

  await sendDeploymentSuccessEmail({
    project: project.name,
    component: component.name,
    commitMessage: metadata?.commitMessage,
    commitAuthor: metadata?.commitAuthor,
  });
};

const handleDeploymentFailure = async (error, component, project, metadata) => {
  const componentId = `${project.name}/${component.name}`;
  console.error(`[Deploy] Failed: ${componentId} - ${error.message}`);

  await sendDeploymentFailureEmail(
    new CICDError({
      stage: "deployment-failure",
      project: project.name,
      component: component.name,
      command: error.command,
      originalError: error.originalError || error.message,
    }),
    metadata
  );

  const rollbackSuccess = await rollbackToLKG(project, component);

  error.message += rollbackSuccess
    ? " | Rollback succeeded"
    : " | Rollback failed, manual intervention required";
  error.rollbackAttempted = true;
  error.rollbackSuccess = rollbackSuccess;

  throw error;
};
