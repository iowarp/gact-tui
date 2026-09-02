# HTTP helper shared by the scripts that must read an error response body.
#
# `Invoke-WebRequest -SkipHttpErrorCheck` is PowerShell 7 only, while the rest of
# this skill is deliberately Windows PowerShell 5.1-safe (see the IndexOf note in
# ClioDevCleanup.ps1) and `pwsh` is not on PATH on the deployment box. Under 5.1
# the parameter never binds, so the call throws before it reaches the network and
# a readiness poll that swallows the error reports a service that never became
# ready -- a 600-second wait blaming Docling for a shell incompatibility.
#
# One helper, one response shape, both shells: an HTTP error status is data, and
# only a genuine transport failure (refused connection, timeout, DNS) throws.

<#
.SYNOPSIS
Perform an HTTP request that treats a 4xx/5xx status as data, not an error.

.OUTPUTS
A PSCustomObject with StatusCode (int) and Content (string).
#>
function Invoke-ClioDevWebRequest {
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory)]
        [string]$Uri,
        [ValidateSet("Get", "Post", "Put", "Patch", "Delete", "Head", "Options")]
        [string]$Method = "Get",
        [ValidateRange(1, 3600)]
        [int]$TimeoutSec = 10
    )

    try {
        $response = Invoke-WebRequest `
            -Uri $Uri `
            -Method $Method `
            -TimeoutSec $TimeoutSec `
            -UseBasicParsing
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Content = [string]$response.Content
        }
    }
    catch {
        $errorResponse = $_.Exception.Response
        if ($null -eq $errorResponse) {
            # No response reached us at all, so there is no status to report.
            # Refusals, timeouts and name-resolution failures must keep throwing;
            # a caller polling for readiness distinguishes them from a served 503.
            throw
        }
        return [pscustomobject]@{
            StatusCode = [int]$errorResponse.StatusCode
            Content = Get-ClioDevErrorBody -ErrorRecord $_
        }
    }
}

<#
.SYNOPSIS
Recover the response body carried by a failed web request on either shell.

.DESCRIPTION
PowerShell 7 attaches the body to ErrorDetails and has already drained the
stream. Windows PowerShell 5.1 populates ErrorDetails only sometimes, and leaves
the HttpWebResponse stream readable when it does not. An unreadable body is
reported as an empty string: the status code is the part callers decide on.
#>
function Get-ClioDevErrorBody {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)]
        [System.Management.Automation.ErrorRecord]$ErrorRecord
    )

    $details = [string]$ErrorRecord.ErrorDetails.Message
    if (-not [string]::IsNullOrEmpty($details)) {
        return $details
    }

    $response = $ErrorRecord.Exception.Response
    if ($response -isnot [System.Net.HttpWebResponse]) {
        return ""
    }
    $reader = $null
    try {
        $stream = $response.GetResponseStream()
        if ($null -eq $stream) {
            return ""
        }
        $reader = New-Object System.IO.StreamReader($stream)
        return $reader.ReadToEnd()
    }
    catch {
        return ""
    }
    finally {
        if ($null -ne $reader) {
            $reader.Dispose()
        }
    }
}
