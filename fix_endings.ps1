$f = 'c:\dev\Projects\SeeNotes\uni\style.css'
$bytes = [System.IO.File]::ReadAllBytes($f)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$text = $text.Replace("`r`n", "`n").Replace("`n", "`r`n")
[System.IO.File]::WriteAllBytes($f, [System.Text.Encoding]::UTF8.GetBytes($text))
Write-Host "Done"
