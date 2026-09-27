using Clarko_API.Models;
using Refit;

namespace Clarko_API.Interface;

/// <summary>
/// The two OpenRouter endpoints this app needs. The base address comes from Program.cs; each call takes
/// the API key to use, sent as "Authorization: Bearer {apiKey}" (it takes precedence over the client's
/// default header from Program.cs).
/// </summary>
public interface IOpenRouterApi
{
    [Post("/chat/completions")]
    Task<ChatCompletionResponse> CreateChatCompletionAsync(
        [Body] ChatCompletionRequest request,
        [Authorize("Bearer")] string apiKey,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// A completion with "stream": true. Returned as the raw response so the server-sent events can be read
    /// as they arrive (Refit hands it over after the headers); the caller checks the status and disposes it.
    /// </summary>
    [Post("/chat/completions")]
    Task<HttpResponseMessage> StreamChatCompletionAsync(
        [Body] ChatCompletionRequest request,
        [Authorize("Bearer")] string apiKey,
        CancellationToken cancellationToken = default);

    /// <summary>Usage and limits of <paramref name="apiKey"/>.</summary>
    [Get("/key")]
    Task<KeyInfoResponse> GetCurrentKeyAsync(
        [Authorize("Bearer")] string apiKey,
        CancellationToken cancellationToken = default);
}
