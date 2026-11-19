# 科研工具与交互参考

这份调研用于说明工作台的设计依据，不表示下列第三方项目已经集成。调研与接口核验时间为 2026 年 11 月 7 日。

## 论文图谱与探索闭环

[Connected Papers](https://www.connectedpapers.com/about) 从一篇起点论文建立相似文献全景，再向前期工作和衍生工作展开。本项目借鉴的是“由种子进入领域，再选择下一篇”的探索方式，而不是复制图形外观。图谱负责选择，不能代替阅读；目标材料在缩放和筛选后仍应容易找回。

[ResearchRabbit](https://www.researchrabbit.ai/features) 把种子文献、持续探索、收藏和再推荐串成循环。其[算法说明](https://learn.researchrabbit.ai/en/articles/12875619-what-s-behind-researchrabbit-s-search-algorithm)区分候选生成与排序，[引用和参考文献指南](https://learn.researchrabbit.ai/en/articles/12454564-how-do-i-see-citations-and-references-in-the-new-researchrabbit)展示了从详情回到 References 与 Cited by 的路径。本项目因此把节点、论文列表、收藏和推荐放在统一状态中，并要求推荐给出进入候选和排序靠前的理由。

[Litmaps](https://www.litmaps.com/features) 的[可视化文档](https://docs.litmaps.com/en/articles/9181490-use-and-edit-litmaps-visualization)与[地图视图说明](https://docs.litmaps.com/en/articles/17702023-map-views-semantic-map-co-citation-and-co-author-networks)提醒用户区分语义、共被引和共同作者网络。二维图不能把所有关系统一成一种距离。本项目明确标注“节点距离表示探索层级，不代表相似度”，并用形状、文字和证据标签补充颜色编码。

[Obsidian Graph view](https://github.com/obsidianmd/obsidian-help/blob/master/en/Plugins/Graph%20view.md) 的局部图和渐进展开适合控制噪声。本项目采用从当前对象向外展开一到两跳的方式，不把大量力导向参数暴露给普通科研用户，并增加键盘节点选择、可见焦点和减少动态效果支持。

## 检索接口的适用边界

[OpenAlex](https://docs.openalex.org/) 当前可直接在浏览器中匿名检索，适合无后端原型。它提供题目、作者、来源、DOI、开放获取、摘要索引和引文元数据。匿名请求共享网络预算，免费 key 的配额和申请方式以[官方文档](https://docs.openalex.org/)为准。生产环境仍应通过服务端管理 key、缓存、重试和请求记录。

[Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) 适合补充 DOI 注册元数据，[Europe PMC](https://europepmc.org/RestfulWebService) 适合生物医学全文与文献检索。两者可作为后续跨库核验来源，但需要保留来源字段并制定 DOI、标题和年份的去重规则。

[arXiv](https://info.arxiv.org/help/api/index.html) 的浏览器跨域限制、Semantic Scholar 的匿名限流以及出版商全文权限都不适合在前端悄悄绕过。下一阶段应由轻量服务端统一代理，并明确记录失败、访问权限与查询时间。

## 科研 Agent 与全文证据

[PaperQA](https://github.com/Future-House/paper-qa) 适合参考带全文证据的问答流程。它对本项目的价值在于把回答定位到论文证据，而不是生成一段无法核验的“研究建议”。全文获取、解析成本和引用核验需要服务端支持。

[OpenScholar](https://github.com/AkariAsai/OpenScholar) 和 [AI2 ScholarQA](https://github.com/allenai/ai2-scholarqa-lib) 可参考检索增强生成、综述组织与引文关联。它们适合后续实现“围绕课题约束生成有出处的方向综述”，但不应取代当前可解释的候选生成与证据分级。

[STORM](https://github.com/stanford-oval/storm) 可参考从主题探索到多视角提纲和长文生成的工作流。对于科研选题，值得借鉴的是先探索再组织结构，而不是直接生成结论。所有生成内容仍需回到可核验文献与实验记录。

## 从原型到研究基础设施

下一阶段首先需要建立统一论文标识、跨库去重、查询快照和全文证据定位。随后可以把课题组实验记录作为独立证据层，与公开论文和迁移假设区分。推荐排序应同时考虑课题目标、已有方法、未解决异常、实验成本和安全约束，并给出停止条件。只有当检索覆盖和全文证据足够时，才适合提高“尚未在该体系验证”的表述强度。
