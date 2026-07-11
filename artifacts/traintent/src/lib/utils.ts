import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Defensive display-layer formatting for a program's splitType - covers both
// older rows generated before the AI prompt enforced plain-language output
// and any future slip-ups, without needing a data migration.
export function formatSplitType(splitType: string): string {
  return splitType
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    // Only reshape all-lowercase words (e.g. "push" -> "Push") - leaves
    // already-formatted or acronym casing (e.g. "PPL", "U/L") untouched.
    .map((word) => (word === word.toLowerCase() ? word[0]?.toUpperCase() + word.slice(1) : word))
    .join(" ")
}
