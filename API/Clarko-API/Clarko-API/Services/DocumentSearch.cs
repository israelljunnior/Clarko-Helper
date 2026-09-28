using Clarko_API.Models;

namespace Clarko.Helper.Api.Services;

/// <summary>
/// The deterministic part of search: finding text in the document's paragraphs, with no model involved.
/// </summary>
public static class DocumentSearch
{
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
