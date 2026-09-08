import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, lazyPlugins } from "vite-plus";

const config = defineConfig({
  server: {
    allowedHosts: ["macbook.donkey-powan.ts.net", "tame-rockets-ring.loca.lt"],
  },
  resolve: { tsconfigPaths: true },
  plugins: lazyPlugins(() => [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
    VitePWA({
      registerType: "autoUpdate",
      outDir: ".output/public",
      integration: {
        closeBundleOrder: "pre",
      },
      // Manifest link + SW registration are wired manually in __root.tsx
      // (plugin HTML injection doesn't apply to the SSR shell).
      injectRegister: false,
      includeAssets: [
        "favicon.ico",
        "icon-192.png",
        "icon-512.png",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "Quite Chat",
        short_name: "Quite",
        description: "A quiet space to chat",
        theme_color: "#F2F3F4",
        background_color: "#F2F3F4",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ request }) =>
              request.destination === "style" ||
              request.destination === "script" ||
              request.destination === "worker" ||
              request.destination === "image" ||
              request.destination === "font",
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ]),
  // Vite plus specific config
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    plugins: ["oxc", "typescript", "unicorn", "react", "import"],
    categories: {
      correctness: "warn",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    env: {
      builtin: true,
    },
    ignorePatterns: [
      "**/.nx/**",
      "**/.svelte-kit/**",
      "**/build/**",
      "**/coverage/**",
      "**/dist/**",
      "**/snap/**",
      "**/.output/**",
      "**/.vscode/**",
      "**/routeTree.gen.ts",
      "**/vite.config.*.timestamp-*.*",
      "eslint.config.js",
      "prettier.config.js",
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      {
        files: ["**/*.{js,ts,tsx}"],
        rules: {
          "for-direction": "error",
          "no-async-promise-executor": "error",
          "no-case-declarations": "error",
          "no-class-assign": "error",
          "no-compare-neg-zero": "error",
          "no-cond-assign": "error",
          "no-constant-binary-expression": "error",
          "no-constant-condition": "error",
          "no-control-regex": "error",
          "no-debugger": "error",
          "no-delete-var": "error",
          "no-dupe-else-if": "error",
          "no-duplicate-case": "error",
          "no-empty-character-class": "error",
          "no-empty-pattern": "error",
          "no-empty-static-block": "error",
          "no-ex-assign": "error",
          "no-extra-boolean-cast": "error",
          "no-fallthrough": "error",
          "no-global-assign": "error",
          "no-invalid-regexp": "error",
          "no-irregular-whitespace": "error",
          "no-loss-of-precision": "error",
          "no-misleading-character-class": "error",
          "no-nonoctal-decimal-escape": "error",
          "no-regex-spaces": "error",
          "no-self-assign": "error",
          "no-shadow": "warn",
          "no-shadow-restricted-names": "error",
          "no-sparse-arrays": "error",
          "no-unsafe-finally": "error",
          "no-unsafe-optional-chaining": "error",
          "no-unused-labels": "error",
          "no-unused-private-class-members": "error",
          "no-useless-backreference": "error",
          "no-useless-catch": "error",
          "no-useless-escape": "error",
          "no-var": "error",
          "no-with": "error",
          "prefer-const": "error",
          "require-yield": "error",
          "use-isnan": "error",
          "valid-typeof": "error",
          "import/consistent-type-specifier-style": [
            "error",
            "prefer-top-level",
          ],
          "import/first": "error",
          "import/newline-after-import": "error",
          "import/no-commonjs": "error",
          "import/no-duplicates": "error",
          "typescript/array-type": [
            "error",
            {
              default: "generic",
              readonly: "generic",
            },
          ],
          "typescript/ban-ts-comment": [
            "error",
            {
              "ts-expect-error": false,
              "ts-ignore": "allow-with-description",
            },
          ],
          "typescript/consistent-type-imports": [
            "error",
            {
              prefer: "type-imports",
            },
          ],
          "typescript/method-signature-style": ["error", "property"],
          "typescript/no-duplicate-enum-values": "error",
          "typescript/no-extra-non-null-assertion": "error",
          "typescript/no-for-in-array": "error",
          "typescript/no-inferrable-types": [
            "error",
            {
              ignoreParameters: true,
            },
          ],
          "typescript/no-misused-new": "error",
          "typescript/no-namespace": "error",
          "typescript/no-non-null-asserted-optional-chain": "error",
          "typescript/no-unnecessary-condition": "error",
          "typescript/no-unnecessary-type-assertion": "error",
          "typescript/no-unsafe-function-type": "error",
          "typescript/no-wrapper-object-types": "error",
          "typescript/prefer-as-const": "error",
          "typescript/prefer-for-of": "warn",
          "typescript/require-await": "warn",
          "typescript/triple-slash-reference": "error",
        },
        jsPlugins: [],
        env: {
          es2020: true,
          browser: true,
        },
      },
      {
        files: ["**/*.vue"],
        rules: {
          "for-direction": "error",
          "no-async-promise-executor": "error",
          "no-case-declarations": "error",
          "no-class-assign": "error",
          "no-compare-neg-zero": "error",
          "no-cond-assign": "error",
          "no-constant-binary-expression": "error",
          "no-constant-condition": "error",
          "no-control-regex": "error",
          "no-debugger": "error",
          "no-delete-var": "error",
          "no-dupe-else-if": "error",
          "no-duplicate-case": "error",
          "no-empty-character-class": "error",
          "no-empty-pattern": "error",
          "no-empty-static-block": "error",
          "no-ex-assign": "error",
          "no-extra-boolean-cast": "error",
          "no-fallthrough": "error",
          "no-global-assign": "error",
          "no-invalid-regexp": "error",
          "no-irregular-whitespace": "error",
          "no-loss-of-precision": "error",
          "no-misleading-character-class": "error",
          "no-nonoctal-decimal-escape": "error",
          "no-regex-spaces": "error",
          "no-self-assign": "error",
          "no-shadow": "warn",
          "no-shadow-restricted-names": "error",
          "no-sparse-arrays": "error",
          "no-unsafe-finally": "error",
          "no-unsafe-optional-chaining": "error",
          "no-unused-labels": "error",
          "no-unused-private-class-members": "error",
          "no-useless-backreference": "error",
          "no-useless-catch": "error",
          "no-useless-escape": "error",
          "no-var": "error",
          "no-with": "error",
          "prefer-const": "error",
          "require-yield": "error",
          "use-isnan": "error",
          "valid-typeof": "error",
          "import/consistent-type-specifier-style": [
            "error",
            "prefer-top-level",
          ],
          "import/first": "error",
          "import/newline-after-import": "error",
          "import/no-commonjs": "error",
          "import/no-duplicates": "error",
          "typescript/array-type": [
            "error",
            {
              default: "generic",
              readonly: "generic",
            },
          ],
          "typescript/ban-ts-comment": [
            "error",
            {
              "ts-expect-error": false,
              "ts-ignore": "allow-with-description",
            },
          ],
          "typescript/consistent-type-imports": [
            "error",
            {
              prefer: "type-imports",
            },
          ],
          "typescript/method-signature-style": ["error", "property"],
          "typescript/no-duplicate-enum-values": "error",
          "typescript/no-extra-non-null-assertion": "error",
          "typescript/no-for-in-array": "error",
          "typescript/no-inferrable-types": [
            "error",
            {
              ignoreParameters: true,
            },
          ],
          "typescript/no-misused-new": "error",
          "typescript/no-namespace": "error",
          "typescript/no-non-null-asserted-optional-chain": "error",
          "typescript/no-unnecessary-condition": "error",
          "typescript/no-unnecessary-type-assertion": "error",
          "typescript/no-unsafe-function-type": "error",
          "typescript/no-wrapper-object-types": "error",
          "typescript/prefer-as-const": "error",
          "typescript/prefer-for-of": "warn",
          "typescript/require-await": "warn",
          "typescript/triple-slash-reference": "error",
        },
        jsPlugins: [],
        env: {
          browser: true,
        },
      },
    ],
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  fmt: {
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    printWidth: 80,
    sortPackageJson: false,
    sortImports: true,
    sortTailwindcss: true,
    tabWidth: 2,
    ignorePatterns: [
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "**/.output/**",
      "**/.vscode/**",
      "**/routeTree.gen.ts",
    ],
  },
});
export default config;
