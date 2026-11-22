# SRY Research Atlas (`sry-research-atlas`)

![SRY Research Atlas Preview](docs/preview.svg)

**SRY Research Atlas** 是一款专为 DeepSeek Harness（DSH）设计的发散式学术文献检索、双侧知识网络构建与原生对话联动工作台。它支持从任意学科的研究主题、材料体系、化学式、实验/算法路线或单篇 DOI 出发，自动联合检索全球主流开放学术库，派生“体系与概念谱系在左、方法与论文证据在右”的结构化知识图谱，并与 DSH 原生对话、Agent 工具链和本地论文知识库无缝协同。

本仓库根目录即为**开箱即用的标准 DSH Bundle**（已包含预构建的 `client.js`、Host 服务 `index.js`、`cordis.patch.yml`、多语言元数据与预览图），克隆或从插件市场拉取后无需任何构建步骤、无需配置 API Key 即可直接在 DSH 中运行。

---

## 核心特性

### 1. 左右双侧结构化知识网络与动态概念派生

传统的文献图谱往往把所有节点堆叠在无序的力导向平面中，随着节点增多迅速退化为难以阅读的线团。玻尔科学空间采用严格的**左右双侧分层布局（Bilateral Layered Layout）**：研究起点固定在画布中央，左侧纵向排列相关的体系、概念或同构家族（`family` / `material`），右侧纵向排列研究方法、表征路线、延伸机会与论文证据（`method` / `opportunity` / `paper`），自动布局不绘制跨越中心轴线的杂乱次级连线。

当用户输入任何学科的检索词时，Host 端不仅检出高相关论文，还会结合当前 DSH 模型自动提炼出 5 个属于该领域的具体体系分支、方法学分支与瓶颈突破点，自动挂载到根节点左右两侧并关联支撑文献。每个节点支持自由拖拽排版，点击非论文节点可聚焦当前分支，点击单篇论文节点时同页并列论文保持展开而不折叠。

### 2. 四源协同检索、中英学术查询规划与合法开放 PDF 代理

为了解决单一免费接口限流（如 OpenAlex 或 Semantic Scholar 匿名共享额度耗尽返回 `429`）以及单一数据库摘要缺失的问题，插件在 Host 端实现了四源协同检索引擎：

第一步是**中英学术查询规划与化学式规范化**。搜索框支持中文学术主题（如`固态电解质 锂电池`、`二氧化碳电催化还原`）、英文短语、化学式（输入 `CsPbBr3` 自动规范化显示为 `CsPbBr₃` 并以标准式检索）或直接输入 DOI（如 `10.1038/s41467-018-07972-7`）。中文查询会通过内置学术词典、DSH 翻译服务与模型重写自动转化为高召回的英文学术检索式。

第二步是**多源互补与跨源摘要回填**。Host 优先请求 OpenAlex（过滤已撤稿文献并提取 `best_oa_location` 与倒排摘要）；当结果不足、摘要缺失或遇到限流时，自动并发查询 **Crossref**（权威 DOI 与期刊许可元数据）、**Europe PMC**（开放全文与 PMC 渲染 PDF）和 **arXiv**（物理、材料、计算机与定量生物预印本）。按规范化 DOI 与标题指纹合并去重时，会自动用 Europe PMC 或 arXiv 的完整摘要和开放 PDF 回填缺失记录，并按标题命中、摘要完整度、开放 PDF 可用性、年代与引用数综合重排，同时提供 15 分钟内存缓存。

第三步是**受控的合法开放 PDF 下载**。对于来源明确标记为开放获取（OpenAlex OA、Creative Commons 许可、Europe PMC 或 arXiv）的论文，界面直接提供“下载开放 PDF”按钮，由 Host 的 `/bohr-api/pdf` 接口以受控白名单方式代理下载并校验 `application/pdf`，解决浏览器跨域限制；未开放论文则提供原文落地页与 DOI 直达入口，绝不绕过付费墙或接入非法源。

### 3. 四级保底的实时中英双语概括

每次检索或从节点向外发散论文后，插件都会在后台自动生成每篇论文的**英文核心概括（English Summary）**、**中文学术对照（Chinese Summary）**与**一句话关键发现（Key Finding）**，鼠标悬停在图谱的论文卡片上即可即时阅读。

为了确保任何网络与摘要条件下“每篇论文都必有中文概要”，Host 端采用四级保底管线：先以 3200 tokens 预算批量生成；若批量输出被截断或漏项则逐篇独立重试；若模型服务短暂不可用，则提取保守英文摘要并调用 DSH 内置翻译服务生成中文；若原记录连摘要也未提供，则明确生成标注“仅有题录信息”的中文题目级解读，绝不虚构实验参数或将错误抛给界面。

