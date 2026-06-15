export const getChangedFiles = (commits) => {
  return commits.flatMap((c) => [...c.added, ...c.modified, ...c.removed]);
};

export function componentChanged(component, files) {
  // Missing path means the whole repo is one component.
  if (!component.path || component.path === "/") return files.length > 0;

  return files.some((file) => file.startsWith(component.path));
}

export const dependenciesChanged = (component, files) => {
  return files.some((f) => component.dependencyFiles?.includes(f));
};
