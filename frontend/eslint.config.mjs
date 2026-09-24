import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["src/components/PublicForm.tsx"],
  },
  {
    name: "lucide-tree-shaking",
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lucide-react",
              message:
                "Import individual icons from 'lucide-react/dist/esm/icons/<name>' (default import) so only used icons are bundled (issue-1123). Add a matching module declaration in types/lucide-deep-imports.d.ts.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
