'use strict';
process.env.TZ = 'Asia/Ho_Chi_Minh';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const sourceRoot = path.resolve(__dirname, '../src');
const pause = () => new Promise(resolve => setTimeout(resolve, 2));
async function until(check) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) assert.fail('Hết thời gian chờ điều kiện tích hợp.');
    await pause();
  }
}
function storage(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-tich-hop-'));
  context.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  return directory;
}
const usage = percent => JSON.stringify({
  status: 'SUCCESS', num_turns: 0, conversation_id: '', command: {name: 'usage', data: {groups: [
    {name: 'Nhóm', buckets: [{window: '5h', remaining_fraction: percent / 100,
      reset_time: '2099-01-01T00:00:00Z'}]}
  ]}}
});
function openWindow(context, directory, options = {}) {
  const commands = new Map();
  const messages = [];
  const logs = [];
  const callbacks = [];
  const kills = [];
  const retryDelays = [];
  const bar = {show() {}, dispose() {}};
  let tick;
  let quickItems;
  const disposable = {dispose() {}};
  const vscode = {
    StatusBarAlignment: {Right: 2}, QuickPickItemKind: {Separator: -1},
    ThemeColor: class {constructor(id) { this.id = id; }},
    MarkdownString: class {constructor(value) { this.value = value; }},
    workspace: {
      getConfiguration: () => ({get: key => key === 'agyPath' ? options.agyPath ?? process.execPath : undefined}),
      onDidChangeConfiguration: () => disposable
    },
    commands: {
      registerCommand: (name, callback) => { commands.set(name, callback); return disposable; },
      executeCommand: async () => {}
    },
    window: {
      createStatusBarItem: () => bar,
      createOutputChannel: () => ({
        info: message => logs.push(message), warn: message => logs.push(message),
        error: message => logs.push(message), show() {}, dispose() {}
      }),
      showErrorMessage: async message => { messages.push(message); },
      showWarningMessage: async message => { messages.push(message); },
      showInformationMessage: async message => { messages.push(message); },
      showQuickPick: async items => { quickItems = items; }
    }
  };
  const childProcess = {
    execFile(file, args, settings, callback) {
      if (/taskkill\.exe$/i.test(file)) {
        kills.push({file, args, callback});
        if (!options.holdKill) setImmediate(() => callback(null));
      } else {
        callbacks.push(callback);
      }
      return {pid: 87654, stdin: {end() {}, on() {}}};
    }
  };
  // Mỗi cửa sổ có bộ nhớ mô-đun riêng; src/state và src/runner đều chạy mã thật.
  // Chỉ thay hai API bên ngoài; tiêm lịch hẹn để thử khóa không phải chờ thật.
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = {exports: {}};
    cache.set(filename, module);
    const sandbox = {
      module, exports: module.exports, process,
      setTimeout(callback, delay) {
        if (delay <= 400) {
          retryDelays.push(delay);
          options.onRetry?.(delay);
          return setImmediate(callback);
        }
        return setTimeout(callback, delay);
      },
      clearTimeout,
      setInterval: callback => { tick = callback; return 1; }, clearInterval() {},
      require(request) {
        if (request === 'vscode') return vscode;
        if (request === 'node:child_process') return childProcess;
        return request.startsWith('./') ? load(path.resolve(path.dirname(filename), request + '.js')) : require(request);
      }
    };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, {filename});
    return module.exports;
  }
  const extension = load(path.join(sourceRoot, 'extension.js'));
  const subscriptions = [];
  extension.activate({globalStorageUri: {fsPath: directory}, subscriptions});
  context.after(async () => { await extension.deactivate(); });
  return {
    extension, bar, messages, logs, callbacks, kills, retryDelays,
    manual: () => commands.get('agyQuota.refresh')(), tick: () => tick(),
    details: () => commands.get('agyQuota.showDetails')(),
    items: () => quickItems,
    read: () => JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8')),
    finish: (percent = 20, index = callbacks.length - 1) => callbacks[index](null, usage(percent), '')
  };
}
test('Tích hợp: hai cửa sổ dùng một kho, chỉ một chạy agy và chỉ một thông báo', async context => {
  const directory = storage(context);
  const first = openWindow(context, directory);
  const second = openWindow(context, directory);
  await until(() => first.callbacks.length + second.callbacks.length === 1);
  const owner = first.callbacks.length ? first : second;
  const observer = owner === first ? second : first;
  owner.finish();
  await until(() => owner.bar.text === 'Nhóm 20%');
  await until(() => observer.retryDelays.length > 0 || !observer.bar.text.includes('sync~spin'));
  observer.tick();
  await until(() => observer.bar.text === 'Nhóm 20%');
  assert.equal(first.callbacks.length + second.callbacks.length, 1);
  assert.equal(first.messages.length + second.messages.length, 1);
  assert.equal(owner.read().levels['Nhóm|5h'], 'warning');
  assert.equal(observer.messages.length, 0);
  await observer.details();
  assert.equal(observer.items().at(-1).action, 'log');
  assert.equal(observer.bar.tooltip.isTrusted, false);
  const cacheLines = () => observer.logs.filter(line => line.includes('nguồn: bộ nhớ đệm'));
  await until(() => cacheLines().length === 1);
  assert.match(cacheLines()[0], /cửa sổ khác, \d+ giây trước/);
  observer.tick();
  await pause();
  observer.tick();
  await pause();
  assert.equal(cacheLines().length, 1);
});
test('Tích hợp N1: hết năm lượt khóa khi complete vẫn hiển thị kết quả, bỏ spinner và ghi cảnh báo', async context => {
  const directory = storage(context);
  const window = openWindow(context, directory);
  await until(() => window.callbacks.length === 1);
  const lock = path.join(directory, 'state.lock');
  fs.writeFileSync(lock, '');
  window.finish(57);
  await until(() => window.logs.some(line => line.includes('vẫn hiển thị kết quả cục bộ')));
  assert.equal(window.bar.text, 'Nhóm 57%');
  assert.deepEqual(window.retryDelays, [50, 100, 200, 400]);
  assert.equal(window.read().buckets.length, 0);
  fs.unlinkSync(lock);
  await window.tick();
  assert.equal(window.bar.text, 'Nhóm 57%');
});
test('Tích hợp N1: hết năm lượt khóa khi ghi lỗi vẫn giữ dữ liệu và dừng spinner', async context => {
  const directory = storage(context);
  const window = openWindow(context, directory);
  await until(() => window.callbacks.length === 1);
  window.finish(60);
  await until(() => window.bar.text === 'Nhóm 60%');
  const manual = window.manual();
  await until(() => window.callbacks.length === 2);
  const lock = path.join(directory, 'state.lock');
  fs.writeFileSync(lock, '');
  window.callbacks[1](null, 'Đầu ra hỏng', '');
  await manual;
  assert.equal(window.bar.text, '$(history) Nhóm 60%');
  assert.match(window.bar.tooltip.value, /Đầu ra hỏng/);
  assert.ok(window.logs.some(line => line.includes('vẫn hiển thị kết quả cục bộ')));
  fs.unlinkSync(lock);
});
test('Tích hợp N2: lệnh thủ công thử lại khóa rồi chạy agy kể cả dữ liệu còn mới', async context => {
  const directory = storage(context);
  const lock = path.join(directory, 'state.lock');
  const window = openWindow(context, directory, {
    onRetry(delay) { if (delay === 100) fs.unlinkSync(lock); }
  });
  await until(() => window.callbacks.length === 1);
  window.finish(60);
  await until(() => window.bar.text === 'Nhóm 60%');
  fs.writeFileSync(lock, '');
  const manual = window.manual();
  await until(() => window.callbacks.length === 2);
  assert.deepEqual(window.retryDelays, [50, 100]);
  assert.match(window.bar.text, /^\$\(sync~spin\) Nhóm 60%/);
  window.finish(29);
  await manual;
  assert.equal(window.bar.text, 'Nhóm 29%');
});
test('Tích hợp N2: khóa thủ công hết lượt ghi cảnh báo rõ, không giả làm bộ nhớ đệm', async context => {
  const directory = storage(context);
  const window = openWindow(context, directory);
  await until(() => window.callbacks.length === 1);
  window.finish(60);
  await until(() => window.bar.text === 'Nhóm 60%');
  const lock = path.join(directory, 'state.lock');
  fs.writeFileSync(lock, '');
  await window.manual();
  assert.equal(window.callbacks.length, 1);
  assert.deepEqual(window.retryDelays, [50, 100, 200, 400]);
  assert.ok(window.logs.some(line => line.includes('chưa chạy lượt làm mới thủ công')));
  fs.unlinkSync(lock);
});
test('Tích hợp L3: đóng cửa sổ chờ giết cây và trả lease, không ghi lỗi dùng chung', async context => {
  const directory = storage(context);
  const window = openWindow(context, directory, {holdKill: true});
  await until(() => window.callbacks.length === 1);
  let finished = false;
  const closing = window.extension.deactivate().then(() => { finished = true; });
  assert.equal(window.kills.length, 1);
  assert.equal(finished, false);
  assert.deepEqual(Array.from(window.kills[0].args), ['/PID', '87654', '/T', '/F']);
  window.kills[0].callback(null);
  await closing;
  const state = window.read();
  assert.equal(state.runningSince, null);
  assert.equal(state.lastAttemptAt, null);
  assert.equal(state.consecutiveErrors, 0);
  assert.equal(state.error, undefined);
  assert.equal(window.messages.length, 0);
  const other = openWindow(context, directory);
  await until(() => other.callbacks.length === 1);
  other.finish(60);
  await until(() => other.bar.text === 'Nhóm 60%');
});
test('Tích hợp N5: lỗi resolveAgy được dùng chung trong tooltip, thông báo và nhật ký', async context => {
  const directory = storage(context);
  const window = openWindow(context, directory, {agyPath: path.join(directory, 'agy.cmd')});
  await until(() => window.messages.length === 1);
  const message = window.messages[0];
  assert.match(message, /chỉ hỗ trợ tệp .exe/);
  assert.ok(window.bar.tooltip.value.includes(message));
  assert.ok(window.logs.some(line => line.includes(message)));
  await window.manual();
  assert.equal(window.messages.length, 1);
  assert.equal(window.callbacks.length, 0);
});
