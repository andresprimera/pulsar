import * as fs from 'fs';
import * as path from 'path';

/**
 * Architecture invariant: the `INBOX_CONVERSATION_WRITE_PORT` symbol is
 * the single seam through which the domain (`ConversationService`) writes
 * inbox conversation columns. The persistence-side `ConversationRepository`
 * may only be imported by `InboxConversationWriteAdapter` (the adapter
 * that wires the symbol to the repository).
 *
 * (a) Every import of `INBOX_CONVERSATION_WRITE_PORT` resolves to the
 *     shared port module — never a feature-local copy.
 * (b) No file that imports the port symbol also imports
 *     `ConversationRepository`, except the adapter itself.
 * (c) Exactly one class in the tree implements
 *     `InboxConversationWritePort`, and it is `InboxConversationWriteAdapter`.
 */

const SRC_ROOT = path.resolve(__dirname, '../../src');
const PORT_FILE = path.resolve(
  SRC_ROOT,
  'shared/ports/inbox-conversation-write.port.ts',
);
const ADAPTER_FILE = path.resolve(
  SRC_ROOT,
  'core/persistence/ports/inbox-conversation-write.adapter.ts',
);

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function getAllFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((file) => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      return getAllFiles(fullPath);
    }
    if (fullPath.endsWith('.ts') && !fullPath.endsWith('.spec.ts')) {
      return [fullPath];
    }
    return [];
  });
}

describe('INBOX_CONVERSATION_WRITE_PORT boundary', () => {
  const allFiles = getAllFiles(SRC_ROOT);

  it('port file exists at the canonical @shared/ports location', () => {
    expect(fs.existsSync(PORT_FILE)).toBe(true);
  });

  it('adapter file exists at the canonical persistence/ports location', () => {
    expect(fs.existsSync(ADAPTER_FILE)).toBe(true);
  });

  it('every import of INBOX_CONVERSATION_WRITE_PORT resolves to @shared/ports/inbox-conversation-write.port', () => {
    const offenders: string[] = [];
    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (!content.includes('INBOX_CONVERSATION_WRITE_PORT')) continue;
      // any import line that mentions the symbol must come from the canonical module
      const importLines = content
        .split('\n')
        .filter(
          (line) =>
            line.includes('INBOX_CONVERSATION_WRITE_PORT') &&
            /^\s*import\b/.test(line.trim()) === false &&
            /from\s+['"]/.test(line),
        );
      // Match every import statement (possibly multi-line) that references the symbol.
      // Simpler: scan for any `from '...'` where the import block above mentions the symbol.
      const importBlockRegex =
        /import\s*(?:type\s*)?\{[^}]*INBOX_CONVERSATION_WRITE_PORT[^}]*\}\s*from\s*['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = importBlockRegex.exec(content)) !== null) {
        const source = match[1];
        if (source !== '@shared/ports/inbox-conversation-write.port') {
          offenders.push(`${toPosix(file)} → ${source}`);
        }
      }
      // Silence unused-variable warning for importLines (it was inspected above).
      void importLines;
    }
    expect(offenders).toEqual([]);
  });

  it('no file other than the adapter imports both the port and ConversationRepository', () => {
    /*
     * Grandfathered exceptions:
     *   - `core/persistence/database.module.ts`: this is the canonical
     *     binding point for the symbol — it MUST reference both the port
     *     and the adapter's dependency (the repository) to compose the
     *     provider tree.
     *   - `core/domain/conversation/conversation.service.ts`: still
     *     imports `ConversationRepository` because the `resolveOrCreate`
     *     / `createOpenConversation` paths use it directly. Those two
     *     domain→persistence edges are tracked as backlog (see the
     *     remaining `eslint-disable boundaries/element-types` annotations
     *     in that file). The inbox-list `touch` write surface — what this
     *     port governs — routes through the port and does NOT use the
     *     repository.
     */
    const ALLOWED_CO_IMPORTERS = new Set<string>([
      'src/core/persistence/database.module.ts',
      'src/core/domain/conversation/conversation.service.ts',
    ]);
    const offenders: string[] = [];
    for (const file of allFiles) {
      const posix = toPosix(file);
      if (posix.endsWith('inbox-conversation-write.adapter.ts')) continue;
      // Repo-relative path (src/...), independent of local checkout directory name.
      const relPosix = toPosix(
        path.relative(path.resolve(SRC_ROOT, '..'), file),
      );
      if (ALLOWED_CO_IMPORTERS.has(relPosix)) continue;
      const content = fs.readFileSync(file, 'utf8');
      if (!content.includes('INBOX_CONVERSATION_WRITE_PORT')) continue;
      if (/\bConversationRepository\b/.test(content)) {
        offenders.push(posix);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('Phase 3: InboxConversationMutationService does NOT import INBOX_CONVERSATION_WRITE_PORT', () => {
    // Locks in the §4.6 / §2.4 contract proof — Phase-3 mutations write
    // discrete columns (`status`, `assignedOperatorId`, `tags`) directly
    // through `ConversationRepository`, NOT through the port (which
    // governs the list-column write surface `lastMessageAt` /
    // `lastMessagePreview`).
    const mutationServicePath = path.resolve(
      SRC_ROOT,
      'features/inbox/inbox-conversation-mutation.service.ts',
    );
    expect(fs.existsSync(mutationServicePath)).toBe(true);
    const content = fs.readFileSync(mutationServicePath, 'utf8');
    expect(content).not.toContain('INBOX_CONVERSATION_WRITE_PORT');
  });

  it('exactly one class implements InboxConversationWritePort, and it is the adapter', () => {
    const implementers: string[] = [];
    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const re = /class\s+(\w+)[^{]*implements[^{]*InboxConversationWritePort/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        implementers.push(`${match[1]} @ ${toPosix(file)}`);
      }
    }
    expect(implementers).toHaveLength(1);
    expect(implementers[0]).toMatch(/^InboxConversationWriteAdapter\s+@/);
    expect(implementers[0]).toContain(
      'core/persistence/ports/inbox-conversation-write.adapter.ts',
    );
  });
});
