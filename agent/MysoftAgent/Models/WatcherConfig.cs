namespace MysoftAgent.Models;

/// <summary>
/// Represents a single file watcher configuration returned by the platform API.
/// Maps to the watcher_configs table / /api/v1/config response.
/// </summary>
public sealed class WatcherConfig
{
    public string Id { get; init; } = string.Empty;

    public string TenantId { get; init; } = string.Empty;

    public string Name { get; init; } = string.Empty;

    /// <summary>Source type — agent only processes "local_folder" configs.</summary>
    public string SourceType { get; init; } = "local_folder";

    /// <summary>Absolute path on the local filesystem to watch.</summary>
    public string? FolderPath { get; init; }

    /// <summary>Glob pattern to match files, e.g. "*.csv".</summary>
    public string FilePattern { get; init; } = "*.csv";

    /// <summary>Optional mapping ID to associate with auto-created upload jobs.</summary>
    public string? MappingId { get; init; }

    /// <summary>What to do with a file after it has been uploaded: move | delete | leave.</summary>
    public string ArchiveAction { get; init; } = "move";

    /// <summary>Destination folder when ArchiveAction = "move".</summary>
    public string? ArchiveFolder { get; init; }

    /// <summary>Whether to set auto_process = true on the created upload_job.</summary>
    public bool AutoProcess { get; init; } = true;

    /// <summary>Poll interval in seconds (used as fallback alongside FileSystemWatcher).</summary>
    public int PollInterval { get; init; } = 300;

    /// <summary>Whether this watcher is currently active.</summary>
    public bool Enabled { get; init; } = true;
}
