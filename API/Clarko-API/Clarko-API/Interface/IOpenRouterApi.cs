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

    /// <summary>Usage and limits of <paramref name="apiKey"/>.</summary>
    [Get("/key")]
    Task<KeyInfoResponse> GetCurrentKeyAsync(
        [Authorize("Bearer")] string apiKey,
        CancellationToken cancellationToken = default);
}
