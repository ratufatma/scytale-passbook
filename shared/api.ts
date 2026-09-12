import { DEFAULT_NODE_URL, PassbookData, PassbookLedgerData, QUANTA_PER_SCY, UTXO, LedgerMutation } from './types';

export type PassbookResult =
    | { ok: true; data: PassbookData }
    | { ok: false; error: string };

function toHexTxid(txid: number[] | string | undefined): string {
    if (!txid) return '';
    if (typeof txid === 'string') return txid;
    if (Array.isArray(txid)) {
        return Array.from(txid).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return String(txid);
}

/**
 * Fetch and normalize passbook data from node.
 */
export async function fetchPassbookData(
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

        const raw = (await response.json()) as any;

        // Normalisasi payload sebelum validasi tipe
        const balance = Number(
            raw.confirmed_native_balance_quanta ??
            raw.balance_quanta ??
            raw.balance ??
            0
        );

        const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];

        // Validasi memeriksa normalized.entries (apakah Array) dan typeof normalized.balance_quanta === 'number'
        if (typeof balance !== 'number' || isNaN(balance) || !Array.isArray(rawEntries)) {
            return { ok: false, error: 'Unexpected response shape from node.' };
        }

        // Map entries into UI ledger & utxo structures if present
        let runningBalance = 0;
        const ledger: LedgerMutation[] = raw.ledger ?? rawEntries.map((e: any) => {
            const delta = Number(e.amount_quanta ?? 0);
            runningBalance += delta;
            const txHash = toHexTxid(e.txid ?? e.outpoint?.txid);
            const action = String(e.action ?? '');
            const type = action.includes('Mining') || action.includes('Reward')
                ? 'REWARD'
                : (delta >= 0 ? 'INBOUND' : 'OUTBOUND');

            let timeStr = '—';
            if (e.timestamp && Number(e.timestamp) > 0) {
                timeStr = new Date(Number(e.timestamp) * 1000).toISOString().replace('T', ' ').slice(0, 19);
            } else if (e.timestamp === 0) {
                timeStr = 'Genesis Epoch (0)';
            }

            return {
                timestamp: timeStr,
                type,
                tx_hash: txHash ? `0x${txHash}` : '—',
                delta_quanta: delta,
                running_balance_quanta: runningBalance,
            };
        });

        const utxos: UTXO[] = raw.utxos ?? rawEntries
            .filter((e: any) => e.status?.Confirmed || e.status === 'Confirmed' || !e.status)
            .map((e: any) => ({
                tx_id: toHexTxid(e.outpoint?.txid ?? e.txid),
                output_index: Number(e.outpoint?.index ?? 0),
                amount_quanta: Number(e.amount_quanta ?? 0),
                confirmations: Number(e.status?.Confirmed?.confirmations ?? 1),
            }));

        const maxBlockHeight = rawEntries.reduce((max: number, e: any) => {
            const h = Number(e.block_height ?? 0);
            return h > max ? h : max;
        }, 0);

        const normalized: PassbookData = {
            address: raw.address || address || raw.passbook_id || raw.account_lock_hex || '',
            balance_quanta: balance,
            confirmed_native_balance_quanta: balance,
            pending_native_balance_quanta: Number(raw.pending_native_balance_quanta ?? 0),
            token_balances: raw.token_balances || {},
            entries: rawEntries,
            // UI compatibility
            passbook_id: raw.address || address || raw.passbook_id || raw.account_lock_hex || 'scy1_passbook',
            account_number: raw.account_number ?? '',
            public_key: raw.public_key ?? '',
            balance_scy: balance / QUANTA_PER_SCY,
            sync_status: 'Node synchronized',
            node_url: nodeUrl,
            block_height: Number(raw.block_height ?? maxBlockHeight),
            utxos,
            ledger,
        };

        return { ok: true, data: normalized };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Node unreachable: ${message}` };
    }
}

/**
 * Backwards-compatible alias for fetchPassbookData.
 */
export const loadPassbook = fetchPassbookData;
