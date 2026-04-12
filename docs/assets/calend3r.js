/**
 * Calend3r
 *
 * Requires d3-selection and d3-time-format (or full d3 bundle) loaded by user.
 */

const DEFAULT_OPTIONS = {
  targetDate: new Date(),
  view: { type: 'week', span: 1 },
  aroundDays: null,
  monthColumns: 7,
  weekStartsOn: 1,
  monthStartsOn: 0,
  dayStartHour: 0,
  dayEndHour: 24,
  timelineStepMinutes: 15,
  showHeader: true,
  events: [],
  locale: {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }
};

const VIEW_TYPES = new Set(['year', 'month', 'week', 'day']);

export class Calend3r {
  constructor(container, options = {}) {
    this.container = resolveSelection(container);
    this.options = mergeOptions(DEFAULT_OPTIONS, options);
    this.renderListeners = new Set();

    this._validateOptions();
    this.render();
  }

  setOptions(nextOptions = {}) {
    this.options = mergeOptions(this.options, nextOptions);
    this._validateOptions();
    this.render();
    return this;
  }

  setTargetDate(date) {
    this.options.targetDate = toDate(date);
    this.render();
    return this;
  }

  setView(viewType, span = 1) {
    this.options.view = normalizeView({ type: viewType, span });
    this._validateOptions();
    this.render();
    return this;
  }

  setEvents(events) {
    this.options.events = Array.isArray(events) ? events.map(normalizeEvent).filter(Boolean) : [];
    this.render();
    return this;
  }

  /**
   * selectAll(target)
   * target:
   * - kind string: 'calendar' | 'dateGrid' | 'timelineGrid' | 'event'
   * - any CSS selector string
   */
  selectAll(target) {
    return this.container.selectAll(resolveElementSelector(target));
  }

  select(target) {
    return this.container.select(resolveElementSelector(target));
  }

  onRender(handler) {
    if (typeof handler !== 'function') {
      throw new Error('handler must be a function');
    }
    this.renderListeners.add(handler);
    handler(this);
    return this;
  }

  offRender(handler) {
    this.renderListeners.delete(handler);
    return this;
  }

  render() {
    const cfg = this.options;
    const range = buildVisibleRange(cfg);
    this._lastRenderMeta = { cfg, range, isTimeline: needsTimeline(range, cfg) };

    const root = this.container
      .html('')
      .append('div')
      .attr('class', 'calend3r')
      .attr('data-cal-kind', 'calendar');

    if (cfg.showHeader) {
      root.append('div')
        .attr('class', 'd3oc-header')
        .text(formatHeaderLabel(range, cfg));
    }

    const body = root.append('div').attr('class', 'd3oc-body');

    if (this._lastRenderMeta.isTimeline) {
      this._renderTimeline(body, range, cfg);
    } else if (cfg.view.type === 'year') {
      this._renderYearGrid(body, range, cfg);
    } else {
      this._renderDateGrid(body, range, cfg);
    }

    this.renderListeners.forEach((handler) => handler(this));

    return this;
  }

  dateToViewPosition(dateLike) {
    const meta = this._lastRenderMeta || { cfg: this.options, range: buildVisibleRange(this.options), isTimeline: false };
    const date = toDate(dateLike);
    if (Number.isNaN(date.getTime())) return null;
    const dayIndex = diffDays(startOfDay(date), startOfDay(meta.range.start));
    const totalDays = diffDays(startOfDay(meta.range.end), startOfDay(meta.range.start)) + 1;
    if (dayIndex < 0 || dayIndex >= totalDays) return null;
    if (meta.isTimeline) {
      const visibleMinutes = (meta.cfg.dayEndHour - meta.cfg.dayStartHour) * 60;
      const minuteOfDay = date.getHours() * 60 + date.getMinutes();
      const result = {
        viewType: meta.cfg.view.type,
        dayIndex,
        minuteOfDay,
        yRatio: (minuteOfDay - meta.cfg.dayStartHour * 60) / visibleMinutes,
        note: 'timeline view: x position is not used'
      };
      const coords = this._timelinePointToCoordinates(dayIndex, minuteOfDay, visibleMinutes, meta);
      return coords ? { ...result, ...coords } : result;
    }
    const result = {
      viewType: meta.cfg.view.type,
      dayIndex,
      date: toDateKey(date),
      note: 'date/year grid view: time fields are ignored'
    };
    const coords = this._dateCellToCoordinates(result.date);
    return coords ? { ...result, ...coords } : result;
  }

