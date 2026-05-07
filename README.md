# PageSnap CLI

全页网页截图工具，专为 AI 对话场景设计。一键生成完整长截图，直接粘贴到 ChatGPT/Claude 对话框中。

## 快速开始

### 安装

**方式一：npm 全局安装**

```bash
npm install -g pagesnap-cli
```

**方式二：下载独立可执行文件**

从 [releases](https://github.com/JOSEDA6/pagesnap-cli/releases) 下载 `pagesnap.exe`，放到 PATH 目录即可。

### 基本用法

```bash
# 截取完整页面
pagesnap https://example.com

# 截取并复制到剪贴板
pagesnap https://example.com --copy

# 指定输出目录和文件名
pagesnap https://example.com -o screenshots -n my-capture

# 检测页面导航链接，自动截取每个链接的页面
pagesnap https://example.com --links

# 自定义视口和延迟
pagesnap https://example.com --width 1920 --height 1080 --delay 500
```

## 命令行选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `<url>` | 要截取的网页 URL（必需） | - |
| `-o, --output <dir>` | 输出目录 | 当前目录 |
| `-n, --name <filename>` | 输出文件名（不含扩展名） | 自动生成 |
| `-l, --links` | 检测导航链接，逐个截取 | false |
| `-c, --copy` | 复制到剪贴板 | false |
| `-w, --width <px>` | 视口宽度 | 1280 |
| `--height <px>` | 视口高度 | 800 |
| `-d, --delay <ms>` | 滚动延迟（懒加载等待） | 300 |
| `-f, --format <type>` | 图片格式：png/jpeg | png |
| `--no-sticky` | 保留 sticky/fixed 元素 | false |

## 使用场景

### AI 对话上下文

手机有滚动截图，电脑为什么没有？PageSnap 填补了这个空白：

1. 遇到长文章/文档 → `pagesnap URL --copy`
2. 直接 Ctrl+V 粘贴到 ChatGPT/Claude
3. AI 获得完整上下文，无需发送链接

### 作品集/文档归档

```bash
# 截取整个作品集网站
pagesnap https://your-portfolio.com --links -o portfolio-backup
```

### 编程使用（Node.js API）

```javascript
const pagesnap = require('pagesnap-cli');

// 单页截图
const { buffer } = await pagesnap.capture('https://example.com');

// 多页截图
const { links, results } = await pagesnap.captureLinks('https://example.com', {
  onProgress: ({ page, total, text }) => {
    console.log(`Capturing ${page}/${total}: ${text}`);
  }
});
```

## 技术特点

- **自动滚动拼接**：处理任意长度页面
- **懒加载支持**：等待图片/内容加载完成
- **Sticky 元素去重**：自动检测并隐藏固定头部/底部
- **导航链接检测**：智能识别真正的页面跳转链接（过滤锚点链接）
- **跨平台剪贴板**：Windows/macOS/Linux 支持

## 本地开发

```bash
git clone https://github.com/JOSEDA6/pagesnap-cli
cd pagesnap-cli
npm install
npm start -- https://example.com

# 构建 exe
npm run build:exe
```

## 构建 exe

使用 `pkg` 打包成独立可执行文件：

```bash
npm run build:exe
# 输出 dist/pagesnap.exe (~79MB，包含 Chromium)
```

## License

MIT