### 4. 抗截断可追问论文思维导图

在论文详情弹窗中点击“生成论文思维导图”，Host 会围绕核心问题、材料与方法、关键结果、证据边界和下一步验证生成结构化 SVG 思维导图。针对大模型长 JSON 易截断的痛点，内置了**括号栈自愈解析器（Truncated JSON Repair）**、紧凑提示词二次重试与确定性阅读框架兜底。点击思维导图中的任意节点即可一键将该节点的上下文与追问送入 DSH 原生对话。

### 5. DSH 原生对话顶层悬浮窗与双向 Agent 工具

插件摒弃了简陋的自定义聊天框，在 DSH 原生对话输入框上方注册了可折叠的“玻尔研究网络”入口。展开后以浏览器顶层 Popover 渲染为**独立研究悬浮窗**，支持**四边拖动位置、四角自由缩放**，不挤压后方对话流。将图谱中的任何卡片向下拖入发送区，或点击详情页的“发送到 DSH 原生对话”，插件会先将论文持久化到本地知识库 `~/.dsh/bohr-knowledge.json`，再通过 DSH 的 `InputActions` 把结构化问题填入原生输入框并自动提交，由 DSH 原版流式输出与工具调用过程完成深度解答。

同时，插件向 DSH Agent 注册了两个标准工具：
`bohr_knowledge` 用于检索、列出和读取用户收藏或拖入对话的本地论文知识库；`bohr_paper_search` 允许 Agent 在对话过程中随时调用四源检索引擎查找最新文献与开放 PDF 链接。

---

## 快速安装（下载即用）

### 方式一：克隆仓库并在 DSH 中加载本地插件

```bash
git clone https://github.com/ssstry2635/sry-research-atlas.git
```

打开 DeepSeek Harness，进入 **设置 → 插件（Plugins）**，选择添加本地插件并指向克隆下来的 `sry-research-atlas` 根目录即可。仓库已内置构建好的 `client.js`，无需执行 `pnpm install` 或编译。

### 方式二：通过 DSH 插件市场发现页安装

在 DSH 的 **插件 → 发现 → 添加索引源** 中添加本仓库内置的 Format 1 市场索引直链：

```text
https://raw.githubusercontent.com/ssstry2635/sry-research-atlas/main/marketplace/index.json
```

添加后即可在发现页检索 **玻尔科学空间** 或 `sry-research-atlas` 并一键安装。如果你使用的是社区 `Awesome DSH Plugin` 或 `DSH-Plugins-Marketplace`，也可以直接通过关键词或 `dsh-plugin` 标签检索。

---

## 可选高级环境变量（默认无需配置）

插件在无任何环境变量的默认状态下即可完整使用四源检索、双语概括、思维导图与开放 PDF 下载。若部署者希望获得更高的专享配额，可在启动 DSH 的 Host 环境中按需设置：

`OPENALEX_API_KEY` 用于绑定 OpenAlex 免费专享额度（每日 1 美元免费额度，约合每日 1000 次检索，可在 `https://openalex.org/settings/api` 免费申请）。`UNPAYWALL_EMAIL` 用于填写联系邮箱，使 Host 在 OpenAlex 未返回 PDF 时额外调用 Unpaywall API 解析 DOI 的开放获取副本。

---

## 仓库目录结构与二次开发

根目录放置 DSH 运行时直接消费的清单与产物：`package.json`、`cordis.patch.yml`、Host 服务入口 `index.js`、预构建前端包 `client.js`、中英文语言包 `locale/`、插件详情与预览图 `docs/` 以及市场索引文件 `marketplace/`。

可重建的完整 TypeScript 与 React 源码位于 `sources/plugin/` 与 `sources/src/`，构建脚本位于 `scripts/build-client.mjs`。如需修改前端界面并重新打包 `client.js`，在仓库根目录执行：

```bash
pnpm install
pnpm run build:client
```

详细架构与设计文档请参阅：
[多源论文检索与开放原文架构](docs/PAPER-RETRIEVAL.md)、[检索稳定性与中文概要保底设计](docs/RETRIEVAL.md)、[DSH 原生对话、悬浮窗与工具链集成](docs/DSH-INTEGRATION.md)、[双侧知识网络与交互设计](docs/NETWORK-DESIGN.md)、[结构化方向推荐与反证核查设计](docs/RECOMMENDATION-DESIGN.md) 以及 [DSH 插件市场收录与分发指南](docs/MARKETPLACE-PUBLISHING.md)。

---

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
