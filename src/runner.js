'use strict';
const path = require('node:path');
const {parse, sanitize, stripAnsi} = require('./parse');
function resolveAgy({configPath = '', env = {}, platform = process.platform, exists}) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const missing = message => ({error: {type: 'not-found', message}});
  configPath = configPath.trim();
  if (configPath) {
    if (platform === 'win32' && !/\.exe$/i.test(configPath)) {
      return missing('Trên Windows chỉ hỗ trợ tệp .exe, không hỗ trợ thư mục hoặc đuôi khác.');
    }
    if (!paths.isAbsolute(configPath)) return missing('Đường dẫn agy phải là đường dẫn tuyệt đối.');
    return exists(configPath) ? {path: configPath} :
      missing('Không tìm thấy agy tại đường dẫn đã cấu hình. Đặt lại agyQuota.agyPath.');
  }
  const key = Object.keys(env).find(name => name.toUpperCase() === 'PATH');
  const candidates = String(env[key] || '').split(platform === 'win32' ? ';' : ':')
    .map(value => value.trim().replace(/^"|"$/g, ''))
    .filter(value => paths.isAbsolute(value))
    .map(value => paths.join(value, platform === 'win32' ? 'agy.exe' : 'agy'));
  if (platform === 'win32' && env.LOCALAPPDATA && paths.isAbsolute(env.LOCALAPPDATA)) {
    candidates.push(paths.join(env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe'));
  }
  const found = candidates.find(exists);
  return found ? {path: found} : missing(
    'Không tìm thấy agy. Đã thử PATH và thư mục cài đặt mặc định. Đặt đường dẫn trong agyQuota.agyPath.');
}
function createRunner({execFile, exists, homedir, env = process.env, platform = process.platform,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, log = () => {}, kill = process.kill}) {
  let active = null;
  let child = null;
  let cached = null;
  let cachedConfig = null;
  let cancel = null;
  let disposed = false;
  function writeLog(message) {
    try { log(message); } catch { /* Kênh nhật ký có thể đã bị hủy khi đóng cửa sổ. */ }
  }
  function killTree(proc) {
    return new Promise(resolve => {
      if (!proc?.pid) return resolve();
      if (platform !== 'win32') {
        try { kill(-proc.pid, 'SIGKILL'); } catch {
          try { proc.kill('SIGKILL'); } catch { /* Tiến trình có thể đã thoát. */ }
        }
        return resolve();
      }
      const rootKey = Object.keys(env).find(key => key.toUpperCase() === 'SYSTEMROOT');
      const executable = env[rootKey] ?
        path.win32.join(env[rootKey], 'System32', 'taskkill.exe') : 'taskkill.exe';
      try {
        execFile(executable, ['/PID', String(proc.pid), '/T', '/F'], {windowsHide: true}, error => {
          if (error) writeLog('Không giết được cây tiến trình: ' + sanitize(error.message, 200));
          resolve();
        });
      } catch (error) {
        writeLog('Không giết được cây tiến trình: ' + sanitize(error.message, 200));
        resolve();
      }
    });
  }
  function run(config = {}) {
    if (active) return active;
    if (disposed) return Promise.resolve({cancelled: true});
    if (cachedConfig !== config.agyPath) {
      cached = null;
      cachedConfig = config.agyPath;
    }
    const resolved = cached ? {path: cached} : resolveAgy({configPath: config.agyPath, env, platform, exists});
    if (resolved.error) {
      writeLog('Làm mới: lỗi ' + resolved.error.type + ', ' + sanitize(resolved.error.message, 200));
      return Promise.resolve(resolved);
    }
    cached = resolved.path;
    let settle;
    active = new Promise(resolve => { settle = resolve; });
    const promise = active;
    const started = now();
    let timer;
    let done = false;
    let stopping = false;
    const finish = result => {
      if (done) return;
      done = true;
      clearTimer(timer);
      result.durationMs = now() - started;
      active = null;
      child = null;
      cancel = null;
      settle(result);
      if (result.cancelled) return;
      writeLog(result.error ? 'Làm mới: lỗi ' + result.error.type + ', ' + sanitize(result.error.message, 200) :
        'Làm mới: thành công, ' + result.durationMs + ' ms, ' + result.buckets.length +
        ' mốc hợp lệ, mã thoát ' + result.exitCode + ', nguồn: agy');
    };
    const stop = type => {
      if (done || stopping) return;
      stopping = true;
      clearTimer(timer);
      const result = type === 'cancelled' ? {cancelled: true} : {
        error: {type, message: 'Hết thời gian chờ (' + (config.timeout || 45) + ' giây).'}
      };
      // Trần 2 giây tránh treo deactivate nếu taskkill không gọi callback.
      timer = setTimer(() => finish(result), 2000);
      void killTree(child).finally(() => finish(result));
    };
    cancel = () => stop('cancelled');
    timer = setTimer(() => stop('timeout'), (config.timeout || 45) * 1000);
    const notFound = () => resolveAgy({configPath: config.agyPath, env, platform, exists: () => false}).error;
    try {
      child = execFile(cached, ['--output-format', 'json', '-p', '/usage'], {
        windowsHide: true,
        ...(platform === 'win32' ? {} : {detached: true}),
        cwd: homedir(), maxBuffer: 256 * 1024, encoding: 'utf8', env: {...env, NO_COLOR: '1'}
      }, (error, stdout = '', stderr = '') => {
        if (done || stopping) return;
        if (error?.code === 'ENOENT') {
          const failure = exists(cached) ? {
            type: 'spawn', message: 'Không khởi chạy được agy; tệp vẫn tồn tại.'
          } : notFound();
          cached = null;
          finish({error: failure});
          return;
        }
        if (error && typeof error.code === 'string') {
          finish({error: {type: 'spawn', message: sanitize(stdout || stderr || error.message, 200)}});
          return;
        }
        const result = parse(stdout);
        if (result.error) {
          try { JSON.parse(stripAnsi(stdout)); } catch {
            result.error.message = sanitize(stdout.trim() ? stdout : stderr, 200) || result.error.message;
          }
        }
        finish({...result, exitCode: error?.code ?? 0});
      });
      child.stdin?.on?.('error', () => {});
      child.stdin?.end();
    } catch (error) {
      const failure = error.code === 'ENOENT' && !exists(cached) ? notFound() : {
        type: 'spawn', message: sanitize(error.message, 200)
      };
      if (error.code === 'ENOENT') cached = null;
      finish({error: failure});
    }
    return promise;
  }
  return {
    run,
    dispose() {
      disposed = true;
      const pending = active;
      cancel?.();
      return pending || Promise.resolve();
    }
  };
}
module.exports = {resolveAgy, createRunner};
