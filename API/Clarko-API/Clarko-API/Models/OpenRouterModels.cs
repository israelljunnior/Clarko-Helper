using System.Text.Json;
using System.Text.Json.Serialization;

namespace Clarko_API.Models;

/// <summary>OpenRouter speaks snake_case JSON; our own API keeps the default camelCase.</summary>
public static class OpenRouterJson
{
    public static JsonSerializerOptions Options { get; } = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}

public sealed record ChatMessage(string Role, string Content)
{
    public static ChatMessage FromSystem(string content) => new("system", content);
    public static ChatMessage FromUser(string content) => new("user", content);
    public static ChatMessage FromAssistant(string content) => new("assistant", content);
}

public sealed record ChatCompletionRequest(
    string Model,
    IReadOnlyList<ChatMessage> Messages,
    double? Temperature = null,
    int? MaxTokens = null,
    ResponseFormat? ResponseFormat = null,
    UsageOptions? Usage = null,
    bool? Stream = null,
    int? Seed = null);

public sealed record ResponseFormat(string Type)
{
    public static ResponseFormat JsonObject { get; } = new("json_object");
}

/// <summary>Asks OpenRouter to include the request cost in the response.</summary>
public sealed record UsageOptions(bool Include)
{
    public static UsageOptions Included { get; } = new(true);
}

public sealed record ChatCompletionResponse(
    string Id,
    string? Provider,
    string Model,
    IReadOnlyList<ChatCompletionChoice> Choices,
    ChatCompletionUsage? Usage)
{
    public string? FirstContent => Choices.Count > 0 ? Choices[0].Message.Content : null;
}

public sealed record ChatCompletionChoice(int Index, string? FinishReason, ChatCompletionMessage Message);

public sealed record ChatCompletionMessage(string Role, string? Content);

public sealed record ChatCompletionUsage(int PromptTokens, int CompletionTokens, int TotalTokens, decimal? Cost);

/// <summary>
/// One server-sent event of a streamed completion: a piece of the answer in <see cref="ChatCompletionChunkChoice.Delta"/>,
/// the usage (with cost) in the last one, or an <see cref="Error"/> if the provider fails mid-stream.
/// </summary>
public sealed record ChatCompletionChunk(
    IReadOnlyList<ChatCompletionChunkChoice>? Choices,
    ChatCompletionUsage? Usage,
    OpenRouterError? Error);

public sealed record ChatCompletionChunkChoice(int Index, ChatCompletionDelta? Delta, string? FinishReason);

public sealed record ChatCompletionDelta(string? Content);

public sealed record OpenRouterError(int? Code, string? Message);

public sealed record KeyInfoResponse(KeyInfo Data);

/// <summary>From GET /key. <see cref="LimitRemaining"/> is null when the key has no spending limit.</summary>
public sealed record KeyInfo(string? Label, decimal? Limit, decimal? LimitRemaining, decimal Usage, bool IsFreeTier);
