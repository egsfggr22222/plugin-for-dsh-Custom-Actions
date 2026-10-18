param(
  [string]$ProcessName = 'DeepSeek Harness'
)

# Bring the DeepSeek Harness window to the front.
#
# The harness Host runs as a plain Node child of the Electron main process, so a
# plugin cannot call BrowserWindow APIs. This script does the equivalent on
# Windows: restore the window if it is minimized, wink it to the top of the
# z-order with a topmost toggle, then take the foreground (with the documented
# AttachThreadInput workaround for the foreground lock).
#
# Exit codes: 0 raised, 2 no window found, 1 failure (message on stderr).

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class DshReminderWindow
{
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
}
'@

try {
  $process = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1
  if ($null -eq $process) {
    Write-Output 'NO-WINDOW'
    exit 2
  }

  $handle = [IntPtr]$process.MainWindowHandle
  $topmost = [IntPtr](-1)
  $notTopmost = [IntPtr](-2)
  # SWP_NOSIZE | SWP_NOMOVE | SWP_SHOWWINDOW
  $flags = 0x0001 -bor 0x0002 -bor 0x0040

  [void][DshReminderWindow]::ShowWindowAsync($handle, 9)   # SW_RESTORE
  [void][DshReminderWindow]::SetWindowPos($handle, $topmost, 0, 0, 0, 0, $flags)

  $foreground = [DshReminderWindow]::GetForegroundWindow()
  $foregroundThread = 0
  [void][DshReminderWindow]::GetWindowThreadProcessId($foreground, [ref]$foregroundThread)
  $self = [DshReminderWindow]::GetCurrentThreadId()
  if ($foregroundThread -ne 0 -and $foregroundThread -ne $self) {
    [void][DshReminderWindow]::AttachThreadInput($self, $foregroundThread, $true)
  }
  try {
    [void][DshReminderWindow]::BringWindowToTop($handle)
    [void][DshReminderWindow]::SetForegroundWindow($handle)
  }
  finally {
    if ($foregroundThread -ne 0 -and $foregroundThread -ne $self) {
      [void][DshReminderWindow]::AttachThreadInput($self, $foregroundThread, $false)
    }
    [void][DshReminderWindow]::SetWindowPos($handle, $notTopmost, 0, 0, 0, 0, $flags)
  }

  Write-Output 'RAISED'
  exit 0
}
catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
