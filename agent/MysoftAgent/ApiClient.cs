using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Reflection;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MysoftAgent.Models;

namespace MysoftAgent;

/// <summary>
/// Typed HTTP client that wraps all /api/v1/ platform calls.
/// Registered as a transient typed client via AddHttpClient&lt;ApiClient&gt;().
/// </summary>
public sealed class ApiClient
{
    private static readonly string AgentVersion =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "1.0.0";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _http;
    private readonly AgentOptions _options;
    private readonly ILogger<ApiClient> _logger;

    public ApiClient(
        HttpClient http,
        IOptions<AgentOptions> options,
        ILogger<ApiClient> logger)
    {
        _http = http;
        _options = options.Value;
        _logger = logger;

        _http.BaseAddress = new Uri(_options.ApiBaseUrl.TrimEnd('/') + '/');
        _http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _options.ApiKey);
        _http.Timeout = TimeSpan.FromSeconds(60);
    }

    // -----------------------------------------------------------------------
    // Retry helper
    // -----------------------------------------------------------------------

    private async Task<T?> ExecuteWithRetryAsync<T>(
        Func<CancellationToken, Task<T?>> action,
        string operationName,
        CancellationToken ct,
        int maxAttempts = 3)
    {
        for (int attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                return await action(ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw; // Don't retry genuine cancellations
            }
            catch (Exception ex) when (attempt < maxAttempts)
            {
                var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt)); // 2s, 4s
                _logger.LogWarning(
                    "{Op} attempt {A}/{Max} failed ({Msg}), retrying in {Delay}s",
                    operationName, attempt, maxAttempts, ex.Message, (int)delay.TotalSeconds);
                await Task.Delay(delay, CancellationToken.None).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "{Op} failed after {Max} attempts", operationName, maxAttempts);
                return default;
            }
        }
        return default;
    }

    // -----------------------------------------------------------------------
    // Configuration
    // -----------------------------------------------------------------------

    /// <summary>
    /// Fetches the tenant configuration including all watcher configs.
    /// GET /api/v1/config
    /// </summary>
    public Task<ConfigResponse?> GetConfigAsync(CancellationToken ct = default)
    {
        return ExecuteWithRetryAsync(
            async token => await _http.GetFromJsonAsync<ConfigResponse>("config", JsonOptions, token),
            nameof(GetConfigAsync),
            ct);
    }

    // -----------------------------------------------------------------------
    // File operations
    // -----------------------------------------------------------------------

    /// <summary>
    /// Checks whether a file (identified by SHA-256) has already been uploaded.
    /// POST /api/v1/check
    /// </summary>
    public Task<CheckFileResponse?> CheckFileAsync(
        string sha256,
        string filename,
        CancellationToken ct = default)
    {
        return ExecuteWithRetryAsync(
            async token =>
            {
                var request = new CheckFileRequest { Sha256 = sha256, Filename = filename };
                var response = await _http.PostAsJsonAsync("check", request, JsonOptions, token);
                response.EnsureSuccessStatusCode();
                return await response.Content.ReadFromJsonAsync<CheckFileResponse>(JsonOptions, token);
            },
            nameof(CheckFileAsync),
            ct);
    }

    /// <summary>
    /// Uploads a file as multipart form data and creates an upload_job.
    /// POST /api/v1/ingest
    /// </summary>
    public Task<IngestResponse?> UploadFileAsync(
        string filePath,
        string sha256,
        string watcherConfigId,
        string? mappingId,
        bool autoProcess,
        CancellationToken ct = default)
    {
        return ExecuteWithRetryAsync(
            async token =>
            {
                await using var fileStream = File.OpenRead(filePath);
                var filename = Path.GetFileName(filePath);

                using var form = new MultipartFormDataContent();
                var fileContent = new StreamContent(fileStream);
                fileContent.Headers.ContentType = new MediaTypeHeaderValue(
                    filename.EndsWith(".csv", StringComparison.OrdinalIgnoreCase)
                        ? "text/csv"
                        : "application/octet-stream");

                form.Add(fileContent, "file", filename);
                form.Add(new StringContent(filename), "filename");
                form.Add(new StringContent(sha256), "sha256");
                form.Add(new StringContent(watcherConfigId), "watcherConfigId");
                form.Add(new StringContent(autoProcess.ToString().ToLower()), "autoProcess");

                if (!string.IsNullOrEmpty(mappingId))
                    form.Add(new StringContent(mappingId), "mappingId");

                var response = await _http.PostAsync("ingest", form, token);
                response.EnsureSuccessStatusCode();
                return await response.Content.ReadFromJsonAsync<IngestResponse>(JsonOptions, token);
            },
            nameof(UploadFileAsync),
            ct);
    }

    // -----------------------------------------------------------------------
    // Job status
    // -----------------------------------------------------------------------

    /// <summary>
    /// Retrieves the current status of an upload job.
    /// GET /api/v1/jobs/{jobId}
    /// </summary>
    public async Task<JobStatusResponse?> GetJobStatusAsync(
        string jobId,
        CancellationToken ct = default)
    {
        try
        {
            return await _http.GetFromJsonAsync<JobStatusResponse>($"jobs/{Uri.EscapeDataString(jobId)}", JsonOptions, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get status for job {JobId}", jobId);
            return null;
        }
    }

    // -----------------------------------------------------------------------
    // Heartbeat
    // -----------------------------------------------------------------------

    /// <summary>
    /// Sends a heartbeat so the platform knows the agent is alive.
    /// POST /api/v1/heartbeat
    /// </summary>
    public async Task SendHeartbeatAsync(
        string[] activeWatcherIds,
        CancellationToken ct = default)
    {
        try
        {
            var request = new HeartbeatRequest
            {
                Version = AgentVersion,
                Hostname = Environment.MachineName,
                WatcherIds = activeWatcherIds,
            };

            var response = await _http.PostAsJsonAsync("heartbeat", request, JsonOptions, ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Heartbeat returned {StatusCode}", response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send heartbeat (non-fatal)");
        }
    }
}
