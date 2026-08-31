const Module = globalThis.process.getBuiltinModule("node:module");
const RESOLVE_FILENAME = "_resolveFilename";
const origRequire = Module.prototype.require;
const origResolve = Module[RESOLVE_FILENAME];

Module[RESOLVE_FILENAME] = function (request, parent, isMain, options) {
  if (request.includes("typescript/lib/tsserverlibrary")) {
    return origResolve.call(this, "@typescript/typescript6/lib/tsserverlibrary.js", parent, isMain, options);
  }
  if (request === "typescript" || request.startsWith("typescript/")) {
    const updated = request.replace(/^typescript/, "@typescript/typescript6");
    return origResolve.call(this, updated, parent, isMain, options);
  }
  return origResolve.call(this, request, parent, isMain, options);
};

Module.prototype.require = function (id) {
  if (id.includes("typescript/lib/tsserverlibrary")) {
    return origRequire.call(this, "@typescript/typescript6/lib/tsserverlibrary.js");
  }
  if (id === "typescript" || id.startsWith("typescript/")) {
    return origRequire.call(this, id.replace(/^typescript/, "@typescript/typescript6"));
  }
  return origRequire.call(this, id);
};
