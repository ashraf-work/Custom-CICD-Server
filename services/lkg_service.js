/**
 * LKG (Last Known Good) SHA Storage Service
 * Manages persistent storage of last successfully deployed commits
 */

/**
 * Node modules
 */
import fs from "node:fs";
import path from "node:path";

const LKG_FILE = path.join(process.cwd(), "store", "lkg.json");

/**
 * Reads the entire LKG store
 * @returns {Object} - LKG data for all projects/components
 */
const readStore = () => {
  try {
    if (!fs.existsSync(LKG_FILE)) return {};
    const data = fs.readFileSync(LKG_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
};

/**
 * Writes the entire LKG store
 * @param {Object} data - LKG data to persist
 */
const writeStore = (data) => {
  const dir = path.dirname(LKG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LKG_FILE, JSON.stringify(data, null, 2));
};

/**
 * Gets the LKG SHA for a specific project/component
 * @param {string} projectName - Project name
 * @param {string} componentName - Component name
 * @returns {Object|null} - LKG data or null if not found
 */
export const getLKG = (projectName, componentName) => {
  const store = readStore();
  return store[projectName]?.[componentName] || null;
};

/**
 * Saves the LKG SHA for a specific project/component
 * @param {string} projectName - Project name
 * @param {string} componentName - Component name
 * @param {string} sha - Commit SHA to save
 */
export const saveLKG = (projectName, componentName, sha) => {
  const store = readStore();

  if (!store[projectName]) store[projectName] = {};

  store[projectName][componentName] = {
    sha,
    deployedAt: new Date().toISOString(),
    verifiedHealthy: true,
  };

  writeStore(store);
  console.log(
    `[LKG] Saved ${projectName}/${componentName} → ${sha.slice(0, 7)}`
  );
};

/**
 * Gets all LKG entries (for debugging/monitoring)
 * @returns {Object} - All LKG data
 */
export const getAllLKG = () => readStore();
