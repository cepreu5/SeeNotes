param(
    [string]$InputFile,
    [string]$OutputFile
)

# Четем всички редове от входния файл
$lines = Get-Content -Path $InputFile

# Списък за резултата
$result = @()

# Флаг дали сме вътре във функция
$inFunction = $false
# Брояч за отварящи/затварящи скоби
$braceCount = 0

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]

    if (-not $inFunction) {
        # Проверяваме дали редът съдържа "function"
        if ($line -match '^\s*function\b') {
            $inFunction = $true
            $braceCount = 0
            $result += $line
        } else {
            $result += $line
        }
    } else {
        # Вече сме вътре във функция
        # Броим скобите
        $braceCount += ($line -split '{').Count - 1
        $braceCount -= ($line -split '}').Count - 1

        # Ако редът е празен, го пропускаме
        if ($line.Trim().Length -gt 0) {
            $result += $line
        }

        # Проверяваме дали сме излезли от функцията
        if ($braceCount -le 0 -and $line -match '}\s*$') {
            $inFunction = $false
        }
    }
}

# Записваме резултата в изходния файл
$result | Set-Content -Path $OutputFile -Encoding UTF8
