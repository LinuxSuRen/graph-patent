# graph-patent

以**力导向图**的形式查询和展示专利数据：专利、公司（申请人）、技术领域构成一张知识图谱，支持搜索高亮、领域过滤与节点下钻。

数据源：[LinuxSuRen/awesome-patent](https://github.com/LinuxSuRen/awesome-patent) 的 `data/*.yaml`（具身智能与巡检机器人专利精选，持续更新）。

## 功能

- **图谱视图**：● 专利（颜色 = 技术领域）— ▪ 公司 — ⬡ 领域三层结构，滚轮缩放、拖拽平移
- **查询**：搜索框按专利名 / 公开号 / 公司过滤，命中节点高亮、其余淡出
- **过滤**：技术领域 chips 按类开关
- **下钻**：点击专利节点查看详情（公开号、公司、领域、年份、Google Patents 链接）；点击公司或领域节点列出其全部关联专利
- **数据分支**：URL 加 `?ref=<branch>` 可加载 awesome-patent 任意分支的数据，便于 PR 合并前预览

## 在线使用

GitHub Pages：https://linuxsuren.github.io/graph-patent/

## 本地开发

```shell
npm install
npm run dev      # http://localhost:5173
npm run build    # 产物在 dist/
```

## 技术栈

Vue 3 + Vite，渲染为手写 Canvas + [d3-force](https://github.com/d3/d3-force) 力导向布局，YAML 解析用 js-yaml；运行时通过 GitHub API 拉取数据源仓库，无后端。
