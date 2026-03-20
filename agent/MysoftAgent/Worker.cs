using Microsoft.Extensions.Options;
using MysoftAgent.Models;

namespace MysoftAgent;

/// <summary>
/// Main hosted service.
/// On startup, fetches the tenant configuration from the platform and starts
/// a WatcherService for each enabled local_folder watcher config.
/// Sends a heartbeat every 5 minutes and refreshes config every 10 minutes.
/// </summary>
public sealed class Worker : BackgroundService
{
    private static readonly TimeSpan HeartbeatInterval = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan ConfigRefreshInterval = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan StartupRetryDelay = TimeSpan.FromSeconds(30);

    private readonly ApiClient _apiClient;
    private readonly IOptions<AgentOptions> _options;
    private readonly ILogger<Worker> _logger;
    private readonly ILoggerFactory _loggerFactory;

    private readonly Dictionary<string, WatcherService> _activeWatchers = new();
    private DateTimeOffset _lastConfigRefresh = DateTimeOffset.MinValue;
    private DateTimeOffset _lastHeartbeat = DateTimeOffset.MinValue;

    public Worker(
        ApiClient apiClient,
        IOptions<AgentOptions> options,
        ILogger<Worker> logger,
        ILoggerFactory loggerFactory)
    {
        _apiClient = apiClient;
        _options = options;
        _logger = logger;
        _loggerFactory = loggerFactory;
    }

    // -----------------------------------------------------------------------
    // BackgroundService implementation
    // -----------------------------------------------------------------------

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Mysoft Integration Agent starting (api={ApiBaseUrl})",
            _options.Value.ApiBaseUrl);

        // Retry until we can reach the platform at startup
        ConfigResponse? config = null;
        while (!stoppingToken.IsCancellationRequested && config is null)
        {
            config = await _apiClient.GetConfigAsync(stoppingToken).ConfigureAwait(false);
            if (config is null)
            {
                _logger.LogWarning(
                    "Could not fetch config from platform — retrying in {Delay}s",
                    StartupRetryDelay.TotalSeconds);
                await Task.Delay(StartupRetryDelay, stoppingToken).ConfigureAwait(false);
            }
        }

        if (config is not null)
        {
            ApplyConfig(config, stoppingToken);
            _lastConfigRefresh = DateTimeOffset.UtcNow;
        }

        // Main loop
        while (!stoppingToken.IsCancellationRequested)
        {
            var now = DateTimeOffset.UtcNow;

            // Heartbeat
            if (now - _lastHeartbeat >= HeartbeatInterval)
            {
                await SendHeartbeatAsync(stoppingToken).ConfigureAwait(false);
                _lastHeartbeat = now;
            }

            // Config refresh
            if (now - _lastConfigRefresh >= ConfigRefreshInterval)
            {
                await RefreshConfigAsync(stoppingToken).ConfigureAwait(false);
                _lastConfigRefresh = now;
            }

            // Sleep 30 s between loop iterations to avoid a tight spin
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken).ConfigureAwait(false);
        }

        // Graceful shutdown
        _logger.LogInformation("Mysoft Integration Agent stopping — shutting down watchers");
        StopAllWatchers();
    }

    // -----------------------------------------------------------------------
    // Config management
    // -----------------------------------------------------------------------

    private async Task RefreshConfigAsync(CancellationToken ct)
    {
        _logger.LogInformation("Refreshing config from platform...");
        var config = await _apiClient.GetConfigAsync(ct).ConfigureAwait(false);
        if (config is null)
        {
            _logger.LogWarning("Config refresh failed — retaining existing watchers");
            return;
        }

        ApplyConfig(config, ct);
        _logger.LogInformation("Config refreshed — {Count} watcher(s) active", _activeWatchers.Count);
    }

    /// <summary>
    /// Diffs the new config against currently running watchers and starts/stops as needed.
    /// Only local_folder watchers are handled by the agent.
    /// </summary>
    private void ApplyConfig(ConfigResponse config, CancellationToken ct)
    {
        var newWatchers = config.Watchers
            .Where(w => w.Enabled && w.SourceType == "local_folder")
            .ToDictionary(w => w.Id);

        // Stop watchers that are no longer in config or disabled
        var toStop = _activeWatchers.Keys.Except(newWatchers.Keys).ToList();
        foreach (var id in toStop)
        {
            _logger.LogInformation("Stopping watcher {WatcherId}", id);
            _activeWatchers[id].Stop();
            _activeWatchers[id].Dispose();
            _activeWatchers.Remove(id);
        }

        // Start new watchers
        foreach (var (id, watcherConfig) in newWatchers)
        {
            if (_activeWatchers.ContainsKey(id)) continue;

            var watcherLogger = _loggerFactory.CreateLogger<WatcherService>();
            var svc = new WatcherService(watcherConfig, _apiClient, watcherLogger);
            svc.Start(ct);

            if (svc.IsRunning)
                _activeWatchers[id] = svc;
        }
    }

    private void StopAllWatchers()
    {
        foreach (var svc in _activeWatchers.Values)
        {
            svc.Stop();
            svc.Dispose();
        }
        _activeWatchers.Clear();
    }

    // -----------------------------------------------------------------------
    // Heartbeat
    // -----------------------------------------------------------------------

    private async Task SendHeartbeatAsync(CancellationToken ct)
    {
        var activeIds = _activeWatchers.Keys.ToArray();
        _logger.LogDebug("Sending heartbeat ({Count} active watcher(s))", activeIds.Length);
        await _apiClient.SendHeartbeatAsync(activeIds, ct).ConfigureAwait(false);
    }

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------

    public override void Dispose()
    {
        StopAllWatchers();
        base.Dispose();
    }
}
