export type MutationType = 'INBOUND' | 'OUTBOUND' | 'REWARD';

export interface UTXO {
    tx_id: string;
    output_index: number;
    amount_quanta: number;
    confirmations: number;
}

export interface LedgerMutation {
    timestamp: string;
    type: MutationType;
    tx_hash: string;
    delta_quanta: number;
    running_balance_quanta: number;
}

export interface PassbookLedgerData {
    passbook_id: string;
    account_number: string;
    public_key: string;
    balance_scy: number;
    balance_quanta: number;
    sync_status: string;
    node_url: string;
    block_height: number;
    utxos: UTXO[];
    ledger: LedgerMutation[];
}

export const QUANTA_PER_SCY = 100_000_000;
export const DEFAULT_NODE_URL = 'https://explorer.myratu.com';
