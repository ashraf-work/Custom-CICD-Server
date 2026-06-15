import "dotenv/config";
import express from "express";

import { verifySignature } from "./middlewares/verifySignature.js";
import { processDeployment } from "./services/deploy_service.js";
import { syncRepo } from "./services/git_services.js";
import { setCommitStatus } from "./services/github_status_service.js";

import config from "./config/cicd_config.json" with { type: "json" };
import { runs } from "./store/runs.js";

const app = express();
const PORT = process.env.PORT;

app.use(express.json());

app.get("/health", (_, res) => {
  res.status(200).json({
    status: "OK",
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
  });
});

app.post("/webhook/github", verifySignature, async (req, res) => {
  res.status(200).send("OK");

  const webhookBody = req.body || {};
  const repo = webhookBody?.repository?.full_name;
  const branch = webhookBody?.ref?.replace("refs/heads/", "");
  const commits = webhookBody?.commits || [];
  const commitSha = webhookBody?.after;

  const project = config.projects.find(
    (p) => p.repository === repo && p.branch === branch
  );

  if (!project || !commitSha) return;

  const target_url = `${process.env.SERVER_URL}/runs/${commitSha}`;

  runs.set(commitSha, {
    project: project.name,
    repository: repo,
    branch,
    commitSha,
    status: "pending",
    startedAt: new Date().toISOString(),
    commits,
  });

  try {
    await setCommitStatus({
      repo,
      sha: commitSha,
      state: "pending",
      description: "Deployment in progress",
      targetUrl: target_url,
    });

    await syncRepo(project, webhookBody?.repository?.clone_url);

    await processDeployment(project, commits, {
      commitMessage: webhookBody.head_commit?.message,
      commitAuthor: webhookBody.head_commit?.author?.name,
    });

    runs.get(commitSha).status = "success";
    runs.get(commitSha).finishedAt = new Date().toISOString();

    await setCommitStatus({
      repo,
      sha: commitSha,
      state: "success",
      description: "CI/CD pipeline completed successfully",
      targetUrl: target_url,
    });
  } catch (error) {
    console.error("Deployment failed:", error);

    runs.get(commitSha).status = "failure";
    runs.get(commitSha).finishedAt = new Date().toISOString();
    runs.get(commitSha).error = error.message;

    await setCommitStatus({
      repo,
      sha: commitSha,
      state: "failure",
      description: "CI/CD pipeline failed",
      targetUrl: target_url,
    });
  }
});

app.get("/runs/:commitSha", (req, res) => {
  const run = runs.get(req.params.commitSha);

  if (!run) {
    return res.status(404).json({
      success: false,
      message: "Run not found",
    });
  }

  res.status(200).json({
    success: true,
    ...run,
  });
});

app.listen(PORT, () => console.log(`CI/CD Server is running on PORT ${PORT}`));
