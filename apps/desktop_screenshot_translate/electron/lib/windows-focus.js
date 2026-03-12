const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function isWindowsFocusSupported() {
  return process.platform === 'win32';
}

function encodePowerShellCommand(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

async function runPowerShell(script) {
  if (!isWindowsFocusSupported()) {
    return '';
  }

  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodePowerShellCommand(script),
    ],
    {
      maxBuffer: 1024 * 1024,
      timeout: 5000,
      windowsHide: true,
    },
  );
  return String(stdout || '').trim();
}

async function snapshotForegroundWindow(currentProcessId) {
  if (!isWindowsFocusSupported()) {
    return null;
  }

  const stdout = await runPowerShell(`
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class AiTransFocus {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@;
$hwnd = [AiTransFocus]::GetForegroundWindow();
if ($hwnd -eq [IntPtr]::Zero) { return }
$pid = [uint32]0;
[AiTransFocus]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null;
if (-not [AiTransFocus]::IsWindowVisible($hwnd)) { return }
[Console]::Out.WriteLine((@{
    hwnd = $hwnd.ToInt64().ToString();
    pid = [int]$pid;
} | ConvertTo-Json -Compress));
`);

  if (!stdout) {
    return null;
  }

  const payload = JSON.parse(stdout);
  const hwnd = typeof payload.hwnd === 'string' ? payload.hwnd.trim() : '';
  const pid = Number(payload.pid);
  if (!hwnd || !/^-?\d+$/.test(hwnd) || !Number.isFinite(pid)) {
    return null;
  }

  return {
    hwnd,
    pid,
    isCurrentProcess: pid === currentProcessId,
  };
}

async function restoreForegroundWindow(snapshot) {
  if (!isWindowsFocusSupported() || !snapshot || typeof snapshot.hwnd !== 'string') {
    return {
      ok: false,
      reason: 'unsupported',
    };
  }

  const hwnd = snapshot.hwnd.trim();
  if (!/^-?\d+$/.test(hwnd)) {
    return {
      ok: false,
      reason: 'invalid_handle',
    };
  }

  const stdout = await runPowerShell(`
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class AiTransFocus {
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@;
$hwnd = [IntPtr]::new([Int64]::Parse("${hwnd}"));
if (-not [AiTransFocus]::IsWindow($hwnd)) {
    [Console]::Out.WriteLine((@{ ok = $false; reason = "missing_window" } | ConvertTo-Json -Compress));
    return
}
[AiTransFocus]::ShowWindowAsync($hwnd, 9) | Out-Null;
Start-Sleep -Milliseconds 60;
$restored = [AiTransFocus]::SetForegroundWindow($hwnd);
[Console]::Out.WriteLine((@{
    ok = $restored;
    reason = $(if ($restored) { "restored" } else { "set_foreground_failed" });
} | ConvertTo-Json -Compress));
`);

  if (!stdout) {
    return {
      ok: false,
      reason: 'empty_response',
    };
  }

  const payload = JSON.parse(stdout);
  return {
    ok: Boolean(payload.ok),
    reason: typeof payload.reason === 'string' ? payload.reason : 'unknown',
  };
}

module.exports = {
  isWindowsFocusSupported,
  restoreForegroundWindow,
  snapshotForegroundWindow,
};
