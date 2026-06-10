/**
 * Sets the status of a commit on GitHub.
 * @param {Object} params - Parameters for setting the commit status
 * @param {string} params.repo - Full repository name (e.g., "owner/repo")
 * @param {string} params.sha - Commit SHA to set the status for
 * @param {string} params.state - State of the status (pending, success, failure, error)
 * @param {string} params.description - Short description of the status
 * @param {string} params.targetUrl - URL to link to for more details
 * @param {string} [params.context] - Context of the status (default: "Custom CI/CD")
 * @returns {Promise<void>}
 */
export const setCommitStatus = async ({
  repo,
  sha,
  state, // pending | success | failure | error
  description,
  targetUrl,
  context = "Custom CI/CD Server",
}) => {
  const url = `https://api.github.com/repos/${repo}/statuses/${sha}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "custom-cicd-server",
    },
    body: JSON.stringify({
      state,
      description,
      target_url: targetUrl,
      context,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("GitHub status update failed:", text);
  }
};
