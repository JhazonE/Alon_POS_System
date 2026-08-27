/**
 * One-off codemod: migrates `<Button variant=.. size=.. className=..>` JSX
 * to a raw `<button className="...">` per the recipes in
 * docs/superpowers/specs/2026-08-25-button-plain-tailwind-migration-design.md
 *
 * Usage: npx tsx scripts/codemods/migrate-button.ts "app/(app)/purchases"
 *        (arguments are directories, walked recursively, or single files)
 *
 * Usages whose `variant`/`size` is not a plain string literal, or that carry
 * `asChild`, are left untouched and reported at the end for manual fixing.
 *
 * The computed classes go first and any pre-existing `className` last. That
 * ordering only expresses intent -- without tailwind-merge the CSS cascade,
 * not the string order, decides which of two competing utilities wins. So the
 * script also reports every usage where a pre-existing class collides with a
 * computed one on the same utility group; those must be eyeballed per batch
 * (see the spec's "Migration mechanics" step 1).
 */
import * as fs from "fs";
import * as path from "path";
import { Project, SyntaxKind, JsxAttribute, JsxOpeningElement, JsxSelfClosingElement, Node, SourceFile } from "ts-morph";

/**
 * Collects `.tsx` files from a directory (recursively) or takes a single file
 * path as-is. Deliberately not glob-based: every app path in this project sits
 * under the `(app)` route group, and fast-glob reads those parentheses as
 * extglob syntax while Windows reads the escaping backslash as a path
 * separator, so `app/(app)/purchases/**\/*.tsx` silently matches nothing.
 */
function collectTsxFiles(target: string): string[] {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];

  const out: string[] = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...collectTsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold " +
  "tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] " +
  "active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

const VARIANTS: Record<string, string> = {
  default:
    "bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] " +
    "hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70 focus-visible:ring-ring",
  outline:
    "border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring",
  ghost: "hover:bg-accent focus-visible:ring-ring",
  destructive:
    "bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] " +
    "hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55",
  link:
    "text-primary underline-offset-4 decoration-primary/35 hover:decoration-primary h-auto px-0 focus-visible:ring-ring",
};

const SIZES: Record<string, string> = {
  default: "h-10 px-[18px]",
  sm: "h-8 px-[13px] text-xs rounded-lg gap-1.5",
  lg: "h-[46px] px-6 text-[15px]",
  icon: "h-10 w-10 p-0",
};

function recipeClasses(variant: string, size: string): string {
  const parts = [BASE, VARIANTS[variant]];
  if (variant !== "link") parts.push(SIZES[size]);
  return parts.filter(Boolean).join(" ");
}

/**
 * Applies tailwind-merge's precedence rule statically, at codemod time: a
 * pre-existing class beats the recipe class it competes with, so the losing
 * recipe class is dropped from the output rather than left in to fight the
 * cascade. Doing it here keeps every migrated button a plain static string
 * with no runtime `cn()` call, while still honouring page-specific overrides
 * like `h-8 w-8` or `shadow-lg`.
 */
function computeClassName(variant: string, size: string, existing: string | null): string {
  const recipe = recipeClasses(variant, size);
  if (!existing) return recipe;

  const overridden = new Set<string>();
  for (const cls of existing.split(/\s+/).filter(Boolean)) {
    const g = utilityGroup(cls);
    if (!g) continue;
    overridden.add(g);
    // `p-*` supersedes `px-*` the way tailwind-merge resolves it; the
    // reverse is not true, so `px-*` only ever drops another `px-*`.
    if (g === "padding") overridden.add("padding-x");
  }

  const kept = recipe
    .split(/\s+/)
    .filter(Boolean)
    .filter((cls) => {
      const g = utilityGroup(cls);
      return g === null || !overridden.has(g);
    });

  return [...kept, existing].join(" ");
}

/** Text-size and text-align utilities are cascade hazards against the recipes;
 * text-<color> utilities are not, so they must not be grouped with either. */
