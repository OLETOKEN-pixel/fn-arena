import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

type ForbiddenPattern = {
  label: string;
  pattern: RegExp;
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function readTextFiles(root: string, exts: string[]): Array<{ file: string; content: string }> {
  const absRoot = path.resolve(root);
  if (!fs.existsSync(absRoot)) return [];

  const files = walk(absRoot).filter((f) => exts.some((e) => f.endsWith(e)));
  return files.map((file) => ({ file, content: fs.readFileSync(file, "utf8") }));
}

describe("schema guard (prevent column does not exist regressions)", () => {
  it("does not reference known-nonexistent columns in SQL migrations / backend functions", () => {
    // NOTE: This is an intentionally simple guardrail.
    // It blocks the exact class of regressions we've been hitting (imaginary/legacy columns).
    const forbidden: ForbiddenPattern[] = [
      { label: "transactions.reference_id", pattern: /\breference_id\b/i },
      { label: "matches.joiner_payment_mode", pattern: /\bjoiner_payment_mode\b/i },
      { label: "matches.host_payment_mode", pattern: /\bhost_payment_mode\b/i },
      { label: "matches.updated_at", pattern: /\bUPDATE\s+matches\b[\s\S]*\bupdated_at\b/i },
      { label: "match_participants.updated_at", pattern: /\bUPDATE\s+match_participants\b[\s\S]*\bupdated_at\b/i },
      // match_participants table has joined_at/ready_at/result_at, but no payment_mode column
      { label: "match_participants.payment_mode", pattern: /\bmatch_participants\b[\s\S]*\bpayment_mode\b/i },
    ];

    const migrationFiles = readTextFiles("supabase/migrations", [".sql"]);
    const functionFiles = readTextFiles("supabase/functions", [".ts", ".tsx"]);
    const files = [...migrationFiles, ...functionFiles];

    const hits: Array<{ file: string; label: string }> = [];
    for (const { file, content } of files) {
      for (const f of forbidden) {
        if (f.pattern.test(content)) hits.push({ file: path.relative(process.cwd(), file), label: f.label });
      }
    }

    expect(
      hits,
      `Found forbidden legacy schema references:\n${hits
        .map((h) => `- ${h.label} in ${h.file}`)
        .join("\n")}`
    ).toEqual([]);
  });
});
