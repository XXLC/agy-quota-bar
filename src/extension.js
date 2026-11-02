'use strict';
const {t, setLocale, localeFor} = require('./i18n');
const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const {createRunner} = require('./runner');
const {createStore, emptyState, localResult} = require('./state');
const {configuration} = require('./thresholds');
const {display, notification, sanitize} = require('./format');
let shutdown = () => Promise.resolve();
function activate(context) {
  setLocale(localeFor(vscode.env?.language));
  const log = vscode.window.createOutputChannel(t('channel.name'), {log: true});
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
  bar.name = t('bar.name');
  bar.command = 'agyQuota.showDetails';
  const runner = createRunner({
    execFile: require('node:child_process').execFile,
    exists: file => { try { return fs.statSync(file).isFile(); } catch { return false; } },
    homedir: os.homedir,
    log: message => log.info(message)
  });
  const store = createStore({directory: context.globalStorageUri.fsPath, fs: fs.promises});
  let state = {...emptyState(), runningSince: Date.now()};
  let config;
  let busy = null;
  let closed = false;
  let notFoundShown = false;
  let pathRefreshPending = false;
  let lastCacheLoggedAt = -Infinity;
  let unpersistedState = null;
  function readConfig() {
    const values = vscode.workspace.getConfiguration('agyQuota');
    const keys = ['agyPath', 'refreshInterval', 'timeout', 'warningThreshold',
      'criticalThreshold', 'notificationEnabled'];
    config = configuration(Object.fromEntries(keys.map(key => [key, values.get(key)])));
  }
  readConfig();
  function render() {
    if (closed) return;
    const model = display(state, Date.now(), config);
    bar.text = model.text;
    bar.backgroundColor = model.severity === 'critical' ? new vscode.ThemeColor('statusBarItem.errorBackground') :
      model.severity === 'warning' ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    const tooltip = new vscode.MarkdownString(model.tooltip, true);
    tooltip.isTrusted = false;
    bar.tooltip = tooltip;
    bar.show();
  }
  function notify(result) {
    if (closed || !result?.events?.length) return;
    const message = notification(result);
    if (result.severity === 'critical') void vscode.window.showErrorMessage(message);
    else if (result.severity === 'warning') void vscode.window.showWarningMessage(message);
    else void vscode.window.showInformationMessage(message);
  }
  async function refresh(manual = false) {
    if (closed) return;
    if (busy) return busy;
    busy = (async () => {
      try {
        const claim = await store.claim(config, manual);
        const shared = claim.state;
        const keepLocal = !claim.claimed && unpersistedState &&
          (shared.lastSuccessAt ?? -Infinity) <= (unpersistedState.lastSuccessAt ?? -Infinity) &&
          (shared.lastAttemptAt ?? -Infinity) <= (unpersistedState.lastAttemptAt ?? -Infinity);
        if (!keepLocal) unpersistedState = null;
        state = {...(keepLocal ? unpersistedState : shared), manualRefresh: manual && claim.claimed};
        if (closed) {
          if (claim.claimed) await store.release(claim);
          return;
        }
        render();
        if (!claim.claimed) {
          // Chỉ cửa sổ thực sự chạy agy phát thông báo, sau khi đã lưu mức dưới khóa.
          if (claim.busy && manual) {
            log.warn(t('log.lockBusy'));
          } else if (!keepLocal && state.lastSuccessAt != null && state.lastSuccessAt > lastCacheLoggedAt) {
            lastCacheLoggedAt = state.lastSuccessAt;
            const age = Math.max(0, Math.floor((Date.now() - state.lastSuccessAt) / 1000));
            log.info(t('log.cache', age));
          }
          return;
        }
        const result = await runner.run(config);
        if (closed || result.cancelled) {
          const released = await store.release(claim);
          state = {...released.state, runningSince: null};
          return;
        }
        let completed;
        try {
          completed = await store.complete(result, config, claim);
        } catch (error) {
          completed = {busy: true};
          log.warn(t('log.writeFailed', sanitize(error.message, 200)));
        }
        if (completed.busy) {
          state = localResult(claim.state, result, Date.now());
          unpersistedState = state;
          log.warn(t('log.localResult'));
        } else {
          state = completed.state;
          lastCacheLoggedAt = Math.max(lastCacheLoggedAt, state.lastSuccessAt ?? -Infinity);
          notify(completed.notification);
        }
        if (result.error?.type === 'not-found' && !notFoundShown && !closed) {
          notFoundShown = true;
          void vscode.window.showErrorMessage(result.error.message, t('action.settings')).then(choice => {
            if (choice) void vscode.commands.executeCommand('workbench.action.openSettings', 'agyQuota.agyPath');
          });
        }
      } catch (error) {
        state = {...state, runningSince: null, manualRefresh: false,
          error: {type: 'spawn', message: t('error.updateState', sanitize(error.message, 200))}};
        if (!closed) log.error(state.error.message);
      } finally {
        busy = null;
        render();
        if (pathRefreshPending && !closed) {
          pathRefreshPending = false;
          void refresh(true);
        }
      }
    })();
    return busy;
  }
  async function details() {
    const model = display(state, Date.now(), config);
    const items = model.items.map(({separator, ...item}) => separator ?
      {...item, kind: vscode.QuickPickItemKind.Separator} : item);
    const selected = await vscode.window.showQuickPick(items, {
      title: model.title, placeHolder: t('picker.placeholder')
    });
    if (selected?.action === 'refresh') await refresh(true);
    if (selected?.action === 'log') log.show();
  }
  const interval = setInterval(() => { render(); return refresh(); }, 60000);
  context.subscriptions.push(bar, log, {dispose: () => clearInterval(interval)},
    vscode.commands.registerCommand('agyQuota.refresh', () => refresh(true)),
    vscode.commands.registerCommand('agyQuota.showDetails', details),
    vscode.commands.registerCommand('agyQuota.showLog', () => log.show()),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration('agyQuota')) return;
      const oldPath = config.agyPath;
      readConfig();
      render();
      if (oldPath !== config.agyPath) {
        if (busy) pathRefreshPending = true;
        else void refresh(true);
      }
    }));
  shutdown = () => {
    closed = true;
    clearInterval(interval);
    const stopping = runner.dispose();
    // Runner có trần giết cây 2 giây; không để khóa bận kéo dài thời gian đóng cửa sổ.
    return new Promise(resolve => {
      const timer = setTimeout(resolve, 2500);
      Promise.all([stopping, busy]).then(() => { clearTimeout(timer); resolve(); }, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };
  context.subscriptions.push({dispose: shutdown});
  render();
  void refresh();
}
function deactivate() { return shutdown(); }
module.exports = {activate, deactivate};
