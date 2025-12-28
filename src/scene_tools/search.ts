import type { Scene, SceneNode } from "./types";

/**
 * Result of a fuzzy search match
 */
export interface FuzzySearchResult {
	node: SceneNode;
	score: number;
	matchType: "label" | "class" | "both";
}

/**
 * Creates a regex for fuzzy subsequence matching.
 * Example: "mcoll" matches "MonsterController"
 *
 * @param query The search query (e.g., "mcoll")
 * @returns A case-insensitive regex that matches the subsequence
 */
export function createFuzzyRegex(query: string): RegExp {
	// Escape special regex characters and join with .*? for subsequence matching
	const escaped = query
		.split("")
		.map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const pattern = escaped.join(".*?");
	return new RegExp(pattern, "i");
}

/**
 * Scores a match based on how "tight" the match is.
 * Lower scores are better (fewer characters between matches).
 *
 * @param text The text being searched
 * @param query The search query
 * @returns Score (lower is better) or -1 if no match
 */
export function scoreFuzzyMatch(text: string, query: string): number {
	if (!query || !text) {
		return -1;
	}

	const lowerText = text.toLowerCase();
	const lowerQuery = query.toLowerCase();

	let textIndex = 0;
	let score = 0;

	for (const char of lowerQuery) {
		const foundIndex = lowerText.indexOf(char, textIndex);
		if (foundIndex === -1) {
			return -1; // No match
		}
		// Add distance between matched characters to score
		score += foundIndex - textIndex;
		textIndex = foundIndex + 1;
	}

	// Bonus for matches at start of text (lower score is better)
	if (lowerText.startsWith(lowerQuery[0])) {
		score -= 10;
	}

	// Bonus for exact prefix match
	if (lowerText.startsWith(lowerQuery)) {
		score -= 20;
	}

	// Bonus for shorter text (more specific match)
	score += Math.floor(text.length / 10);

	return score;
}

/**
 * Searches scene nodes with fuzzy matching on label and className.
 *
 * @param scene The scene containing nodes to search
 * @param query The search query
 * @returns Sorted array of matching results (best matches first)
 */
export function searchNodes(scene: Scene, query: string): FuzzySearchResult[] {
	if (!query.trim() || !scene?.nodes) {
		return [];
	}

	const regex = createFuzzyRegex(query);
	const results: FuzzySearchResult[] = [];

	for (const node of scene.nodes.values()) {
		const nodeLabel = node.label as string;
		const labelMatch = regex.test(nodeLabel);
		const classMatch = regex.test(node.className);

		if (labelMatch || classMatch) {
			const labelScore = labelMatch
				? scoreFuzzyMatch(nodeLabel, query)
				: 999;
			const classScore = classMatch
				? scoreFuzzyMatch(node.className, query)
				: 999;

			// Determine match type
			let matchType: "label" | "class" | "both";
			if (labelMatch && classMatch) {
				matchType = "both";
			} else if (labelMatch) {
				matchType = "label";
			} else {
				matchType = "class";
			}

			// Use best score, but prefer label matches over class matches
			const combinedScore = Math.min(
				labelScore,
				classScore + 5, // Small penalty for class-only matches
			);

			results.push({
				node,
				score: combinedScore,
				matchType,
			});
		}
	}

	// Sort by score (lower is better)
	return results.sort((a, b) => a.score - b.score);
}

/**
 * Formats a search result label for display in QuickPick
 *
 * @param result The search result to format
 * @returns Formatted label string
 */
export function formatSearchResultLabel(result: FuzzySearchResult): string {
	return `$(symbol-class) ${result.node.label}`;
}

/**
 * Formats a search result description for display in QuickPick
 *
 * @param result The search result to format
 * @returns Formatted description string
 */
export function formatSearchResultDescription(
	result: FuzzySearchResult,
): string {
	return result.node.className;
}

/**
 * Formats a search result detail for display in QuickPick
 *
 * @param result The search result to format
 * @returns Formatted detail string showing the node path
 */
export function formatSearchResultDetail(result: FuzzySearchResult): string {
	return result.node.relativePath || "(root)";
}
