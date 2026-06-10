/**
 * Telegram Service Module
 * Handles sending alerts via Telegram
 * @error {Object} error - Error details
 * @metadata {Object} metadata - Additional metadata for the alert
*/
export const sendTelegramAlert = async (error, metadata = {}) => {
  const message = `
🚨 CI/CD Deployment Failed

Project: ${error.project}
Component: ${error.component}
Stage: ${error.stage}

Command:
${error.command || "N/A"}

Error:
${error.originalError}

Commit:
${metadata.commitMessage || "N/A"}
Author:
${metadata.commitAuthor || "N/A"}

Time:
${error.timestamp}
`;

  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
      }),
    }
  );
};

/**
 * Send a success alert via Telegram
 * @param {Object} params - Parameters for the success message
 * @param {string} params.project - Project name
 * @param {string} params.component - Component name
 * @param {string} params.commitMessage - Commit message
 * @param {string} params.commitAuthor - Commit author
*/
export const sendTelegramSuccess = async ({
  project,
  component,
  commitMessage,
  commitAuthor,
}) => {
  const message = `
✅ CI/CD Deployment Successful

Project: ${project}
Component: ${component}

Commit:
${commitMessage || "N/A"}
Author:
${commitAuthor || "N/A"}

Time:
${new Date().toISOString()}
`;

  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
      }),
    }
  );

  if (!res.ok) {
    console.error("Failed to send success Telegram message");
  }
};

/**
 * Send a rollback notification via Telegram
 * @param {Object} params - Parameters for the rollback message
 * @param {string} params.project - Project name
 * @param {string} params.component - Component name
 * @param {string} params.lkgSha - LKG SHA that was rolled back to
 * @param {string} params.lkgDeployedAt - When the LKG was originally deployed
 * @param {boolean} params.success - Whether rollback succeeded
 * @param {string} [params.errorMessage] - Error message if rollback failed
 */
export const sendTelegramRollback = async ({
  project,
  component,
  lkgSha,
  lkgDeployedAt,
  success,
  errorMessage,
}) => {
  const emoji = success ? "🔄" : "💥";
  const status = success ? "Rollback Successful" : "Rollback Failed";

  const message = `
${emoji} CI/CD ${status}

Project: ${project}
Component: ${component}

LKG SHA: ${lkgSha || "N/A"}
LKG Deployed At: ${lkgDeployedAt || "N/A"}
${!success && errorMessage ? `\nError:\n${errorMessage}` : ""}
${!success ? "\n⚠️ Manual intervention required!" : ""}

Time: ${new Date().toISOString()}
`;

  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
      }),
    }
  );

  if (!res.ok) {
    console.error("Failed to send rollback Telegram message");
  }
};
