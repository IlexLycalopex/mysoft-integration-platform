using MysoftAgent;
using Serilog;
using Serilog.Events;

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    Log.Information("Mysoft Integration Agent starting up");

    var host = Host.CreateDefaultBuilder(args)
        .UseWindowsService(options => { options.ServiceName = "Mysoft Integration Agent"; })
        .UseSerilog((context, services, loggerConfig) =>
        {
            loggerConfig
                .ReadFrom.Configuration(context.Configuration)
                .ReadFrom.Services(services)
                .Enrich.FromLogContext();
        })
        .ConfigureServices((ctx, services) =>
        {
            services.Configure<AgentOptions>(ctx.Configuration.GetSection("MysoftAgent"));
            services.AddHttpClient<ApiClient>()
                .SetHandlerLifetime(TimeSpan.FromMinutes(5));
            services.AddHostedService<Worker>();
        })
        .Build();

    await host.RunAsync();
    return 0;
}
catch (Exception ex)
{
    Log.Fatal(ex, "Mysoft Integration Agent terminated unexpectedly");
    return 1;
}
finally
{
    await Log.CloseAndFlushAsync();
}
