# 🛡️ TypeScript 严禁 `any` 实战手册：5 种武器和真实案例

> lhx-kit 在 `packages/*` 整个范围内**禁止 `any` 与 `as any`**。这不是教条主义，是因为我们对外发包，每一处 `any` 都会**渗透到下游用户的 IDE**——他们调用我们的 API，看到的提示、自动补全、类型推导都被这一处缝隙污染。本篇把"如何替代 `any`"的工具箱讲透，并配上仓库里 2026-05 那次大扫除的真实改造案例。

---

## 🎯 为什么要禁

很多教程说"`any` 是逃生通道，少用就好"。在内部业务代码里这话没错；但**库代码**完全是另一回事：

| 场景 | 对外暴露 `any` 的代价 |
|---|---|
| 用户 import 你的函数 | 参数和返回值的智能提示直接消失 |
| 用户基于你的类型再做泛型扩展 | 整条类型链路退化成 `any` |
| 用户接入 strict 模式后审查 | `any` 触发 `noImplicitAny` 报错，但根源在你的库 |
| 半年后的你回来重构 | 编译器不会告诉你哪里依赖了"被 `any` 吃掉的契约" |

> **核心观点**：在库的公共面，`any` 比"没有类型"更糟糕——前者会让用户**误以为有类型**，后者至少能引起警觉。

具体到 lhx-kit：8 个发包都是别人会 `import` 的对象，包括 `@lhx-kit/cli`（执行命令的命令行参数解析）、`@lhx-kit/runtime`（用户 axios-like 实例的类型基础）、`@lhx-kit/renderer`（schema 类型推导）。每一处 `any` 都会让这些公共面变模糊。

---

## 🔧 5 种替代武器（按优先级排序）

遇到 `any` 时按这个顺序试。**越靠前越好**。

### 🥇 武器 1：精确接口/类型别名

最朴素也最强。已知字段就把它们写下来。

**反例**：

```ts
function describeUser(u: any) {
  return `${u.name} <${u.email}>`;
}
```

**正例**：

```ts
interface User {
  name: string;
  email: string;
}
function describeUser(u: User) {
  return `${u.name} <${u.email}>`;
}
```

**什么时候用**：调用方传的形状你能枚举（哪怕只是部分字段）。**永远先尝试这条**。

---

### 🥈 武器 2：泛型

当函数的"输入类型"和"输出类型"有依赖关系，用泛型保留信息流。

**反例**：

```ts
function pick(obj: any, keys: string[]): any {
  const out: any = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

const r = pick({a: 1, b: 'x', c: true}, ['a', 'b']);
// r 的类型：any  ❌ 信息全丢
```

**正例**：

```ts
function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}

const r = pick({a: 1, b: 'x', c: true}, ['a', 'b']);
// r 的类型：{a: number, b: string}  ✅
```

**什么时候用**：函数像一根"管道"——输入决定输出形状。

---

### 🥉 武器 3：`unknown` + 类型守卫

当你接收的是**真正未知的形状**（比如解析 JSON、接收第三方 callback 的数据），用 `unknown` 强制调用方先做 narrowing。

**反例**：

```ts
function handleMessage(msg: any) {
  console.log(msg.type, msg.payload.id);  // 编译器不报错，运行时随时 crash
}
```

**正例**：

```ts
function handleMessage(msg: unknown) {
  if (typeof msg !== 'object' || msg === null) return;
  if (!('type' in msg) || !('payload' in msg)) return;
  const m = msg as {type: string; payload: {id?: string}};
  console.log(m.type, m.payload.id);
}
```

或用 zod / typia / 自定义 type guard 函数让 narrowing 更优雅：

```ts
function isMessage(v: unknown): v is {type: string; payload: {id: string}} {
  return (
    typeof v === 'object' && v !== null &&
    'type' in v && typeof v.type === 'string' &&
    'payload' in v && typeof v.payload === 'object'
  );
}

function handleMessage(msg: unknown) {
  if (!isMessage(msg)) return;
  console.log(msg.type, msg.payload.id);  // 类型安全
}
```

**`unknown` 与 `any` 的本质区别**：
- `any` 不要求 narrowing，**对所有操作都"放行"**——风险静默
- `unknown` 强制 narrowing 才能用，**编译器逼你处理"我不知道"的事实**——风险显式

---

### 🏅 武器 4：`z.infer<typeof Schema>`

当数据形状由 zod schema 定义时，**永远用 `z.infer` 推导，不要重复声明 interface**。

**反例**：

```ts
const ProjectConfigSchema = z.object({
  name: z.string(),
  framework: z.enum(['vue3', 'react', 'react-admin'])
});

interface ProjectConfig {  // 重复了 schema 已经表达的信息
  name: string;
  framework: 'vue3' | 'react' | 'react-admin';
}

function load(): ProjectConfig {
  ...
}
```

