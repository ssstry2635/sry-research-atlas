# DSH 插件市场收录与分发指南

本文档基于 DeepSeek Harness `0.2.2-rc.5` 的官方实现源码（`@deepseek-ai/dsh-plugin-market`、`@deepseek-ai/dsh-plugin-market-index` 与 `@deepseek-ai/dsh-plugin-manager`）以及主流第三方社区市场的索引规则整理，说明如何让 `sry-research-atlas` 被 DSH 内置发现页与各大社区市场检索、展示和一键安装。

## 一、DSH 插件发现机制的技术原理

DeepSeek Harness 本身不内置带中心服务器的官方市场，而是由宿主侧的 `pluginMarket` 服务读取用户或 profile 配置的静态 HTTPS 索引源（`indexes` 数组），在独立 Worker 线程中按 Format 1 规范（`parseMarketIndex`）校验 JSON，再将用户选中的条目交给 `pluginManager.installBundle` 执行安装。

要让插件既能通过本地目录或 Git 链接直接安装，又能出现在各大 DSH 插件市场中，插件仓库本身必须首先满足五项基础要求。第一，仓库根目录的 `package.json` 必须声明 `dsh.bundle.patch` 并指向 `./cordis.patch.yml`，不能只声明 `dsh.client`。第二，包名应当是合法的 npm 包名（本项目已从私有的 `@local/bohr-research-atlas` 升级为公开包名 `sry-research-atlas`，并同步了 `cordis.patch.yml` 与 `client.js` 的模块 ID）。第三，`package.json` 必须移除 `private: true`，补齐 `version`、`description`、`license`、`repository`、`homepage`、`keywords`（包含 `dsh-plugin`）与 `engines.dsh`（`>=0.2.2-rc.5 <0.3.0-0`）。第四，必须导出 `./locale/*.json` 与 `./icon`，且在 `locale/zh-CN.json` 和 `locale/en.json` 中提供准确的 `meta.title`、`meta.description` 与指向单图预览文档的 `meta.detail`，同时把 `"docs"` 加入 `files` 数组。第五，`client.js` 必须作为已构建产物提交在仓库根目录，使得用户无需在安装阶段执行额外的 TypeScript 编译即可开箱即用。以上五项要求在本仓库 `4.7.0` 版本中已全部配齐。

## 二、收录到三大主流 DSH 社区插件市场

目前 DSH 生态中用户使用最广的插件发现渠道共有三类，分别是桌面端默认配置的 Awesome DSH Plugin 社区目录（`dsh-plugin-catalog`）、搜索 GitHub Topic 的 `DSH-Plugins-Marketplace` 插件，以及社区索引仓库 `dsh-plugin-index` / `DSH-Store`。

### 1. 被 GitHub Topic 驱动的市场自动检索到（零等待）

社区中以 `bradeGithub/DSH-Plugins-Marketplace` 为代表的市场插件通过 GitHub Search API 自动抓取带有 `dsh-plugin` 标签的公开仓库。只要在 GitHub 仓库主页右侧点击 About 旁边的齿轮图标，将 Description 设为 `Bohr Research Atlas (玻尔科学空间): bilateral knowledge graph, multi-source scholarly retrieval, bilingual summaries, interactive mind maps, open-access PDF proxy, and native DSH conversation integration.`，并在 Topics 中填入 `dsh-plugin`、`deepseek-harness`、`research`、`knowledge-graph`、`literature-review` 保存，这类市场插件在刷新时就会自动索引到本仓库。

### 2. 提交到 Awesome DSH Plugin 官方格式社区主目录（`dsh-plugin-catalog`）

许多 DSH 桌面端用户的 `cordis.patch.yml` 中配置了 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`。该索引由 `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin` 仓库通过 CI 自动构建并发布到 npm 与 jsDelivr。本仓库已为你准备好符合其 CI 校验规范的条目文件 `marketplace/ssstry2635__sry-research-atlas.yml`。

向该目录提交收录只需三步。第一步，确认 GitHub 仓库已添加 `dsh-plugin` topic 且仓库创建时间已满 24 小时。第二步，Fork `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin` 仓库，将本仓库下的 `marketplace/ssstry2635__sry-research-atlas.yml` 复制到对方仓库的 `data/plugins/ssstry2635__sry-research-atlas.yml`。第三步，发起 Pull Request（标题写 `Add sry-research-atlas`），对方 GitHub Actions 校验通过并合并后，全球配置了 `dsh-plugin-catalog` 的 DSH 客户端即可在“插件 → 发现”页直接搜索“玻尔科学空间”或 `sry-research-atlas` 并一键安装。

### 3. 自托管或直接挂载 Format 1 市场索引（立即可用）

本仓库已在 `marketplace/index.json` 中内置了一份完全符合 `@deepseek-ai/dsh-plugin-market-index` Format 1 规范的静态索引文件，并通过了本机 DSH `parseMarketIndex` 严格校验。它采用 `git` 安装源并指向本仓库的精确提交，无需等待 npm 发布即可工作。

任何用户只要在 DSH 的“插件 → 发现 → 添加索引源”中填入以下直链地址（或任何无重定向的静态 HTTPS 托管地址），就能立刻在发现页中看到并安装本插件：

```text
https://raw.githubusercontent.com/ssstry2635/sry-research-atlas/main/marketplace/index.json
```

### 4. 可选：发布到 npm 官方注册表

如果希望在市场中显示 npm 下载量并支持通过包名 `sry-research-atlas` 直接安装，可在仓库根目录登录 npm 后执行：

```bash
npm pack --dry-run
npm publish --access public
```

发布成功后，把 `marketplace/index.json` 中的 `source` 改为 `{ "type": "npm" }` 即可同时支持注册表版本更新。
