# 疑義と解消内容

## 1. ライブラリの公開形式
- 疑義: UMD/CJS/ESM のどれを正式採用するか。
- 解消: まずは最小実装として ESM (`src/d3-outlook-calendar.js`) を採用。

## 2. Outlook 完全互換レイアウトの定義
- 疑義: Outlook デスクトップ/Outlook Web のどちら準拠か、完全一致レベルが必要か。
- 解消: 「Outlook 風」の操作感を優先し、以下を提供。
  - 日付グリッド
  - タイムライン表示（day/week）
  - イベント描画
  - ビュー切替 API

## 3. N 表示と前後 N 日表示の優先順位
- 疑義: `view.span` と `aroundDays` が同時指定された場合の扱い。
- 解消: `aroundDays` を優先。指定時は targetDate 前後 N 日表示。

## 4. イベントの繰り返し・タイムゾーン
- 疑義: RRULE など繰り返し予定、TZ厳密処理の要否。
- 解消: 初版は単発イベントのみサポート。`start`/`end` は Date 変換で扱う。

## 5. d3 の on("event") 互換範囲
- 疑義: 完全に d3.Selection を返す API にするか、薄いラッパにするか。
- 解消: `on(elementType, eventName, handler)` を提供し、内部で d3 selection.on に委譲。
  payload に `event/datum/node` と要素固有情報を付与。

## 6. 使用例サンプルの粒度
- 疑義: README に断片コードのみか、実行可能な HTML サンプルまで含めるか。
- 解消: 実行可能な `examples/basic.html` を追加し、README から起動方法を案内。

## 7. GitHub demo 公開方法
- 疑義: 手順説明だけでよいか、即公開可能な構成まで含めるか。
- 解消: `docs/` に公開用デモを追加し、GitHub Pages (GitHub Actions) 用 workflow も追加。

## 8. Pages未有効リポジトリでの404エラー
- 疑義: `Get Pages site failed (Not Found)` が出る場合に手動設定前提か自動有効化するか。
- 解消: workflow の `actions/configure-pages` に `enablement: true` を設定し、初回有効化を試行。

## 9. 変更時のドキュメント同期
- 疑義: 機能追加・変更時に usage / document をどの粒度で更新するか。
- 解消: 機能変更ごとに README / examples / docs の usage・document を必ず更新し、実装とサンプルの乖離を残さない。

## 10. Pull Request本文の言語
- 疑義: PRタイトル・本文の言語指定が必要か。
- 解消: Pull Request のタイトルと本文は日本語で記載する。