  viewPositionToDate(position = {}) {
    const meta = this._lastRenderMeta || { cfg: this.options, range: buildVisibleRange(this.options), isTimeline: false };
    const dayIndex = Number(position.dayIndex);
    if (Number.isFinite(dayIndex)) {
      const day = addDays(startOfDay(meta.range.start), Math.trunc(dayIndex));
      if (meta.isTimeline) {
        const visibleMinutes = (meta.cfg.dayEndHour - meta.cfg.dayStartHour) * 60;
        let minuteOfDay = Number(position.minuteOfDay);
        if (!Number.isFinite(minuteOfDay) && Number.isFinite(position.yRatio)) {
          minuteOfDay = meta.cfg.dayStartHour * 60 + (Number(position.yRatio) * visibleMinutes);
        }
        if (!Number.isFinite(minuteOfDay)) minuteOfDay = meta.cfg.dayStartHour * 60;
        return timelinePositionToDate(day, minuteOfDay, meta.cfg.timelineStepMinutes);
      }
      return day;
    }

    const clientPos = this._resolveClientPosition(position);
    if (!clientPos) return null;

    if (meta.isTimeline) {
      const timelinePos = this._resolveTimelinePositionFromClient(clientPos, meta);
      if (!timelinePos) return null;
      return timelinePositionToDate(timelinePos.day, timelinePos.minuteOfDay, meta.cfg.timelineStepMinutes);
    }

    const dateCell = this._resolveDateCellFromClient(clientPos);
    if (!dateCell) return null;
    return startOfDay(dateCell);
  }

  _resolveClientPosition(position = {}) {
    const clientX = Number(position.clientX);
    const clientY = Number(position.clientY);
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      return { clientX, clientY };
    }

    const x = Number(position.x);
    const y = Number(position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const root = this.select('calendar').node();
    if (!root || !root.getBoundingClientRect) return null;
    const rect = root.getBoundingClientRect();
    return {
      clientX: rect.left + x,
      clientY: rect.top + y
    };
  }

  _timelinePointToCoordinates(dayIndex, minuteOfDay, visibleMinutes, meta) {
    const canvasNode = this.container.select('.d3oc-timeline-canvas').node();
    const firstCell = this.container.select('.d3oc-time-cell').node();
    const root = this.select('calendar').node();
    if (!canvasNode || !firstCell || !root) return null;
    const canvasRect = canvasNode.getBoundingClientRect();
    const firstCellRect = firstCell.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const days = Math.max(diffDays(startOfDay(meta.range.end), startOfDay(meta.range.start)) + 1, 1);
    const gridLeft = firstCellRect.left;
    const gridWidth = Math.max(canvasRect.right - gridLeft, 1);
    const xRatio = (dayIndex + 0.5) / days;
    const yRatio = (minuteOfDay - meta.cfg.dayStartHour * 60) / visibleMinutes;
    const clampedY = Math.min(Math.max(yRatio, 0), 1);
    const clientX = gridLeft + (xRatio * gridWidth);
    const clientY = canvasRect.top + (clampedY * canvasRect.height);
    return {
      x: clientX - rootRect.left,
      y: clientY - rootRect.top,
      clientX,
      clientY
    };
  }

  _dateCellToCoordinates(dateKey) {
    const cell = this.container.select(`[data-cal-kind='dateGrid'][data-date-key='${dateKey}']`).node();
    const root = this.select('calendar').node();
    if (!cell || !root) return null;
    const rect = cell.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const clientX = rect.left + (rect.width / 2);
    const clientY = rect.top + (rect.height / 2);
    return {
      x: clientX - rootRect.left,
      y: clientY - rootRect.top,
      clientX,
      clientY
    };
  }

