# 压缩坞（Media Compress Hub）

纯前端的本地媒体压缩工具：图片、GIF、视频在浏览器或桌面窗口内处理，**文件不会上传到任何服务器**。可作为渐进式 Web 应用（PWA）在浏览器中安装，也可通过 **Electron** 打包为 Windows / macOS / Linux 桌面应用。

## 界面展示

<img width="2229" height="1626" alt="image" src="https://github.com/user-attachments/assets/f7eb58ea-2ec2-42ac-9947-39e326e7bc6e" />

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
- **路由**：首页 `/`、历史 `/history`、设置 `/settings`（网页版为 History 路由；桌面版为 Hash 路由，地址形式为 `#/`、`#/history` 等）

## 技术栈

- [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) 8
- [Ant Design](https://ant.design/) 6
- [React Router](https://reactrouter.com/) 7
- [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)（Web Worker 中运行，用于 GIF / 视频）
- 独立 **Web Worker** 处理图片编码
- [Dexie](https://dexie.org/) 管理 IndexedDB
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)（仅网页构建）提供离线缓存与安装体验
- [Electron](https://www.electronjs.org/) + [electron-builder](https://www.electron.build/) 桌面打包

## 环境要求

- **Node.js**：建议使用当前 LTS；若使用较新的 `electron-builder` 工具链，以安装时的引擎提示为准。
- **包管理器**：**npm**（仓库根目录含 [`.npmrc`](./.npmrc)，已启用 `legacy-peer-deps`，以兼容当前 Vite 8 与 `vite-plugin-pwa` 的 peer 依赖声明）。

## 本地开发（网页）

```bash
npm install
npm run dev
```

在浏览器中打开终端提示的本地地址（一般为 [http://localhost:5173](http://localhost:5173)）。

## 构建与预览（网页）

```bash
npm run build
npm run preview
```

静态产物输出在 `dist/`，可部署到任意静态托管（GitHub Pages、对象存储 + CDN 等）。

## 桌面端（Electron）

| 命令 | 说明 |
|------|------|
| `npm run electron:dev` | 启动 Vite（`electron-dev` 模式）并打开 Electron 窗口，热更新开发 |
| `npm run build:electron` | 类型检查并构建供桌面使用的 `dist/`（资源为相对路径，关闭 PWA 插件） |
| `npm run electron:start` | 先执行 `build:electron`，再用当前仓库的 Electron 直接加载 `dist`（快速验证生产包） |
| `npm run electron:pack` | 构建并生成未封装的程序目录（如 `release/win-unpacked`） |
| `npm run electron:dist` | 构建并生成安装包（Windows 默认 NSIS，输出在 `release/`） |

说明：

- 桌面安装包默认输出目录为 **`release/`**（已在 `.gitignore` 中忽略）。
- Windows 下 `package.json` 中配置了 `signAndEditExecutable: false`，便于在未配置代码签名、无符号链接权限的环境中本地打包；若需正式发布签名安装包，请自行配置证书并调整 [electron-builder](https://www.electron.build/) 选项。

## 代码质量

```bash
npm run lint
```

## 隐私与数据

- 媒体仅在用户本机内存与 Worker 中处理
- 历史与设置仅存于浏览器本地存储（IndexedDB 等），清除站点数据会一并删除

## 许可

本项目以 [**GNU Affero General Public License v3.0**](https://www.gnu.org/licenses/agpl-3.0.html)（AGPL-3.0）发布，全文见仓库根目录 [`LICENSE`](./LICENSE)。

> 将本程序作为网络服务提供给公众使用时，AGPL 对「向用户提供对应源码」等有额外要求，部署前请通读许可证或咨询法律顾问。
