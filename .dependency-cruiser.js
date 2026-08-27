/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "shared-no-app-deps",
      comment: "Shared code must not depend on frontend, backend, or app layers — see shared/AGENTS.md",
      severity: "error",
      from: { path: "^shared" },
      to: { path: "^(frontend|backend|app)" },
    },
    {
      name: "frontend-no-backend-deps",
      comment: "Frontend code must not depend on backend layer — use GraphQL or shared/ instead",
      severity: "error",
      from: { path: "^frontend" },
      to: { path: "^backend" },
    },
    {
      name: "backend-no-frontend-deps",
      comment: "Backend code must not depend on frontend layer",
      severity: "error",
      from: { path: "^backend" },
      to: { path: "^frontend" },
    },
  ],
  options: {
    exclude: {
      path: "^(\\..*|node_modules|out|build|dist|logs|storage|scratch|Kottaby|public|storybook-static|docs|.*\\.d\\.ts|frontend/graphql/generated|.*unRefactored_tests)",
    },
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
