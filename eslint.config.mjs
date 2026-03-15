import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/components/**",
      "src/hooks/**",
      "src/lib/**",
      "src/server/**",
      "src/solana-arb/**",
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {},
  },
];
