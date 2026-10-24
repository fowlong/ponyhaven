param([Parameter(Mandatory=$true)][string]$ReleaseFolder)
. "$PSScriptRoot/zip-helpers.ps1"
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $workspace 'release')) + [IO.Path]::DirectorySeparatorChar
$destination = [IO.Path]::GetFullPath($ReleaseFolder)
if (-not $destination.StartsWith($releaseRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Sources must stay in release' }
$entries = [Collections.Generic.List[object]]::new()
foreach ($name in @('srb2-native-source.zip','kart-native-source.zip')) {
    $entries.Add(@{Path=(Join-Path $workspace "tmp/arcade/$name");Name="tmp/arcade/$name"})
}
$entries.Add(@{Path=(Join-Path $workspace 'tmp/equestria/luanti-5.17.0-source.zip');Name='upstream/luanti-5.17.0-source.zip'})
foreach ($name in @('Wyrda-main.zip','boss list.txt','dbj4but-11ce86bb-08c9-40ca-a316-dc57815e0cc9.png','wasm-media-encoders-0.7.0.tgz')) {
    $entries.Add(@{Path=(Join-Path $workspace "tmp/equestria/$name");Name="tmp/equestria/$name"})
}
foreach ($folder in @('engines','equestria','desktop/equestria')) {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $workspace $folder) -Recurse -File) {
        $entries.Add(@{Path=$file.FullName;Name=$file.FullName.Substring($workspace.Length+1).Replace('\','/')})
    }
}
$names = @('prepare-native.py','prepare-native-assets.py','patch-native.py','build-native.py','native-manifest.py','audit-native.py')
$names += @(Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object { $_.Name -match 'equestria|^zip-helpers|^package-' } | Select-Object -ExpandProperty Name)
$names += @('audit-pet-frames.mjs','apply-pet-frame-audit.mjs')
foreach ($name in $names) { $entries.Add(@{Path=(Join-Path $PSScriptRoot $name);Name="scripts/$name"}) }
foreach ($name in @('DESKTOP_SETUP.md','EQUESTRIA_0.3.0.md','THIRD_PARTY.md')) { $entries.Add(@{Path=(Join-Path $workspace $name);Name=$name}) }
$modsPath = if ($env:PONYHAVEN_MODS) { $env:PONYHAVEN_MODS } else { 'C:\Users\calla\Downloads\forens' }
foreach ($folder in @('pony wads','ponykart mod')) {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $modsPath $folder) -File | Where-Object { $_.Extension -in '.wad','.pk3','.txt','.md' }) {
        $entries.Add(@{Path=$file.FullName;Name="original-pony-assets/$folder/$($file.Name)"})
    }
}
$sourceArchive = Join-Path $destination ('engine-sources.'+[guid]::NewGuid().ToString('N')+'.zip')
Write-VerifiedZip $sourceArchive $entries.ToArray()
Move-Item -LiteralPath $sourceArchive -Destination (Join-Path $destination 'engine-sources.zip') -Force
