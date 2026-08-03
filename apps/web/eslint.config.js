import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";

/**
 * FSD layer rule (see docs/08-fsd-dependency-map.md):
 *   app → pages → widgets → features → entities → shared
 *
 * Same-layer imports are allowed — the codebase shares cross-feature helpers
 * (offline queue, autosave preference) and the we only forbid upward edges.
 * External packages (including @soulside/domain) are not classified, so they
 * pass through.
 */
const LAYERS = ["app", "pages", "widgets", "features", "entities", "shared"];

function allowBelow(from) {
  const fromIndex = LAYERS.indexOf(from);
  return {
    from: { element: { type: from } },
    allow: {
      to: {
        element: {
          types: LAYERS.slice(fromIndex),
        },
      },
    },
  };
}

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "**/*.css"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      boundaries,
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
      "boundaries/include": ["src/**/*"],
      // Entry sits above the layers; tests may reach siblings for fixtures.
      "boundaries/ignore": [
        "src/main.tsx",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
      ],
      "boundaries/elements": [
        { type: "app", pattern: "src/app/*" },
        { type: "pages", pattern: "src/pages/*", capture: ["slice"] },
        { type: "widgets", pattern: "src/widgets/*", capture: ["slice"] },
        { type: "features", pattern: "src/features/*", capture: ["slice"] },
        { type: "entities", pattern: "src/entities/*", capture: ["slice"] },
        // shared has segments (ui, api, …), not slices — one element for the layer.
        { type: "shared", pattern: "src/shared/*", capture: ["segment"] },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: LAYERS.map(allowBelow),
        },
      ],
    },
  },
);
