using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Clarko.Helper.Api.Services;
using Clarko_API.EndPoints;
using Clarko_API.Interface;
using Clarko_API.Options;
using Clarko_API.Services;
using Microsoft.Extensions.Options;
using Refit;

const string FrontendCorsPolicy = "frontend";

var builder = WebApplication.CreateBuilder(args);

// Fail at startup, not on the first request, when the key or a setting is missing.
builder.Services.AddOptions<OpenRouterOptions>()
    .Bind(builder.Configuration.GetSection(OpenRouterOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddOptions<TokenBudgetOptions>()
    .Bind(builder.Configuration.GetSection(TokenBudgetOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

// OpenRouter speaks snake_case JSON; our own API keeps the default camelCase.
var openRouterJson = new JsonSerializerOptions(JsonSerializerDefaults.Web)
{
    PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
};

builder.Services
    .AddRefitClient<IOpenRouterApi>(new RefitSettings(new SystemTextJsonContentSerializer(openRouterJson)))
    .ConfigureHttpClient((services, client) =>
    {
        var openRouter = services.GetRequiredService<IOptions<OpenRouterOptions>>().Value;
        client.BaseAddress = new Uri(openRouter.BaseUrl);
        client.Timeout = TimeSpan.FromSeconds(openRouter.TimeoutSeconds);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", openRouter.ApiKey);
        client.DefaultRequestHeaders.Add("X-Title", openRouter.AppName);
    });

builder.Services.AddMemoryCache();
builder.Services.AddSingleton<PromptService>();
builder.Services.AddScoped<TokenBudgetControlService>();
builder.Services.AddProblemDetails();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(cors => cors.AddPolicy(FrontendCorsPolicy, policy => policy
    .WithOrigins(allowedOrigins)
    .WithMethods(HttpMethods.Get, HttpMethods.Post)
    .WithHeaders("Content-Type")));

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors(FrontendCorsPolicy);

app.MapHelperEndpoints();
app.MapBudgetEndpoints();

app.Run();
