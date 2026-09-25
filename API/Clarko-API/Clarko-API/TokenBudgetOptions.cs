using System.ComponentModel.DataAnnotations;

namespace Clarko.Helper.Api.Configuration;

public sealed class TokenBudgetOptions
{
    public const string SectionName = "TokenBudget";

    /// <summary>
    /// Requests are refused once the key has less than this left (USD),
    /// so the app stops before OpenRouter's hard cap instead of at it.
    /// </summary>
    [Range(typeof(decimal), "0", "100")]
    public decimal MinimumRemainingUsd { get; init; } = 0.25m;

    /// <summary>How long the remaining budget read from OpenRouter is trusted before asking again.</summary>
    [Range(1, 3600)]
    public int RefreshSeconds { get; init; } = 60;

    [Range(1, 4000)]
    public int SuggestionMaxTokens { get; init; } = 40;

    [Range(1, 4000)]
    public int SelectionMaxTokens { get; init; } = 800;
}
