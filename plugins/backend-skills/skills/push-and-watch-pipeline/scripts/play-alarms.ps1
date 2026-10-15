# Plays alarms one after another so they never overlap.
# Each argument is "Kind|Message", e.g. "Success|build-images: Pipeline Completed" "Stage|Ready To Stage"
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Alarms)

$alarm = Join-Path $PSScriptRoot "alarm.ps1"
foreach ($a in $Alarms) {
    $kind, $message = $a -split "\|", 2
    $procArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-File", $alarm, "-Kind", $kind, "-Seconds", "8")
    if ($message) { $procArgs += @("-Message", "`"$message`"") }   # PS 5.1 does not quote array args containing spaces
    Start-Process powershell -ArgumentList $procArgs -Wait -WindowStyle Hidden
}
