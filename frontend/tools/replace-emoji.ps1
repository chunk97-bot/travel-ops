$jsDir = "C:\Users\Treasure Destination\OneDrive\Documents\docs\travel-ops\frontend\js"

$i = '<i data-lucide="'
$s = '" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>'

$map = @{}
$map[[char]::ConvertFromUtf32(0x1F4CA)] = "${i}layout-dashboard${s}"
$map[[char]::ConvertFromUtf32(0x1F3AF)] = "${i}target${s}"
$map[[char]::ConvertFromUtf32(0x1F465)] = "${i}users${s}"
$map[[char]::ConvertFromUtf32(0x1F5FA)] = "${i}map${s}"
$map[[char]::ConvertFromUtf32(0x1F4E6)] = "${i}package${s}"
$map[[char]::ConvertFromUtf32(0x1F91D)] = "${i}handshake${s}"
$map[[char]::ConvertFromUtf32(0x1F9FE)] = "${i}file-text${s}"
$map[[char]::ConvertFromUtf32(0x1F514)] = "${i}bell${s}"
$map[[char]::ConvertFromUtf32(0x1F4CB)] = "${i}clipboard-list${s}"
$map[[char]::ConvertFromUtf32(0x1F5D3)] = "${i}calendar-check${s}"
$map[[char]::ConvertFromUtf32(0x274C)]  = "${i}x-circle${s}"
$map[[char]::ConvertFromUtf32(0x1F4B8)] = "${i}wallet${s}"
$map[[char]::ConvertFromUtf32(0x1F4BC)] = "${i}briefcase${s}"
$map[[char]::ConvertFromUtf32(0x1F4D2)] = "${i}book-open${s}"
$map[[char]::ConvertFromUtf32(0x1F3DB)] = "${i}landmark${s}"
$map[[char]::ConvertFromUtf32(0x1F464)] = "${i}user${s}"
$map[[char]::ConvertFromUtf32(0x2709)]  = "${i}mail${s}"
$map[[char]::ConvertFromUtf32(0x1F4E2)] = "${i}megaphone${s}"
$map[[char]::ConvertFromUtf32(0x2705)]  = "${i}check-circle${s}"
$map[[char]::ConvertFromUtf32(0x1F4C1)] = "${i}folder${s}"
$map[[char]::ConvertFromUtf32(0x1F4C8)] = "${i}bar-chart-3${s}"
$map[[char]::ConvertFromUtf32(0x2699)]  = "${i}settings${s}"
$map[[char]::ConvertFromUtf32(0x2708)]  = "${i}plane${s}"
$map[[char]::ConvertFromUtf32(0x1F4B0)] = "${i}indian-rupee${s}"
$map[[char]::ConvertFromUtf32(0x1F4C5)] = "${i}calendar${s}"
$map[[char]::ConvertFromUtf32(0x1F382)] = "${i}cake${s}"
$map[[char]::ConvertFromUtf32(0x2B50)]  = "${i}star${s}"
$map[[char]::ConvertFromUtf32(0x1F4E5)] = "${i}download${s}"
$map[[char]::ConvertFromUtf32(0x1F4DE)] = "${i}phone${s}"
$map[[char]::ConvertFromUtf32(0x1F4E7)] = "${i}mail-open${s}"
$map[[char]::ConvertFromUtf32(0x1F4AC)] = "${i}message-circle${s}"
$map[[char]::ConvertFromUtf32(0x270F)]  = "${i}pencil${s}"
$map[[char]::ConvertFromUtf32(0x1F5D1)] = "${i}trash-2${s}"
$map[[char]::ConvertFromUtf32(0x23F1)]  = "${i}timer${s}"
$map[[char]::ConvertFromUtf32(0x26A1)]  = "${i}zap${s}"
$map[[char]::ConvertFromUtf32(0x1F5BC)] = "${i}image${s}"
$map[[char]::ConvertFromUtf32(0x1F4CD)] = "${i}map-pin${s}"
$map[[char]::ConvertFromUtf32(0x1F441)] = "${i}eye${s}"
$map[[char]::ConvertFromUtf32(0x1F504)] = "${i}refresh-cw${s}"
$map[[char]::ConvertFromUtf32(0x1F4DD)] = "${i}file-edit${s}"
$map[[char]::ConvertFromUtf32(0x1F3C6)] = "${i}trophy${s}"
$map[[char]::ConvertFromUtf32(0x1F3C5)] = "${i}award${s}"
$map[[char]::ConvertFromUtf32(0x1F31F)] = "${i}sparkles${s}"
$map[[char]::ConvertFromUtf32(0x1F4E4)] = "${i}upload${s}"
$map[[char]::ConvertFromUtf32(0x1F389)] = "${i}party-popper${s}"
$map[[char]::ConvertFromUtf32(0x1F381)] = "${i}gift${s}"
$map[[char]::ConvertFromUtf32(0x1F5A8)] = "${i}printer${s}"
$map[[char]::ConvertFromUtf32(0x1F517)] = "${i}link${s}"
$map[[char]::ConvertFromUtf32(0x1F4CE)] = "${i}paperclip${s}"
$map[[char]::ConvertFromUtf32(0x1F3F7)] = "${i}tag${s}"
$map[[char]::ConvertFromUtf32(0x1F4C4)] = "${i}file${s}"
$map[[char]::ConvertFromUtf32(0x1F50D)] = "${i}search${s}"

$totalFiles = 0
Get-ChildItem -Path $jsDir -Filter "*.js" | Where-Object { $_.Name -ne "icons.js" } | ForEach-Object {
    $content = [System.IO.File]::ReadAllText($_.FullName)
    $original = $content
    foreach ($emoji in $map.Keys) {
        if ($content.Contains($emoji)) {
            $content = $content.Replace($emoji, $map[$emoji])
        }
    }
    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($_.FullName, $content)
        $totalFiles++
        Write-Host "Updated: $($_.Name)"
    }
}
Write-Host "`nTotal files updated: $totalFiles"