  _resolveTimelinePositionFromClient(clientPos, meta) {
    const canvasNode = this.container.select('.d3oc-timeline-canvas').node();
    const firstCell = this.container.select('.d3oc-time-cell').node();
    if (!canvasNode || !firstCell) return null;
    const canvasRect = canvasNode.getBoundingClientRect();
    const firstCellRect = firstCell.getBoundingClientRect();
    if (!canvasRect.height) return null;
    const gridLeft = firstCellRect.left;
    const gridRight = canvasRect.right;
    if (clientPos.clientX < gridLeft || clientPos.clientX > gridRight || clientPos.clientY < canvasRect.top || clientPos.clientY > canvasRect.bottom) {
      return null;
    }
    const days = Math.max(diffDays(startOfDay(meta.range.end), startOfDay(meta.range.start)) + 1, 1);
    const xRatio = Math.min(Math.max((clientPos.clientX - gridLeft) / Math.max(gridRight - gridLeft, 1), 0), 0.999999);
    const dayIndex = Math.floor(xRatio * days);
    const visibleMinutes = (meta.cfg.dayEndHour - meta.cfg.dayStartHour) * 60;
    const yRatio = Math.min(Math.max((clientPos.clientY - canvasRect.top) / canvasRect.height, 0), 1);
    const minuteOfDay = meta.cfg.dayStartHour * 60 + (yRatio * visibleMinutes);
    const day = addDays(startOfDay(meta.range.start), dayIndex);
    return { day, minuteOfDay };
  }

