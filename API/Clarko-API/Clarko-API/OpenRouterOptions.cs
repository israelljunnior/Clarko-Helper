using System.ComponentModel.DataAnnotations;

namespace Clarko.Helper.Api.Configuration;

public sealed class OpenRouterOptions
{
    public const string SectionName = "OpenRouter";

    [Required, Url]
    public string BaseUrl { get; init; } = "https://openrouter.ai/api/v1";

    [Required(ErrorMessage = "OpenRouter:ApiKey is missing. Add it to appsettings.json.")]
    public string ApiKey { get; init; } = string.Empty;

    public string AppName { get; init; } = "Clarko Helper";

    [Required]
    public string SuggestionModel { get; init; } = "openai/gpt-4o-mini";

    [Required]
    public string SelectionModel { get; init; } = "openai/gpt-4o";

    [Range(1, 120)]
    public int TimeoutSeconds { get; init; } = 30;
}
