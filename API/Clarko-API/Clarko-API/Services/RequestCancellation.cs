using Microsoft.AspNetCore.Http.HttpResults;

namespace Clarko_API.Services;

/// <summary>
/// The editor cancels requests on purpose: the author kept typing, closed a popup mid-answer, or (in
/// development) React mounted a component twice. That is a normal outcome, not an error, so the code that
/// calls OpenRouter catches the resulting cancellation itself and answers with this instead of letting a
/// <see cref="TaskCanceledException"/> escape (which the debugger would stop on).
/// </summary>
public static class RequestCancellation
{
    /// <summary>"Client Closed Request" (the nginx convention): the editor left before the answer.</summary>
    public const int ClientClosedRequest = 499;

    /// <summary>The response to a request the editor cancelled. Nobody reads it: the connection is gone.</summary>
    public static ProblemHttpResult ClientClosed() =>
        TypedResults.Problem("The request was cancelled by the editor.", statusCode: ClientClosedRequest);
}
