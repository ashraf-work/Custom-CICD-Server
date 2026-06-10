/**
 * Custom module
*/
import { CICDError } from "./CICDError.js";

/**
 * Validate that required environment variables are set
 * @param {Array} required - List of required environment variable names
 * @param {Object} context - Contextual information for error reporting
 * @throws {CICDError} - If any required environment variable is missing
*/
export const validateEnv = (required, context = {}) => {
  for (const key of required) {
    if (!process.env[key]) {
      throw new CICDError({
        stage: "env-validation",
        project: context.project,
        component: context.component,
        originalError: `Missing required env variable: ${key}`,
      });
    }
  }
};
