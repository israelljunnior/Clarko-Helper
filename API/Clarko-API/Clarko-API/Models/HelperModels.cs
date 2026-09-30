namespace Clarko_API.Models;

/// <summary>The line being typed, plus optional surrounding text for tone and topic.</summary>
public sealed record NextWordRequest(string Line, string? Context = null);

public sealed record NextWordResponse(IReadOnlyList<string> Suggestions);

/// <summary>
/// <see cref="History"/> holds earlier turns for the same selection, oldest first,
/// so "shorter" and then "more formal" build on each other.
/// </summary>
public sealed record SelectionRequest(
    string SelectedText,
    string Instruction,
    string? Context = null,
    IReadOnlyList<RefinementTurn>? History = null);

public sealed record RefinementTurn(string Instruction, string? Revised);

/// <summary><see cref="Revised"/> is null when the model thinks no change is needed.</summary>
public sealed record SelectionResponse(string? Revised, string Reason);

/// <summary>
/// What to look for (up to 300 characters) and the document to look in, one entry per top-level
/// paragraph or heading, in order. Match positions refer to these indexes.
/// </summary>
public sealed record SearchRequest(string Query, IReadOnlyList<string> Paragraphs);

/// <summary>
/// <see cref="Kind"/> says how the matches were found: "position" (the query named a place, like "third
/// paragraph" or "character 500", found without the model), "exact" (the text itself, found without the
/// model), "related" (passages the model judged related, each verified to exist in the document) or "none".
/// </summary>
public sealed record SearchResponse(string Kind, IReadOnlyList<SearchMatch> Matches)
{
    public const string PositionKind = "position";
    public const string ExactKind = "exact";
    public const string RelatedKind = "related";
    public const string NoneKind = "none";
}

/// <summary>
/// A found passage: <see cref="Start"/> and <see cref="Length"/> are character offsets into
/// paragraph <see cref="Paragraph"/>, and <see cref="Text"/> is exactly that slice of it.
/// </summary>
public sealed record SearchMatch(int Paragraph, int Start, int Length, string Text, string? Reason = null);
