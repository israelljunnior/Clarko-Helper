namespace Clarko.Helper.Api.Endpoints;

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
