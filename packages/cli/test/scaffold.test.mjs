import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scaffoldUrl = pathToFileURL(path.join(__dirname, "../dist/scaffold.js")).href;

const { generateSharedComponent, scaffoldEntity, scaffoldFeature, scaffoldHook, scaffoldPage } = await import(
  scaffoldUrl
);

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-scaffold-test-"));
}

function makeTsProject(dir) {
  fs.writeFileSync(path.join(dir, "tsconfig.json"), "{}");
}

const read = (root, ...segments) => fs.readFileSync(path.join(root, ...segments), "utf8");

const noopLogger = { error: () => {}, success: () => {} };
const plainColours = { dim: (s) => `${s}`, cyan: (s) => `${s}` };

function runGeneratorThatExits(setup, fn, args = []) {
  const dir = createTmpDir();
  const entry = path.join(dir, "run.mjs");
  try {
    setup(dir);
    const argList = [...args, dir].map((arg) => JSON.stringify(arg)).join(", ");
    fs.writeFileSync(entry, `import { ${fn} } from ${JSON.stringify(scaffoldUrl.toString())};\n${fn}(${argList});`);
    try {
      execFileSync(process.execPath, [entry], { stdio: "pipe" });
      return { status: 0, stdout: "", stderr: "" };
    } catch (err) {
      return {
        status: err.status,
        stdout: err.stdout?.toString() ?? "",
        stderr: err.stderr?.toString() ?? "",
      };
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("toKebabCase/toPascalCase/toCamelCase cover common inputs", async () => {
  const { toCamelCase, toKebabCase, toPascalCase } = await import("../dist/utils/casing.js");
  assert.equal(toKebabCase("UserProfile"), "user-profile");
  assert.equal(toKebabCase("user profile"), "user-profile");
  assert.equal(toKebabCase("user_profile"), "user-profile");
  assert.equal(toPascalCase("user-profile"), "UserProfile");
  assert.equal(toCamelCase("User-Profile"), "userProfile");
});

test("scaffoldFeature generates a complete feature slice in TS mode", () => {
  const dir = createTmpDir();
  try {
    makeTsProject(dir);
    scaffoldFeature("userProfile", dir);

    const featureDir = path.join(dir, "src/features/user-profile");
    assert.ok(fs.existsSync(path.join(featureDir, "components/UserProfile.tsx")));
    assert.ok(fs.existsSync(path.join(featureDir, "components/UserProfile.module.scss")));
    assert.ok(fs.existsSync(path.join(featureDir, "api/actions.server.ts")));
    assert.ok(fs.existsSync(path.join(featureDir, "hooks/useUserProfile.ts")));
    assert.ok(fs.existsSync(path.join(featureDir, "index.ts")));
    assert.ok(fs.statSync(path.join(featureDir, "store")).isDirectory());

    const component = read(featureDir, "components/UserProfile.tsx");
    assert.match(component, /import type \{ JSX \} from "solid-js";/);
    assert.match(component, /interface UserProfileProps/);
    assert.match(component, /data\?: unknown/);
    assert.match(component, /export function UserProfile\(props: UserProfileProps\)/);
    assert.match(component, /styles\.wrapper/);
    assert.match(component, /props\.children/);

    assert.equal(read(featureDir, "components/UserProfile.module.scss"), ".wrapper {\n  display: block;\n}\n");

    const actions = read(featureDir, "api/actions.server.ts");
    assert.match(actions, /export async function userProfileQuery\(input: unknown\)/);
    assert.match(actions, /\/\/ TODO: implement server-side logic/);
    assert.match(actions, /return \{ ok: true \};/);

    const hook = read(featureDir, "hooks/useUserProfile.ts");
    assert.match(hook, /import \{ createServerResource \} from "@anaemia\/core";/);
    assert.match(hook, /import \{ userProfileAction \} from "\.\.\/index\.js";/);
    assert.match(hook, /export function useUserProfile\(\)/);

    const index = read(featureDir, "index.ts");
    assert.match(index, /import \{ runOnServer, registerRpcPolicy \} from "@anaemia\/core";/);
    assert.match(index, /export const userProfileAction = runOnServer/);
    assert.match(index, /registerRpcPolicy\(userProfileAction\.id, \{ allow: \(\) => true \}\)/);
    assert.match(index, /export \{ UserProfile \} from "\.\/components\/UserProfile\.js";/);
    assert.match(index, /export \{ useUserProfile \} from "\.\/hooks\/useUserProfile\.js";/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffoldFeature emits JS output when no tsconfig.json is present", () => {
  const dir = createTmpDir();
  try {
    scaffoldFeature("userProfile", dir);

    const featureDir = path.join(dir, "src/features/user-profile");
    assert.ok(fs.existsSync(path.join(featureDir, "components/UserProfile.jsx")));
    assert.ok(!fs.existsSync(path.join(featureDir, "components/UserProfile.tsx")));
    assert.ok(fs.existsSync(path.join(featureDir, "api/actions.server.js")));
    assert.ok(fs.existsSync(path.join(featureDir, "hooks/useUserProfile.js")));
    assert.ok(fs.existsSync(path.join(featureDir, "index.js")));

    const component = read(featureDir, "components/UserProfile.jsx");
    assert.ok(!component.includes("interface UserProfileProps"));
    assert.ok(!component.includes(": unknown"));
    assert.match(component, /export function UserProfile\(props\)/);

    const actions = read(featureDir, "api/actions.server.js");
    assert.ok(!actions.includes("unknown"));
    assert.match(actions, /export async function userProfileQuery\(input\)/);

    const index = read(featureDir, "index.js");
    assert.match(index, /export \{ UserProfile \} from "\.\/components\/UserProfile\.js";/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffoldEntity generates an entity in TS mode", () => {
  const dir = createTmpDir();
  try {
    makeTsProject(dir);
    scaffoldEntity("orderItem", dir);

    const entityDir = path.join(dir, "src/entities/order-item");
    assert.ok(fs.existsSync(path.join(entityDir, "types.ts")));
    assert.ok(fs.existsSync(path.join(entityDir, "api/getOrderItem.ts")));
    assert.ok(fs.existsSync(path.join(entityDir, "api/index.ts")));
    assert.ok(fs.existsSync(path.join(entityDir, "store/orderItemStore.ts")));
    assert.ok(fs.existsSync(path.join(entityDir, "index.ts")));
    assert.ok(fs.statSync(path.join(entityDir, "components")).isDirectory());

    assert.match(read(entityDir, "types.ts"), /export interface OrderItem/);

    assert.match(read(entityDir, "api/getOrderItem.ts"), /Promise<OrderItem>/);
    assert.match(read(entityDir, "api/getOrderItem.ts"), /throw new Error\("getOrderItem not implemented"\)/);
    assert.equal(read(entityDir, "api/index.ts"), 'export { getOrderItem } from "./getOrderItem.js";\n');

    assert.match(read(entityDir, "store/orderItemStore.ts"), /createSignal<OrderItem \| null>\(null\)/);

    const index = read(entityDir, "index.ts");
    assert.match(index, /export type \{ OrderItem \} from "\.\/types\.js";/);
    assert.match(index, /export \* from "\.\/api\/index\.js";/);
    assert.match(index, /export \* from "\.\/store\/orderItemStore\.js";/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffoldEntity emits JS output without a types file", () => {
  const dir = createTmpDir();
  try {
    scaffoldEntity("orderItem", dir);

    const entityDir = path.join(dir, "src/entities/order-item");
    assert.ok(!fs.existsSync(path.join(entityDir, "types.ts")));
    assert.ok(!fs.existsSync(path.join(entityDir, "types.js")));
    assert.ok(fs.existsSync(path.join(entityDir, "api/getOrderItem.js")));
    assert.ok(fs.existsSync(path.join(entityDir, "store/orderItemStore.js")));

    const store = read(entityDir, "store/orderItemStore.js");
    assert.ok(!store.includes("OrderItem | null"));
    assert.match(store, /createSignal\(null\)/);

    const index = read(entityDir, "index.js");
    assert.ok(!index.includes("types.js"));
    assert.match(index, /export \* from "\.\/api\/index\.js";/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("generateSharedComponent creates a shared component in TS mode", () => {
  const dir = createTmpDir();
  try {
    makeTsProject(dir);
    const result = generateSharedComponent(dir, "button", { logger: noopLogger, pc: plainColours });
    assert.equal(result, true);

    const compDir = path.join(dir, "src/shared/components/button");
    assert.ok(fs.existsSync(path.join(compDir, "Button.tsx")));
    assert.ok(fs.existsSync(path.join(compDir, "Button.module.scss")));

    const component = read(compDir, "Button.tsx");
    assert.match(component, /import \{ children \} from "solid-js";/);
    assert.match(component, /interface ButtonProps/);
    assert.match(component, /export function Button\(props: ButtonProps\)/);
    assert.match(component, /const resolved = children\(\(\) => props\.children\);/);
    assert.match(component, /styles\.base/);

    assert.equal(read(compDir, "Button.module.scss"), ".base {\n  display: inline-block;\n}\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("generateSharedComponent emits JS output without a tsconfig", () => {
  const dir = createTmpDir();
  try {
    generateSharedComponent(dir, "button", { logger: noopLogger, pc: plainColours });

    const compDir = path.join(dir, "src/shared/components/button");
    assert.ok(fs.existsSync(path.join(compDir, "Button.jsx")));
    const component = read(compDir, "Button.jsx");
    assert.ok(!component.includes("interface ButtonProps"));
    assert.match(component, /export function Button\(props\)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("generateSharedComponent refuses to overwrite an existing component", () => {
  const dir = createTmpDir();
  try {
    makeTsProject(dir);
    const compDir = path.join(dir, "src/shared/components/button");
    fs.mkdirSync(compDir, { recursive: true });

    const result = generateSharedComponent(dir, "button", { logger: noopLogger, pc: plainColours });
    assert.equal(result, false);
    assert.ok(!fs.existsSync(path.join(compDir, "Button.tsx")), "should not create the component file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffoldPage generates a basic page with loader and types file", () => {
  const dir = createTmpDir();
  try {
    makeTsProject(dir);
    scaffoldPage("contact", dir);

    assert.ok(fs.existsSync(path.join(dir, "src/routes/contact.tsx")));
    assert.ok(fs.existsSync(path.join(dir, "src/routes/contact.types.ts")));

    const page = read(dir, "src/routes/contact.tsx");
    assert.match(page, /\/\/ route: \/contact/);
    assert.match(page, /export async function loader\(/);
    assert.match(page, /params: Record<string, string>/);
    assert.match(page, /satisfies ContactPageLoaderData/);
    assert.match(page, /export default function ContactPage\(\)/);
    assert.match(page, /useLoaderData<ContactPageLoaderData>/);

    assert.match(read(dir, "src/routes/contact.types.ts"), /export interface ContactPageLoaderData/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffoldPage supports dynamic route segments", () => {
  const dir = createTmpDir();
  try {
    makeTsProject(dir);
    scaffoldPage("blog/[slug]", dir);

    assert.ok(fs.existsSync(path.join(dir, "src/routes/blog/[slug].tsx")));
    assert.ok(fs.existsSync(path.join(dir, "src/routes/blog/[slug].types.ts")));

    const page = read(dir, "src/routes/blog/[slug].tsx");
    assert.match(page, /\/\/ route: \/blog\/:slug/);
    assert.match(page, /\/\/ param:\s+slug/);
    assert.match(page, /export default function SlugPage\(\)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffoldPage supports catch-all route segments", () => {
  const dir = createTmpDir();
  try {
    makeTsProject(dir);
    scaffoldPage("docs/[...rest]", dir);

    assert.ok(fs.existsSync(path.join(dir, "src/routes/docs/[...rest].tsx")));
    const page = read(dir, "src/routes/docs/[...rest].tsx");
    assert.match(page, /\/\/ route: \/docs\/\*rest/);
    assert.match(page, /\/\/ param:\s+rest/);
    assert.match(page, /export default function RestPage\(\)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffoldPage emits JS output without a types file", () => {
  const dir = createTmpDir();
  try {
    scaffoldPage("about", dir);

    assert.ok(fs.existsSync(path.join(dir, "src/routes/about.jsx")));
    assert.ok(!fs.existsSync(path.join(dir, "src/routes/about.types.ts")));
    assert.ok(!fs.existsSync(path.join(dir, "src/routes/about.types.js")));

    const page = read(dir, "src/routes/about.jsx");
    assert.match(page, /\/\/ route: \/about/);
    assert.match(page, /export default function AboutPage\(\)/);
    assert.ok(!page.includes("satisfies AboutPageLoaderData"), "should not reference a loader type");
    assert.ok(!page.includes(".types"), "should not import a types file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffoldHook creates a shared hook and preserves an existing use prefix", () => {
  const dir = createTmpDir();
  try {
    makeTsProject(dir);
    scaffoldHook("useSession", dir);

    const hook = read(dir, "src/shared/hooks/useSession.ts");
    assert.match(hook, /export function useSession\(options\?: UseSessionOptions\)/);
    assert.match(hook, /createSignal<unknown>\(null\)/);
    assert.match(hook, /onMount\(\(\) =>/);
    assert.match(hook, /onCleanup\(\(\) =>/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffoldHook adds the use prefix when missing", () => {
  const dir = createTmpDir();
  try {
    makeTsProject(dir);
    scaffoldHook("toast", dir);
    assert.ok(fs.existsSync(path.join(dir, "src/shared/hooks/useToast.ts")));
    assert.match(read(dir, "src/shared/hooks/useToast.ts"), /export function useToast/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffoldHook scoped to a feature appends an export to the feature index", () => {
  const dir = createTmpDir();
  try {
    makeTsProject(dir);
    scaffoldFeature("auth", dir);
    scaffoldHook("auth/useRole", dir);

    assert.ok(fs.existsSync(path.join(dir, "src/features/auth/hooks/useRole.ts")));
    const index = read(dir, "src/features/auth/index.ts");
    assert.match(index, /export \{ useRole \} from "\.\/hooks\/useRole\.js";/);
    assert.ok(!fs.existsSync(path.join(dir, "src/shared/hooks/useRole.ts")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffoldHook scoped to an entity appends an export to the entity index", () => {
  const dir = createTmpDir();
  try {
    makeTsProject(dir);
    scaffoldEntity("user", dir);
    scaffoldHook("user/useAvatar", dir);

    assert.ok(fs.existsSync(path.join(dir, "src/entities/user/hooks/useAvatar.ts")));
    const index = read(dir, "src/entities/user/index.ts");
    assert.match(index, /export \{ useAvatar \} from "\.\/hooks\/useAvatar\.js";/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffoldPage exits with a non-zero code when the page is a duplicate", () => {
  const result = runGeneratorThatExits(
    (dir) => {
      makeTsProject(dir);
      fs.mkdirSync(path.join(dir, "src/routes"), { recursive: true });
      fs.writeFileSync(path.join(dir, "src/routes/contact.tsx"), "existing page");
    },
    "scaffoldPage",
    ["contact"],
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /generation halted: page "contact" already exists/);
});

test("scaffoldHook exits with a non-zero code when the hook is a duplicate", () => {
  const result = runGeneratorThatExits(
    (dir) => {
      makeTsProject(dir);
      fs.mkdirSync(path.join(dir, "src/shared/hooks"), { recursive: true });
      fs.writeFileSync(path.join(dir, "src/shared/hooks/useSession.ts"), "existing hook");
    },
    "scaffoldHook",
    ["session"],
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /generation halted: hook "useSession" already exists/);
});

test("scaffoldHook exits with a non-zero code when the scope is unknown", () => {
  const result = runGeneratorThatExits((dir) => makeTsProject(dir), "scaffoldHook", ["ghost/useMagic"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /"ghost" is not a known feature or entity/);
});
