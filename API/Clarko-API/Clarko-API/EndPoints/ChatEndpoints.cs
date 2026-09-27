using Clarko.Helper.Api.Services;
using Clarko_API.Models;
using Clarko_API.Services;

namespace Clarko_API.EndPoints;

/// <summary>Clarko's insights: a conversation about one paragraph, streamed as it is written.</summary>
public static class ChatEndpoints
{
    public static IEndpointRouteBuilder MapChatEndpoints(this IEndpointRouteBuilder app)
    {
        var chat = app.MapGroup("/api/chat").WithTags("Chat");

        chat.MapPost("/insights", StreamInsightsAsync)
            .WithName("Insights")
            .Produces(StatusCodes.Status200OK, contentType: "text/event-stream");

        return app;
    }

    /// <summary>
    /// Clarko's next message about <see cref="InsightsRequest.Paragraph"/>: its first thoughts when the history
    /// is empty, otherwise the answer to the author's last question. Errors before the first word are normal
    /// problem responses; the answer itself streams as server-sent events.
    /// </summary>
    private static async Task<IResult> StreamInsightsAsync(
        InsightsRequest request,
        PromptService prompts,
        ChatService chat,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        var validation = prompts.ValidateInsights(request);
        if (!validation.IsValid) return TypedResults.ValidationProblem(validation.Errors);

        var (answer, problem) = await chat.StartInsightsAsync(request, cancellationToken);
        if (problem is not null) return problem;

        return new ServerSentEventsResult(answer!, loggers.CreateLogger(typeof(ChatEndpoints)));
    }
}
