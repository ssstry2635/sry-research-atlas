# 论文检索与开放原文方案

这一轮的检索目标不是“能返回一些 DOI”，而是让材料与化学研究者拿到相关、可核验、尽量有摘要和合法开放原文的论文。为此先调研了现有 agent 工具，再决定不直接嵌入一个外部 MCP 服务，而是在插件 Host 内实现受控的多源检索。

调研过的候选包括 [paper-search-mcp](https://github.com/223nobody/paper-search-mcp)、[PaperQA2](https://github.com/Future-House/paper-qa) 和若干聚合型论文 MCP。`paper-search-mcp` 覆盖 arXiv、PubMed、Crossref、Semantic Scholar、Unpaywall 等来源，但其部分版本包含可选的 Sci-Hub 或 Google Scholar 抓取，不适合作为默认依赖；PaperQA2 擅长拿到 PDF 后的带引用检索，不负责稳定的在线发现。因此本项目采用“DSH Host 统一检索，客户端只调用内部接口”的架构，不把 API key、CORS 和第三方服务的可用性交给浏览器。

检索的优先级是 OpenAlex、Crossref 与 arXiv。OpenAlex 提供较好的材料论文相关性和摘要倒排索引，还能返回开放获取位置；Crossref 提供权威 DOI、期刊和许可元数据；arXiv 提供公开预印本与直接 PDF。OpenAlex 失败时，Crossref 与 arXiv 并行查询，按 DOI 或规范化题目去重，再用题目匹配、摘要匹配、引用数和开放获取状态做软排序，避免让仅凭年份或引用数的低相关结果排在前面。检索结果会按 15 分钟缓存，并在界面标明 OpenAlex、Crossref 或 arXiv。

开放原文只处理合法开放版本。OpenAlex 返回 `best_oa_location.pdf_url` 时直接标记为开放 PDF；Crossref 只有在 Creative Commons 许可且存在 PDF 链接时才标记；arXiv 预印本开放 PDF 直接使用。部署者可以设置 `UNPAYWALL_EMAIL`，插件会通过 [Unpaywall API](https://unpaywall.org/products/api) 为 DOI 补充开放位置。没有开放版本时，只提供 DOI 或出版社原文页，不绕过付费墙，也不接入 Sci-Hub。

PDF 下载不是把任意 URL 交给代理。检索时只登记通过 HTTPS 获取、被来源声明为开放获取的 PDF 地址；下载接口按论文 id 查找登记记录，拒绝私网地址、要求上游返回 PDF、限制 40 MB 和 30 秒，并以附件形式返回。这样既解决了浏览器跨域和部分仓库需要正确 Accept 头的问题，也避免把插件变成任意 URL 代理。失败时界面明确提示“没有开放 PDF，请打开原文页或通过机构权限访问”。

Agent 侧新增了只读工具 `bohr_paper_search`，允许 DSH 直接检索实时文献并返回题目、作者、年份、期刊、被引、摘要、DOI、原文页和开放 PDF。它与界面共用同一检索缓存和来源回退，不另外维护一套结果。已保存论文仍由 `bohr_knowledge` 工具读取。

当前边界是没有解析 PDF 全文，也没有做 PaperQA2 式的段落级引用问答。开放 PDF 下载后，可以继续在 DSH 中读取文件；若要实现“全文证据定位”，下一步应使用结构化 PDF 解析和带页码引用的检索，而不是仅依赖摘要。
