'use strict';
const {sanitize, removeControls} = require('./parse');
const {level, isStale, configuration, worstLevel} = require('./thresholds');
const escapeMarkdown = text => removeControls(text)
  .replace(/[\\`*_[\]<>|#]/g, '\\$&').replace(/\$\(/g, '\\$(');
const labelText = text => sanitize(String(text), 120).replace(/\$\(/g, '＄(');
const safeText = text => labelText(text).replace(/[\[\]]/g, '');
const pad = value => String(value).padStart(2, '0');
const levelLabel = severity => severity === 'critical' ? ' (nghiêm trọng)' :
  severity === 'warning' ? ' (cảnh báo)' : '';
const levelIcon = severity => severity === 'critical' ? '$(error) ' :
  severity === 'warning' ? '$(warning) ' : '';
function resetTime(value) {
  if (value == null) return 'không rõ';
  const date = new Date(value);
  return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ' ' +
    ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][date.getDay()] + ' ' +
    pad(date.getDate()) + '/' + pad(date.getMonth() + 1);
}
function countdown(reset, now) {
  if (reset == null) return 'không rõ';
  const milliseconds = reset - now;
  const minutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return milliseconds <= 0 ? 'đã đến giờ reset' : days ? days + ' ngày ' + hours % 24 + ' giờ' :
    hours ? hours + ' giờ ' + minutes % 60 + ' phút' : minutes ? minutes + ' phút' : 'dưới 1 phút';
}
const ago = (time, now) => now - time < 60000 ? 'vừa xong' :
  Math.floor(Math.max(0, now - time) / 60000) + ' phút trước';
function display(state, now, config = {}) {
  const values = configuration(config);
  const stale = isStale(state, now, values);
  const rows = (state.buckets || []).map(bucket => {
    const severity = level(bucket, now, values);
    return {
      ...bucket, groupLabel: labelText(bucket.groupLabel), windowLabel: labelText(bucket.windowLabel),
      severity, value: severity === 'unknown' ? '?%' : bucket.percent + '%',
      reset: resetTime(bucket.resetAt), remaining: countdown(bucket.resetAt, now)
    };
  });
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.groupName)) groups.set(row.groupName, []);
    groups.get(row.groupName).push(row);
  }
  const selected = [...groups.values()].map(items => {
    const valid = items.filter(item => item.severity !== 'unknown');
    return (valid.length ? valid : items).reduce((a, b) => b.percent < a.percent ? b : a);
  });
  const severity = worstLevel(selected.map(bucket => bucket.severity));
  let text = selected.map(row => row.groupLabel + ' ' + row.value +
    (row.windowKey === 'weekly' ? ' tuần' : '')).join(' | ');
  if (!text) {
    text = state.runningSince != null ? 'Quota agy' :
      state.error?.type === 'not-found' ? 'Quota agy: không tìm thấy agy' : 'Quota agy: lỗi';
  }
  text = (stale && rows.length ? '$(history) ' : !rows.length && state.runningSince == null ? '$(error) ' : '') + text;
  if (state.manualRefresh || (!rows.length && state.runningSince != null)) text = '$(sync~spin) ' + text;
  const loading = !rows.length && state.runningSince != null && !state.error;
  const error = sanitize(state.error?.message || 'Không đọc được quota.', 200);
  let tooltip = '**Quota Antigravity**\n\n';
  if (stale && rows.length) {
    tooltip += '$(history) **Dữ liệu cũ.** ' + (state.error ? 'Lần làm mới' +
      (state.lastAttemptAt == null ? '' : ' lúc ' + resetTime(state.lastAttemptAt).slice(0, 5)) +
      ' thất bại: ' + escapeMarkdown(error) : 'Đã quá thời hạn cập nhật.') + '\n\n';
  }
  if (!rows.length) {
    tooltip += loading ? 'Đang đọc quota.' : '$(error) ' + escapeMarkdown(error) +
      '\n\nChạy lệnh "Quota agy: Mở nhật ký" để xem chi tiết.';
  } else {
    tooltip += '| Nhóm | Giới hạn | Còn lại | Reset lúc | Còn |\n|---|---|---:|---|---|\n';
    for (const row of rows) {
      const value = escapeMarkdown(row.value + levelLabel(row.severity));
      tooltip += '| ' + [escapeMarkdown(row.groupLabel), escapeMarkdown(row.windowLabel),
        row.severity === 'critical' ? '**' + value + '**' : value,
        escapeMarkdown(row.reset), escapeMarkdown(row.remaining)].join(' | ') + ' |\n';
    }
    tooltip += '\nCập nhật lúc ' + resetTime(state.lastSuccessAt).slice(0, 5) +
      ' (' + ago(state.lastSuccessAt, now) + '). Ngưỡng: cảnh báo <= ' + values.warningThreshold +
      '%, nghiêm trọng <= ' + values.criticalThreshold + '%.\n\nBấm để xem chi tiết.';
  }
  const items = [];
  for (const group of groups.values()) {
    items.push({label: group[0].groupLabel, separator: true});
    for (const row of group) {
      items.push({
        label: levelIcon(row.severity) + row.windowLabel + ': ' + row.value + levelLabel(row.severity),
        description: 'reset ' + row.reset + ', còn ' + row.remaining
      });
    }
  }
  if (!rows.length && !loading) items.push({label: '$(error) ' + safeText(error)});
  items.push({label: '', separator: true}, {label: '$(refresh) Làm mới ngay', action: 'refresh'},
    {label: '$(output) Mở nhật ký', action: 'log'});
  return {
    text, tooltip, items, severity, stale,
    title: 'Quota Antigravity - cập nhật ' + (state.lastSuccessAt == null ? 'chưa có' :
      resetTime(state.lastSuccessAt).slice(0, 5)) + (stale ? ' (dữ liệu cũ)' : '')
  };
}
function notification(result) {
  return 'Quota Antigravity: ' + result.events.map(({bucket, recovered}) =>
    safeText(bucket.groupLabel) + ' (' + safeText(bucket.windowLabel) + ') ' +
    (recovered ? 'đã hồi phục, còn ' + bucket.percent + '%' :
      'còn ' + bucket.percent + '%, reset ' + resetTime(bucket.resetAt))).join('; ') + '.';
}
module.exports = {escapeMarkdown, safeText, resetTime, countdown, ago, display, notification, sanitize};
