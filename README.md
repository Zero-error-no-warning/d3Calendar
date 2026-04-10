# Calend3r

d3.js で Outlook 風の予定表 UI を描画する軽量ライブラリ Calend3r です。

## できること

- ターゲット日 (`targetDate`) の設定
- ビューの柔軟な切り替え
  - `year`, `month`, `week`, `day`
  - 各ビューの `span` 指定で N 表示 (`N年`, `N月`, `N週`, `N日`)
  - `aroundDays` 指定でターゲット日前後 N 日表示
- 時間グリッドの粒度 (`timelineStepMinutes`, 既定 15分)
- `events` 配列から予定を描画
- 要素別イベント登録
  - `calendar`, `dateGrid`, `timelineGrid`, `event`
  - d3 の `selection.on('click', ...)` と同様の感覚で `on(...)` を設定可能

## インストール

```html
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<link rel="stylesheet" href="./src/calend3r.css" />
<script type="module">
  import { createCalend3r } from './src/calend3r.js';
</script>
```

## 基本例

```html
<div id="calendar"></div>
<script type="module">
  import { createCalend3r } from './src/calend3r.js';

  const cal = createCalend3r('#calendar', {
    targetDate: '2026-04-10',
    view: { type: 'week', span: 1 },
    timelineStepMinutes: 15,
    events: [
      {
        id: 'ev-1',
        title: '定例MTG',
        start: '2026-04-10T10:00:00',
        end: '2026-04-10T11:00:00'
      }
    ]
  });

  cal.on('event', 'click', ({ event, datum }) => {
    console.log('clicked event:', datum.title, event.type);
  });

  cal.on('timelineGrid', 'dblclick', ({ day, slot }) => {
    console.log('new event on', day, slot);
  });
</script>
```

## API

### `createCalend3r(container, options)`
カレンダーインスタンスを生成します。

### options

```ts
{
  targetDate?: Date | string;
  view?: { type: 'year' | 'month' | 'week' | 'day'; span?: number };
  aroundDays?: number | null;
  weekStartsOn?: number;      // 0:日曜 ~ 6:土曜
  dayStartHour?: number;      // 既定 0
  dayEndHour?: number;        // 既定 24
  timelineStepMinutes?: number; // 既定 15
  showHeader?: boolean;
  events?: Array<{
    id?: string;
    title?: string;
    start: Date | string;
    end: Date | string;
    [key: string]: unknown;
  }>;
}
```

## 使用例サンプルコード

- すぐ動かせるサンプル: `examples/basic.html`
- GitHub Pages 用デモ: `docs/index.html`
- ローカルで確認する場合はリポジトリ直下で静的サーバを起動し、`examples/basic.html` を開いてください。

```bash
python -m http.server 8000
# ブラウザで http://localhost:8000/examples/basic.html
```

このサンプルには以下が含まれます。
- day/week/month/year の表示切替
- 前へ/次へによるターゲット日移動
- 前後3日表示 (`aroundDays`)
- イベントクリックとタイムラインダブルクリックのハンドラ設定

### instance methods

- `setOptions(options)`
- `setTargetDate(date)`
- `setView(type, span = 1)`
- `setEvents(events)`
- `render()`
- `on(elementType, eventName, handler)`
- `off(elementType, eventName)`
