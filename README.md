# 儿童自然拼读课程编排工具

面向自然拼读教师的纯前端课程设计工具。老师可以组织音素、单词、句子和练习，检查教学顺序与质量，并在本机离线继续编辑。

## 功能

- 按音素、单词、句子、练习四类活动编排课程。
- 设置活动难度、预计时长、教学提示、无障碍说明和练习反馈。
- 使用复选框建立前置活动依赖，并检测循环依赖和失效引用。
- 手机、平板、桌面三种预览宽度，按课程顺序查看学习路径。
- 自动检查音素提前使用、相似音混淆、例句过长、练习缺少反馈、无障碍说明缺失。
- 活动上移、下移、复制、删除，以及整门课程复制。
- 保存完整课程快照并比较两个版本的活动增删和字段变化。
- 所有数据自动保存到 localStorage，断网后仍可编辑。
- `Ctrl/Cmd+Z` 撤销、`Ctrl/Cmd+Y` 重做、`Alt+N` 新建活动、`Alt+↑/↓` 调整顺序、`Ctrl/Cmd+S` 保存。

## 技术栈

- SvelteKit + TypeScript
- Svelte 5
- Carbon Components Svelte
- Vite
- 浏览器 localStorage
- Nginx 静态部署

## 本地开发

```bash
npm install
npm run dev
```

开发服务器监听 `5173`，宿主端口仅由部署映射，源码未写入 `10026`。

## 生产构建

```bash
npm install
npm run build
```

静态产物位于 `build`。也可以执行 `npm run check` 做 Svelte/TypeScript 检查。

## Docker

```bash
docker build -t sologsb-1026 .
docker run --rm -p 10026:80 sologsb-1026
```

容器内 Nginx 监听 `80`，访问 `http://localhost:10026`。课程数据仅保存在当前浏览器。
