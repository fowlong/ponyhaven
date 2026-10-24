param([int]$GameProcessId, [switch]$Check)
$ErrorActionPreference = 'Stop'
# Read only seven bindings while this Luanti window owns keyboard focus.
# No text or background-window input is read or stored.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PonyhavenBookKeys {
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
 public static int Read(int process) {
  uint foreground; GetWindowThreadProcessId(GetForegroundWindow(), out foreground);
  if (foreground != process) return 0;
  int mask = 0;
  for (int i=0; i<7; i++) if ((GetAsyncKeyState(0x31+i) & 0x8000) != 0) mask |= 1 << i;
  return mask;
 }
}
'@
if ($Check) { Write-Output 'Book key helper compiled.'; exit 0 }
$game = [System.Diagnostics.Process]::GetProcessById($GameProcessId)
$previous = 0
while (-not $game.HasExited) {
  $current = [PonyhavenBookKeys]::Read($GameProcessId)
  for ($book=1; $book -le 7; $book++) {
    $bit = 1 -shl ($book-1)
    if (($current -band $bit) -and -not ($previous -band $bit)) {
      [Console]::Out.WriteLine($book); [Console]::Out.Flush()
    }
  }
  $previous = $current
  Start-Sleep -Milliseconds 20
}
