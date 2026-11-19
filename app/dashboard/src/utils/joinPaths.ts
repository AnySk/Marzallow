// Join URL path segments, collapsing duplicate slashes.
// Same behaviour as the `joinPaths` helper previously imported from @remix-run/router.
export const joinPaths = (paths: string[]): string =>
  paths.join("/").replace(/\/\/+/g, "/");
