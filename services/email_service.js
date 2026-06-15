import { Resend } from "resend";

export const sendDeploymentFailureEmail = async (error, metadata = {}) => {
  await sendEmail({
    subject: `CI/CD failed: ${error.project}/${error.component}`,
    text: `
CI/CD Deployment Failed

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
`,
  });
};

export const sendDeploymentSuccessEmail = async ({
  project,
  component,
  commitMessage,
  commitAuthor,
}) => {
  await sendEmail({
    subject: `CI/CD success: ${project}/${component}`,
    text: `
CI/CD Deployment Successful

Project: ${project}
Component: ${component}

Commit:
${commitMessage || "N/A"}
Author:
${commitAuthor || "N/A"}

Time:
${new Date().toISOString()}
`,
  });
};

export const sendRollbackEmail = async ({
  project,
  component,
  lkgSha,
  lkgDeployedAt,
  success,
  errorMessage,
}) => {
  const status = success ? "Rollback Successful" : "Rollback Failed";

  await sendEmail({
    subject: `CI/CD ${status}: ${project}/${component}`,
    text: `
CI/CD ${status}

Project: ${project}
Component: ${component}

LKG SHA: ${lkgSha || "N/A"}
LKG Deployed At: ${lkgDeployedAt || "N/A"}
${!success && errorMessage ? `\nError:\n${errorMessage}` : ""}
${!success ? "\nManual intervention required!" : ""}

Time: ${new Date().toISOString()}
`,
  });
};

const sendEmail = async ({ subject, text }) => {
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is missing, email not sent");
    return;
  }

  const from = process.env.EMAIL_FROM;
  const to = process.env.EMAIL_TO;

  if (!from || !to) {
    console.error("EMAIL_FROM or EMAIL_TO is missing, email not sent");
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from,
    to: to.split(",").map((email) => email.trim()),
    subject,
    text: text.trim(),
  });

  if (error) {
    console.error("Failed to send email:", error.message || error);
  }
};
