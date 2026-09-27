using System.Net;
using Clarko.Helper.Api.Services;
using Clarko_API.Interface;
using Clarko_API.Models;
using Clarko_API.Options;
using Clarko_API.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Refit;

namespace Clarko_API.EndPoints;

/// <summary>The two AI helpers the editor calls. Every request is validated and budget-checked first.</summary>
public static class HelperEndpoints
{
    public static IEndpointRouteBuilder MapHelperEndpoints(this IEndpointRouteBuilder app)
    {
        var helper = app.MapGroup("/api/helper").WithTags("Helper");

        helper.MapPost("/suggestionautocomplete", SuggestNextWordsAsync).WithName("SuggestionAutocomplete");
        helper.MapPost("/selectionautocomplete", RefineSelectionAsync).WithName("SelectionAutocomplete");

        return app;
    }

    /// <summary>Next-word suggestions for the line being typed (GPT-4o mini: fast and cheap).</summary>
    private static async Task<Results<Ok<NextWordResponse>, ValidationProblem, ProblemHttpResult>> SuggestNextWordsAsync(
        NextWordRequest request,
        PromptService prompts,
        TokenBudgetControlService budget,
        IOpenRouterApi openRouter,
        IOptions<OpenRouterOptions> options,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        var validation = prompts.ValidateNextWord(request);
        if (!validation.IsValid) return TypedResults.ValidationProblem(validation.Errors);
        if (!await budget.HasBudgetAsync(cancellationToken)) return TokenBudgetControlService.BudgetExhausted();

        var completion = new ChatCompletionRequest(
            Model: options.Value.SuggestionModel,
            Messages: prompts.BuildNextWordPrompt(request),
            Temperature: Temperature.Deterministic.ToValue(),
            MaxTokens: budget.SuggestionMaxTokens,
            ResponseFormat: ResponseFormat.JsonObject,
            Usage: UsageOptions.Included);

        var (response, problem) = await SendAsync(openRouter, options.Value.ApiKey, completion, loggers, cancellationToken);
        if (problem is not null) return problem;
        budget.RecordSpend(response!.Usage);

        return TypedResults.Ok(new NextWordResponse(prompts.ParseNextWords(response!.FirstContent)));
    }

    /// <summary>Rewrites the selected text following the author's instruction (GPT-4o: better rewrites).</summary>
    private static async Task<Results<Ok<SelectionResponse>, ValidationProblem, ProblemHttpResult>> RefineSelectionAsync(
        SelectionRequest request,
        PromptService prompts,
        TokenBudgetControlService budget,
        IOpenRouterApi openRouter,
        IOptions<OpenRouterOptions> options,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        var validation = prompts.ValidateSelection(request);
        if (!validation.IsValid) return TypedResults.ValidationProblem(validation.Errors);
        if (!await budget.HasBudgetAsync(cancellationToken)) return TokenBudgetControlService.BudgetExhausted();

        var completion = new ChatCompletionRequest(
            Model: options.Value.SelectionModel,
            Messages: prompts.BuildSelectionPrompt(request),
            Temperature: Temperature.Creative.ToValue(),
            MaxTokens: budget.SelectionMaxTokens,
            ResponseFormat: ResponseFormat.JsonObject,
            Usage: UsageOptions.Included);

        var (response, problem) = await SendAsync(openRouter, options.Value.ApiKey, completion, loggers, cancellationToken);
        if (problem is not null) return problem;
        budget.RecordSpend(response!.Usage);

        var revision = prompts.ParseRevision(response!.FirstContent, request.SelectedText);
        if (revision is null)
        {
            return TypedResults.Problem(
                "The model returned an answer Clarko couldn't use. Try again or rephrase the instruction.",
                statusCode: StatusCodes.Status502BadGateway);
        }

        return TypedResults.Ok(new SelectionResponse(revision.Revised, revision.Reason));
    }

    private static async Task<(ChatCompletionResponse? Response, ProblemHttpResult? Problem)> SendAsync(
        IOpenRouterApi openRouter,
        string apiKey,
        ChatCompletionRequest request,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        var logger = loggers.CreateLogger(typeof(HelperEndpoints));

        try
        {
            var response = await openRouter.CreateChatCompletionAsync(request, apiKey, cancellationToken);

            logger.LogInformation(
                "{Model} answered with {Tokens} tokens, cost {Cost} USD",
                response.Model, response.Usage?.TotalTokens, response.Usage?.Cost);

            return (response, null);
        }
        catch (ApiException exception)
        {
            logger.LogWarning("OpenRouter returned {Status}: {Body}", exception.StatusCode, exception.Content);

            return (null, exception.StatusCode switch
            {
                HttpStatusCode.PaymentRequired => TokenBudgetControlService.BudgetExhausted(),
                HttpStatusCode.TooManyRequests => TypedResults.Problem(
                    "Too many requests to the model. Wait a moment and try again.",
                    statusCode: StatusCodes.Status429TooManyRequests),
                _ => TypedResults.Problem(
                    "The model provider returned an error. Try again.",
                    statusCode: StatusCodes.Status502BadGateway),
            });
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Could not reach OpenRouter");
            return (null, TypedResults.Problem(
                "Couldn't reach the model provider. Check the connection and try again.",
                statusCode: StatusCodes.Status502BadGateway));
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            // HttpClient timeout, not the editor cancelling the request.
            return (null, TypedResults.Problem(
                "The model took too long to answer. Try again.",
                statusCode: StatusCodes.Status504GatewayTimeout));
        }
    }
}
