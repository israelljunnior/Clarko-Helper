using Clarko_API.Models;
using Refit;

namespace Clarko_API.Interface;

/// <summary>The two OpenRouter endpoints this app needs. Base address and auth come from Program.cs.</summary>
public interface IOpenRouterApi
{
    [Post("/chat/completions")]
    Task<ChatCompletionResponse> CreateChatCompletionAsync(
        [Body] ChatCompletionRequest request,
        CancellationToken cancellationToken = default);

    [Get("/key")]
    Task<KeyInfoResponse> GetCurrentKeyAsync(CancellationToken cancellationToken = default);
}
