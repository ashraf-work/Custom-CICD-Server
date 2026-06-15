# Custom CI/CD Server

A lightweight, configuration-driven CI/CD server built with Node.js and Express. It supports multi-project and multi-component deployments, handling both local and remote (SSH) deployments based on GitHub Webhook events.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration Guide](#configuration-guide)
  - [Project Configuration](#project-configuration)
  - [Component Configuration](#component-configuration)
  - [Deployment Modes](#deployment-modes)
  - [SSH Configuration](#ssh-configuration-remote-mode-only)
  - [Commands Object](#commands-object)
  - [Environment Variables](#using-environment-variables)
- [Health Check Configuration](#health-check-configuration)
  - [HTTP Health Check](#1-http-health-check)
  - [PM2 Health Check](#2-pm2-health-check)
  - [Custom Command Health Check](#3-custom-command-health-check)
- [Rollback Mechanism (LKG)](#rollback-mechanism-lkg---last-known-good)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Multi-Project Support**: Manage multiple repositories from a single CI/CD server.
- **Component-Based**: Deploy specific parts of a monorepo (e.g., Client, Server) independently.
- **Smart Change Detection**: Only deploys components that have changed in the commit.
- **Dependency Management**: Automatically detects changes in dependency files (e.g., `package.json`) and runs install commands.
- **Deployment Modes**:
  - **Local**: Deploys applications running on the same server.
  - **Remote**: Deploys applications on remote servers via SSH.
- **Health Checks**: Verify deployments are working before marking as successful.
- **Automatic Rollback**: Reverts to Last Known Good (LKG) state on deployment or health check failure.
- **Notifications**: Sends success/failure/rollback alerts via email using Resend.

---

## Prerequisites

Ensure the following are installed on the CI/CD server:

- **Node.js** (v18+ recommended)
- **npm** or **yarn**
- **Git**
- **PM2** (for process management): `npm install -g pm2`
- **AWS CLI** (if deploying to S3/CloudFront): [Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

For remote deployments:
- SSH access to target servers
- SSH private key configured on the CI/CD server

---

## Installation

1. **Clone the repository**:

   ```bash
   git clone <repo-url>
   cd CICD_SERVER
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Configure environment variables**:
   
   Create a `.env` file in the root directory:

   ```env
   # Server Configuration
   PORT=5001
   SERVER_URL=https://your-cicd-server.com

   # GitHub Webhook Secret
   GITHUB_SECRET=your_webhook_secret

   # GitHub Personal Access Token (for commit status updates)
   GITHUB_TOKEN=your_github_token

   # Email Notifications
   RESEND_API_KEY=your_resend_api_key
   EMAIL_FROM="CI/CD Server <deploy@yourdomain.com>"
   EMAIL_TO=admin@yourdomain.com
   ```

4. **Create configuration file**:
   
   Create `config/cicd_config.json` following the [Configuration Guide](#configuration-guide).

5. **Start the server**:

   ```bash
   # Development
   npm run dev

   # Production (with PM2)
   pm2 start index.js --name cicd-server
   pm2 save
   ```

6. **Setup GitHub Webhook**:
   
   In your GitHub repository, go to **Settings → Webhooks → Add webhook**:
   
   | Field | Value |
   |-------|-------|
   | Payload URL | `http://<your-server-ip>:5001/webhook/github` |
   | Content type | `application/json` |
   | Secret | Same as `GITHUB_SECRET` in `.env` |
   | Events | Just the push event |

## Configuration Guide

The core of the system is the `config/cicd_config.json` file. This file defines your projects, their components, and deployment strategies.

### File Structure

The configuration file must contain a root object with a `projects` array.

```json
{
  "projects": [
    {
      // Project 1 configuration
    },
    {
      // Project 2 configuration
    }
  ]
}
```

### Project Configuration

Each object in the `projects` array represents a GitHub repository.

| Field        | Type   | Required | Description                                                                   |
| ------------ | ------ | -------- | ----------------------------------------------------------------------------- |
| `name`       | String | Yes      | A unique identifier for the project.                                          |
| `repository` | String | Yes      | The full GitHub repository name (e.g., `username/repo`).                      |
| `branch`     | String | Yes      | The branch to track for deployments (e.g., `main`).                           |
| `localPath`  | String | Yes      | Absolute path on the CI/CD server where the repository will be cloned/synced. |
| `components` | Array  | Yes      | List of components (services/apps) within this repository.                    |

### Component Configuration

A project can have multiple components.

| Field             | Type   | Required    | Description                                                                                                                                      |
| ----------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`            | String | Yes         | Name of the component.                                                                                                                           |
| `path`            | String | No          | Relative path to the component's root within the repository. Defaults to repo root if omitted. Used to detect changes and set working directory. |
| `mode`            | String | Yes         | Deployment mode: `"local"` or `"remote"`.                                                                                                        |
| `dependencyFiles` | Array  | No          | List of files (relative to repo root) that trigger an install command when changed (e.g., `package.json`).                                       |
| `env`             | Array  | No          | List of environment variable names required by the component.                                                                                    |
| `ssh`             | Object | Conditional | **Required** if `mode` is `"remote"`. SSH connection details.                                                                                    |
| `healthCheck`     | Object | No          | Health check configuration to verify deployment success. See [Health Check Configuration](#health-check-configuration).                          |
| `commands`        | Object | Yes         | Lifecycle commands for deployment.                                                                                                               |

### Deployment Modes

#### 1. Local Mode (`"mode": "local"`)

Use this when the application runs on the same server as this CI/CD system.

- The repository is automatically synced to `localPath`.
- Commands are executed inside `localPath` (joined with `component.path`).
- **Note:** You do not need a `pull` command in `local` mode as the system handles git sync automatically.

#### 2. Remote Mode (`"mode": "remote"`)

Use this when the application runs on a different server.

- The CI/CD server connects to the remote server via SSH.
- Commands are executed on the remote server in the directory specified by `ssh.remotePath`.
- **Note:** You typically need a `pull` command (e.g., `git pull origin main`) to update the code on the remote server.

### SSH Configuration (Remote Mode Only)

| Field        | Type   | Required | Description                                                          |
| ------------ | ------ | -------- | -------------------------------------------------------------------- |
| `host`       | String | Yes      | Remote server IP address or hostname.                                |
| `user`       | String | Yes      | SSH username.                                                        |
| `port`       | Number | No       | SSH port (default: 22).                                              |
| `keyPath`    | String | Yes      | Absolute path to the private SSH key on the CI/CD server.            |
| `remotePath` | String | Yes      | Absolute path on the remote server where the application is located. |

### Commands Object

Define the shell commands to run for each stage. You can provide a single string or an array of strings.

| Field     | Description                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| `pull`    | Commands to fetch code (Remote mode only).                                                                        |
| `install` | Commands to install dependencies (e.g., `npm ci`). Runs if `dependencyFiles` change or `node_modules` is missing. |
| `build`   | Commands to build the project (e.g., `npm run build`).                                                            |
| `test`    | Commands to run tests.                                                                                            |
| `deploy`  | Commands to start/restart the application (e.g., `pm2 reload app`).                                               |

### Using Environment Variables

You can use environment variables in your commands (e.g., `$MY_API_KEY`).

1.  **Define in `.env`**: Add the variable to the `.env` file of the CI/CD server.
    ```env
    MY_API_KEY=secret_value_123
    ```
2.  **Whitelist in Config**: Add the variable name to the `env` array in your component configuration.
    ```json
    "env": ["MY_API_KEY"]
    ```
3.  **Use in Commands**: Reference it with `$` prefix.
    ```json
    "commands": {
      "build": "echo Building with key $MY_API_KEY && npm run build"
    }
    ```

**How it works:**

- **Local Mode**: The command inherits the environment variables from the CI/CD server process.
- **Remote Mode**: The CI/CD server reads the value from its own environment and injects it into the SSH command string (e.g., `MY_API_KEY='...' bash -c '...'`).

### Example Configuration

```json
{
  "projects": [
    {
      "name": "My-Web-App",
      "repository": "username/my-web-app",
      "branch": "main",
      "localPath": "/var/www/cicd/repos/my-web-app",
      "components": [
        {
          "name": "Backend-API",
          "path": "api/",
          "mode": "remote",
          "ssh": {
            "host": "192.168.1.50",
            "user": "deploy-user",
            "keyPath": "/home/cicd/.ssh/id_rsa",
            "remotePath": "/var/www/api"
          },
          "healthCheck": {
            "type": "http",
            "url": "https://api.example.com/health",
            "expectedStatus": 200,
            "retries": 3,
            "delay": 5000
          },
          "dependencyFiles": ["api/package.json", "api/package-lock.json"],
          "env": ["PORT", "DB_URI"],
          "commands": {
            "pull": "git pull origin main",
            "install": "npm ci",
            "build": "npm run build",
            "deploy": "pm2 reload api-server"
          }
        },
        {
          "name": "Frontend-App",
          "path": "client/",
          "mode": "local",
          "healthCheck": {
            "type": "http",
            "url": "https://example.com",
            "expectedStatus": 200
          },
          "dependencyFiles": ["client/package.json"],
          "env": ["S3_BUCKET", "CF_DISTRIBUTION_ID"],
          "commands": {
            "install": "npm ci",
            "build": "npm run build",
            "deploy": [
              "aws s3 sync dist/ \"s3://$S3_BUCKET\" --delete",
              "aws cloudfront create-invalidation --distribution-id \"$CF_DISTRIBUTION_ID\" --paths '/*'"
            ]
          }
        }
      ]
    }
  ]
}
```

---

## Health Check Configuration

Health checks verify that a deployment is working correctly before marking it as successful. If a health check fails, the system automatically triggers a rollback to the Last Known Good (LKG) state.

### Health Check Types

The system supports three types of health checks:

#### 1. HTTP Health Check

Performs an HTTP request to a specified URL and checks the response status code.

```json
"healthCheck": {
  "type": "http",
  "url": "https://api.example.com/health",
  "expectedStatus": 200,
  "timeout": 10000,
  "retries": 3,
  "delay": 5000
}
```

| Field            | Type   | Required | Default | Description                                      |
| ---------------- | ------ | -------- | ------- | ------------------------------------------------ |
| `type`           | String | Yes      | -       | Must be `"http"`.                                |
| `url`            | String | Yes      | -       | The URL to check (must be accessible from CI/CD server). |
| `expectedStatus` | Number | No       | 200     | Expected HTTP status code.                       |
| `timeout`        | Number | No       | 10000   | Request timeout in milliseconds.                 |
| `retries`        | Number | No       | 3       | Number of retry attempts before failing.         |
| `delay`          | Number | No       | 5000    | Delay between retries in milliseconds.           |

#### 2. PM2 Health Check

Checks if a PM2 process is running and has "online" status. Works for both local and remote deployments.

```json
"healthCheck": {
  "type": "pm2",
  "processName": "my-app",
  "retries": 3,
  "delay": 5000
}
```

| Field         | Type   | Required | Default | Description                              |
| ------------- | ------ | -------- | ------- | ---------------------------------------- |
| `type`        | String | Yes      | -       | Must be `"pm2"`.                         |
| `processName` | String | Yes      | -       | The PM2 process name to check.           |
| `retries`     | Number | No       | 3       | Number of retry attempts before failing. |
| `delay`       | Number | No       | 5000    | Delay between retries in milliseconds.   |

#### 3. Custom Command Health Check

Runs a custom shell command. The check passes if the command exits with code 0.

```json
"healthCheck": {
  "type": "command",
  "command": "curl -f http://localhost:3000/health",
  "retries": 3,
  "delay": 5000
}
```

| Field     | Type   | Required | Default | Description                                          |
| --------- | ------ | -------- | ------- | ---------------------------------------------------- |
| `type`    | String | Yes      | -       | Must be `"command"`.                                 |
| `command` | String | Yes      | -       | Shell command to execute. Exit code 0 = healthy.    |
| `retries` | Number | No       | 3       | Number of retry attempts before failing.             |
| `delay`   | Number | No       | 5000    | Delay between retries in milliseconds.               |

### Health Check Behavior

> **💡 Tip:** For remote deployments, use HTTP health checks with public URLs for the most reliable results.

- **Local Mode**: Commands run directly on the CI/CD server.
- **Remote Mode**: PM2 and command checks are automatically executed via SSH on the remote server.
- **No Health Check**: If `healthCheck` is not configured, the deployment is assumed successful after commands complete.

### Example with Health Check

```json
{
  "name": "Backend-API",
  "path": "api/",
  "mode": "remote",
  "ssh": {
    "host": "192.168.1.50",
    "user": "deploy-user",
    "keyPath": "/home/cicd/.ssh/id_rsa",
    "remotePath": "/var/www/api"
  },
  "healthCheck": {
    "type": "http",
    "url": "https://api.example.com/health",
    "expectedStatus": 200,
    "timeout": 10000,
    "retries": 3,
    "delay": 5000
  },
  "commands": {
    "pull": "git pull origin main",
    "install": "npm ci",
    "deploy": "pm2 reload api-server"
  }
}
```

---

## Rollback Mechanism (LKG - Last Known Good)

The CI/CD server implements an automatic rollback system using the **Last Known Good (LKG)** approach. This ensures that if a deployment fails or a health check doesn't pass, the system can automatically revert to the last successfully deployed state.

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  1. DEPLOYMENT STARTS                                           │
│     └── Execute: pull → install → build → deploy                │
├─────────────────────────────────────────────────────────────────┤
│  2. HEALTH CHECK (if configured)                                │
│     └── Verify deployment is working                            │
│     └── Retry up to N times with delay                          │
├─────────────────────────────────────────────────────────────────┤
│  3. ON SUCCESS                                                  │
│     └── Save current commit SHA as LKG                          │
│     └── Send success notification via email                     │
├─────────────────────────────────────────────────────────────────┤
│  4. ON FAILURE → AUTOMATIC ROLLBACK                             │
│     └── Fetch all branches: git fetch --all                     │
│     └── Reset to LKG: git reset --hard <lkg_sha>                │
│     └── Re-run: install → build → deploy                        │
│     └── Send rollback notification via email                    │
└─────────────────────────────────────────────────────────────────┘
```

### LKG Storage

The LKG data is stored in `store/lkg.json` and persists across server restarts.

```json
{
  "My-Project": {
    "Backend-API": {
      "sha": "a1b2c3d4e5f6...",
      "deployedAt": "2025-12-21T10:30:00.000Z",
      "verifiedHealthy": true
    },
    "Frontend-App": {
      "sha": "a1b2c3d4e5f6...",
      "deployedAt": "2025-12-21T10:32:00.000Z",
      "verifiedHealthy": true
    }
  }
}
```

### Rollback Behavior

| Mode   | Rollback Steps                                                  |
| ------ | --------------------------------------------------------------- |
| Local  | `git reset --hard <lkg_sha>` → install → build → deploy         |
| Remote | `git fetch --all` → `git reset --hard <lkg_sha>` → install → build → deploy (via SSH) |

### Rollback Scenarios

| Scenario                  | Action                                          |
| ------------------------- | ----------------------------------------------- |
| Deployment command fails  | Rollback to LKG automatically                   |
| Health check fails        | Rollback to LKG automatically                   |
| No LKG exists             | Skip rollback, send alert for manual intervention |
| LKG commit not found      | Skip rollback, send alert for manual intervention |
| Rollback itself fails     | Send failure alert, manual intervention required |

### Email Notifications

The system sends Resend email notifications for deployment and rollback events:

**Rollback Success:**
```
CI/CD Rollback Successful

Project: My-Project
Component: Backend-API

LKG SHA: a1b2c3d
LKG Deployed At: 2025-12-21T10:30:00.000Z

Time: 2025-12-21T12:00:00.000Z
```

**Rollback Failure:**
```
CI/CD Rollback Failed

Project: My-Project
Component: Backend-API

LKG SHA: a1b2c3d
LKG Deployed At: 2025-12-21T10:30:00.000Z

Error:
<error message>

Manual intervention required!

Time: 2025-12-21T12:00:00.000Z
```

### Important Notes

> **⚠️ Warning:** Force-pushing or rebasing can invalidate LKG commits. Avoid rewriting git history on production branches.

1. **First Deployment**: No LKG exists for the first deployment. If it fails, manual intervention is required.
2. **Component-Level Rollback**: Rollback is per-component. If Client fails, only Client rolls back; Server remains unchanged.
3. **Git History Required**: The LKG commit must exist in the git history. Force-pushed or rebased commits may cause rollback failures.
4. **Add to `.gitignore`**: Add `store/lkg.json` to your `.gitignore` to prevent committing deployment state.

---

## Project Structure

```
├── index.js                 # Main Express server entry point
├── config/
│   └── cicd_config.json     # Project and component configurations
├── middlewares/
│   └── verifySignature.js   # GitHub webhook signature verification
├── services/
│   ├── deploy_service.js    # Core deployment logic
│   ├── git_services.js      # Git sync operations
│   ├── github_status_service.js  # GitHub commit status updates
│   ├── health_service.js    # Health check implementations
│   ├── lkg_service.js       # LKG storage and retrieval
│   ├── rollback_service.js  # Rollback logic
│   ├── ssh_service.js       # SSH command execution
│   └── email_service.js     # Email notifications
├── store/
│   ├── lkg.json             # LKG state (auto-generated)
│   └── runs.js              # In-memory run tracking
├── utils/
│   ├── CICDError.js         # Custom error class
│   ├── pathMatcher.js       # File change detection utilities
│   └── validateEnv.js       # Environment variable validation
├── .env                     # Environment variables (not committed)
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check endpoint. Returns server status. |
| `POST` | `/webhook/github` | GitHub webhook receiver. Triggers deployments. |
| `GET` | `/runs/:commitSha` | Get deployment run details by commit SHA. |

### Example: Health Check Response

```json
{
  "status": "OK",
  "success": true,
  "message": "Server is healthy",
  "timestamp": "2025-12-21T10:00:00.000Z"
}
```

### Example: Run Details Response

```json
{
  "success": true,
  "project": "My-Project",
  "repository": "username/my-project",
  "branch": "main",
  "commitSha": "a1b2c3d4...",
  "status": "success",
  "startedAt": "2025-12-21T10:00:00.000Z",
  "finishedAt": "2025-12-21T10:02:00.000Z"
}
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Webhook returns 403 | Invalid signature | Verify `GITHUB_SECRET` matches webhook secret |
| SSH connection fails | Key permissions | Run `chmod 600 /path/to/key` on the SSH key |
| `git reset` fails on rollback | Commit not found | Run `git fetch --all` manually on target server |
| Health check always fails | URL not accessible | Ensure URL is reachable from CI/CD server |
| PM2 health check fails | Wrong process name | Verify process name with `pm2 list` |


### Manual Rollback

If automatic rollback fails, you can manually rollback:

```bash
# SSH into the target server
ssh user@server

# Navigate to project directory
cd /path/to/project

# Fetch latest and reset to a known good commit
git fetch --all
git reset --hard <commit_sha>

# Reinstall dependencies and restart
npm ci
pm2 reload app-name
```

---

<p align="center">
  Made with ❤️ for seamless deployments
</p>
