# pchome

PChome 3C 特價看板與來源管理。

## 用法

1. 開啟看板: `index.html`
2. 批次加入來源: 先跑本機來源管理器

```powershell
node .\scripts\source-manager-server.mjs
```

然後打開:

```text
http://127.0.0.1:8787/source-manager.html
```

你可以一次貼多個 PChome 24h 連結，按「送出加入」後，系統會自動分類並寫回 `pchome-sources.json`。

## GitHub Pages 模式

如果你是在 `https://blue9111.github.io/pchome/source-manager.html` 使用這頁，先儲存一組 repo 專用的 GitHub fine-grained PAT，權限只要 `Contents: write`。

送出後會先把批次連結寫入 `source-import-queue/`，再由 GitHub Actions 自動處理，更新 `pchome-sources.json` 和快照檔。

## 同步快照

來源清單更新後，執行：

```powershell
node .\scripts\sync-pchome-snapshot.mjs
```
