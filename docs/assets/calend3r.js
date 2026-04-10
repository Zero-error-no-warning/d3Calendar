/**
 * Calend3r
 *
 * Requires d3-selection and d3-time-format (or full d3 bundle) loaded by user.
 */

const DEFAULT_OPTIONS = {
  targetDate: new Date(),
  view: { type: 'week', span: 1 },
  aroundDays: null,
  weekStartsOn: 1,
  dayStartHour: 0,
  dayEndHour: 24,
  timelineStepMinutes: 15,
  showHeader: true,
  events: [],
  locale: {
    weekday: 'short',
    date: 'numeric',
    month: 'short',
    year: 'numeric'
  }
};

const VIEW_TYPES = new Set(['year', 'month', 'week', 'day']);

export class Calend3r {
  constructor(container, options = {}) {
    this.container = resolveSelection(container);
    this.options = mergeOptions(DEFAULT_OPTIONS, options);
    this.listeners = {
      calendar: {},
      dateGrid: {},
      timelineGrid: {},
      event: {}
    };

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
   * on(elementType, eventName, handler)
   * elementType: 'calendar' | 'dateGrid' | 'timelineGrid' | 'event'
   */
  on(elementType, eventName, handler) {
    if (!this.listeners[elementType]) {
      throw new Error(`Unsupported elementType: ${elementType}`);
    }
    this.listeners[elementType][eventName] = handler;
    this._bindExistingNodes(elementType, eventName, handler);
    return this;
  }

  off(elementType, eventName) {
    if (this.listeners[elementType]) {
      delete this.listeners[elementType][eventName];
    }
    this.container.selectAll(`[data-cal-kind='${elementType}']`).on(eventName, null);
    return this;
  }

  render() {
    const cfg = this.options;
    const range = buildVisibleRange(cfg);

    const root = this.container
      .html('')
      .append('div')
      .attr('class', 'calend3r')
      .attr('data-cal-kind', 'calendar');

    applyListeners(root, this.listeners.calendar);

    if (cfg.showHeader) {
      root.append('div')
        .attr('class', 'd3oc-header')
        .text(formatHeaderLabel(range, cfg));
    }

    const body = root.append('div').attr('class', 'd3oc-body');

    if (needsTimeline(range, cfg)) {
      this._renderTimeline(body, range, cfg);
    } else {
      this._renderDateGrid(body, range, cfg);
    }

    return this;
  }

  _renderDateGrid(body, range, cfg) {
    const days = eachDay(range.start, range.end);
    const grid = body.append('div').attr('class', 'd3oc-date-grid');

    const dayCell = grid.selectAll('div.d3oc-day-cell')
      .data(days)
      .enter()
      .append('div')
      .attr('class', 'd3oc-day-cell')
      .attr('data-cal-kind', 'dateGrid')
      .attr('data-date', d => d.toISOString())
      .text(d => formatDateLabel(d, cfg));

    applyListeners(dayCell, this.listeners.dateGrid, d => ({ date: d }));

    const events = this._eventsInRange(range.start, addDays(range.end, 1));

    dayCell.each((day, i, nodes) => {
      const cell = d3.select(nodes[i]);
      const dayEvents = events.filter(evt => overlapsDay(evt, day));
      const wrappers = cell.selectAll('div.d3oc-event')
        .data(dayEvents)
        .enter()
        .append('div')
        .attr('class', 'd3oc-event')
        .attr('data-cal-kind', 'event')
        .text(evt => evt.title || '(untitled)');

      applyListeners(wrappers, this.listeners.event, evt => ({ event: evt, date: day }));
    });
  }

  _renderTimeline(body, range, cfg) {
    const days = eachDay(range.start, range.end);
    const times = buildTimelineSlots(cfg.dayStartHour, cfg.dayEndHour, cfg.timelineStepMinutes);

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
      .text(d => formatDateLabel(d, cfg));

    const rows = wrap.selectAll('div.d3oc-time-row')
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
        .attr('class', 'd3oc-time-cell')
        .attr('data-cal-kind', 'timelineGrid')
        .attr('data-date', day => day.toISOString())
        .attr('data-minutes', slot.minutes);

      applyListeners(cells, this.listeners.timelineGrid, day => ({ day, slot }));
    });

    const start = range.start;
    const end = addDays(range.end, 1);
    const events = this._eventsInRange(start, end);

    const eventsWrap = wrap.append('div').attr('class', 'd3oc-events-layer');

    const eventNodes = eventsWrap.selectAll('div.d3oc-event')
      .data(events)
      .enter()
      .append('div')
      .attr('class', 'd3oc-event')
      .attr('data-cal-kind', 'event')
      .style('position', 'relative')
      .text(evt => `${evt.title || '(untitled)'} (${timeHM(evt.start)}-${timeHM(evt.end)})`);

    applyListeners(eventNodes, this.listeners.event, evt => ({ event: evt }));
  }

  _eventsInRange(start, end) {
    return (this.options.events || [])
      .map(normalizeEvent)
      .filter(Boolean)
      .filter(evt => evt.end > start && evt.start < end)
      .sort((a, b) => a.start - b.start);
  }

  _bindExistingNodes(elementType, eventName, handler) {
    const sel = this.container.selectAll(`[data-cal-kind='${elementType}']`);
    if (!sel.empty()) {
      sel.on(eventName, function (ev, d) {
        handler({
          event: ev,
          datum: d,
          node: this
        });
      });
    }
  }

  _validateOptions() {
    const { view, timelineStepMinutes, dayStartHour, dayEndHour } = this.options;

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

function applyListeners(selection, listeners, payloadFactory) {
  Object.entries(listeners).forEach(([name, handler]) => {
    selection.on(name, function (ev, d) {
      const payload = payloadFactory ? payloadFactory(d) : {};
      handler({ event: ev, datum: d, node: this, ...payload });
    });
  });
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

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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
