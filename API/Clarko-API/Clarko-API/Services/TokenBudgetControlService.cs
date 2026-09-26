using Clarko_API.Interface;
using Clarko_API.Models;
using Clarko_API.Options;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Refit;

namespace Clarko_API.Services;

/// <summary>What the app has spent against its cap, as shown in the editor's header.</summary>
public sealed record BudgetStatus(decimal SpentUsd, decimal LimitUsd, decimal RemainingUsd, bool Exhausted);

/// <summary>
/// Keeps the app inside its own spending cap (<see cref="TokenBudgetOptions.LimitUsd"/>) and the OpenRouter
/// key's limit. Usage is read from GET /key, cached, and updated locally by each response's reported
/// cost between refreshes.
/// </summary>
public sealed class TokenBudgetControlService(
    IOpenRouterApi openRouter,
    IMemoryCache cache,
    IOptions<TokenBudgetOptions> options,
    IOptions<OpenRouterOptions> openRouterOptions,
    ILogger<TokenBudgetControlService> logger)
{
    private const string CacheKey = "openrouter:budget";
    private readonly TokenBudgetOptions _options = options.Value;

    public int SuggestionMaxTokens => _options.SuggestionMaxTokens;
    public int SelectionMaxTokens => _options.SelectionMaxTokens;

    /// <summary>The 402 the endpoints return when the budget is used up, whether we or OpenRouter noticed first.</summary>
    public static ProblemHttpResult BudgetExhausted() =>
        TypedResults.Problem(
            "The AI budget for this demo is used up, so suggestions are paused.",
            statusCode: StatusCodes.Status402PaymentRequired);

    /// <summary>True while more than the configured safety margin is left under both limits.</summary>
    public async Task<bool> HasBudgetAsync(CancellationToken cancellationToken)
    {
        // If the check itself fails we let the request through: OpenRouter still enforces the key's hard cap.
        var status = await GetStatusAsync(cancellationToken);
        return status is not { Exhausted: true };
    }

    /// <summary>Spent and remaining against the app's cap, or null when OpenRouter can't be asked right now.</summary>
    public async Task<BudgetStatus?> GetStatusAsync(CancellationToken cancellationToken)
    {
        var budget = await GetBudgetAsync(cancellationToken);
        if (budget is null) return null;

        var (spent, keyRemaining) = budget.Read();
        var underCap = Math.Max(0, _options.LimitUsd - spent);
        var remaining = keyRemaining is { } key ? Math.Min(Math.Max(0, key), underCap) : underCap;

        return new BudgetStatus(
            SpentUsd: spent,
            LimitUsd: _options.LimitUsd,
            RemainingUsd: remaining,
            Exhausted: remaining < _options.MinimumRemainingUsd);
    }

    public void RecordSpend(ChatCompletionUsage? usage)
    {
        if (usage?.Cost is not { } cost || cost <= 0) return;
        if (cache.TryGetValue(CacheKey, out BudgetSnapshot? budget)) budget?.Spend(cost);
    }

    private async Task<BudgetSnapshot?> GetBudgetAsync(CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(CacheKey, out BudgetSnapshot? cached)) return cached;

        try
        {
            var key = await openRouter.GetCurrentKeyAsync(openRouterOptions.Value.ApiKey, cancellationToken);
            var snapshot = new BudgetSnapshot(key.Data.Usage, key.Data.LimitRemaining);
            cache.Set(CacheKey, snapshot, TimeSpan.FromSeconds(_options.RefreshSeconds));

            logger.LogInformation(
                "OpenRouter budget refreshed: {Spent} USD spent of {Cap} USD, key has {Remaining} USD left",
                key.Data.Usage, _options.LimitUsd, key.Data.LimitRemaining);
            return snapshot;
        }
        catch (Exception exception) when (exception is ApiException or HttpRequestException)
        {
            logger.LogWarning(exception, "Could not read the OpenRouter key budget");
            return null;
        }
    }

    /// <summary>The key's usage and remaining limit, adjusted by each response's cost until the next refresh.</summary>
    private sealed class BudgetSnapshot(decimal spent, decimal? keyRemaining)
    {
        private readonly Lock _gate = new();
        private decimal _spent = spent;
        private decimal? _keyRemaining = keyRemaining;

        public (decimal Spent, decimal? KeyRemaining) Read()
        {
            lock (_gate) return (_spent, _keyRemaining);
        }

        public void Spend(decimal amount)
        {
            lock (_gate)
            {
                _spent += amount;
                if (_keyRemaining is { } current) _keyRemaining = current - amount;
            }
        }
    }
}
