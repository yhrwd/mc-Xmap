# MC Xmap

一个基于 `Vue 3 + TypeScript + Canvas` 的 Minecraft 地图查看器。

## 1. 快速开始

### 环境要求

- Node.js `20.19+`（或 `22.12+`）

### 安装依赖

```bash
npm install
```

### 启动开发

```bash
npm run dev
```

### 构建生产

```bash
npm run build
```

## 2. 使用教程

### 第一步：准备地图原图

把导出的瓦片 PNG 放进项目根目录 `map/`。

文件名需要包含坐标，格式示例：

- `xxx_x512_z0.png`
- `aaa_x-1536_z1024.png`

脚本会自动从文件名中解析 `x/z` 坐标。

### 第二步：预处理地图

运行：

```bash
npm run process-map
```

这个命令会自动完成：

1. PNG -> WebP（增量处理，只转换有变更的文件）
2. 生成 `public/tiles/tile-index.json`
3. 生成多级分块缩略图金字塔（mip）

### 第三步：配置标记

编辑 `public/markers.json`，示例：

```json
[{ "id": "spawn", "name": "出生点", "x": 0, "z": 0, "color": "#22c55e" }]
```

## 3. 命令

- `npm run dev`：开发模式
- `npm run build`：构建
- `npm run type-check`：类型检查
- `npm run process-map`：完整地图预处理（推荐）
- `npm run generate-mips`：仅重新生成 mip 金字塔

## 4. 目录说明

```text
map/                  原始 PNG 瓦片地图
public/tiles/         处理后的 WebP 瓦片与索引
public/tiles/mip/     多级分块缩略图金字塔
public/markers.json   标记配置
scripts/              预处理脚本
src/                  前端源码
```
