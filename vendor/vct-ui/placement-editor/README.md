# 配置編集部品 v1

MIT Copyright (c) 2026 Umetana

固定キャンバス上の領域をドラッグ移動・ホイール倍率変更する、依存なしのブラウザー部品です。Vue、設定キー、localStorage、VCT通信に依存しません。file／HTTPで同じJSを利用できます。単体テンプレートにはこのフォルダーを同梱してください。

```js
const editor = VCTPlacementEditor.create({
  element: editingOverlay,
  getCanvasRect: () => canvas.getBoundingClientRect(),
  canvasWidth: 1920, canvasHeight: 1080,
  limits: { x: [0,1920,80], y: [0,1080,80],
    width: [160,1920,760], height: [80,1080,880], scale: [.1,3,1] },
  value: { x: 80, y: 80, width: 760, height: 880, scale: 1 },
  onChange(value, changedKeys) { /* 編集値を保持し、領域を再描画する */ }
});
editor.setEnabled(true);
```

- `getCanvasRect` は回転・傾斜のないキャンバスの表示矩形。縮小表示から論理座標へ換算します。
- `limits` は各値の最小・最大・不正値時の既定値。領域がキャンバス外へはみ出すことは許容し、切り抜きは呼出側のCSSで決めます。
- `setValue(value)` は全5項目を渡し、正規化したコピーを返します。通知は発生しません。
- `onChange(value, changedKeys)` は操作で変更された場合だけ通知します。保存は行いません。幅・高さは呼出側の数値UIで変更します。
- `setEnabled(false)`、`end()` はドラッグを終了します。`destroy()` は全リスナーを解除します。画面の破棄時に呼んでください。
- 表示要素・編集枠の生成、CSS、設定名への変換、保存・取消・通信は呼出側の責務です。操作要素には `touch-action: none` を指定してください。
- pointer capture、操作中のblur／resize／pagehide／非表示でのドラッグ終了を共通化しています。従来テンプレートのOBS向け動作を維持します。今回の部品化後のOBS実機確認は未実施です。

正本はVCT Serverの `public/V_CreatorTools/_vct_lib/ui/placement-editor/v1/`。テンプレート内のコピーは `node sync-placement-editor.js "<テンプレートフォルダー>"` で更新、`--check` で一致確認します。Electron向けは通常のpublic同期を使用します。
