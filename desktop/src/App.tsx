import { useEffect, useState } from 'react';
import {
    AlertCircle, ArrowUpRight, BookOpen, CheckCircle2,
    Copy, Database, RefreshCw, Search, ShieldCheck,
    Sparkles, WalletCards,
} from 'lucide-react';
import { loadPassbook, PassbookResult } from '../../shared/api';
import { formatQuanta, formatSCY, shortHash } from '../../shared/format';
import { DEFAULT_NODE_URL, LedgerMutation, PassbookLedgerData, UTXO } from '../../shared/types';

const typeClass: Record<LedgerMutation['type'], string> = {
    INBOUND: 'inbound', OUTBOUND: 'outbound', REWARD: 'reward',
};

function UtxoCard({ item }: { item: UTXO }) {
    return (
        <article className="utxo-card">
            <div className="utxo-top">
                <span>{shortHash(item.tx_id)}</span>
                <b>vOut #{item.output_index}</b>
            </div>
            <strong>{formatQuanta(item.amount_quanta)} <small>quanta</small></strong>
            <footer>
                <span><CheckCircle2 size={13} /> {item.confirmations} confirmations</span>
                <span>UTXO</span>
            </footer>
        </article>
    );
}

function App() {
    const [result, setResult] = useState<PassbookResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [address, setAddress] = useState('');
    const [nodeUrl] = useState(DEFAULT_NODE_URL);

    const refresh = async (addr?: string) => {
        setLoading(true);
        setResult(await loadPassbook(addr || undefined, nodeUrl));
        setLoading(false);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        void refresh(address.trim() || undefined);
    };

    const copy = async () => {
        if (!result?.ok) return;
        await navigator.clipboard?.writeText(result.data.passbook_id);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
    };

    const data: PassbookLedgerData | null = result?.ok ? result.data : null;

    return (
        <main className="shell">
            <header className="topbar">
                <div className="brand">
                    <div className="brand-mark">S</div>
                    <div>
                        <strong>SCYTALE</strong>
                        <span>PASSBOOK / DESKTOP</span>
                    </div>
                </div>
                {data && (
                    <div className="node-pill">
                        <i /> {data.sync_status} <span>·</span> {data.node_url.replace('http://', '')}
                    </div>
                )}
                <button className="icon-button" onClick={() => void refresh(address.trim() || undefined)} aria-label="Refresh" title="Refresh">
                    <RefreshCw size={17} className={loading ? 'spin' : ''} />
                </button>
            </header>

            {/* Address search bar */}
            <form className="desktop-search" onSubmit={handleSearch}>
                <Search size={15} className="ds-icon" />
                <input
                    className="ds-input"
                    type="text"
                    placeholder="Enter passbook address (scy1…) — leave blank to load default"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                />
                <button type="submit" className="ds-submit" disabled={loading}>
                    {loading ? <RefreshCw size={14} className="spin" /> : 'Load Passbook'}
                </button>
            </form>

            {/* Error banner */}
            {result && !result.ok && (
                <div className="desktop-error">
                    <AlertCircle size={15} />
                    <span>{result.error}</span>
                </div>
            )}

            {/* Empty / prompt state */}
            {!result && !loading && (
                <section className="hero-grid">
                    <div>
                        <p className="eyebrow">CRYPTOGRAPHIC ACCOUNT // P2PKH</p>
                        <h1>Passbook Control Room</h1>
                        <p className="lede">Enter a passbook address above to load a clear operational view of the UTXO vault and synchronized ledger mutations from the live node.</p>
                    </div>
                </section>
            )}

            {data && (
                <>
                    <section className="hero-grid">
                        <div>
                            <p className="eyebrow">CRYPTOGRAPHIC ACCOUNT // P2PKH</p>
                            <h1>Passbook Control Room</h1>
                            <p className="lede">A clear operational view of your passbook, UTXO vault, and synchronized ledger mutations.</p>
                        </div>
                        <div className="tip">
                            <Sparkles size={15} /> Block tip <b>#{data.block_height.toLocaleString()}</b>
                        </div>
                    </section>

                    <section className="certificate">
                        <div className="certificate-head">
                            <div className="seal"><ShieldCheck size={22} /></div>
                            <div>
                                <span className="label">VERIFIED PASSBOOK</span>
                                <strong>{data.passbook_id}</strong>
                            </div>
                            <button className="ghost-button" onClick={() => void copy()}>
                                <Copy size={14} /> {copied ? 'Copied' : 'Copy ID'}
                            </button>
                        </div>
                        <div className="balance-row">
                            <div>
                                <span className="label">ACTIVE BALANCE</span>
                                <div className="balance">{formatSCY(data.balance_scy)} <em>SCY</em></div>
                                <p>1 SCY = 100,000,000 quanta</p>
                            </div>
                            <div className="identity">
                                <span><small>ACCOUNT NUMBER</small><b>{data.account_number || '—'}</b></span>
                                <span><small>PUBLIC KEY</small><b>{shortHash(data.public_key)}</b></span>
                                <span><small>DERIVATION PATH</small><b>m/0&apos;/0&apos;</b></span>
                            </div>
                            <div className="quanta">
                                <span>INTEGER QUANTA</span>
                                <strong>{formatQuanta(data.balance_quanta)}</strong>
                                <small>quanta</small>
                            </div>
                        </div>
                    </section>

                    <section className="section-heading">
                        <div>
                            <p className="eyebrow">UNSPENT OUTPUTS</p>
                            <h2>UTXO Vault</h2>
                        </div>
                        <span>{data.utxos.length} active outputs</span>
                    </section>

                    {data.utxos.length === 0 ? (
                        <p className="empty-table">No UTXOs found for this address.</p>
                    ) : (
                        <div className="utxo-grid">
                            {data.utxos.map((item) => (
                                <UtxoCard key={`${item.tx_id}-${item.output_index}`} item={item} />
                            ))}
                        </div>
                    )}

                    <section className="ledger-panel">
                        <div className="section-heading">
                            <div>
                                <p className="eyebrow">AUDIT TRAIL</p>
                                <h2>Mutation Journal</h2>
                            </div>
                            <span><Database size={14} /> Live node ledger</span>
                        </div>
                        {data.ledger.length === 0 ? (
                            <p className="empty-table">No ledger mutations recorded yet.</p>
                        ) : (
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Timestamp</th>
                                            <th>Type</th>
                                            <th>Tx Hash</th>
                                            <th className="right">Delta Quanta</th>
                                            <th className="right">Running Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.ledger.map((item) => (
                                            <tr key={`${item.tx_hash}-${item.timestamp}`}>
                                                <td>{item.timestamp}</td>
                                                <td><span className={`type ${typeClass[item.type]}`}>{item.type}</span></td>
                                                <td className="hash">{item.tx_hash}</td>
                                                <td className={`right delta ${item.delta_quanta >= 0 ? 'positive' : 'negative'}`}>
                                                    {item.delta_quanta >= 0 ? '+' : ''}{formatQuanta(item.delta_quanta)}
                                                </td>
                                                <td className="right">{formatQuanta(item.running_balance_quanta)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <footer className="footer">
                        <span><WalletCards size={14} /> passbook_id verified</span>
                        <span>{data.node_url} <ArrowUpRight size={13} /></span>
                        <span><BookOpen size={14} /> mempool-aware sync</span>
                    </footer>
                </>
            )}
        </main>
    );
}

export default App;
