# Calend3r

d3.js で Outlook 風の予定表 UI を描画する軽量ライブラリです。

## 主な機能

- 表示ビュー: `year` / `month` / `week` / `day`
- `span` による N 単位表示（N年/N月/N週/N日）
- `aroundDays` による targetDate 前後 N 日表示
- タイムライン（day/week）表示
  - 1時間ごとの横線 + `timelineStepMinutes` ごとの点線
  - イベント本体の上下ドラッグで開始/終了時刻をまとめて移動
  - イベントの上下エッジをドラッグして時間変更
  - ドラッグで日跨ぎイベントに拡張/縮小可能
- 月表示の開始曜日設定 (`monthStartsOn`)
- 年表示の週カラム表示（縦1列=1週間）
- 日付/曜日/イベントを `d3.select` / `d3.selectAll` しやすい `data-*` 属性
- 日時↔表示位置の相互変換 API

## インストール

```html
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<link rel="stylesheet" href="./src/calend3r.css" />
<script type="module">
  import { createCalend3r } from './src/calend3r.js';
</script>
```

## 最小例

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

  cal.onRender((instance) => {
    instance.selectAll('event').on('click', (event, datum) => {
      console.log('clicked event:', datum.title, event.type);
    });

    instance.selectAll('timelineGrid').on('dblclick', (event, day) => {
      console.log('new event on', day);
    });
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
  monthColumns?: number;     // month表示の1行あたり日数（既定 7）
  weekStartsOn?: number;      // 0:日曜 ~ 6:土曜
  monthStartsOn?: number;     // month表示の左端曜日 (既定 0:日曜)
  dayStartHour?: number;      // 既定 0
  dayEndHour?: number;        // 既定 24
  timelineStepMinutes?: number; // 既定 15
  showHeader?: boolean;
  locale?: Intl.DateTimeFormatOptions; // 既定: { day, month, year }
  events?: Array<{
    id?: string;
    title?: string;
    start: Date | string;
    end: Date | string;
    [key: string]: unknown;
  }>;
}
```

### 主要 option の補足

- `weekStartsOn`: week表示や年表示の週境界に使用
- `monthStartsOn`: month表示の左端曜日（既定は日曜始まり）
- `timelineStepMinutes`: タイムラインの縦グリッド粒度、およびドラッグ時のスナップ単位

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
- `select(target)`
- `selectAll(target)`
- `onRender(handler)`
- `offRender(handler)`
- `dateToViewPosition(date)`  // 日時 -> 現在ビュー上の位置情報
- `viewPositionToDate(position)` // 現在ビュー上の位置情報 -> 日時

`target` は `calendar | dateGrid | timelineGrid | event` を渡すと `data-cal-kind` ベースのセレクタに解決されます。通常の CSS セレクタ文字列も使用できます。

`instance.selectAll('event')` はこのライブラリ独自のショートハンドです。内部的には `[data-cal-kind='event']` に変換されます（`.event` の誤記ではありません）。

`render()` のたびに DOM は作り直されるため、イベントやプラグインのバインドは `onRender` で再適用してください。

### `dateToViewPosition(date)`

現在のビュー上で、指定日時がどの位置にあたるかを返します。

- timeline(day/week): `dayIndex`, `minuteOfDay`, `yRatio` を返す
- date/year grid: `dayIndex`, `date` を返す（時刻は意味を持たない）

```js
const pos = cal.dateToViewPosition('2026-04-10T10:30:00');
// 例 (week): { viewType: 'week', dayIndex: 0, minuteOfDay: 630, yRatio: 0.4375, ... }
```

> 補足: 返り値には `dayIndex` などの論理位置に加えて、描画済みであれば `x/y`（カレンダー相対）と `clientX/clientY`（画面座標）も含まれます。

### `viewPositionToDate(position)`

現在のビュー上の位置情報から日時に変換します。

- timeline(day/week): `dayIndex` + `minuteOfDay`（または `yRatio`）で日時化
- date/year grid: `dayIndex` の日付（00:00）を返す

```js
const dt = cal.viewPositionToDate({ dayIndex: 0, minuteOfDay: 10 * 60 + 30 });
const dt2 = cal.viewPositionToDate({ x: 220, y: 140 }); // カレンダー左上基準の相対座標
```

> 補足: timeline(day/week) では `dayIndex` と `minuteOfDay`（または `yRatio`）に加えて、  
> `x/y`（カレンダー相対）または `clientX/clientY`（画面座標）からも日時へ変換できます。

```js
cal.onRender((instance) => {
  instance.select('calendar').on('click', (event) => {
    const dt = instance.viewPositionToDate({
      clientX: event.clientX,
      clientY: event.clientY
    });
    console.log('clicked datetime:', dt); // timeline なら時刻まで、month/year なら日付(00:00)
  });
});
```

### 特定時刻に横線を引く

timeline では `dateToViewPosition(date)` の `yRatio` を使って、任意時刻の横線を重ねられます。

```js
cal.onRender((instance) => {
  const pos = instance.dateToViewPosition('2026-04-10T13:30:00');
  if (!pos || !Number.isFinite(pos.yRatio)) return;
  instance.select('calendar')
    .append('div')
    .attr('class', 'custom-line')
    .style('position', 'absolute')
    .style('left', '0')
    .style('right', '0')
    .style('top', `${pos.yRatio * 100}%`)
    .style('border-top', '1px solid red');
});
```

## d3 のセレクタで日付データを使う

日グリッド/年グリッドセルには `dateGrid` クラスが付与され、datum は以下を持ちます。

```ts
{
  dateObj: Date;
  date: 'YYYY-MM-DD';
  weekday: number;   // 0..6
  isWeekend: boolean;
  isPadding: boolean;
}
```

```js
const selected = cal.selectAll('dateGrid')
  .filter(d => d.date === '2026-04-10');
```

任意の CSS セレクタも使えます。

```js
cal.selectAll('.d3oc-timeline-event').classed('is-highlight', true);
```

```js
// 例: d3-context-menu のような Selection ベースのプラグインを併用
cal.onRender((instance) => {
  instance.selectAll('event').call(d3.contextMenu(menuItems));
});
```
