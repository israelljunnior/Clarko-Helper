namespace Clarko.Helper.Api.OpenRouter;

// Property names are serialized as snake_case (see Program.cs) to match OpenRouter's API.

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
    UsageOptions? Usage = null);

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

public sealed record KeyInfoResponse(KeyInfo Data);

/// <summary>From GET /key. <see cref="LimitRemaining"/> is null when the key has no spending limit.</summary>
public sealed record KeyInfo(string? Label, decimal? Limit, decimal? LimitRemaining, decimal Usage, bool IsFreeTier);
