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

export interface PassbookEntry {
    entry_number?: number;
    timestamp?: number | string;
    asset?: string;
    action?: string;
    amount_quanta?: number;
    fee_quanta?: number;
    status?: any;
    txid?: number[] | string;
    outpoint?: {
        txid?: number[] | string;
        index?: number;
    };
    block_height?: number;
    datum_hash?: string | null;
    [key: string]: any;
}

export interface PassbookData {
    address: string;
    balance_quanta: number;
    confirmed_native_balance_quanta?: number;
    pending_native_balance_quanta?: number;
    token_balances?: Record<string, number>;
    entries: PassbookEntry[];
    // UI compatibility fields
    passbook_id: string;
    account_number: string;
    public_key: string;
    balance_scy: number;
    sync_status: string;
    node_url: string;
    block_height: number;
    utxos: UTXO[];
    ledger: LedgerMutation[];
}

export type PassbookLedgerData = PassbookData;

export const QUANTA_PER_SCY = 100_000_000;
export const DEFAULT_NODE_URL = 'https://explorer.myratu.com';
