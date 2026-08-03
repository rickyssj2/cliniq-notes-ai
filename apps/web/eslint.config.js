import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";

/**
 * Strict FSD (docs/08-fsd-dependency-map.md):
 *   app → pages → widgets → features → entities → shared
 *
 * A slice may import lower layers, or the same slice. Sibling slices on the
 * same layer are illegal. `app` and `shared` have segments, not slices —
 * cross-segment imports within those layers are allowed.
 *
 * External packages (including @soulside/domain) are unclassified and pass.
 */

/** Lower layers only (no same-layer siblings). */
function allowLowerLayers(from, lowerTypes) {
  return {
    from: { element: { type: from } },
    allow: {
      to: { element: { types: { anyOf: lowerTypes } } },
    },
  };
}

/** Same slice via captured `slice` name (alias or relative into the same folder). */
function allowSameSlice(layer) {
  return {
    from: { element: { type: layer } },
    allow: {
      to: {
        element: {
          type: layer,
          captured: { slice: "{{ from.element.captured.slice }}" },
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
      "boundaries/ignore": [
        "src/main.tsx",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
      ],
      "boundaries/elements": [
        { type: "app", pattern: "src/app/*", capture: ["segment"] },
        { type: "pages", pattern: "src/pages/*", capture: ["slice"] },
        { type: "widgets", pattern: "src/widgets/*", capture: ["slice"] },
        { type: "features", pattern: "src/features/*", capture: ["slice"] },
        { type: "entities", pattern: "src/entities/*", capture: ["slice"] },
        { type: "shared", pattern: "src/shared/*", capture: ["segment"] },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            {
              from: { element: { type: "app" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        "app",
                        "pages",
                        "widgets",
                        "features",
                        "entities",
                        "shared",
                      ],
                    },
                  },
                },
              },
            },
            allowLowerLayers("pages", [
              "widgets",
              "features",
              "entities",
              "shared",
            ]),
            allowSameSlice("pages"),
            allowLowerLayers("widgets", ["features", "entities", "shared"]),
            allowSameSlice("widgets"),
            allowLowerLayers("features", ["entities", "shared"]),
            allowSameSlice("features"),
            allowLowerLayers("entities", ["shared"]),
            allowSameSlice("entities"),
            {
              from: { element: { type: "shared" } },
              allow: {
                to: { element: { type: "shared" } },
              },
            },
          ],
        },
      ],
    },
  },
);

