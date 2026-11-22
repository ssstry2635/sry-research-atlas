# Changelog

## 4.7.0 (2026-11-22)

升级四源协同检索引擎（OpenAlex + Crossref + Europe PMC + arXiv），支持单篇 DOI 直查、中文学术关键词到英文检索式的智能规划，以及跨源摘要与开放获取 PDF 自动回填。新增检索后动态派生左右双侧概念分支、方法路线与机会节点的能力，并提供跨学科快捷探索主题，使插件从单一材料示例扩展为通用科研发散工作台。新增截断 JSON 括号栈自愈解析器，彻底解决长摘要或思维导图生成时的 JSON 截断报错。将插件包名规范化为公开包名 `sry-research-atlas`，补齐 `engines.dsh`、MIT 许可证、中英文 `meta.detail` 预览图、Format 1 市场索引 `marketplace/index.json` 与社区目录提交清单。

## 4.6.0 (2026-11-20)

新增 `bohr_paper_search` Agent 实时文献检索工具。支持识别 OpenAlex `best_oa_location`、Crossref Creative Commons PDF、arXiv PDF 与可选 Unpaywall 开放副本，并提供 Host 端 `/bohr-api/pdf` 受控开放 PDF 下载代理。思维导图接口升级为双提示词重试与确定性基础导图兜底。

## 4.5.2 (2026-11-20)

实现实时论文中英概要的四级保底链路：批量生成、逐篇重试、题目级保守英文概括加 DSH 翻译服务、以及明确标注“仅有题录信息”的中文说明，确保每篇发散论文必有中文概要。修复 OpenAlex 429 限流问题并加入 15 分钟检索缓存。修复点击论文节点会收起同页并列论文的问题。

## 4.4.1 (2026-11-20)

DSH 原生对话中的研究网络升级为顶层 Popover 独立悬浮窗，支持四边拖动位置、四角缩放。卡片先写入知识库，再通过原生 `InputActions` 提交。修复 `bohr_knowledge` 工具参数 Schema。

## 4.2.1 (2026-11-19)

实现左右双侧规整分支布局、节点自由拖动、分支聚焦、普通搜索框化学式自动规范化与论文双语悬浮摘要卡。
