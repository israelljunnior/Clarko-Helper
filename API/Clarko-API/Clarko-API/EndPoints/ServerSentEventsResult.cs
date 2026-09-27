using System.Text.Json;
using Clarko_API.Services;
using Microsoft.AspNetCore.Http.Features;

namespace Clarko_API.EndPoints;

/// <summary>
/// Streams text to the editor as server-sent events, one per piece of the answer:
/// <c>data: {"text":"…"}</c>. Ends with <c>event: done</c>, or <c>event: error</c> with
/// <c>data: {"message":"…"}</c> if the answer fails after it started.
/// </summary>
public sealed class ServerSentEventsResult(IAsyncEnumerable<string> pieces, ILogger logger) : IResult
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task ExecuteAsync(HttpContext http)
    {
        var response = http.Response;
        response.StatusCode = StatusCodes.Status200OK;
        response.ContentType = "text/event-stream";
        response.Headers.CacheControl = "no-cache";
        response.Headers["X-Accel-Buffering"] = "no"; // don't let a proxy hold the pieces back
        http.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

        var cancellationToken = http.RequestAborted;
        try
        {
            await foreach (var text in pieces.WithCancellation(cancellationToken))
            {
                await WriteAsync(response, null, new { text }, cancellationToken);
            }

            await WriteAsync(response, "done", new { }, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The editor closed the popup or moved on: nothing left to tell it.
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Insights stream failed");
            var message = exception is ChatStreamException
                ? exception.Message
                : "Clarko lost the connection partway. Try again.";
            await WriteAsync(response, "error", new { message }, CancellationToken.None);
        }
    }

    private static async Task WriteAsync(HttpResponse response, string? eventName, object data, CancellationToken cancellationToken)
    {
        var payload = (eventName is null ? string.Empty : $"event: {eventName}\n")
            + $"data: {JsonSerializer.Serialize(data, Json)}\n\n";
        await response.WriteAsync(payload, cancellationToken);
        await response.Body.FlushAsync(cancellationToken);
    }
}