**正例**：

```ts
const ProjectConfigSchema = z.object({
  name: z.string(),
  framework: z.enum(['vue3', 'react', 'react-admin'])
});

type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

function load(): ProjectConfig {
  return ProjectConfigSchema.parse(rawJson);  // 这里自动是 ProjectConfig 类型
}
```

**好处**：
- 单一信息源——改 schema，类型自动跟进
- 运行时验证（`.parse`）和编译时类型保持一致，不会出现 schema 增加了字段、类型却忘加的情况
- 替代了大量"运行时收到 unknown JSON、想用就 cast 成 any"的反模式

**lhx-kit 实战**：`@lhx-kit/config` 的 `defineProjectConfig`、`defineOfflineConfig` 全部走这条路径——用户写的 `project.config.ts` 由 zod schema 校验后再以推导出的类型暴露。没有任何一处 `any`。

---

### 🎯 武器 5：`as unknown as <SpecificType>`（最后手段）

当你**确实需要绕过类型系统**——通常是和**第三方类型缺失/冲突**的角落里——优先用 `as unknown as <Specific>` 而不是 `as any`。

```ts
// ❌ 不要这么写
const result = thirdPartyValue as any;

// ✅ 这么写
const result = thirdPartyValue as unknown as MySpecificShape;
```

**为什么 `as unknown as <T>` 比 `as any` 好**：

| 维度 | `as any` | `as unknown as <T>` |
|---|---|---|
| 后续读取的类型提示 | `any`（IDE 提示废了） | `<T>`（IDE 知道形状） |
| 后续传给其他函数 | 静默接受任意签名 | 必须形状匹配 |
| 拦截误用 | 拦不住 | 拦得住 |
| 表达"我知道我在做什么" | 弱 | 强 |

**关键约束**：用了之后要写注释说明**为什么**——是 typing gap、是 vendor lib 没更新、还是真的有理由 escape。

---

## 🧪 lhx-kit 仓库里的真实案例（2026-05 改造）

下面三个改造来自 commit `2747a93`，是把 `packages/*` 全部 `any` / `as any` 清空那一批。

### 案例 1：探测 Vite 8 才有的导出

`packages/vite-plugin/src/plugin.ts` 顶部需要判断当前 Vite 是不是 Rolldown 后端的版本——Vite 8+ 才会 export `rolldownVersion`：

**改造前**：

```ts
// biome-ignore lint/suspicious/noExplicitAny: probe an optional export without failing on old typings
const IS_ROLLDOWN = Boolean((viteExports as any).rolldownVersion);
```

**改造后**：

```ts
const IS_ROLLDOWN = Boolean(
  (viteExports as unknown as {rolldownVersion?: unknown}).rolldownVersion
);
```

**变化点**：
1. 用 `as unknown as <typed shape>` 替代 `as any`——访问 `.rolldownVersion` 时类型仍然是 `unknown | undefined`，不会被错当成"任何东西"
2. 字段类型用 `unknown` 而不是 `string`——因为我们只 `Boolean()` 它，没必要假设值类型
3. 删掉了 biome-ignore 注释——不再需要

读取 `(typed-shape).rolldownVersion` 后想拿来用，编译器会强制你 narrow 一次（`typeof === 'string'` 之类）——这正是 `unknown` 的价值。

---

### 案例 2：去掉 `pending.get(key)!` 的非空断言

`packages/runtime/src/request.ts` 的 dedupe 拦截器：

**改造前**：

```ts
if (pending.has(key)) {
  const existing = await pending.get(key)!;
  // ↑ noNonNullAssertion：上一行 has(key) 不能让编译器推出 get 一定有值
  ...
}
```

虽然 `!` 不直接是 `any`，但它是**类型系统的逃生口**——和 `any` 同根。biome 的 `noNonNullAssertion` 规则把它当 lint warning 提示。

**改造后**：

```ts
const inflight = pending.get(key);
if (inflight) {
  const existing = await inflight;
  ...
}
```

**变化点**：
1. 不再依赖 `has + get` 双查询——一次 `get` 拿值，用 truthy 检查代替
2. 编译器在 `if (inflight)` 之后**自然 narrow** 出 `Promise<AxiosResponse>`，不需要 `!`
3. 顺便修掉了 race condition——`has(key)` 和 `get(key)` 之间理论上 map 可能被改

> **教训**：每次想写 `!`，问自己一句"能不能改写成 narrow"——大多数情况都能。

---

### 案例 3：Vite 8 才有的 `oxc` 选项

`packages/vite-plugin/src/plugin.ts` 配置 minifier 时，需要根据是不是 Rolldown 决定用 `oxc` 还是 `esbuild`，但 `oxc` 字段在 Vite 5/6/7 的 `UserConfig` 类型里不存在：