const TEXT_SIZE = /^text-(xs|sm|base|lg|xl|\d?xl|\[)/;
const TEXT_ALIGN = /^text-(left|center|right|justify|start|end)$/;

/** Maps a bare (unprefixed) Tailwind class to the utility group it competes
 * in, or null when it can't collide with anything the recipes emit. */
function utilityGroup(cls: string): string | null {
  // Variant-prefixed (hover:, md:, dark:, ...) classes only collide with the
  // same prefix, which the recipes never duplicate -- ignore them.
  if (cls.includes(":")) return null;
  if (/^h-/.test(cls)) return "height";
  if (/^w-/.test(cls)) return "width";
  if (/^p-/.test(cls)) return "padding";
  if (/^px-/.test(cls)) return "padding-x";
  if (/^rounded/.test(cls)) return "radius";
  if (/^gap-/.test(cls)) return "gap";
  if (/^font-/.test(cls)) return "font-weight";
  if (/^tracking-/.test(cls)) return "tracking";
  if (/^bg-/.test(cls)) return "background";
  if (/^shadow/.test(cls)) return "shadow";
  if (/^justify-/.test(cls)) return "justify";
  if (/^items-/.test(cls)) return "items";
  if (/^whitespace-/.test(cls)) return "whitespace";
  if (/^transition(-|$)/.test(cls)) return "transition";
  // Only border *width* competes with the outline recipe's bare `border`;
  // `border-input` and friends are colors and must be left alone.
  if (/^border(-\d+|-none)?$/.test(cls)) return "border-width";
  if (TEXT_SIZE.test(cls)) return "text-size";
  if (TEXT_ALIGN.test(cls)) return "text-align";
  if (/^(inline-flex|flex|block|inline-block|grid|hidden|inline)$/.test(cls)) return "display";
  return null;
}

/** Reads a JsxAttribute's value as a plain string, only if it's a static
 * string literal (`x="y"` or `x={"y"}`). Returns undefined if the attribute
 * doesn't exist, null if it exists but is dynamic (not a string literal). */
function readStaticString(attr: JsxAttribute | undefined): string | null | undefined {
  if (!attr) return undefined;
  const init = attr.getInitializer();
  if (!init) return null;
  if (Node.isStringLiteral(init)) return init.getLiteralText();
  if (Node.isJsxExpression(init)) {
    const expr = init.getExpression();
    if (expr && Node.isStringLiteral(expr)) return expr.getLiteralText();
    return null; // dynamic expression
  }
  return null;
}

/** Reads an existing className's source text to splice into the new value:
 * a string literal's raw text (no quotes), or a dynamic expression's full
 * source text (to be re-wrapped in a template literal). */
function readClassNameSource(
  attr: JsxAttribute | undefined
): { text: string; dynamic: boolean; node?: Node } | null {
  if (!attr) return null;
  const init = attr.getInitializer();
  if (!init) return null;
  if (Node.isStringLiteral(init)) return { text: init.getLiteralText(), dynamic: false };
  if (Node.isJsxExpression(init)) {
    const expr = init.getExpression();
    if (expr && Node.isStringLiteral(expr)) return { text: expr.getLiteralText(), dynamic: false };
    if (expr) return { text: expr.getText(), dynamic: true, node: expr };
  }
  return null;
}

/** Renders a dynamic className expression as arguments to a fresh `cn(...)`.
 * An expression that is already a `cn(...)` call is unwrapped to its own
 * arguments rather than nested, and its indentation is flattened -- the
 * original leading whitespace is meaningless once the call moves. */
function asCnArguments(existing: { text: string; node?: Node }): string {
  const node = existing.node;
  if (node && Node.isCallExpression(node) && node.getExpression().getText() === "cn") {
    return node
      .getArguments()
      .map((a) => a.getText().replace(/\s*\r?\n\s*/g, " "))
      .join(", ");
  }
  return existing.text.replace(/\s*\r?\n\s*/g, " ");
}

function findAttr(el: JsxOpeningElement | JsxSelfClosingElement, name: string): JsxAttribute | undefined {
  return el
    .getAttributes()
    .filter((a): a is JsxAttribute => Node.isJsxAttribute(a))
    .find((a) => a.getNameNode().getText() === name);
}

/** Adds `import { cn } from "@/lib/utils"` unless the file already has it. */
function ensureCnImport(sf: SourceFile): void {
  const existing = sf
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === "@/lib/utils");

  if (!existing) {
    sf.addImportDeclaration({ moduleSpecifier: "@/lib/utils", namedImports: ["cn"] });
    return;
  }
  if (!existing.getNamedImports().some((ni) => ni.getName() === "cn")) {
    existing.addNamedImport("cn");
  }
}

