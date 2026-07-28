export type M7ParsedComment = { reviewerLabel: string; commentNumber: string; content: string };

export function parseM7DecisionLetter(text: string): M7ParsedComment[] {
  const normalized = text.replace(/\r\n?/gu, "\n").trim();
  if (!normalized) return [];
  const comments: M7ParsedComment[] = [];
  let reviewerLabel = "Reviewer 1";
  let commentNumber = "";
  let buffer: string[] = [];
  const flush = () => {
    const content = buffer.join("\n").trim();
    if (commentNumber && content) comments.push({ reviewerLabel, commentNumber, content });
    buffer = [];
  };
  for (const line of normalized.split("\n")) {
    const reviewer = line.match(/^\s*(Reviewer|审稿人)\s*([\w一二三四五六七八九十-]+)\s*[:：]?\s*$/iu);
    if (reviewer) { flush(); reviewerLabel = `${reviewer[1]} ${reviewer[2]}`; commentNumber = ""; continue; }
    const comment = line.match(/^\s*(?:Comment|意见)\s*#?\s*([\w.-]+)\s*[:：]\s*(.*)$/iu) ?? line.match(/^\s*(\d+)\s*[.)、]\s+(.+)$/u);
    if (comment) { flush(); commentNumber = comment[1]; buffer.push(comment[2]); continue; }
    if (commentNumber) buffer.push(line);
  }
  flush();
  if (!comments.length) return [{ reviewerLabel: "Reviewer 1", commentNumber: "1", content: normalized }];
  return comments.slice(0, 200);
}
