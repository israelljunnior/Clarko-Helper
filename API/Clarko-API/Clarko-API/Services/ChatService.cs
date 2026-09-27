using System.Net;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Clarko.Helper.Api.Services;
using Clarko_API.Interface;
using Clarko_API.Models;
using Clarko_API.Options;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;

namespace Clarko_API.Services;

/// <summary>A problem that ends an answer after it started streaming, reported to the editor as an error event.</summary>
public sealed class ChatStreamException(string message) : Exception(message);

/// <summary>
/// Clarko's insights conversation. Asks OpenRouter for a streamed completion and passes the answer on
/// piece by piece as it arrives, so the editor can show Clarko "typing".
/// </summary>
public sealed class ChatService(
    IOpenRouterApi openRouter,
    PromptService prompts,
    TokenBudgetControlService budget,
    IOptions<OpenRouterOptions> options,
    ILogger<ChatService> logger)
{
    private static readonly string[] Openings = ["Clarko thinks", "Clarko feels"];
    private readonly OpenRouterOptions _options = options.Value;

    /// <summary>
    /// Starts Clarko's next message about the paragraph. Anything that goes wrong before the first word
    /// (budget, OpenRouter refusing) comes back as a <see cref="ProblemHttpResult"/>, so the endpoint can
    /// still answer with a normal error. The request must already be validated.
    /// </summary>
    public async Task<(IAsyncEnumerable<string>? Answer, ProblemHttpResult? Problem)> StartInsightsAsync(
        InsightsRequest request,
        CancellationToken cancellationToken)
    {
        if (!await budget.HasBudgetAsync(cancellationToken)) return (null, TokenBudgetControlService.BudgetExhausted());

        var completion = new ChatCompletionRequest(
            Model: _options.ChatModel,
            Messages: prompts.BuildInsightsPrompt(request),
            Temperature: Temperature.Creative.ToValue(),
            MaxTokens: budget.ChatMaxTokens,
            Usage: UsageOptions.Included,
            Stream: true);

        HttpResponseMessage response;
        try
        {
            response = await openRouter.StreamChatCompletionAsync(completion, _options.ApiKey, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Could not reach OpenRouter");
            return (null, Problem("Couldn't reach the model provider. Check the connection and try again.", StatusCodes.Status502BadGateway));
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return (null, Problem("The model took too long to answer. Try again.", StatusCodes.Status504GatewayTimeout));
        }

        if (!response.IsSuccessStatusCode)
        {
            using (response)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                logger.LogWarning("OpenRouter returned {Status}: {Body}", response.StatusCode, body);

                return (null, response.StatusCode switch
                {
                    HttpStatusCode.PaymentRequired => TokenBudgetControlService.BudgetExhausted(),
                    HttpStatusCode.TooManyRequests => Problem(
                        "Too many requests to the model. Wait a moment and try again.",
                        StatusCodes.Status429TooManyRequests),
                    _ => Problem("The model provider returned an error. Try again.", StatusCodes.Status502BadGateway),
                });
            }
        }

        return (ReadAnswerAsync(response, cancellationToken), null);
    }

    /// <summary>
    /// Reads OpenRouter's server-sent events and yields the text of the answer as it arrives. Records the
    /// cost from the final event, and makes sure the answer opens with "Clarko thinks" or "Clarko feels".
    /// </summary>
    private async IAsyncEnumerable<string> ReadAnswerAsync(
        HttpResponseMessage response,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        using var _ = response;
        await using var body = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(body);

        // The opening is held back until it can be checked, then everything else streams straight through.
        var opening = new StringBuilder();
        var openingChecked = false;
        ChatCompletionUsage? usage = null;

        while (await reader.ReadLineAsync(cancellationToken) is { } line)
        {
            // Blank lines separate events; lines starting with ":" are keep-alive comments ("OPENROUTER PROCESSING").
            if (!line.StartsWith("data:", StringComparison.Ordinal)) continue;

            var data = line["data:".Length..].Trim();
            if (data == "[DONE]") break;

            var chunk = JsonSerializer.Deserialize<ChatCompletionChunk>(data, OpenRouterJson.Options);
            if (chunk?.Error is { } error)
            {
                logger.LogWarning("OpenRouter failed mid-stream: {Code} {Message}", error.Code, error.Message);
                throw new ChatStreamException("The model stopped answering partway. Try again.");
            }

            if (chunk?.Usage is { } chunkUsage) usage = chunkUsage;

            var text = chunk?.Choices is [var first, ..] ? first.Delta?.Content : null;
            if (string.IsNullOrEmpty(text)) continue;

            if (openingChecked)
            {
                yield return text;
                continue;
            }

            opening.Append(text);
            if (opening.ToString().TrimStart().Length < Openings.Max(o => o.Length)) continue;

            openingChecked = true;
            yield return WithOpening(opening.ToString());
        }

        if (!openingChecked && opening.Length > 0) yield return WithOpening(opening.ToString());

        budget.RecordSpend(usage);
        logger.LogInformation("Insights answered with {Tokens} tokens, cost {Cost} USD", usage?.TotalTokens, usage?.Cost);
    }

    /// <summary>The model is asked to open with "Clarko thinks/feels"; this keeps the promise if it forgets.</summary>
    private static string WithOpening(string start)
    {
        var trimmed = start.TrimStart();
        return Openings.Any(o => trimmed.StartsWith(o, StringComparison.OrdinalIgnoreCase))
            ? trimmed
            : $"Clarko thinks: {trimmed}";
    }

    private static ProblemHttpResult Problem(string detail, int statusCode) =>
        TypedResults.Problem(detail, statusCode: statusCode);
}