function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error("Usage: npx tsx scripts/codemods/migrate-button.ts <dir-or-file...>");
    process.exit(1);
  }

  const paths = [...new Set(targets.flatMap(collectTsxFiles))];
  if (paths.length === 0) {
    console.error(`No .tsx files found under: ${targets.join(" ")}`);
    process.exit(1);
  }

  // skipAddingFilesFromTsConfig: tsconfig's `include` is `**/*.tsx`, so the
  // constructor would otherwise pre-load every file in the repo. The rewrite
  // is purely syntactic, so no type information is needed.
  const project = new Project({
    tsConfigFilePath: "tsconfig.json",
    skipAddingFilesFromTsConfig: true,
  });
  const sourceFiles = paths.map((p) => project.addSourceFileAtPath(p));

  let migrated = 0;
  const skipped: string[] = [];
  const collisions: string[] = [];
  const dynamicClassNames: string[] = [];

  for (const sf of sourceFiles) {
    if (!sf.getFullText().includes("<Button")) continue;

    let needsCn = false;

    const elements: (JsxOpeningElement | JsxSelfClosingElement)[] = [
      ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ].filter((el) => el.getTagNameNode().getText() === "Button");

    for (const el of elements) {
      const variantAttr = findAttr(el, "variant");
      const sizeAttr = findAttr(el, "size");
      const classNameAttr = findAttr(el, "className");
      const asChildAttr = findAttr(el, "asChild");

      const variantRaw = readStaticString(variantAttr);
      const sizeRaw = readStaticString(sizeAttr);
      const variant = variantRaw === undefined ? "default" : variantRaw;
      const size = sizeRaw === undefined ? "default" : sizeRaw;

      if (asChildAttr || variant === null || size === null || !(variant in VARIANTS) || !(size in SIZES)) {
        const { line } = sf.getLineAndColumnAtPos(el.getStart());
        skipped.push(`${sf.getFilePath()}:${line}`);
        continue;
      }

      const existing = readClassNameSource(classNameAttr);
      const existingForCompute = existing ? (existing.dynamic ? null : existing.text) : null;
      const staticClasses = computeClassName(variant, size, existingForCompute);

      // Override report (see the file header): which recipe classes lost to
      // a pre-existing class, so each batch's overrides can be eyeballed.
      const { line } = sf.getLineAndColumnAtPos(el.getStart());
      if (existing?.dynamic) {
        dynamicClassNames.push(`${sf.getFilePath()}:${line}  {${existing.text}}`);
      } else if (existing) {
        const before = recipeClasses(variant, size).split(/\s+/).filter(Boolean);
        const after = new Set(staticClasses.split(/\s+/).filter(Boolean));
        const dropped = before.filter((cls) => !after.has(cls));
        if (dropped.length) {
          collisions.push(
            `${sf.getFilePath()}:${line}  dropped [${dropped.join(" ")}] for [${existing.text}]  (variant=${variant} size=${size})`
          );
        }
      }

      if (variantAttr) variantAttr.remove();
      if (sizeAttr) sizeAttr.remove();

      // A dynamic className can't be resolved against the recipe at codemod
      // time -- its classes aren't known until render -- so those usages, and
      // only those, keep `cn()` (clsx + tailwind-merge, no Radix) to do the
      // same override resolution at runtime. Rewriting an existing attribute
      // in place (rather than remove + re-add) keeps it where the author put
      // it, so the diff stays readable.
      let initializer: string;
      if (existing?.dynamic) {
        initializer = `{cn(${JSON.stringify(staticClasses)}, ${asCnArguments(existing)})}`;
        needsCn = true;
      } else {
        initializer = JSON.stringify(staticClasses);
      }

      if (classNameAttr) {
        classNameAttr.setInitializer(initializer);
      } else {
        el.addAttribute({ name: "className", initializer });
      }

      el.getTagNameNode().replaceWithText("button");
      const jsxElementParent = el.getParentIfKind(SyntaxKind.JsxElement);
      if (jsxElementParent) {
        jsxElementParent.getClosingElement().getTagNameNode().replaceWithText("button");
      }

      migrated++;
    }

    if (needsCn) ensureCnImport(sf);

    // Drop the Button import if nothing in the file still references it.
    // Checking identifiers rather than only JSX matters: a file can name
    // Button in a type position (`React.ComponentProps<typeof Button>`),
    // which no JSX walk would see, and removing the import under it breaks
    // the build in a way the batch's own diff doesn't show.
    const stillUsed = sf
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .some((id) => id.getText() === "Button" && !Node.isImportSpecifier(id.getParent()));

    if (!stillUsed) {
      const importDecl = sf
        .getImportDeclarations()
        .find((d) => d.getModuleSpecifierValue() === "@/components/ui/button");
      if (importDecl) {
        const named = importDecl.getNamedImports().find((ni) => ni.getName() === "Button");
        named?.remove();
        if (importDecl.getNamedImports().length === 0 && !importDecl.getDefaultImport()) {
          importDecl.remove();
        }
      }
    }
  }

  project.saveSync();

  console.log(`migrated: ${migrated}, skipped (dynamic variant/size/asChild): ${skipped.length}`);
  if (skipped.length) {
    console.log("Skipped locations (fix by hand):");
    skipped.forEach((s) => console.log("  " + s));
  }
  if (collisions.length) {
    console.log(`\nRecipe classes overridden by a pre-existing className (${collisions.length}) -- eyeball these:`);
    collisions.forEach((c) => console.log("  " + c));
  }
  if (dynamicClassNames.length) {
    console.log(`\nDynamic className expressions wrapped in cn() (${dynamicClassNames.length}) -- review:`);
    dynamicClassNames.forEach((d) => console.log("  " + d));
  }
}

main();
