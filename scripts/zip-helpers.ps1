$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Write-VerifiedZip([string]$Destination, [object[]]$Entries) {
    if (Test-Path -LiteralPath $Destination) { throw "Refusing to overwrite staging ZIP: $Destination" }
    $expected = @{}
    $archive = [IO.Compression.ZipFile]::Open($Destination, [IO.Compression.ZipArchiveMode]::Create)
    try {
        $index = 0
        foreach ($item in $Entries) {
            if ($expected.ContainsKey($item.Name)) { throw "Duplicate ZIP entry: $($item.Name)" }
            $expected[$item.Name] = (Get-FileHash -LiteralPath $item.Path -Algorithm SHA256).Hash
            [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $item.Path, $item.Name, [IO.Compression.CompressionLevel]::Optimal)
            $index++
            if ($index % 2000 -eq 0) { Write-Host "Archived $index / $($Entries.Count) files" }
        }
    } finally { $archive.Dispose() }
    $archive = [IO.Compression.ZipFile]::OpenRead($Destination)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        if ($archive.Entries.Count -ne $expected.Count) { throw 'ZIP entry count mismatch' }
        foreach ($entry in $archive.Entries) {
            $stream = $entry.Open()
            try { $hash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '') }
            finally { $stream.Dispose() }
            if ($hash -ne $expected[$entry.FullName]) { throw "ZIP payload hash mismatch: $($entry.FullName)" }
        }
    } finally { $hasher.Dispose(); $archive.Dispose() }
    Write-Host "Verified $($expected.Count) ZIP payload hashes."
}
