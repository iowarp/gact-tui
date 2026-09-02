# Pure decision helpers. Kept free of process/filesystem side effects (beyond a
# Test-Path probe) so tests/Test-ClioDevSetup.ps1 can exercise every branch
# without a live deployment.

<#
.SYNOPSIS
Decide what to do with a process the stop sweep found.

.DESCRIPTION
Returns one of:
  stop         - the process identity lives under the owned root.
  ignore-stale - the ONLY evidence is a PID recorded in dev-processes.json and
                 the running process's identity is outside the owned root, i.e.
                 the record is stale and the PID has been recycled.
  refuse       - an unowned process reached the sweep some other way; the caller
                 must fail loudly rather than kill it.

Identity is the only thing that can authorize a kill. CrossConfirmed describes a
second, independent sighting of the same PID (a live port or generation hit on a
PID that was also recorded); it can only CONFIRM an identity that already places
the process under the owned root, never substitute for one. A cross-confirmed
process whose identity is outside the root is not a stale record -- the PID is
genuinely the listener we found -- so it is refused loudly rather than ignored,
and never killed: the recorded PID may be a node-wide daemon this tooling merely
adopted, and force-killing it takes down every other consumer on the box.
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

    # IndexOf with an explicit StringComparison, not Contains: the
    # (string, StringComparison) Contains overload is .NET Core only and throws
    # on Windows PowerShell 5.1, which is the shell this skill runs under.
    if ($Identity.IndexOf($OwnedRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        return "stop"
    }
    if ($CrossConfirmed) {
        return "refuse"
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

    # -Attributes !ReparsePoint bounds the walk: a junction or symlink inside the
    # tree (a pnpm store link, a venv, a user's own shortcut) otherwise sends the
    # recursion through its target, clearing read-only flags on files that are
    # not in this tree at all -- and, if it points at an ancestor, forever.
    foreach ($item in @(
        Get-ChildItem `
            -LiteralPath $Path `
            -Recurse `
            -Force `
            -Attributes !ReparsePoint `
            -ErrorAction SilentlyContinue
    )) {
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
                    # Same reparse-point bound as Clear-ClioDevReadOnlyAttributes,
                    # and here it also protects the link itself: writing Normal
                    # over a reparse point's attributes destroys the link.
                    Get-ChildItem `
                        -LiteralPath $target.FullName `
                        -Recurse `
                        -Force `
                        -Attributes !ReparsePoint `
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
