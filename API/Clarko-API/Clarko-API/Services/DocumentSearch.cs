using System.Globalization;
using System.Text.RegularExpressions;
using Clarko_API.Models;

namespace Clarko.Helper.Api.Services;

/// <summary>
/// The deterministic part of search: finding text in the document's paragraphs, and places in it by
/// position ("third paragraph", "line 5", "character 500"), with no model involved.
/// </summary>
public static partial class DocumentSearch
{
    private static readonly string[] OrdinalWords =
    [
        "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
        "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth",
        "eighteenth", "nineteenth", "twentieth",
    ];

    private const string Lead = @"^\s*(?:(?:go\s+to|jump\s+to|find|show(?:\s+me)?|where\s+is)\s+)?(?:the\s+)?";

    // "third paragraph", "3rd line", "the last paragraph", "500th character"
    [GeneratedRegex(
        Lead + @"(?<ord>first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|last|\d+(?:st|nd|rd|th)?)\s+(?<unit>paragraph|line|character|char|letter)s?\s*[.?!]?\s*$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 100)]
    private static partial Regex OrdinalPositionPattern();

    // "paragraph 3", "line #5", "character number 500"
    [GeneratedRegex(
        Lead + @"(?<unit>paragraph|line|character|char|letter)\s+(?:(?:number|no\.?|#)\s*)?(?<ord>\d+)\s*[.?!]?\s*$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 100)]
    private static partial Regex NumberedPositionPattern();

    [GeneratedRegex(@"\w")]
    private static partial Regex WordCharacter();

    /// <summary>
    /// When the query names a position rather than content, the passage at that position. Counting starts
    /// at 1: "paragraph N" counts paragraphs and headings that have text, "line N" counts every block
    /// (like the editor's line count), and "character N" counts the document's characters in order (the
    /// word containing it is returned). Null when the query isn't a position; an empty list when the
    /// position is past the end of the document.
    /// </summary>
    public static IReadOnlyList<SearchMatch>? FindByPosition(string query, IReadOnlyList<string> paragraphs)
    {
        Match parsed;
        try
        {
            parsed = OrdinalPositionPattern().Match(query);
            if (!parsed.Success) parsed = NumberedPositionPattern().Match(query);
        }
        catch (RegexMatchTimeoutException)
        {
            return null;
        }
        if (!parsed.Success) return null;

        var unit = parsed.Groups["unit"].Value.ToLowerInvariant();
        var ord = parsed.Groups["ord"].Value.ToLowerInvariant();

        return unit switch
        {
            "paragraph" => Paragraph(ord, paragraphs, countEmpty: false, label: "Paragraph"),
            "line" => Paragraph(ord, paragraphs, countEmpty: true, label: "Line"),
            _ => Character(ord, paragraphs),
        };
    }

    /// <summary>The number an ordinal names ("third" → 3, "12th" → 12), or null for "last" and nonsense.</summary>
    private static int? OrdinalNumber(string ord)
    {
        var word = Array.IndexOf(OrdinalWords, ord);
        if (word >= 0) return word + 1;

        var digits = new string(ord.TakeWhile(char.IsDigit).ToArray());
        return int.TryParse(digits, NumberStyles.None, CultureInfo.InvariantCulture, out var number) && number > 0
            ? number
            : null;
    }

    private static IReadOnlyList<SearchMatch> Paragraph(string ord, IReadOnlyList<string> paragraphs, bool countEmpty, string label)
    {
        var candidates = Enumerable.Range(0, paragraphs.Count)
            .Where(i => countEmpty || !string.IsNullOrWhiteSpace(paragraphs[i]))
            .ToList();
        if (candidates.Count == 0) return [];

        var number = ord == "last" ? candidates.Count : OrdinalNumber(ord);
        if (number is not { } n || n > candidates.Count) return [];

        var index = candidates[n - 1];
        var text = paragraphs[index] ?? string.Empty;
        return [new SearchMatch(index, 0, text.Length, text, $"{label} {n}")];
    }

    private static IReadOnlyList<SearchMatch> Character(string ord, IReadOnlyList<string> paragraphs)
    {
        var total = paragraphs.Sum(p => p?.Length ?? 0);
        var number = ord == "last" ? total : OrdinalNumber(ord);
        if (number is not { } n || n > total) return [];

        // Walk the paragraphs in order to the one holding character n.
        var remaining = n - 1;
        for (var index = 0; index < paragraphs.Count; index++)
        {
            var text = paragraphs[index] ?? string.Empty;
            if (remaining >= text.Length)
            {
                remaining -= text.Length;
                continue;
            }

            // Highlight the whole word around it, so a single letter is easy to spot.
            var start = remaining;
            var end = remaining + 1;
            if (WordCharacter().IsMatch(text[remaining].ToString()))
            {
                while (start > 0 && WordCharacter().IsMatch(text[start - 1].ToString())) start--;
                while (end < text.Length && WordCharacter().IsMatch(text[end].ToString())) end++;
            }

            var shown = char.IsWhiteSpace(text[remaining]) ? "a space" : $"\"{text[remaining]}\"";
            return [new SearchMatch(index, start, end - start, text[start..end], $"Character {n} is {shown}")];
        }

        return [];
    }

    /// <summary>More than this many exact matches are unlikely to help anyone; the rest are left out.</summary>
    private const int MaxExactMatches = 50;

    /// <summary>
    /// Every place <paramref name="query"/> appears, ignoring case, in document order: by paragraph, then
    /// by position. The same input always gives the same result.
    /// </summary>
    public static IReadOnlyList<SearchMatch> FindExact(string query, IReadOnlyList<string> paragraphs)
    {
        var needle = query.Trim();
        var matches = new List<SearchMatch>();
        if (needle.Length == 0) return matches;

        for (var index = 0; index < paragraphs.Count && matches.Count < MaxExactMatches; index++)
        {
            var paragraph = paragraphs[index] ?? string.Empty;
            var start = paragraph.IndexOf(needle, StringComparison.OrdinalIgnoreCase);
            while (start >= 0 && matches.Count < MaxExactMatches)
            {
                matches.Add(new SearchMatch(index, start, needle.Length, paragraph.Substring(start, needle.Length)));
                start = paragraph.IndexOf(needle, start + needle.Length, StringComparison.OrdinalIgnoreCase);
            }
        }

        return matches;
    }

    /// <summary>
    /// Where a quote sits in paragraph <paramref name="index"/>: exactly as written first, then ignoring case.
    /// Null when the paragraph doesn't exist or doesn't contain the quote (e.g. the model paraphrased it).
    /// </summary>
    public static SearchMatch? Locate(IReadOnlyList<string> paragraphs, int index, string quote, string? reason)
    {
        if (index < 0 || index >= paragraphs.Count || string.IsNullOrEmpty(paragraphs[index])) return null;

        var paragraph = paragraphs[index];
        var start = paragraph.IndexOf(quote, StringComparison.Ordinal);
        if (start < 0) start = paragraph.IndexOf(quote, StringComparison.OrdinalIgnoreCase);
        if (start < 0) return null;

        return new SearchMatch(index, start, quote.Length, paragraph.Substring(start, quote.Length), reason);
    }
}
