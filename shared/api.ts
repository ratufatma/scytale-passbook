import { DEFAULT_NODE_URL, PassbookLedgerData, QUANTA_PER_SCY } from './types';

export type PassbookResult =
    | { ok: true; data: PassbookLedgerData }
    | { ok: false; error: string };

/**
 * Query a specific passbook address from the node.
 *
 * @param address  Bech32 passbook address (e.g. "scy1abc..."). When omitted,
 *                 the node returns the default/tip passbook (useful for demo).
 * @param nodeUrl  Base URL of the scytale-node HTTP gateway.
 */
export async function loadPassbook(
    address?: string,
    nodeUrl = DEFAULT_NODE_URL,
): Promise<PassbookResult> {
    const base = nodeUrl.replace(/\/$/, '');
    const url = address
        ? `${base}/api/v1/passbook?address=${encodeURIComponent(address)}`
        : `${base}/api/v1/passbook`;

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

        if (response.status === 404) {
            return { ok: false, error: 'Passbook address not found on this node.' };
        }
        if (!response.ok) {
            return { ok: false, error: `Node returned HTTP ${response.status}.` };
        }

        const remote = await response.json() as Partial<PassbookLedgerData>;

        // Validate that the minimum required fields are present.
        if (typeof remote.balance_quanta !== 'number') {
            return { ok: false, error: 'Unexpected response shape from node.' };
        }

        const balanceQuanta = remote.balance_quanta;
        const data: PassbookLedgerData = {
            passbook_id:    remote.passbook_id    ?? address ?? '',
            account_number: remote.account_number ?? '',
            public_key:     remote.public_key     ?? '',
            balance_scy:    remote.balance_scy    ?? balanceQuanta / QUANTA_PER_SCY,
            balance_quanta: balanceQuanta,
            sync_status:    'Node synchronized',
            node_url:       nodeUrl,
            block_height:   remote.block_height   ?? 0,
            utxos:          remote.utxos           ?? [],
            ledger:         remote.ledger          ?? [],
        };

        return { ok: true, data };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Node unreachable: ${message}` };
    }
}
