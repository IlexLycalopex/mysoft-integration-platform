using System.Security.Cryptography;
using MysoftAgent.Models;

namespace MysoftAgent;

/// <summary>
/// Watches a local folder for new files matching a pattern.
/// Uses FileSystemWatcher for real-time detection with a periodic polling
/// fallback to catch files that may have been missed during downtime.
/// </summary>
public sealed class WatcherService : IDisposable
{
    private readonly WatcherConfig _config;
    private readonly ApiClient _apiClient;
    private readonly ILogger<WatcherService> _logger;
    private readonly SemaphoreSlim _processingLock = new(1, 1);

    private FileSystemWatcher? _fsw;
    private Timer? _pollTimer;
    private bool _disposed;

    // Track files currently being processed to avoid double-processing
    // when both FSW event and poll timer fire for the same file.
    private readonly HashSet<string> _inProgress = new(StringComparer.OrdinalIgnoreCase);

    public string WatcherId => _config.Id;
    public bool IsRunning { get; private set; }

    public WatcherService(
        WatcherConfig config,
        ApiClient apiClient,
        ILogger<WatcherService> logger)
    {
        _config = config;
        _apiClient = apiClient;
        _logger = logger;
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    public void Start(CancellationToken ct)
    {
        if (_config.FolderPath is null || !Directory.Exists(_config.FolderPath))
        {
            _logger.LogError(
                "Watcher '{Name}': folder path '{Path}' does not exist — skipping",
                _config.Name, _config.FolderPath);
            return;
        }

        _logger.LogInformation(
            "Watcher '{Name}': starting on '{Path}' (pattern={Pattern})",
            _config.Name, _config.FolderPath, _config.FilePattern);

        // FileSystemWatcher for near-real-time detection
        _fsw = new FileSystemWatcher(_config.FolderPath)
        {
            Filter = _config.FilePattern,
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
            EnableRaisingEvents = true,
        };

        _fsw.Created += (_, e) => _ = HandleFileEventAsync(e.FullPath, ct);
        _fsw.Renamed += (_, e) => _ = HandleFileEventAsync(e.FullPath, ct);
        _fsw.Error += (_, e) =>
            _logger.LogWarning(e.GetException(), "Watcher '{Name}': FileSystemWatcher error", _config.Name);

        // Polling fallback — default poll_interval is 300 s (5 minutes)
        var interval = TimeSpan.FromSeconds(Math.Max(_config.PollInterval, 30));
        _pollTimer = new Timer(
            async _ => await PollFolderAsync(_config.FolderPath, ct),
            null,
            interval,  // first run after one interval (FSW handles immediate detection)
            interval);

        // Run an initial poll immediately to pick up files present at startup
        _ = PollFolderAsync(_config.FolderPath, ct);

        IsRunning = true;
    }

    public void Stop()
    {
        _fsw?.Dispose();
        _fsw = null;
        _pollTimer?.Dispose();
        _pollTimer = null;
        IsRunning = false;
        _logger.LogInformation("Watcher '{Name}': stopped", _config.Name);
    }

    // -----------------------------------------------------------------------
    // File event handlers
    // -----------------------------------------------------------------------

    private async Task HandleFileEventAsync(string fullPath, CancellationToken ct)
    {
        var filename = Path.GetFileName(fullPath);
        if (!await WaitForFileReadyAsync(fullPath, ct).ConfigureAwait(false))
        {
            _logger.LogWarning("Watcher '{Name}': file '{File}' not ready after 60s — skipping", _config.Name, filename);
            return;
        }
        await ProcessFileIfEligibleAsync(fullPath, ct).ConfigureAwait(false);
    }

    /// <summary>
    /// Waits until the file can be opened exclusively, indicating the writing process has finished.
    /// Retries with increasing delays up to ~60 seconds total.
    /// </summary>
    private static async Task<bool> WaitForFileReadyAsync(string filePath, CancellationToken ct)
    {
        int[] delays = [500, 1000, 2000, 3000, 5000, 8000, 10000, 15000, 15000]; // ~60s total
        for (int i = 0; i < delays.Length; i++)
        {
            try
            {
                // Try to open exclusively — if another process is still writing, this throws IOException
                await using var fs = new FileStream(
                    filePath,
                    FileMode.Open,
                    FileAccess.Read,
                    FileShare.None,
                    bufferSize: 1,
                    useAsync: true);
                return true; // File is readable and not locked
            }
            catch (IOException) when (i < delays.Length - 1)
            {
                await Task.Delay(delays[i], ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return false;
            }
            catch (Exception)
            {
                return false; // File gone or permission error
            }
        }
        return false; // Timed out
    }

    private async Task PollFolderAsync(string folderPath, CancellationToken ct)
    {
        try
        {
            var files = Directory.GetFiles(folderPath, _config.FilePattern);
            foreach (var file in files)
            {
                if (ct.IsCancellationRequested) break;
                await ProcessFileIfEligibleAsync(file, ct).ConfigureAwait(false);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Watcher '{Name}': error during folder poll", _config.Name);
        }
    }

    private async Task ProcessFileIfEligibleAsync(string fullPath, CancellationToken ct)
    {
        if (ct.IsCancellationRequested) return;
        if (!File.Exists(fullPath)) return;

        await _processingLock.WaitAsync(ct).ConfigureAwait(false);
        bool added = false;
        try
        {
            if (_inProgress.Contains(fullPath)) return;
            _inProgress.Add(fullPath);
            added = true;
        }
        finally
        {
            _processingLock.Release();
        }

        try
        {
            await ProcessFileAsync(fullPath, ct).ConfigureAwait(false);
        }
        finally
        {
            await _processingLock.WaitAsync(ct).ConfigureAwait(false);
            try { if (added) _inProgress.Remove(fullPath); }
            finally { _processingLock.Release(); }
        }
    }

    // -----------------------------------------------------------------------
    // Core processing logic
    // -----------------------------------------------------------------------

    private async Task ProcessFileAsync(string fullPath, CancellationToken ct)
    {
        var filename = Path.GetFileName(fullPath);
        _logger.LogInformation("Watcher '{Name}': detected file '{File}'", _config.Name, filename);

        // Compute SHA-256
        string sha256;
        try
        {
            sha256 = await ComputeSha256Async(fullPath, ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Watcher '{Name}': failed to hash '{File}'", _config.Name, filename);
            return;
        }

        _logger.LogDebug("Watcher '{Name}': sha256={Sha256} for '{File}'", _config.Name, sha256, filename);

        // Check for duplicate
        var checkResult = await _apiClient.CheckFileAsync(sha256, filename, ct).ConfigureAwait(false);
        if (checkResult is null)
        {
            _logger.LogWarning(
                "Watcher '{Name}': could not check duplicate for '{File}' — skipping to avoid data loss",
                _config.Name, filename);
            return;
        }

        if (checkResult.IsDuplicate)
        {
            _logger.LogInformation(
                "Watcher '{Name}': '{File}' is a duplicate (existing job {JobId}) — archiving without upload",
                _config.Name, filename, checkResult.ExistingJobId);
            await ArchiveFileAsync(fullPath, ct).ConfigureAwait(false);
            return;
        }

        // Upload to platform
        _logger.LogInformation("Watcher '{Name}': uploading '{File}'...", _config.Name, filename);
        var ingestResult = await _apiClient.UploadFileAsync(
            fullPath,
            sha256,
            _config.Id,
            _config.MappingId,
            _config.AutoProcess,
            ct).ConfigureAwait(false);

        if (ingestResult is null || !ingestResult.Success)
        {
            _logger.LogError(
                "Watcher '{Name}': upload failed for '{File}' — {Error}",
                _config.Name, filename, ingestResult?.Error ?? "no response");
            return;  // Leave file in place so it will be retried on next poll
        }

        _logger.LogInformation(
            "Watcher '{Name}': uploaded '{File}' — job {JobId}",
            _config.Name, filename, ingestResult.JobId);

        // Archive the file
        await ArchiveFileAsync(fullPath, ct).ConfigureAwait(false);
    }

    // -----------------------------------------------------------------------
    // Archiving
    // -----------------------------------------------------------------------

    private async Task ArchiveFileAsync(string fullPath, CancellationToken ct)
    {
        var filename = Path.GetFileName(fullPath);

        try
        {
            switch (_config.ArchiveAction.ToLower())
            {
                case "delete":
                    File.Delete(fullPath);
                    _logger.LogInformation("Watcher '{Name}': deleted '{File}'", _config.Name, filename);
                    break;

                case "move":
                    var archiveDir = _config.ArchiveFolder
                        ?? Path.Combine(Path.GetDirectoryName(fullPath)!, "processed");

                    Directory.CreateDirectory(archiveDir);

                    // Avoid collisions by appending a timestamp if a file with the same name exists
                    var destPath = Path.Combine(archiveDir, filename);
                    if (File.Exists(destPath))
                    {
                        var ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                        var nameWithoutExt = Path.GetFileNameWithoutExtension(filename);
                        var ext = Path.GetExtension(filename);
                        destPath = Path.Combine(archiveDir, $"{nameWithoutExt}_{ts}{ext}");
                    }

                    File.Move(fullPath, destPath);
                    _logger.LogInformation(
                        "Watcher '{Name}': moved '{File}' → '{Dest}'",
                        _config.Name, filename, destPath);
                    break;

                case "leave":
                default:
                    _logger.LogDebug(
                        "Watcher '{Name}': leave action — '{File}' not moved",
                        _config.Name, filename);
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Watcher '{Name}': failed to archive '{File}'", _config.Name, filename);
        }

        await Task.CompletedTask.ConfigureAwait(false);
    }

    // -----------------------------------------------------------------------
    // SHA-256 helper
    // -----------------------------------------------------------------------

    private static async Task<string> ComputeSha256Async(string filePath, CancellationToken ct)
    {
        await using var stream = new FileStream(
            filePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.ReadWrite,
            bufferSize: 81920,
            useAsync: true);

        var hash = await SHA256.HashDataAsync(stream, ct).ConfigureAwait(false);
        return Convert.ToHexString(hash).ToLower();
    }

    // -----------------------------------------------------------------------
    // IDisposable
    // -----------------------------------------------------------------------

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Stop();
        _processingLock.Dispose();
    }
}

// ---------------------------------------------------------------------------
// AgentOptions — bound from appsettings.json "MysoftAgent" section
// ---------------------------------------------------------------------------

public sealed class AgentOptions
{
    public string ApiBaseUrl { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string LogPath { get; set; } = @"C:\ProgramData\MysoftAgent\logs";
}
