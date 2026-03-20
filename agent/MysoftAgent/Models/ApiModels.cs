namespace MysoftAgent.Models;

// ---------------------------------------------------------------------------
// Request / response DTOs for the Mysoft Integration Platform /api/v1/ routes.
// ---------------------------------------------------------------------------

/// <summary>Response from GET /api/v1/config.</summary>
public sealed class ConfigResponse
{
    public string TenantId { get; init; } = string.Empty;
    public string TenantName { get; init; } = string.Empty;
    public WatcherConfig[] Watchers { get; init; } = [];
}

/// <summary>Request body for POST /api/v1/check.</summary>
public sealed class CheckFileRequest
{
    public string Sha256 { get; init; } = string.Empty;
    public string Filename { get; init; } = string.Empty;
}

/// <summary>Response from POST /api/v1/check.</summary>
public sealed class CheckFileResponse
{
    /// <summary>True if the file (by SHA-256) has already been uploaded.</summary>
    public bool IsDuplicate { get; init; }

    /// <summary>Existing job ID if IsDuplicate = true.</summary>
    public string? ExistingJobId { get; init; }
}

/// <summary>Response from POST /api/v1/ingest (multipart file upload).</summary>
public sealed class IngestResponse
{
    public bool Success { get; init; }
    public string? JobId { get; init; }
    public string? Error { get; init; }
}

/// <summary>Response from GET /api/v1/jobs/{jobId}.</summary>
public sealed class JobStatusResponse
{
    public string Id { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public int ProcessedCount { get; init; }
    public int ErrorCount { get; init; }
    public string? ErrorMessage { get; init; }
    public DateTimeOffset? CompletedAt { get; init; }
}

/// <summary>Request body for POST /api/v1/heartbeat.</summary>
public sealed class HeartbeatRequest
{
    public string Version { get; init; } = string.Empty;
    public string Hostname { get; init; } = string.Empty;
    public string[] WatcherIds { get; init; } = [];
}
