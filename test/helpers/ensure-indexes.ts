import { Connection } from 'mongoose';

/** IndexOptionsConflict / IndexKeySpecsConflict: an equivalent index already exists. */
const TOLERATED_INDEX_ERROR_CODES = new Set([85, 86]);

/**
 * Waits for every registered Mongoose model to finish building its indexes.
 *
 * Mongoose `autoIndex` is fire-and-forget: `app.init()` can resolve while index
 * builds are still running, and a multi-document transaction that writes during
 * that window fails with "Unable to write ... due to catalog changes" or an IX
 * lock timeout. Call this after `app.init()` and before any e2e path that opens
 * a transaction.
 *
 * Name conflicts between two schema-declared indexes on the same key are
 * tolerated: they are a schema concern, not something an e2e setup step should
 * fail on, and `autoIndex` ignores them the same way.
 */
export async function ensureIndexes(connection: Connection): Promise<void> {
  await Promise.all(
    connection.modelNames().map(async (name) => {
      try {
        await connection.model(name).createIndexes();
      } catch (error) {
        const code = (error as { code?: number })?.code;
        if (code !== undefined && TOLERATED_INDEX_ERROR_CODES.has(code)) {
          return;
        }
        throw error;
      }
    }),
  );
}
