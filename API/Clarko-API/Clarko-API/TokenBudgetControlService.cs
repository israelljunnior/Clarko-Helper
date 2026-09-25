using Clarko.Helper.Api.Configuration;
using Clarko.Helper.Api.OpenRouter;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Refit;

namespace Clarko.Helper.Api.Services;

/// <summary>
/// Keeps the app inside the OpenRouter key's spending limit. The remaining budget is read from
/// GET /key, cached, and reduced locally by each response's reported cost between refreshes.
/// </summary>
public sealed class TokenBudgetControlService(
    IOpenRouterApi openRouter,
    IMemoryCache cache,
    IOptions<TokenBudgetOptions> options,
    ILogger<TokenBudgetControlService> logger)
{
    private const string CacheKey = "openrouter:budget";
    private readonly TokenBudgetOptions _options = options.Value;

    public int SuggestionMaxTokens => _options.SuggestionMaxTokens;
    public int SelectionMaxTokens => _options.SelectionMaxTokens;

    /// <summary>True while the key has more than the configured safety margin left.</summary>
    public async Task<bool> HasBudgetAsync(CancellationToken cancellationToken)
    {
        var budget = await GetBudgetAsync(cancellationToken);

        // If the check itself fails we let the request through: OpenRouter still enforces the hard cap.
        if (budget is null) return true;

        return budget.Remaining is not { } remaining || remaining >= _options.MinimumRemainingUsd;
    }

    public void RecordSpend(ChatCompletionUsage? usage)
    {
        if (usage?.Cost is not { } cost || cost <= 0) return;
        if (cache.TryGetValue(CacheKey, out BudgetSnapshot? budget)) budget?.Subtract(cost);
    }

    private async Task<BudgetSnapshot?> GetBudgetAsync(CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(CacheKey, out BudgetSnapshot? cached)) return cached;

        try
        {
            var key = await openRouter.GetCurrentKeyAsync(cancellationToken);
            var snapshot = new BudgetSnapshot(key.Data.LimitRemaining);
            cache.Set(CacheKey, snapshot, TimeSpan.FromSeconds(_options.RefreshSeconds));

            logger.LogInformation("OpenRouter budget refreshed: {Remaining} USD remaining", key.Data.LimitRemaining);
            return snapshot;
        }
        catch (Exception exception) when (exception is ApiException or HttpRequestException)
        {
            logger.LogWarning(exception, "Could not read the OpenRouter key budget");
            return null;
        }
    }

    private sealed class BudgetSnapshot(decimal? remaining)
    {
        private readonly Lock _gate = new();
        private decimal? _remaining = remaining;

        public decimal? Remaining
        {
            get
            {
                lock (_gate) return _remaining;
            }
        }

        public void Subtract(decimal amount)
        {
            lock (_gate)
            {
                if (_remaining is { } current) _remaining = current - amount;
            }
        }
    }
}
