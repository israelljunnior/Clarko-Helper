using Clarko_API.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Clarko_API.EndPoints;

/// <summary>What the editor shows in its header, e.g. "$0.42/5.00".</summary>
public sealed record BudgetResponse(decimal SpentUsd, decimal LimitUsd, decimal RemainingUsd, bool Exhausted);

/// <summary>Lets the editor show how much of the AI budget has been used.</summary>
public static class BudgetEndpoints
{
    public static IEndpointRouteBuilder MapBudgetEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/budget", GetBudgetAsync).WithTags("Budget").WithName("Budget");
        return app;
    }

    private static async Task<Results<Ok<BudgetResponse>, ProblemHttpResult>> GetBudgetAsync(
        TokenBudgetControlService budget,
        CancellationToken cancellationToken)
    {
        var status = await budget.GetStatusAsync(cancellationToken);
        if (status is null)
        {
            return TypedResults.Problem(
                "Couldn't read the AI budget from OpenRouter right now.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return TypedResults.Ok(new BudgetResponse(status.SpentUsd, status.LimitUsd, status.RemainingUsd, status.Exhausted));
    }
}
