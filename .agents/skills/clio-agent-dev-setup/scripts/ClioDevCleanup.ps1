# Pure decision helpers. Kept free of process/filesystem side effects (beyond a
# Test-Path probe) so tests/Test-ClioDevSetup.ps1 can exercise every branch
# without a live deployment.

<#
.SYNOPSIS
Decide what to do with a process the stop sweep found.

.DESCRIPTION
Returns one of:
  stop         - the process identity lives under the owned root, or an
                 independent signal cross-confirms a recorded PID.
  ignore-stale - the ONLY evidence is a PID recorded in dev-processes.json and
                 the running process's identity is outside the owned root, i.e.
                 the record is stale and the PID has been recycled.
  refuse       - an unowned process reached the sweep some other way; the caller
                 must fail loudly rather than kill it.

The identity check comes FIRST and CrossConfirmed must describe evidence other
than the record being acted on: a recorded PID that confirms itself would make
the stale branch unreachable and force-kill recycled PIDs.
#>
function Resolve-ClioDevProcessAction {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Identity,
        [Parameter(Mandatory)]
        [string]$OwnedRoot,
        [Parameter(Mandatory)]
        [string]$Reason,
        [switch]$CrossConfirmed
    )

    # IndexOf, not Contains: the (string, StringComparison) Contains overload is
    # .NET Core only and throws on Windows PowerShell 5.1.
    if ($Identity.IndexOf($OwnedRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        return "stop"
    }
    if ($CrossConfirmed) {
        return "stop"
    }
    if ($Reason.StartsWith("recorded ", [System.StringComparison]::OrdinalIgnoreCase)) {
        return "ignore-stale"
    }
    return "refuse"
}

<#
.SYNOPSIS
Report whether a path outside the owned root is provably this tooling's residue.

.DESCRIPTION
Ownership is proven by an artifact THIS tooling writes, never by the directory's
name: a directory called `D:\tmp` is an ordinary scratch directory until it
carries the generation state Start-ClioDev.ps1 creates. Anything else is
unrelated residue to record, not a stale CLIO root to delete.
#>
function Test-ClioDevOwnedResidue {
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $false
    }

    foreach ($marker in @(
        "config\active-generation.json",
        "runtime\clio-agent-dev\dev-processes.json",
        "config\cleanup-residue.json"
    )) {
        if (Test-Path -LiteralPath (Join-Path $Path $marker) -PathType Leaf) {
            return $true
        }
    }
    return $false
}

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
