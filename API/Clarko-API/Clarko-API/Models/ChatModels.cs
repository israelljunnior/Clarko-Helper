namespace Clarko_API.Models;

/// <summary>
/// A conversation about one paragraph. <see cref="History"/> is empty to ask for Clarko's first
/// thoughts; otherwise it holds the conversation so far, oldest first, ending with the author's question.
/// </summary>
public sealed record InsightsRequest(
    string Paragraph,
    string? Context = null,
    IReadOnlyList<InsightMessage>? History = null);

/// <summary>One message in the conversation. <see cref="Role"/> is "author" or "clarko".</summary>
public sealed record InsightMessage(string Role, string Content)
{
    public const string AuthorRole = "author";
    public const string ClarkoRole = "clarko";
}
