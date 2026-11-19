# 玻尔科学空间 · SRY Research Atlas

这是一个面向材料与化学研究的 DSH 插件。它把目标材料、同族体系、制备方法、论文证据和研究机会组织成左右双侧知识网络，并把论文检索、中英概要、课题推荐、DSH 原生对话、论文知识库和论文思维导图连接在一起。

仓库根目录就是可安装的 DSH bundle，包含 Host 入口、构建后的 Client、Cordis 清单、语言资源和图标。`sources/` 保留可重建的 TypeScript 源码，`docs/` 记录网络、检索和 DSH 集成设计。

## 安装

先把仓库克隆到本机：

```bash
git clone https://github.com/ssstry2635/sry-research-atlas.git
```

然后在 DSH 的 **Plugins / 插件** 页面选择添加本地插件，定位到克隆后的仓库根目录。也可以在已安装 Plugin Manager 的环境中使用同样的本地目录安装方式。安装后左侧出现“玻尔科学空间”入口；普通对话页的原生输入框上方会出现“玻尔研究网络”折叠栏。

运行时不需要单独启动 Web 服务，也不需要 API key。DSH 需要已经配置可用的模型，因为论文中英摘要、思维导图和研究问答会调用当前 DSH 模型。

## 功能

网络以研究起点为中心，材料谱系向左、方法与证据向右，自动布局不绘制跨中心连线。节点可以自由拖动，点击材料、方法或机会节点进入分支聚焦；点击论文不会收起同页其他论文。论文卡悬停显示英文概括、中文对照和关键发现。

搜索框接收普通材料名、化学式、方法或论文题目，提交后自动规范化化学式。检索优先 OpenAlex，遇到额度限制或服务失败时自动切换 Crossref，并对相同查询缓存 15 分钟。界面标明实际论文来源。

DSH 原生对话页中的“玻尔研究网络”展开为独立悬浮窗。窗口四边可以拖动位置，四角可以缩放。论文或节点可以发送到原生对话，问题先写入 DSH 原生输入框，再使用原版消息流、流式输出和工具过程回答。论文知识库保存在 `~/.dsh/bohr-knowledge.json`，DSH Agent 可通过 `bohr_knowledge` 工具检索。

论文详情可以生成结构化思维导图，节点覆盖研究问题、材料与合成、表征、关键结果、证据边界和下一步验证。选中节点可直接追问，问题进入 DSH 原生对话。

## 数据与配置

OpenAlex 的匿名额度由 IP 共享，因此插件不依赖单一来源。若部署者希望获得独立的 OpenAlex 额度，可在启动 DSH 的 Host 环境设置 `OPENALEX_API_KEY`；没有该变量时，Crossref 回退仍然工作，并且不需要修改插件清单。

知识库文件只保存论文元数据、模型生成的中英概要和加入时间。课题、收藏和摘要缓存保存在 DSH 页面来源的浏览器本地存储中。Host 的 `/bohr-api` 接口只接受同源请求，不保存对话内容或模型凭据。

## 开发

仓库根目录的 `client.js` 是已构建产物。修改 `sources/` 后，先安装开发依赖并重新构建：

```bash
pnpm install
pnpm build:client
```

构建只需要 `esbuild` 和 `lucide-react`。React 与 React JSX Runtime 由 DSH 宿主提供，插件不携带第二份 React。

## 设计文档

网络结构和输入设计见 [docs/NETWORK-DESIGN.md](docs/NETWORK-DESIGN.md)。多源检索、429 处理、缓存与中文概要保底见 [docs/RETRIEVAL.md](docs/RETRIEVAL.md)。DSH 原生对话、悬浮窗、知识库和工具集成见 [docs/DSH-INTEGRATION.md](docs/DSH-INTEGRATION.md)。推荐评分与证据边界见 [docs/RECOMMENDATION-DESIGN.md](docs/RECOMMENDATION-DESIGN.md)。

## 当前版本

版本 `4.5.2`。详细变更见 [CHANGELOG.md](CHANGELOG.md)。
