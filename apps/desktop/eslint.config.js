import { config } from "@repo/eslint-config/base";

export default [
  ...config,
  {
    files: ["**/preload*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*"],
              message:
                "Node built-ins are forbidden in sandboxed preload scripts",
            },
            {
              group: ["@kombuse/core/logger"],
              message:
                "Use @kombuse/core/browser-logger instead — the logger module imports node:fs",
            },
          ],
        },
      ],
    },
  },
  { ignores: ["dist"] },
];
