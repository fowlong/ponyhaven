$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$sheet = [System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot '../tmp/equestria/dbj4but-11ce86bb-08c9-40ca-a316-dc57815e0cc9.png'))
try {
  $cell = [int]($sheet.Height / 4)
  $output = [System.Drawing.Bitmap]::new($cell, $cell * 7)
  $graphics = [System.Drawing.Graphics]::FromImage($output)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    for ($frame=0; $frame -lt 7; $frame++) {
      $bob = @(0,1,2,1,0,1,0)[$frame]
      $graphics.DrawImage($sheet, [System.Drawing.Rectangle]::new(0,$frame*$cell+$bob,$cell,$cell-$bob), [System.Drawing.Rectangle]::new($frame*$cell,0,$cell,$cell-$bob), [System.Drawing.GraphicsUnit]::Pixel)
    }
    $output.Save((Join-Path $PSScriptRoot '../native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven/textures/eq_changeling_front.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $output.Dispose() }
} finally { $sheet.Dispose() }
Write-Output 'Prepared seven front-facing changeling frames from the supplied sheet.'
