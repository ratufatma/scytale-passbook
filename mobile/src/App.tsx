import { useEffect, useState } from 'react';
import {
    AlertCircle, BookOpen, CheckCircle2, Copy, Database,
    QrCode, RefreshCw, ScanLine, Search, ShieldCheck, WalletCards,
} from 'lucide-react';
import { loadPassbook, PassbookResult } from '../../shared/api';
import { formatQuanta, formatSCY, shortHash } from '../../shared/format';
import { DEFAULT_NODE_URL, LedgerMutation, PassbookLedgerData } from '../../shared/types';

type View = 'card' | 'mutations' | 'utxo' | 'scan';
const typeClass: Record<LedgerMutation['type'], string> = {
    INBOUND: 'inbound', OUTBOUND: 'outbound', REWARD: 'reward',
};

function App() {
    const [view, setView] = useState<View>('card');
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
        <main className="mobile-shell">
            <header className="mobile-header">
                <div className="mobile-brand">
                    <div className="mobile-mark">S</div>
                    <div><b>SCYTALE</b><span>PASSBOOK</span></div>
                </div>
                <button className="round-button" onClick={() => void refresh(address.trim() || undefined)} aria-label="Refresh node">
                    <RefreshCw size={17} className={loading ? 'spin' : ''} />
                </button>
            </header>

            {/* Address search bar */}
            <form className="address-bar" onSubmit={handleSearch}>
                <Search size={14} className="address-icon" />
                <input
                    className="address-input"
                    type="text"
                    placeholder="Enter passbook address (scy1…)"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                />
                <button type="submit" className="address-submit" disabled={loading}>
                    {loading ? <RefreshCw size={13} className="spin" /> : 'Go'}
                </button>
            </form>

            {/* Status / error banner */}
            {result && !result.ok && (
                <div className="error-banner">
                    <AlertCircle size={14} />
                    {result.error}
                </div>
            )}

            {data && (
                <>
                    <div className="sync-line">
                        <i /> {data.sync_status} <span>·</span> Block #{data.block_height.toLocaleString()}
                    </div>

                    <section className="mobile-content">
                        {view === 'card' && (
                            <div className="view-stack">
                                <div className="mobile-card">
                                    <div className="card-top">
                                        <div>
                                            <span className="label">VERIFIED PASSBOOK</span>
                                            <strong>{shortHash(data.passbook_id)}</strong>
                                        </div>
                                        <ShieldCheck size={24} />
                                    </div>
                                    <div className="mobile-balance">
                                        <span>ACTIVE BALANCE</span>
                                        <strong>{formatSCY(data.balance_scy)} <em>SCY</em></strong>
                                        <small>{formatQuanta(data.balance_quanta)} quanta</small>
                                    </div>
                                    <div className="mobile-account">
                                        <span>ACCOUNT NUMBER<b>{data.account_number || '—'}</b></span>
                                        <span>DERIVATION PATH<b>m/0&apos;/0&apos;</b></span>
                                    </div>
                                </div>
                                <div className="quick-actions">
                                    <button onClick={() => void copy()}>
                                        <Copy size={16} />{copied ? 'Copied' : 'Copy passbook_id'}
                                    </button>
                                    <button onClick={() => void refresh(address.trim() || undefined)}>
                                        <RefreshCw size={16} />Refresh node
                                    </button>
                                </div>
                                <div className="mobile-note">
                                    <CheckCircle2 size={16} /> 1 SCY = 100,000,000 quanta
                                </div>
                            </div>
                        )}

                        {view === 'mutations' && (
                            <SwipeView title="Mutations" eyebrow="LEDGER JOURNAL" icon={<BookOpen size={17} />}>
                                {data.ledger.length === 0 ? (
                                    <p className="swipe-hint">No mutations recorded yet.</p>
                                ) : (
                                    <div className="swipe-track">
                                        {data.ledger.map((item) => (
                                            <article className="mutation-card" key={`${item.tx_hash}-${item.timestamp}`}>
                                                <div>
                                                    <span className={`type ${typeClass[item.type]}`}>{item.type}</span>
                                                    <time>{item.timestamp}</time>
                                                </div>
                                                <strong className={item.delta_quanta >= 0 ? 'positive' : 'negative'}>
                                                    {item.delta_quanta >= 0 ? '+' : ''}{formatQuanta(item.delta_quanta)} <small>quanta</small>
                                                </strong>
                                                <footer>
                                                    <span>{shortHash(item.tx_hash)}</span>
                                                    <span>Balance {formatQuanta(item.running_balance_quanta)}</span>
                                                </footer>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </SwipeView>
                        )}

                        {view === 'utxo' && (
                            <SwipeView title="UTXO Vault" eyebrow="UNSPENT OUTPUTS" icon={<Database size={17} />}>
                                {data.utxos.length === 0 ? (
                                    <p className="swipe-hint">No UTXOs found.</p>
                                ) : (
                                    <div className="swipe-track">
                                        {data.utxos.map((item) => (
                                            <article className="utxo-mobile" key={`${item.tx_id}-${item.output_index}`}>
                                                <div className="utxo-heading">
                                                    <span>{shortHash(item.tx_id)}</span>
                                                    <b>vOut #{item.output_index}</b>
                                                </div>
                                                <strong>{formatQuanta(item.amount_quanta)} <small>quanta</small></strong>
                                                <footer>
                                                    <span><CheckCircle2 size={13} /> {item.confirmations} confirmations</span>
                                                    <span>UTXO</span>
                                                </footer>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </SwipeView>
                        )}

                        {view === 'scan' && (
                            <SwipeView title="Scan QR" eyebrow="P2PKH PAYLOAD" icon={<QrCode size={17} />}>
                                <div className="scan-card">
                                    <ScanLine size={68} />
                                    <h2>Scan a passbook payload</h2>
                                    <p>Use the device camera to inspect a P2PKH payload or share this passbook_id.</p>
                                    <button onClick={() => void copy()}><Copy size={16} />Copy passbook_id</button>
                                </div>
                            </SwipeView>
                        )}
                    </section>
                </>
            )}

            {!result && !loading && (
                <div className="empty-state">
                    <Search size={40} />
                    <p>Enter a passbook address above to load ledger data from the node.</p>
                </div>
            )}

            <nav className="bottom-nav">
                <NavButton active={view === 'card'} onClick={() => setView('card')} icon={<WalletCards size={19} />} label="Passbook Card" />
                <NavButton active={view === 'mutations'} onClick={() => setView('mutations')} icon={<BookOpen size={19} />} label="Mutations" />
                <NavButton active={view === 'utxo'} onClick={() => setView('utxo')} icon={<Database size={19} />} label="UTXO Vault" />
                <NavButton active={view === 'scan'} onClick={() => setView('scan')} icon={<QrCode size={19} />} label="Scan QR" />
            </nav>
        </main>
    );
}

function SwipeView({ title, eyebrow, icon, children }: {
    title: string; eyebrow: string; icon: React.ReactNode; children: React.ReactNode;
}) {
    return (
        <div className="view-stack">
            <header className="mobile-section-head">
                <div>
                    <span className="label">{eyebrow}</span>
                    <h1>{title}</h1>
                </div>
                <div className="section-icon">{icon}</div>
            </header>
            {children}
            <p className="swipe-hint">Swipe cards to browse</p>
        </div>
    );
}

function NavButton({ active, onClick, icon, label }: {
    active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
    return (
        <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}>
            {icon}<span>{label}</span>
        </button>
    );
}

export default App;
