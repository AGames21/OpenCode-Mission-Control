# Creates a Desktop shortcut for OpenCode Mission Control.
# Run: powershell -ExecutionPolicy Bypass -File scripts/shortcut.ps1
$target = "$env:USERPROFILE\Desktop\OpenCode Mission Control.lnk"
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($target)
$link.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$link.Arguments = '-ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\OpenCodeMissionControl\scripts\start.ps1"'
$link.WorkingDirectory = 'C:\OpenCodeMissionControl'
$link.Description = 'Launch OpenCode Mission Control (server + dashboard + browser)'
$link.Save()
Write-Output "[mc] shortcut created: $target"
