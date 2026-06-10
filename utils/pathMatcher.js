/**
 * Utility functions for matching changed files to components
 * @param {Array} commits - List of commits from the webhook payload
 * @returns {Array} - List of changed file paths
*/
export const getChangedFiles = (commits) => {
  return commits.flatMap((c) => [...c.added, ...c.modified, ...c.removed]);
};

/**
 * Checks if a component has changed based on the list of changed files
 * @param {Object} component - The component configuration object
 * @param {Array} files - List of changed file paths
 * @returns {Boolean} - True if the component has changed, false otherwise
*/
export function componentChanged(component, files) {
  // If no path is defined, assume whole repo is the component
  if (!component.path || component.path === "/") return files.length > 0;

  return files.some((file) => file.startsWith(component.path));
}

/**
 * Checks if any dependency files of a component have changed
 * @param {Object} component - The component configuration object
 * @param {Array} files - List of changed file paths
 * @returns {Boolean} - True if any dependency files have changed, false otherwise
*/
export const dependenciesChanged = (component, files) => {
  return files.some((f) => component.dependencyFiles?.includes(f));
};
