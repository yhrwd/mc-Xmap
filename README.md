# **Shit AI Code Warning**

# MC Xmap

一个基于 `Vue 3 + TypeScript + Canvas` 的 Minecraft 地图查看器。

## 1. 快速开始

### 环境要求

- Node.js `20.19+`（或 `22.12+`）
- Git
- 你那聪明至极的脑子，我的朋友

### 克隆本仓库

```bash
git clone
```

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

把导出的分层瓦片目录放进项目根目录 `map/`，例如：

- `map/map0`
- `map/map1`
- `map/map2`

文件名需要包含坐标，格式示例：

- `xxx_x512_z0.png`
- `aaa_x-1536_z1024.png`

脚本会自动从文件名中解析 `x/z` 坐标。

### 第二步：一键处理（合并 + 预处理）

运行：

```bash
npm run pipeline-map
```

这个命令会自动完成：

1. 合并 `map/map*` 到 `map/merged_map`（每次先清空输出目录）
2. PNG -> WebP（处理 `map/merged_map`）
3. 生成 `public/tiles/tile-index.json`
4. 生成多级分块缩略图金字塔（mip）

### 第二步（可选）：单独执行

```bash
npm run merge-map
npm run process-map
```

- `merge-map`：仅合并到 `map/merged_map`
- `process-map`：仅预处理 `map/merged_map`（每次先清空 `public/tiles`）

原有预处理中的主要阶段：

1. PNG -> WebP
2. 生成 `public/tiles/tile-index.json`
3. 生成多级分块缩略图金字塔（mip，`L0` 直接使用原始瓦片索引，不重复生成文件）

### 第三步：配置标记

编辑 `public/markers.json`，示例：

```json
[
  { 
    "id": "spawn", 
    "name": "出生点", 
    "x": 0, 
    "z": 0, 
    "color": "#22c55e" 
  }
]
```

## 3. 命令

- `npm run dev`：开发模式
- `npm run build`：构建
- `npm run type-check`：类型检查
- `npm run merge-map`：合并 `map/map*` 到 `map/merged_map`
- `npm run process-map`：预处理 `map/merged_map` 到 `public/tiles`
- `npm run pipeline-map`：一键合并并预处理（推荐）
- `npm run generate-mips`：仅重新生成 mip 金字塔

## 4. 目录说明

```text
map/map*/             合并前分层 PNG 瓦片目录
map/merged_map/       合并后的 PNG 瓦片目录
public/tiles/         处理后的 WebP 瓦片与索引
public/tiles/mip/     多级分块缩略图金字塔
public/markers.json   标记配置
scripts/              预处理脚本
src/                  前端源码
```
###### *其实有部分代码是Python写的，转的js，因为js看的我头疼*