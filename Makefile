# ╭───────────────────────────────────────────────────────────╮
# │  lhx-kit Makefile — 常用命令聚合器                         │
# │                                                           │
# │  为什么要 Makefile？                                       │
# │    - pnpm scripts 有链式依赖时写 & 和 && 很丑              │
# │    - CI / 新人 onboarding 只要记 `make` 一个入口即可       │
# │    - 便于定义"安装依赖 + build + 启动"这类组合工作流       │
# │                                                           │
# │  惯例：                                                    │
# │    - 所有 target 用 .PHONY 标记（不会和同名文件冲突）       │
# │    - 不写 target 时默认执行 help                            │
# │    - 长命令拆行，用 `@` 前缀隐藏命令本体                   │
# ╰───────────────────────────────────────────────────────────╯

SHELL := /bin/bash
.DEFAULT_GOAL := help

# 颜色（支持 tput 的终端会高亮）
BOLD  := $(shell tput bold 2>/dev/null || echo '')
CYAN  := $(shell tput setaf 6 2>/dev/null || echo '')
GREEN := $(shell tput setaf 2 2>/dev/null || echo '')
RESET := $(shell tput sgr0 2>/dev/null || echo '')

# ══════════════════════════════════════════════════════════════
# Help
# ══════════════════════════════════════════════════════════════
.PHONY: help
help:  ## 显示所有可用命令
	@echo ""
	@echo "$(BOLD)lhx-kit Makefile$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "用法: make $(CYAN)<target>$(RESET)\n\n命令列表:\n"} \
	/^[a-zA-Z_-]+:.*?##/ { printf "  $(CYAN)%-22s$(RESET) %s\n", $$1, $$2 } \
	/^##@/ { printf "\n$(BOLD)%s$(RESET)\n", substr($$0, 5) }' $(MAKEFILE_LIST)
	@echo ""

# ══════════════════════════════════════════════════════════════
##@ 环境初始化
# ══════════════════════════════════════════════════════════════

.PHONY: install
install:  ## 安装所有 workspace 依赖
	@echo "$(GREEN)▶ installing workspace deps...$(RESET)"
	pnpm install

.PHONY: setup
setup: install build  ## 从零开始：install + build 全部内部包
	@echo ""
	@echo "$(GREEN)✓ ready!$(RESET) 接下来可以 make dev-vmpa / dev-rmpa / docs-dev"

.PHONY: clean
clean:  ## 清理所有 dist / 缓存
	pnpm -r --if-present clean
	rm -rf node_modules/.cache
	rm -rf apps/docs/doc_build
	rm -rf examples/*/dist examples/*/dist-offline
	@echo "$(GREEN)✓ cleaned$(RESET)"

.PHONY: reset
reset: clean  ## 清理 + 删除所有 node_modules（核弹级清理）
	find . -type d -name 'node_modules' -prune -exec rm -rf {} \;
	rm -rf pnpm-lock.yaml
	@echo "$(GREEN)✓ reset$(RESET) — 用 make install 重新开始"

# ══════════════════════════════════════════════════════════════
##@ 构建
# ══════════════════════════════════════════════════════════════

.PHONY: build
build:  ## 构建所有内部包
	pnpm -r --if-present build

.PHONY: build-packages
build-packages:  ## 仅构建 packages/* 内部包（不含 apps/examples）
	pnpm --filter './packages/*' --if-present build

.PHONY: build-examples
build-examples:  ## 构建 examples（vmpa + rmpa）
	pnpm --filter './examples/*' --if-present build

# ══════════════════════════════════════════════════════════════
##@ 开发
# ══════════════════════════════════════════════════════════════

.PHONY: dev-vmpa
dev-vmpa:  ## 启动 Vue3 MPA 示例 dev server
	pnpm --filter vmpa dev

.PHONY: dev-rmpa
dev-rmpa:  ## 启动 React MPA 示例 dev server
	pnpm --filter rmpa dev

.PHONY: docs-dev
docs-dev:  ## 启动文档站 dev server（Rspress）
	pnpm --filter @lhx-kit/docs dev

.PHONY: docs-build
docs-build:  ## 构建文档站
	pnpm --filter @lhx-kit/docs build

.PHONY: watch
watch:  ## watch 模式构建所有内部包（tsup --watch 并行）
	pnpm --filter './packages/*' --parallel --if-present dev

# ══════════════════════════════════════════════════════════════
##@ 质量保障
# ══════════════════════════════════════════════════════════════

.PHONY: lint
lint:  ## Biome 扫全仓（不改文件）
	pnpm exec biome check .

.PHONY: lint-fix
lint-fix:  ## Biome 扫全仓并自动修复
	pnpm exec biome check --write .

.PHONY: format
format:  ## Biome 格式化全仓
	pnpm exec biome format --write .

.PHONY: typecheck
typecheck:  ## 对所有 workspace 跑 tsc --noEmit
	pnpm -r --if-present --parallel typecheck

.PHONY: test
test:  ## 跑所有单测
	pnpm -r --if-present test

.PHONY: smoke
smoke:  ## 烟测 CLI 能否启动
	pnpm --filter @lhx-kit/cli smoke

.PHONY: check
check: lint typecheck test  ## 全套质量检查（CI 里跑的组合）

# ══════════════════════════════════════════════════════════════
##@ 发布
# ══════════════════════════════════════════════════════════════

.PHONY: changeset
changeset:  ## 交互式声明变更（changesets 规划中）
	@echo "changesets 集成规划中，见 openspec / migration.md"

.PHONY: release-dry
release-dry:  ## 模拟发布（不真正 publish）
	pnpm -r --if-present publish --dry-run --access public

# ══════════════════════════════════════════════════════════════
##@ 工具
# ══════════════════════════════════════════════════════════════

.PHONY: icons-gen
icons-gen:  ## 重新生成文档站 favicon
	pnpm run icons:gen

.PHONY: sync-readmes
sync-readmes:  ## 刷新所有包 README 的 managed footer（安装 / badges / 链接）
	pnpm run sync:readmes

.PHONY: info
info:  ## 打印环境信息（Node / pnpm / git / workspace 树）
	@echo "$(BOLD)Environment$(RESET)"
	@echo "  node:  $$(node --version)"
	@echo "  pnpm:  $$(pnpm --version)"
	@echo "  git:   $$(git --version)"
	@echo ""
	@echo "$(BOLD)Workspace$(RESET)"
	@pnpm -r --depth=-1 list --json 2>/dev/null | grep '"name"' | sed 's/.*"name": "\([^"]*\)".*/  \1/' | sort
	@echo ""