**改造前**：

```ts
oxc: {
  drop: ...,
  pure: ...,
  legalComments: 'none'
  // biome-ignore lint/suspicious/noExplicitAny: `oxc` is only in Vite 8+ typings
} as any
```

**改造后**：

```ts
oxc: {
  drop: ...,
  pure: ...,
  legalComments: 'none'
} as unknown as Record<string, unknown>
```

**为什么不直接写"正确类型"**：因为 lhx-kit 的 peerDeps 是 `vite ^5 || ^6 || ^7 || ^8`——如果只取 Vite 8 的类型，Vite 5/6/7 的安装会编译失败。`as unknown as Record<string, unknown>` 是一种"保留对象语义但脱离 Vite 版本"的折中。

**这种 case 的纪律**：
- 用 `as unknown as <Specific>` 而非 `as any`（更窄）
- 加注释说明这是 typing gap，下次升级 peer 范围时记得回收
- 在 commit message / changeset 里写明这是"已知的类型 escape"

---

## 🚧 真正的"无解"角落怎么办

有些场景**确实**无法用纯类型解决：

| 场景 | 推荐做法 |
|---|---|
| 第三方库根本没 `.d.ts`，且没人写 `@types/*` | 自己在项目里加 `src/types/<lib>.d.ts` 写一份**最小够用**的 shim，不要 `as any` |
| 第三方类型严重错误（你确认它的运行时行为不是它声明的那样） | 写一个 typed wrapper 函数，把 escape 局限在 wrapper 内部，**不让它扩散** |
| 真正的动态形状（如 plugin runtime 收到的用户配置） | 用 `unknown` + zod 校验，**不是** `any` |
| Vendor build artifacts 里的 `any`（不是你的代码） | 不用管——biome 默认不扫 `node_modules`/`dist` |

**核心原则**：把 escape 局限在最小作用域。**绝不让 `any` 出现在公共 API 的签名里**。

---

## 🛠️ 如何在仓库里"守住"这条规则

### 1. Biome 规则

`biome.json` 里启用 `lint.suspicious.noExplicitAny`：

```json
{
  "linter": {
    "rules": {
      "suspicious": {
        "noExplicitAny": "error"
      }
    }
  }
}
```

> ⚠️ lhx-kit 当前 biome 配置默认是 warn 而不是 error——**这是一个值得升级的优化项**。改成 error 之后，pre-push 钩子（`biome check .`）会直接拦下任何含 `any` 的提交。

### 2. Pre-push 钩子

`.husky/pre-push` 执行 `biome check .`——只要有 lint warning 都会拦。结合上面把 `noExplicitAny` 升到 error，等于**任何 `any` 都过不了 push**。

### 3. CI 兜底

`.github/workflows/ci.yaml` 里的 `pnpm lint` 这一步同样会跑 `biome check .`——即使本地 hook 被 `--no-verify` 跳过，CI 还是会拦红。

### 4. PR review

人工 review 时关键关注：
- 新增的 `as ` 关键字（不限 `as any`）
- 新增的 `: any` 类型标注
- 新增的 `// biome-ignore lint/suspicious/noExplicitAny`——这条尤其要追问"为什么必须 escape"

---

## 📋 Anti-pattern 速查表

| ❌ 反例 | ✅ 正例 |
|---|---|
| `function f(x: any)` | `function f(x: unknown)` 或精确类型 |
| `const data: any = JSON.parse(s)` | `const data: unknown = JSON.parse(s)` 之后 narrow |
| `arr.find(x => ...) as any` | `arr.find(x => ...) as Specific` 或返回 `T \| undefined` |
| `try { ... } catch (e: any) {}` | `try { ... } catch (e: unknown) {}` 之后 narrow（TS 4.4+ 默认 unknown） |
| `Map<string, any>` | `Map<string, KnownValueType>` |
| `Record<string, any>` | `Record<string, unknown>` 或精确 union |
| `(x as any).foo` | `(x as {foo: unknown}).foo` |
| `// @ts-ignore` 来跳过类型错误 | 修类型，或退而用 `// @ts-expect-error <reason>` |

---

## 🎯 最后：当你忍不住想写 `any` 时

回答这三个问题：

1. **是不是没花时间想？** → 大多数 `any` 出现是因为查 generics / utility types 麻烦。花 3 分钟，通常能找到精确类型。
2. **是不是真的"未知"？** → 真未知就 `unknown` + narrow，不是 `any`。
3. **是不是 typing gap？** → `as unknown as <Specific>` + 注释说明 + changeset/issue 记录回收。

**实在挡不住的极端 case**——要 `// biome-ignore` 也行，但写明理由，并把这个 escape 列入下次重构的待办。
