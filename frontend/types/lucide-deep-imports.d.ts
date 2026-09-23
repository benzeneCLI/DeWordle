/**
 * ISSUE-1123: lucide-react ships no per-icon type declarations and no `exports`
 * map, so deep imports resolve to plain ESM files. These ambient declarations
 * type the individual icon modules used by the app as `LucideIcon` components.
 *
 * Keep this list in sync with every `lucide-react/dist/esm/icons/*` import in
 * the codebase; the ESLint `no-restricted-imports` rule (eslint.config.mjs)
 * forbids the barrel import so this module list stays the only surface.
 */

declare module "lucide-react/dist/esm/icons/bell" {
  import type { LucideIcon } from "lucide-react";
  const Icon: LucideIcon;
  export default Icon;
}

declare module "lucide-react/dist/esm/icons/help-circle" {
  import type { LucideIcon } from "lucide-react";
  const Icon: LucideIcon;
  export default Icon;
}

declare module "lucide-react/dist/esm/icons/x" {
  import type { LucideIcon } from "lucide-react";
  const Icon: LucideIcon;
  export default Icon;
}

declare module "lucide-react/dist/esm/icons/arrow-left" {
  import type { LucideIcon } from "lucide-react";
  const Icon: LucideIcon;
  export default Icon;
}

declare module "lucide-react/dist/esm/icons/arrow-right" {
  import type { LucideIcon } from "lucide-react";
  const Icon: LucideIcon;
  export default Icon;
}
