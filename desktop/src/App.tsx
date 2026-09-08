import { useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, CheckCircle2, Copy, Database, RefreshCw, ShieldCheck, Sparkles, WalletCards } from 'lucide-react';
import { loadPassbook } from '../../shared/api';
import { formatQuanta, formatSCY, shortHash } from '../../shared/format';
import { LedgerMutation, PassbookLedgerData, UTXO } from '../../shared/types';

const typeClass: Record<LedgerMutation['type'], string> = { INBOUND: 'inbound', OUTBOUND: 'outbound', REWARD: 'reward' };

function UtxoCard({ item }: { item: UTXO }) {
    return <article className="utxo-card"><div className="utxo-top"><span>{shortHash(item.tx_id)}</span><b>vOut #{item.output_index}</b></div><strong>{formatQuanta(item.amount_quanta)} <small>quanta</small></strong><footer><span><CheckCircle2 size={13} /> {item.confirmations} confirmations</span><span>UTXO</span></footer></article>;
}

function App() {
    const [data, setData] = useState<PassbookLedgerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const refresh = async () => { setLoading(true); setData(await loadPassbook()); setLoading(false); };
    useEffect(() => { void refresh(); }, []);
    const copy = async () => { if (!data) return; await navigator.clipboard?.writeText(data.passbook_id); setCopied(true); window.setTimeout(() => setCopied(false), 1400); };
    if (!data) return <div className="loading">Loading passbook <span>●●●</span></div>;
    return <main className="shell">
        <header className="topbar"><div className="brand"><div className="brand-mark">S</div><div><strong>SCYTALE</strong><span>PASSBOOK / DESKTOP</span></div></div><div className="node-pill"><i /> {data.sync_status} <span>·</span> {data.node_url.replace('http://', '')}</div><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh node" title="Refresh node"><RefreshCw size={17} className={loading ? 'spin' : ''} /></button></header>
        <section className="hero-grid"><div><p className="eyebrow">CRYPTOGRAPHIC ACCOUNT // P2PKH</p><h1>Passbook Control Room</h1><p className="lede">A clear operational view of your passbook, UTXO vault, and synchronized ledger mutations.</p></div><div className="tip"><Sparkles size={15} /> Block tip <b>#{data.block_height.toLocaleString()}</b></div></section>
        <section className="certificate"><div className="certificate-head"><div className="seal"><ShieldCheck size={22} /></div><div><span className="label">VERIFIED PASSBOOK</span><strong>{data.passbook_id}</strong></div><button className="ghost-button" onClick={() => void copy()}><Copy size={14} /> {copied ? 'Copied' : 'Copy ID'}</button></div><div className="balance-row"><div><span className="label">ACTIVE BALANCE</span><div className="balance">{formatSCY(data.balance_scy)} <em>SCY</em></div><p>1 SCY = 100,000,000 quanta</p></div><div className="identity"><span><small>ACCOUNT NUMBER</small><b>{data.account_number}</b></span><span><small>PUBLIC KEY</small><b>{shortHash(data.public_key)}</b></span><span><small>DERIVATION PATH</small><b>m/0'/0'</b></span></div><div className="quanta"><span>INTEGER QUANTA</span><strong>{formatQuanta(data.balance_quanta)}</strong><small>quanta</small></div></div></section>
        <section className="section-heading"><div><p className="eyebrow">UNSPENT OUTPUTS</p><h2>UTXO Vault</h2></div><span>{data.utxos.length} active outputs</span></section><div className="utxo-grid">{data.utxos.map((item) => <UtxoCard key={`${item.tx_id}-${item.output_index}`} item={item} />)}</div>
        <section className="ledger-panel"><div className="section-heading"><div><p className="eyebrow">AUDIT TRAIL</p><h2>Mutation Journal</h2></div><span><Database size={14} /> Live node ledger</span></div><div className="table-wrap"><table><thead><tr><th>Timestamp</th><th>Type</th><th>Tx Hash</th><th className="right">Delta Quanta</th><th className="right">Running Balance</th></tr></thead><tbody>{data.ledger.map((item) => <tr key={`${item.tx_hash}-${item.timestamp}`}><td>{item.timestamp}</td><td><span className={`type ${typeClass[item.type]}`}>{item.type}</span></td><td className="hash">{item.tx_hash}</td><td className={`right delta ${item.delta_quanta >= 0 ? 'positive' : 'negative'}`}>{item.delta_quanta >= 0 ? '+' : ''}{formatQuanta(item.delta_quanta)}</td><td className="right">{formatQuanta(item.running_balance_quanta)}</td></tr>)}</tbody></table></div></section>
        <footer className="footer"><span><WalletCards size={14} /> passbook_id verified</span><span>{data.node_url} <ArrowUpRight size={13} /></span><span><BookOpen size={14} /> mempool-aware sync</span></footer>
    </main>;
}

export default App;
