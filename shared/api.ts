import { DEFAULT_NODE_URL, PassbookLedgerData, QUANTA_PER_SCY } from './types';

const fixture: PassbookLedgerData = {
    passbook_id: 'scy1_passbook_demo_7f2a',
    account_number: 'SCY-184206',
    public_key: '02b7e2...c91a8f',
    balance_scy: 124.50840012,
    balance_quanta: 12_450_840_012,
    sync_status: 'Node synchronized',
    node_url: DEFAULT_NODE_URL,
    block_height: 4921804,
    utxos: [
        { tx_id: '8f62a9b4d2c0e18aa7b5', output_index: 0, amount_quanta: 8_400_000_000, confirmations: 42 },
        { tx_id: 'c17e40e1f8ab4412d991', output_index: 1, amount_quanta: 4_050_840_012, confirmations: 18 },
    ],
    ledger: [
        { timestamp: '2026-09-08 14:30:22', type: 'REWARD', tx_hash: '0a93ef4d...b8c1', delta_quanta: 2_500_000, running_balance_quanta: 12_450_840_012 },
        { timestamp: '2026-09-08 11:04:09', type: 'INBOUND', tx_hash: '8f62a9b4...e18a', delta_quanta: 250_000_000, running_balance_quanta: 12_448_340_012 },
        { timestamp: '2026-09-07 20:18:44', type: 'OUTBOUND', tx_hash: 'c17e40e1...2d99', delta_quanta: -75_000_000, running_balance_quanta: 12_198_340_012 },
    ],
};

export async function loadPassbook(nodeUrl = DEFAULT_NODE_URL): Promise<PassbookLedgerData> {
    const endpoint = `${nodeUrl.replace(/\/$/, '')}/api/v1/passbook`;
    try {
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(4500) });
        if (!response.ok) throw new Error(`Node returned ${response.status}`);
        const remote = await response.json() as Partial<PassbookLedgerData>;
        const balanceQuanta = remote.balance_quanta ?? 0;
        return {
            ...fixture,
            ...remote,
            balance_quanta: balanceQuanta || fixture.balance_quanta,
            balance_scy: remote.balance_scy ?? (balanceQuanta ? balanceQuanta / QUANTA_PER_SCY : fixture.balance_scy),
            node_url: nodeUrl,
            sync_status: 'Node synchronized',
        };
    } catch {
        return { ...fixture, node_url: nodeUrl, sync_status: 'Offline fixture · node unavailable' };
    }
}
