function Remove-ClioDevCleanupResidue {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Root
    )

    $tracked = [System.Collections.Generic.List[string]]::new()
    $expandContainers = @("cache", "generations", "worktrees")

    foreach ($entry in @(Get-ChildItem -LiteralPath $Root -Force -ErrorAction SilentlyContinue)) {
        $targets = @($entry)
        if ($entry.PSIsContainer -and $entry.Name -in $expandContainers) {
            $targets = @(
                Get-ChildItem -LiteralPath $entry.FullName -Force -ErrorAction SilentlyContinue
            )
        }

        foreach ($target in $targets) {
            try {
                if ($target.PSIsContainer) {
                    Get-ChildItem `
                        -LiteralPath $target.FullName `
                        -Recurse `
                        -Force `
                        -ErrorAction SilentlyContinue |
                        ForEach-Object {
                            $_.Attributes = [System.IO.FileAttributes]::Normal
                        }
                    $target.Attributes = [System.IO.FileAttributes]::Normal
                    [System.IO.Directory]::Delete($target.FullName, $true)
                }
                else {
                    $target.Attributes = [System.IO.FileAttributes]::Normal
                    [System.IO.File]::Delete($target.FullName)
                }
            }
            catch {
                $tracked.Add($target.FullName)
            }
        }

        if ($entry.PSIsContainer -and $entry.Name -in $expandContainers) {
            $remaining = @(
                Get-ChildItem -LiteralPath $entry.FullName -Force -ErrorAction SilentlyContinue
            )
            foreach ($item in $remaining) {
                if (-not $tracked.Contains($item.FullName)) {
                    $tracked.Add($item.FullName)
                }
            }
            if ($remaining.Count -eq 0 -and (Test-Path -LiteralPath $entry.FullName)) {
                try {
                    [System.IO.Directory]::Delete($entry.FullName, $false)
                }
                catch {
                    $tracked.Add($entry.FullName)
                }
            }
        }
    }

    if ((Test-Path -LiteralPath $Root) -and
        @(Get-ChildItem -LiteralPath $Root -Force -ErrorAction SilentlyContinue).Count -eq 0) {
        try {
            [System.IO.Directory]::Delete($Root, $false)
        }
        catch {
            $tracked.Add($Root)
        }
    }

    return @($tracked | Sort-Object -Unique)
}
