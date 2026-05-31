export function formatMemberSince(dateString: string | null | undefined): string {
  if (!dateString) return "None";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "None";

  // Format: "April 14, 2026"
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
