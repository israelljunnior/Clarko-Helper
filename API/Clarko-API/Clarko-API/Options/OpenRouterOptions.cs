using System.ComponentModel.DataAnnotations;

namespace Clarko_API.Options;

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

/// <summary>Sampling presets for OpenRouter requests. Use <see cref="TemperatureExtensions.ToValue"/> to get the number sent to the model.</summary>
public enum Temperature
{
    /// <summary>Focused, repeatable output (0.3).</summary>
    Deterministic,

    /// <summary>More varied, inventive output (0.7).</summary>
    Creative,
}

public static class TemperatureExtensions
{
    public static double ToValue(this Temperature temperature) => temperature switch
    {
        Temperature.Deterministic => 0.3,
        Temperature.Creative => 0.7,
        _ => throw new ArgumentOutOfRangeException(nameof(temperature), temperature, null),
    };
}
