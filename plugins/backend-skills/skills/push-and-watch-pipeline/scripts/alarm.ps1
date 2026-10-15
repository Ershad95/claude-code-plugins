param(
    [ValidateSet("Error", "Success", "Stage")]
    [string]$Kind = "Error",
    [string]$Title,
    [string]$Message,
    [int]$Seconds = 10,
    [string]$Speech
)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing, System.Speech

if ($Kind -eq "Success") {
    if (-not $PSBoundParameters.ContainsKey("Title")) { $Title = "SUCCESS" }
    if (-not $PSBoundParameters.ContainsKey("Message")) { $Message = "Pipeline Completed" }
    if (-not $PSBoundParameters.ContainsKey("Speech")) { $Speech = "Successful. Pipeline Completed" }
    $colorA = [System.Drawing.Color]::FromArgb(0, 170, 60)
    $colorB = [System.Drawing.Color]::FromArgb(0, 110, 40)
    $icon = [char]0x2714
    $tones = @(@(523, 0.15), @(659, 0.15), @(784, 0.15), @(1047, 0.35))   # rising C-E-G-C chime
    $sirenRepeats = 1
}
elseif ($Kind -eq "Stage") {
    if (-not $PSBoundParameters.ContainsKey("Title")) { $Title = "ACTION NEEDED" }
    if (-not $PSBoundParameters.ContainsKey("Message")) { $Message = "Ready To Stage" }
    if (-not $PSBoundParameters.ContainsKey("Speech")) { $Speech = "Ready To Stage" }
    $colorA = [System.Drawing.Color]::FromArgb(255, 150, 0)
    $colorB = [System.Drawing.Color]::FromArgb(190, 95, 0)
    $icon = [char]0x25B6
    $tones = @(@(880, 0.2), @(660, 0.2), @(880, 0.2), @(660, 0.3))    # ding-dong doorbell
    $sirenRepeats = 1
}
else {
    if (-not $PSBoundParameters.ContainsKey("Title")) { $Title = "ERROR" }
    if (-not $PSBoundParameters.ContainsKey("Message")) { $Message = "Pipeline Failed" }
    if (-not $PSBoundParameters.ContainsKey("Speech")) { $Speech = "Error. Pipeline Failed" }
    $colorA = [System.Drawing.Color]::Red
    $colorB = [System.Drawing.Color]::DarkRed
    $icon = [char]0x26A0
    $tones = @(@(1400, 0.25), @(900, 0.25))                              # two-tone siren
    $sirenRepeats = 2
}

# Build the tone sequence as a WAV in memory
$rate = 22050
$samples = New-Object System.Collections.Generic.List[byte]
foreach ($t in $tones) {
    $freq = $t[0]; $n = [int]($rate * $t[1])
    for ($i = 0; $i -lt $n; $i++) {
        $fade = [math]::Min(1.0, ($n - $i) / 400.0)
        $v = [int](12000 * $fade * [math]::Sin(2 * [math]::PI * $freq * $i / $rate))
        $samples.Add([byte]($v -band 0xFF)); $samples.Add([byte](($v -shr 8) -band 0xFF))
    }
}
$data = $samples.ToArray()
$ms = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($ms)
$w.Write([Text.Encoding]::ASCII.GetBytes("RIFF")); $w.Write([int](36 + $data.Length))
$w.Write([Text.Encoding]::ASCII.GetBytes("WAVEfmt ")); $w.Write([int]16); $w.Write([int16]1); $w.Write([int16]1)
$w.Write([int]$rate); $w.Write([int]($rate * 2)); $w.Write([int16]2); $w.Write([int16]16)
$w.Write([Text.Encoding]::ASCII.GetBytes("data")); $w.Write([int]$data.Length); $w.Write($data)
$toneBytes = $ms.ToArray()

# Audio loop on a background thread: tones, then speech, repeat — so they never overlap
$state = [hashtable]::Synchronized(@{ Running = $true })
$audio = [powershell]::Create()
[void]$audio.AddScript({
    param($toneBytes, $speech, $repeats, $state)
    Add-Type -AssemblyName System.Speech
    $player = New-Object System.Media.SoundPlayer(New-Object System.IO.MemoryStream(, $toneBytes))
    $voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $voice.Volume = 100
    while ($state.Running) {
        for ($r = 0; $r -lt $repeats; $r++) { $player.PlaySync() }
        if (-not $state.Running) { break }
        if ($speech) { $voice.Speak($speech) }
        Start-Sleep -Milliseconds 300
    }
    $voice.Dispose()
}).AddArgument($toneBytes).AddArgument($Speech).AddArgument($sirenRepeats).AddArgument($state)
$audioHandle = $audio.BeginInvoke()

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.WindowState = 'Maximized'
$form.TopMost = $true
$form.BackColor = $colorA
$form.Cursor = [System.Windows.Forms.Cursors]::Hand

$label = New-Object System.Windows.Forms.Label
$label.Dock = 'Fill'
$label.TextAlign = 'MiddleCenter'
$label.ForeColor = [System.Drawing.Color]::White
$label.Font = New-Object System.Drawing.Font("Segoe UI", 48, [System.Drawing.FontStyle]::Bold)
$label.Text = "$icon $Title $icon`n`n$Message`n`n(click to dismiss)"
$form.Controls.Add($label)

$flash = New-Object System.Windows.Forms.Timer
$flash.Interval = 400
$flash.Add_Tick({
    if ($form.BackColor -eq $colorA) { $form.BackColor = $colorB } else { $form.BackColor = $colorA }
})
$flash.Start()

$stop = New-Object System.Windows.Forms.Timer
$stop.Interval = $Seconds * 1000
$stop.Add_Tick({ $form.Close() })
$stop.Start()

$label.Add_Click({ $form.Close() })
$form.Add_KeyDown({ $form.Close() })
$form.Add_FormClosed({ $state.Running = $false; $flash.Stop(); $stop.Stop() })

[void]$form.ShowDialog()
[void]$audio.EndInvoke($audioHandle)
$audio.Dispose()
