param(
    [Parameter(Mandatory=$true)]
    [string]$InputFile,

    [Parameter(Mandatory=$true)]
    [string]$OutputFile
)

if (-not (Test-Path $InputFile)) {
    Write-Error "Входният файл '$InputFile' не съществува."
    exit
}

$reader = [System.IO.StreamReader]::new($InputFile, [System.Text.Encoding]::UTF8)
$writer = [System.IO.StreamWriter]::new($OutputFile, $false, [System.Text.Encoding]::UTF8)

$inFunction = $false
$braceCount = 0

while (-not $reader.EndOfStream) {
    $line = $reader.ReadLine()

    if (-not $inFunction) {
        if ($line -match "^\s*function\b") {
            $inFunction = $true
            $braceCount = 0
            $writer.WriteLine($line)
        } else {
            $writer.WriteLine($line)
        }
    } else {
        $braceCount += ($line -split "{").Count - 1
        $braceCount -= ($line -split "}").Count - 1

        if ($line.Trim().Length -gt 0) {
            $writer.WriteLine($line)
        }

        if ($braceCount -le 0 -and $line -match "}\s*$") {
            $inFunction = $false
        }
    }
}

$reader.Close()
$writer.Close()
