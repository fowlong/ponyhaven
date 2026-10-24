$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskRoot = Split-Path -Parent $PSScriptRoot
$modRoot = Join-Path $taskRoot 'native\equestria\luanti-5.17.0-win64\games\ponyhaven\mods\ponyhaven'
$inputs = Get-Content -LiteralPath (Join-Path $taskRoot 'tmp\equestria-npc-input.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$npcOutput = @()
foreach ($npc in $inputs) {
    $sourcePath = Join-Path (Join-Path $taskRoot 'public') ([Uri]::UnescapeDataString($npc.path))
    $sourceImage = [Drawing.Image]::FromFile($sourcePath)
    try {
        $count = $sourceImage.GetFrameCount([Drawing.Imaging.FrameDimension]::Time)
        $stride = [Math]::Max(1, [Math]::Ceiling(($count * $sourceImage.Height) / 8192))
        $frames = [int][Math]::Ceiling($count / $stride)
        $atlas = [Drawing.Bitmap]::new($sourceImage.Width, ($sourceImage.Height * $frames), [Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [Drawing.Graphics]::FromImage($atlas)
        try {
            $graphics.Clear([Drawing.Color]::Transparent)
            for ($frame = 0; $frame -lt $frames; $frame++) {
                [void]$sourceImage.SelectActiveFrame([Drawing.Imaging.FrameDimension]::Time, [int]($frame * $stride))
                $graphics.DrawImageUnscaled($sourceImage, 0, ($frame * $sourceImage.Height))
            }
            $atlas.Save((Join-Path (Join-Path $modRoot 'textures') $npc.filename), [Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $atlas.Dispose() }
        $delay = 0.12
        try {
            $delays = $sourceImage.GetPropertyItem(0x5100).Value
            $total = 0
            for ($i = 0; $i -lt $count; $i++) { $total += [Math]::Max(2, [BitConverter]::ToInt32($delays, ($i * 4))) }
            $delay = $total / $frames / 100
        } catch {}
        $npcOutput += [ordered]@{ id = $npc.id; name = $npc.name; texture = $npc.filename; width = $sourceImage.Width; height = $sourceImage.Height; frames = $frames; delay = $delay }
    } finally { $sourceImage.Dispose() }
}
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $modRoot 'npcs.json'), ($npcOutput | ConvertTo-Json -Depth 4), $utf8)
Write-Output "Prepared $($npcOutput.Count) animated virtual-pet NPC sprite sheets."