  _resolveDateCellFromClient(clientPos) {
    if (typeof document === 'undefined' || !document.elementFromPoint) return null;
    const node = document.elementFromPoint(clientPos.clientX, clientPos.clientY);
    if (!node || !node.closest) return null;
    const cell = node.closest("[data-cal-kind='dateGrid']");
    if (!cell || !cell.dataset) return null;
    const key = cell.dataset.dateKey || cell.dataset.date;
    if (!key) return null;
    const parsed = toDate(`${key}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  _renderDateGrid(body, range, cfg) {
    const days = buildDateGridCells(range, cfg);
    const grid = body.append('div')
      .attr('class', `d3oc-date-grid${cfg.view.type === 'month' ? ' d3oc-date-grid--month' : ''}`)
      .style('--d3oc-month-columns', String(cfg.monthColumns));

    const dayCell = grid.selectAll('div.d3oc-day-cell')
      .data(days)
      .enter()
      .append('div')
      .attr('class', d => `d3oc-day-cell dateGrid${d.isWeekend ? ' d3oc-weekend' : ''}${d.isPadding ? ' d3oc-day-cell--padding' : ''}`)
      .attr('data-cal-kind', 'dateGrid')
      .attr('data-date', d => d.date)
      .attr('data-date-key', d => d.date)
      .attr('data-weekday', d => String(d.weekday))
      .text(d => (d.dateObj ? formatDateLabel(d.dateObj, cfg) : ''));

    const events = this._eventsInRange(range.start, addDays(range.end, 1));

    dayCell.each((day, i, nodes) => {
      if (day.isPadding || !day.dateObj) return;
      const cell = d3.select(nodes[i]);
      const dayEvents = events.filter(evt => overlapsDay(evt, day.dateObj));
      const wrappers = cell.selectAll('div.d3oc-event')
        .data(dayEvents)
        .enter()
        .append('div')
        .attr('class', 'd3oc-event')
        .attr('data-cal-kind', 'event')
        .attr('data-date-key', day.date)
        .text(evt => evt.title || '(untitled)');

    });
  }

  _renderYearGrid(body, range, cfg) {
    const weekStart = startOfWeek(range.start, cfg.weekStartsOn);
    const weekEnd = endOfWeek(range.end, cfg.weekStartsOn);
    const days = eachDay(weekStart, weekEnd);
    const weeks = Math.ceil(days.length / 7);
    const cellsData = days.map(d => toDayDatum(d, d < range.start || d > range.end));

    const grid = body.append('div')
      .attr('class', 'd3oc-year-grid')
      .style('--d3oc-year-weeks', String(weeks));

    const dayCell = grid.selectAll('div.d3oc-year-day')
      .data(cellsData)
      .enter()
      .append('div')
      .attr('class', d => `d3oc-year-day dateGrid${d.isWeekend ? ' d3oc-weekend' : ''}${d.isPadding ? ' d3oc-year-day--padding' : ''}`)
      .attr('data-cal-kind', 'dateGrid')
      .attr('data-date', d => d.date)
      .attr('data-date-key', d => d.date)
      .attr('data-weekday', d => String(d.weekday));

  }

  _renderTimeline(body, range, cfg) {
    const days = eachDay(range.start, range.end);
    const times = buildTimelineSlots(cfg.dayStartHour, cfg.dayEndHour, cfg.timelineStepMinutes);
    const visibleMinutes = (cfg.dayEndHour - cfg.dayStartHour) * 60;

    const wrap = body.append('div')
      .attr('class', 'd3oc-timeline-wrap')
      .style('--d3oc-day-cols', String(days.length));
    const header = wrap.append('div').attr('class', 'd3oc-timeline-header');

    header.append('div').attr('class', 'd3oc-time-col-label').text('Time');
    header.selectAll('div.d3oc-day-col-label')
      .data(days)
      .enter()
      .append('div')
      .attr('class', 'd3oc-day-col-label')
      .attr('data-date', d => toDateKey(d))
      .attr('data-date-key', d => toDateKey(d))
      .attr('data-weekday', d => String(d.getDay()))
      .classed('d3oc-weekend', d => d.getDay() === 0 || d.getDay() === 6)
      .text(d => formatDateLabel(d, cfg));

    const canvas = wrap.append('div').attr('class', 'd3oc-timeline-canvas');
    const linesLayer = canvas.append('div').attr('class', 'd3oc-lines-layer');

    const rows = canvas.selectAll('div.d3oc-time-row')
      .data(times)
      .enter()
      .append('div')
      .attr('class', 'd3oc-time-row');

    rows.append('div')
      .attr('class', 'd3oc-time-label')
      .text(slot => slot.label);

    rows.each((slot, rowIndex, rowNodes) => {
      const row = d3.select(rowNodes[rowIndex]);
      const cells = row.selectAll('div.d3oc-time-cell')
        .data(days)
        .enter()
        .append('div')
        .attr('class', 'd3oc-time-cell timelineGrid')
        .attr('data-cal-kind', 'timelineGrid')
        .attr('data-date', day => toDateKey(day))
        .attr('data-date-key', day => toDateKey(day))
        .attr('data-weekday', day => String(day.getDay()))
        .classed('d3oc-weekend', day => day.getDay() === 0 || day.getDay() === 6)
        .attr('data-minutes', slot.minutes);

    });

    const start = range.start;
    const end = addDays(range.end, 1);
    const events = this._eventsInRange(start, end);

    const segments = buildTimelineEventSegments(events, days, cfg);
    const dayCols = Math.max(days.length, 1);
    const dayWidthPct = 100 / dayCols;
    const step = Math.max(cfg.timelineStepMinutes, 1);

    const lineMinutes = [];
    for (let m = step; m < visibleMinutes; m += step) {
      lineMinutes.push(m);
    }
    linesLayer.selectAll('div.d3oc-grid-line')
      .data(lineMinutes)
      .enter()
      .append('div')
      .attr('class', m => `d3oc-grid-line ${isHourLine(m, cfg.dayStartHour) ? 'd3oc-grid-line--hour' : 'd3oc-grid-line--step'}`)
      .attr('data-cal-kind', 'timelineGrid')
      .attr('data-minute-offset', m => m)
      .style('top', m => `${(m / visibleMinutes) * 100}%`);

    const eventsLayer = canvas.append('div').attr('class', 'd3oc-events-layer');
    const canvasNode = canvas.node();
    const eventNodes = eventsLayer.selectAll('div.d3oc-timeline-event')
      .data(segments)
      .enter()
      .append('div')
      .attr('class', 'd3oc-event d3oc-timeline-event')
      .attr('data-cal-kind', 'event')
      .attr('data-date-key', d => toDateKey(days[d.dayIndex]))
      .attr('data-weekday', d => String(days[d.dayIndex].getDay()))
      .style('left', d => `calc(${(d.dayIndex * dayWidthPct).toFixed(6)}% + 2px)`)
      .style('width', `calc(${dayWidthPct.toFixed(6)}% - 4px)`)
      .style('top', d => `${(d.startMinute / visibleMinutes) * 100}%`)
      .style('height', d => `${Math.max(((d.endMinute - d.startMinute) / visibleMinutes) * 100, 2)}%`)
      .text(d => `${d.event.title || '(untitled)'} (${timeHM(d.event.start)}-${timeHM(d.event.end)})`)
      .datum(d => d.event);

    eventNodes.append('div')
      .attr('class', 'd3oc-resize-handle d3oc-resize-handle--start')
      .attr('data-edge', 'start');
    eventNodes.append('div')
      .attr('class', 'd3oc-resize-handle d3oc-resize-handle--end')
      .attr('data-edge', 'end');

    eventNodes.selectAll('.d3oc-resize-handle').on('pointerdown', (ev, evt) => {
      ev.preventDefault();
      ev.stopPropagation();
      const edge = d3.select(ev.currentTarget).attr('data-edge');
      const segment = segments.find(seg => seg.event.id === evt.id);
      if (!segment || !canvasNode) return;
      this._startEventResize({
        pointerEvent: ev,
        edge,
        eventData: evt,
        segment,
        day: days[segment.dayIndex],
        canvasNode,
        cfg,
        visibleMinutes
      });
    });

    eventNodes.on('pointerdown', (ev, evt) => {
      if (ev.target && ev.target.closest && ev.target.closest('.d3oc-resize-handle')) return;
      ev.preventDefault();
      const segment = segments.find(seg => seg.event.id === evt.id);
      if (!segment || !canvasNode) return;
      this._startEventDrag({
        pointerEvent: ev,
        eventData: evt,
        day: days[segment.dayIndex],
        canvasNode,
        cfg,
        visibleMinutes
      });
    });

  }

  _startEventResize({ pointerEvent, edge, eventData, segment, day, canvasNode, cfg, visibleMinutes }) {
    const minDurationMs = Math.max(cfg.timelineStepMinutes, 1) * 60000;
    const onMove = (moveEv) => {
      moveEv.preventDefault();
      const nextDate = pointerToTimelineDate(day, moveEv.clientY, canvasNode, cfg, visibleMinutes);
      if (!nextDate) return;
      const updates = {};
      if (edge === 'start') {
        const limited = new Date(Math.min(nextDate.getTime(), eventData.end.getTime() - minDurationMs));
        updates.start = limited;
      } else {
        const limited = new Date(Math.max(nextDate.getTime(), eventData.start.getTime() + minDurationMs));
        updates.end = limited;
      }
      this._patchEvent(eventData.id, updates);
      this.render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  _startEventDrag({ pointerEvent, eventData, day, canvasNode, cfg, visibleMinutes }) {
    const durationMs = Math.max(eventData.end.getTime() - eventData.start.getTime(), 0);
    const onMove = (moveEv) => {
      moveEv.preventDefault();
      const pointerDate = pointerToTimelineDate(day, moveEv.clientY, canvasNode, cfg, visibleMinutes);
      if (!pointerDate) return;
      const clampedStart = clampEventStartInDay(pointerDate, day, cfg, durationMs);
      const updates = {
        start: clampedStart,
        end: new Date(clampedStart.getTime() + durationMs)
      };
      this._patchEvent(eventData.id, updates);
      this.render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  _patchEvent(eventId, patch) {
    this.options.events = (this.options.events || []).map(evt => {
      if (evt.id !== eventId) return evt;
      return normalizeEvent({ ...evt, ...patch });
    }).filter(Boolean);
  }

  _eventsInRange(start, end) {
    return (this.options.events || [])
      .map(normalizeEvent)
      .filter(Boolean)
      .filter(evt => evt.end > start && evt.start < end)
      .sort((a, b) => a.start - b.start);
  }

  _validateOptions() {
    const { view, timelineStepMinutes, dayStartHour, dayEndHour, monthColumns, monthStartsOn } = this.options;

    if (!VIEW_TYPES.has(view.type)) {
      throw new Error(`Unsupported view.type: ${view.type}`);
    }
    if (!Number.isInteger(view.span) || view.span <= 0) {
      throw new Error('view.span must be positive integer');
    }
    if (!Number.isInteger(timelineStepMinutes) || timelineStepMinutes <= 0 || timelineStepMinutes > 180) {
      throw new Error('timelineStepMinutes must be positive integer (<= 180)');
    }
    if (dayStartHour < 0 || dayStartHour >= 24 || dayEndHour <= 0 || dayEndHour > 24 || dayStartHour >= dayEndHour) {
      throw new Error('dayStartHour/dayEndHour range is invalid');
    }
    if (!Number.isInteger(monthColumns) || monthColumns <= 0) {
      throw new Error('monthColumns must be positive integer');
    }
    if (!Number.isInteger(monthStartsOn) || monthStartsOn < 0 || monthStartsOn > 6) {
      throw new Error('monthStartsOn must be integer 0..6');
    }
  }
}

export function createCalend3r(container, options = {}) {
  return new Calend3r(container, options);
}

function resolveSelection(container) {
  if (!container) {
    throw new Error('container is required');
  }
  if (typeof container === 'string') {
    return d3.select(container);
  }
  if (container.selectAll) {
    return container;
  }
  return d3.select(container);
}

function resolveElementSelector(target) {
  if (typeof target !== 'string' || !target) {
    throw new Error('target must be a non-empty string');
  }
  if (target === 'calendar' || target === 'dateGrid' || target === 'timelineGrid' || target === 'event') {
    return `[data-cal-kind='${target}']`;
  }
  return target;
}

function mergeOptions(base, patch) {
  const merged = {
    ...base,
    ...patch,
    view: normalizeView(patch?.view || base.view)
  };
  merged.targetDate = toDate(merged.targetDate);
  merged.events = (merged.events || []).map(normalizeEvent).filter(Boolean);
  return merged;
}

function normalizeView(view) {
  if (typeof view === 'string') {
    return { type: view, span: 1 };
  }
  return {
    type: view?.type || 'week',
    span: view?.span || 1
  };
}

function buildVisibleRange(cfg) {
  const target = startOfDay(cfg.targetDate);

  if (Number.isInteger(cfg.aroundDays) && cfg.aroundDays >= 0) {
    return {
      start: addDays(target, -cfg.aroundDays),
      end: addDays(target, cfg.aroundDays)
    };
  }

  const { type, span } = cfg.view;

  switch (type) {
    case 'day':
      return { start: target, end: addDays(target, span - 1) };
    case 'week': {
      const start = startOfWeek(target, cfg.weekStartsOn);
      return { start, end: addDays(start, 7 * span - 1) };
    }
    case 'month': {
      const monthStart = new Date(target.getFullYear(), target.getMonth(), 1);
      const endMonth = addMonths(monthStart, span);
      return { start: monthStart, end: addDays(endMonth, -1) };
    }
    case 'year': {
      const yearStart = new Date(target.getFullYear(), 0, 1);
      const endYear = new Date(target.getFullYear() + span, 0, 1);
      return { start: yearStart, end: addDays(endYear, -1) };
    }
    default:
      return { start: target, end: target };
  }
}

function needsTimeline(range, cfg) {
  const days = Math.round((range.end - range.start) / 86400000) + 1;
  return cfg.view.type === 'day' || (cfg.view.type === 'week' && days <= 7);
}

function buildDateGridCells(range, cfg) {
  if (cfg.view.type !== 'month') {
    return eachDay(range.start, range.end).map(d => toDayDatum(d));
  }
  const gridStart = startOfWeek(range.start, cfg.monthStartsOn);
  const gridEnd = endOfWeek(range.end, cfg.monthStartsOn);
  return eachDay(gridStart, gridEnd).map(d => toDayDatum(d, d < range.start || d > range.end));
}

function toDayDatum(date, isPadding = false) {
  return {
    dateObj: date,
    date: toDateKey(date),
    weekday: date.getDay(),
    isWeekend: date.getDay() === 0 || date.getDay() === 6,
    isPadding
  };
}

function normalizeEvent(event) {
  if (!event || !event.start || !event.end) {
    return null;
  }
  const start = toDate(event.start);
  const end = toDate(event.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return null;
  }
  return {
    ...event,
    start,
    end,
    id: event.id || `${start.toISOString()}_${end.toISOString()}_${event.title || ''}`
  };
}

function eachDay(start, end) {
  const result = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    result.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function buildTimelineSlots(dayStartHour, dayEndHour, step) {
  const total = (dayEndHour - dayStartHour) * 60;
  const slots = [];
  for (let m = 0; m < total; m += step) {
    const absolute = dayStartHour * 60 + m;
    slots.push({
      minutes: absolute,
      label: `${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
    });
  }
  return slots;
}

