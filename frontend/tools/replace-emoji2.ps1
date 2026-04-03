$jsDir = "C:\Users\Treasure Destination\OneDrive\Documents\docs\travel-ops\frontend\js"

$i = '<i data-lucide="'
$s = '" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>'

# Second pass: remaining emoji not caught in first pass
$map2 = @{
    [string][char]0x2B07 = "${i}arrow-down${s}"       # ⬇
    [string][char]0x2B06 = "${i}arrow-up${s}"         # ⬆
    [string][char]0x25C0 = "${i}chevron-left${s}"     # ◀
    [string][char]0x25B6 = "${i}chevron-right${s}"    # ▶
    [string][char]0x2197 = "${i}trending-up${s}"     # ↗
}

# Multi-char emoji replacements using string literals  
$replacements = @(
    @{ Find = '📉'; Replace = "${i}trending-down${s}" }
    @{ Find = '🔴'; Replace = '<span class="dot dot-danger"></span>' }
    @{ Find = '🟡'; Replace = '<span class="dot dot-warning"></span>' }
    @{ Find = '🟢'; Replace = '<span class="dot dot-success"></span>' }
    @{ Find = '🔵'; Replace = '<span class="dot dot-info"></span>' }
    @{ Find = '⚠'; Replace = "${i}alert-triangle${s}" }
    @{ Find = '→'; Replace = '<span style="font-weight:600">&rarr;</span>' }
    @{ Find = '🌙'; Replace = "${i}moon${s}" }
    @{ Find = '☀️'; Replace = "${i}sun${s}" }
    @{ Find = '☀'; Replace = "${i}sun${s}" }
    @{ Find = '💎'; Replace = "${i}diamond${s}" }
    @{ Find = '🥇'; Replace = "${i}trophy${s}" }
    @{ Find = '🥈'; Replace = "${i}medal${s}" }
    @{ Find = '🥉'; Replace = "${i}award${s}" }
    @{ Find = '⏰'; Replace = "${i}alarm-clock${s}" }
    @{ Find = '🏨'; Replace = "${i}building${s}" }
    @{ Find = '✈️'; Replace = "${i}plane${s}" }
    @{ Find = '🚗'; Replace = "${i}car${s}" }
    @{ Find = '🎟'; Replace = "${i}ticket${s}" }
    @{ Find = '🚂'; Replace = "${i}train-front${s}" }
    @{ Find = '💳'; Replace = "${i}credit-card${s}" }
    @{ Find = '🏞'; Replace = "${i}mountain-snow${s}" }
    @{ Find = '🌍'; Replace = "${i}globe${s}" }
    @{ Find = '🔐'; Replace = "${i}shield-check${s}" }
    @{ Find = '🆕'; Replace = "${i}badge-plus${s}" }
    @{ Find = '📊'; Replace = "${i}layout-dashboard${s}" }
    @{ Find = '🏖'; Replace = "${i}umbrella${s}" }
    @{ Find = '🎊'; Replace = "${i}party-popper${s}" }
    @{ Find = '💍'; Replace = "${i}heart${s}" }
    @{ Find = '📌'; Replace = "${i}pin${s}" }
    @{ Find = '🔒'; Replace = "${i}lock${s}" }
    @{ Find = '⬆'; Replace = "${i}arrow-up${s}" }
    @{ Find = '⬇'; Replace = "${i}arrow-down${s}" }
    @{ Find = '↑'; Replace = '<span style="color:var(--success);font-weight:700">&uarr;</span>' }
    @{ Find = '↓'; Replace = '<span style="color:var(--danger);font-weight:700">&darr;</span>' }
)

$totalFiles = 0
Get-ChildItem -Path $jsDir -Filter "*.js" | Where-Object { $_.Name -ne "icons.js" } | ForEach-Object {
    $content = [System.IO.File]::ReadAllText($_.FullName)
    $original = $content
    
    foreach ($r in $replacements) {
        if ($content.Contains($r.Find)) {
            $content = $content.Replace($r.Find, $r.Replace)
        }
    }
    foreach ($emoji in $map2.Keys) {
        if ($content.Contains($emoji)) {
            $content = $content.Replace($emoji, $map2[$emoji])
        }
    }
    
    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($_.FullName, $content)
        $totalFiles++
        Write-Host "Updated: $($_.Name)"
    }
}
Write-Host "`nTotal files updated: $totalFiles"
