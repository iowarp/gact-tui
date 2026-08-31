function Clear-ClioDevReadOnlyAttributes {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    foreach ($item in @(Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue)) {
        if (-not $item.PSIsContainer -and $item.IsReadOnly) {
            $item.IsReadOnly = $false
        }
    }

    $root = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($null -ne $root -and -not $root.PSIsContainer -and $root.IsReadOnly) {
        $root.IsReadOnly = $false
    }
}

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
                Clear-ClioDevReadOnlyAttributes -Path $target.FullName
                if ($target.PSIsContainer) {
                    [System.IO.Directory]::Delete($target.FullName, $true)
                }
                else {
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