function overlapsDay(evt, day) {
  const start = startOfDay(day);
  const end = addDays(start, 1);
  return evt.end > start && evt.start < end;
}

function formatHeaderLabel(range, cfg) {
  return `${formatDateLabel(range.start, cfg)} - ${formatDateLabel(range.end, cfg)}`;
}

function formatDateLabel(date, cfg) {
  return date.toLocaleDateString(undefined, cfg.locale);
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d, weekStartsOn) {
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  return addDays(startOfDay(d), -diff);
}

function endOfWeek(d, weekStartsOn) {
  return addDays(startOfWeek(d, weekStartsOn), 6);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function diffDays(a, b) {
  return Math.floor((startOfDay(a) - startOfDay(b)) / 86400000);
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function toDate(v) {
  if (v instanceof Date) return new Date(v);
  return new Date(v);
}

function timeHM(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isHourLine(offsetMinute, dayStartHour) {
  return ((offsetMinute + dayStartHour * 60) % 60) === 0;
}

function pointerToTimelineDate(day, clientY, canvasNode, cfg, visibleMinutes) {
  const rect = canvasNode.getBoundingClientRect();
  if (!rect.height) return null;
  const relativeY = clientY - rect.top;
  const absoluteMinutes = cfg.dayStartHour * 60 + (relativeY / rect.height) * visibleMinutes;
  return timelinePositionToDate(day, absoluteMinutes, cfg.timelineStepMinutes);
}

function timelinePositionToDate(day, minuteOfDay, timelineStepMinutes) {
  const step = Math.max(Number(timelineStepMinutes) || 1, 1);
  const snapped = Math.round(minuteOfDay / step) * step;
  const dayDelta = Math.floor(snapped / 1440);
  const normalizedMinute = ((snapped % 1440) + 1440) % 1440;
  const result = addDays(startOfDay(day), dayDelta);
  result.setHours(Math.floor(normalizedMinute / 60), normalizedMinute % 60, 0, 0);
  return result;
}

function clampEventStartInDay(startCandidate, day, cfg, durationMs) {
  const dayStart = startOfDay(day);
  const minStart = new Date(dayStart);
  minStart.setHours(cfg.dayStartHour, 0, 0, 0);
  const maxStart = new Date(dayStart);
  maxStart.setHours(cfg.dayEndHour, 0, 0, 0);
  maxStart.setMilliseconds(maxStart.getMilliseconds() - durationMs);
  if (maxStart < minStart) return minStart;
  const nextStart = new Date(startCandidate);
  if (nextStart < minStart) return minStart;
  if (nextStart > maxStart) return maxStart;
  return nextStart;
}

function buildTimelineEventSegments(events, days, cfg) {
  const segments = [];
  const visibleStart = cfg.dayStartHour * 60;
  const visibleEnd = cfg.dayEndHour * 60;

  days.forEach((day, dayIndex) => {
    const dayStart = new Date(day);
    dayStart.setHours(cfg.dayStartHour, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(cfg.dayEndHour, 0, 0, 0);

    events.forEach(event => {
      const segStart = new Date(Math.max(event.start.getTime(), dayStart.getTime()));
      const segEnd = new Date(Math.min(event.end.getTime(), dayEnd.getTime()));
      if (segEnd <= segStart) return;

      const startMinute = Math.max(visibleStart, segStart.getHours() * 60 + segStart.getMinutes()) - visibleStart;
      const endMinute = Math.min(visibleEnd, segEnd.getHours() * 60 + segEnd.getMinutes()) - visibleStart;
      segments.push({ event, dayIndex, startMinute, endMinute });
    });
  });

  return segments;
}
