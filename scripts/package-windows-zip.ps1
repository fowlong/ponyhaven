param([Parameter(Mandatory=$true)][string]$ReleaseFolder)
. "$PSScriptRoot/zip-helpers.ps1"
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $workspace 'release')) + [IO.Path]::DirectorySeparatorChar
$folder = [IO.Path]::GetFullPath($ReleaseFolder)
if (-not $folder.StartsWith($releaseRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Package folder must stay in release' }
$entries = [Collections.Generic.List[object]]::new()
$manifest = [Collections.Generic.List[string]]::new()
foreach ($file in Get-ChildItem -LiteralPath $folder -Recurse -File | Sort-Object FullName) {
    if ($file.Name -eq 'FILES.sha256') { continue }
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Unexpected package link: $($file.FullName)" }
    $name = $file.FullName.Substring($folder.Length+1).Replace('\','/')
    $bundledWorld = $name.StartsWith('resources/app/native/equestria/world/', [StringComparison]::Ordinal)
    if ($file.Name.StartsWith('.env') -or $file.Extension -in '.log','.mca','.sqlite','.sqlite3' -or $file.Name -in 'save.json','profiles.json','activation.bin','bridge.json','session-password.txt' -or (($file.Extension -eq '.eqr' -or $file.Name -eq 'locations.json') -and -not $bundledWorld)) { throw "Unexpected private/runtime data: $name" }
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifest.Add("$hash  $name")
    $entries.Add(@{Path=$file.FullName;Name=([IO.Path]::GetFileName($folder)+"/$name")})
}
$manifestPath = Join-Path $folder 'FILES.sha256'
[IO.File]::WriteAllLines($manifestPath,$manifest,[Text.UTF8Encoding]::new($false))
$entries.Add(@{Path=$manifestPath;Name=([IO.Path]::GetFileName($folder)+'/FILES.sha256')})
$temporary = Join-Path $releaseRoot ([IO.Path]::GetFileName($folder)+'.'+[guid]::NewGuid().ToString('N')+'.zip.partial')
Write-VerifiedZip $temporary $entries.ToArray()
$destination = Join-Path $releaseRoot 'Ponyhaven-Windows.zip'
# Both absolute paths are confined to release; replace only this known ZIP file.
Move-Item -LiteralPath $temporary -Destination $destination -Force
$hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($destination+'.sha256'),"$hash  Ponyhaven-Windows.zip`n",[Text.Encoding]::ASCII)
Write-Host "Verified portable ZIP: $destination"
Write-Host "SHA-256: $hash"
