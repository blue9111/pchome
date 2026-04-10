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

## 同步快照

來源清單更新後，執行：

```powershell
node .\scripts\sync-pchome-snapshot.mjs
```
