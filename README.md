# 压缩坞（Media Compress Hub）

纯前端的本地媒体压缩工具：图片、GIF、视频在浏览器内处理，**文件不会上传到任何服务器**。可作为渐进式 Web 应用（PWA）安装使用。

## 界面展示
<img width="1407" height="1379" alt="image" src="https://github.com/user-attachments/assets/e737892d-1eb2-44fe-83c3-21682e643596" />
<img width="2229" height="1626" alt="image" src="https://github.com/user-attachments/assets/1b2cb875-b7cd-4b64-a034-26edaa02b29c" />
<img width="2206" height="1628" alt="image" src="https://github.com/user-attachments/assets/98bb92ac-cda4-4329-b23f-f3fc21de919d" />


## 功能概览

| 类型 | 说明 |
|------|------|
| **图片** | 支持常见位图输入（如 JPEG、PNG、WebP、BMP、AVIF 等），可输出 JPG / PNG / WebP；支持质量调节、目标体积（智能压缩）、原图对比预览 |
| **GIF** | 基于 FFmpeg 重编码；可调帧率上限、调色板颜色数、抖动算法、最大宽度等 |
| **视频** | 基于 FFmpeg 的 CRF 压缩；可选保留并重编码音轨或去除音轨 |

其他能力：

- **历史记录**：压缩任务摘要保存在本地（IndexedDB），可在「历史」页查看
- **设置**：单文件大小上限、图片最低质量、视频 CRF 范围与默认偏好等可配置
- **路由**：首页 `/`、历史 `/history`、设置 `/settings`

## 技术栈

- [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) 8
- [Ant Design](https://ant.design/) 6
- [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)（Web Worker 中运行，用于 GIF / 视频）
- 独立 **Web Worker** 处理图片编码
- [Dexie](https://dexie.org/) 管理 IndexedDB
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) 提供离线缓存与安装体验

## 本地开发

环境要求：**Node.js**（建议当前 LTS）与 **npm**。

```bash
npm install
npm run dev
```

浏览器访问终端里提示的本地地址（一般为 `http://localhost:5173`）。

## 构建与预览

```bash
npm run build
npm run preview
```

产物在 `dist/` 目录，可部署到任意静态站点托管。

## 代码质量

```bash
npm run lint
```

## 隐私与数据

- 媒体仅在用户本机内存与 Worker 中处理
- 历史与设置仅存于浏览器本地存储，清除站点数据会一并删除

## 许可

本项目以 [**GNU Affero General Public License v3.0**](https://www.gnu.org/licenses/agpl-3.0.html)（AGPL-3.0）发布，全文见仓库根目录 [`LICENSE`](./LICENSE)。

> 将本程序作为网络服务提供给公众使用时， AGPL 对「向用户提供对应源码」等有额外要求，部署前请通读许可证或咨询法律顾问。
