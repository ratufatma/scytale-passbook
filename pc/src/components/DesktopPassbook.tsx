import React, { useState, useMemo, useEffect } from 'react';
import {
  Shield,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  Copy,
  Check,
  Server,
  RefreshCw,
  QrCode,
  Search,
  ChevronRight,
  Database,
  Clock,
  Lock,
  PlusCircle,
  Cpu
} from 'lucide-react';
import GeminiIcon from './icons/GeminiIcon.tsx';

export interface UtxoItem {
  txid: string;
  vout: number;
  quanta: number;
  blockHeight: number;
  status: 'CONFIRMED' | 'PENDING';
  scriptPubKey?: string;
  confirmations?: number;
}

export interface MutationItem {
  id: string;
  timestamp: string;
  type: 'INBOUND' | 'OUTBOUND' | 'REWARD';
  txHash: string;
  quantaDelta: number;
  runningBalanceQuanta: number;
  note?: string;
}

export interface PassbookData {
  accountNumber: string;
  passbookId: string;
  derivationPath: string;
  nodeUrl: string;
  blockTip: number;
  totalQuanta: number;
  isSynced: boolean;
  mempoolTxs: number;
  p2pkhAddress: string;
}

export default function DesktopPassbook() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INBOUND' | 'OUTBOUND' | 'REWARD'>('ALL');
  const [showQrModal, setShowQrModal] = useState(false);
  const [selectedUtxo, setSelectedUtxo] = useState<UtxoItem | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [networkPing, setNetworkPing] = useState(24);

  // Synchronized node state
  const [passbookData, setPassbookData] = useState<PassbookData>({
    accountNumber: "SCY-004812",
    passbookId: "scy1nw7vhxmxyz2jlw89vz88tdv938692xk968uxn89787fa4w207s8sddvv3q",
    derivationPath: "m/44'/999'/0'/0/0",
    nodeUrl: "http://127.0.0.1:8332",
    blockTip: 1084,
    totalQuanta: 1980000000000000,
    isSynced: true,
    mempoolTxs: 1,
    p2pkhAddress: "scy1nw7vhxmxyz2jlw89vz88tdv938692xk968uxn89787fa4w207s8sddvv3q"
  });

  const [utxos, setUtxos] = useState<UtxoItem[]>([
    {
      txid: "f8c04455dd8982944f59cf017ac701dbb12c42aa2b022b353886d5382816fc21",
      vout: 0,
      quanta: 1980000000000000,
      blockHeight: 0,
      status: 'CONFIRMED',
      scriptPubKey: "OP_DUP OP_BLAKE3 73a020... OP_EQUALVERIFY OP_CHECKSIG",
      confirmations: 1
    }
  ]);

  const [mutations, setMutations] = useState<MutationItem[]>([
    {
      id: "m_genesis",
      timestamp: "Genesis Epoch (0)",
      type: "REWARD",
      txHash: "0xf8c04455dd89...16fc21",
      quantaDelta: 1980000000000000,
      runningBalanceQuanta: 1980000000000000,
      note: "Genesis founder allocation & mining reward"
    }
  ]);

  const formatSCY = (quanta: number) => (quanta / 100000000).toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 8
  });

  const formatQuanta = (quanta: number) => quanta.toLocaleString('en-US');

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const loadFromNode = async () => {
    setIsRefreshing(true);
    try {
      const endpoints = [
        'http://127.0.0.1:8332/api/v1/passbook?address=scy1nw7vhxmxyz2jlw89vz88tdv938692xk968uxn89787fa4w207s8sddvv3q',
        'https://explorer.myratu.com/api/v1/passbook?address=scy1nw7vhxmxyz2jlw89vz88tdv938692xk968uxn89787fa4w207s8sddvv3q'
      ];
      let data: any = null;
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep, { signal: AbortSignal.timeout(2500) });
          if (res.ok) {
            data = await res.json();
            break;
          }
        } catch {
          // fallback to next
        }
      }

      if (data) {
        const balance = Number(data.confirmed_native_balance_quanta ?? data.balance_quanta ?? data.balance ?? 0);
        setPassbookData(prev => ({
          ...prev,
          totalQuanta: balance > 0 ? balance : prev.totalQuanta,
          blockTip: Number(data.block_height ?? prev.blockTip)
        }));
      }
    } catch {
      // offline fallback
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadFromNode();
  }, []);

  const handleSimulateInboundTx = () => {
    const delta = 15000000000; // 150 SCY
    const newTotal = passbookData.totalQuanta + delta;
    const newBlock = passbookData.blockTip + 1;
    const newTxId = `scy_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;

    const newMutation: MutationItem = {
      id: `m_${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      type: 'INBOUND',
      txHash: `${newTxId.substring(0, 8)}...${newTxId.substring(newTxId.length - 6)}`,
      quantaDelta: delta,
      runningBalanceQuanta: newTotal,
      note: "Incoming P2PKH peer transfer"
    };

    const newUtxo: UtxoItem = {
      txid: `${newTxId}f8a7e6d5c4b3a21e0f9876543210fedcba`,
      vout: 0,
      quanta: delta,
      blockHeight: newBlock,
      status: 'CONFIRMED',
      scriptPubKey: "OP_DUP OP_BLAKE3 e0f987... OP_EQUALVERIFY OP_CHECKSIG",
      confirmations: 1
    };

    setPassbookData(prev => ({
      ...prev,
      totalQuanta: newTotal,
      blockTip: newBlock
    }));
    setMutations(prev => [newMutation, ...prev]);
    setUtxos(prev => [newUtxo, ...prev]);
  };

  const filteredMutations = useMemo(() => {
    return mutations.filter(m => {
      const matchesType = typeFilter === 'ALL' || m.type === typeFilter;
      const matchesSearch =
        m.txHash.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.note && m.note.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesType && matchesSearch;
    });
  }, [mutations, typeFilter, searchQuery]);

  return (
    <div className="w-full min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 md:p-8 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Viewport Control Bar & Network Telemetry */}
      <header className="max-w-7xl mx-auto mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping absolute opacity-75" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 relative" />
          </div>
          <GeminiIcon className="w-6 h-6 rounded-md shrink-0 shadow-lg shadow-cyan-950/50" size={24} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono tracking-widest text-emerald-400 font-bold uppercase">
                Scytale Desktop Passbook
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
                Tauri v2 Native Runtime
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/40 border border-cyan-800/40 text-cyan-400 font-mono">
                Gemini Core
              </span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-2 mt-0.5">
              <span>Node: {passbookData.nodeUrl}</span>
              <span className="text-zinc-700">•</span>
              <span className="text-emerald-400/90">{networkPing}ms latency</span>
              <span className="text-zinc-700">•</span>
              <span className="text-cyan-400/90">mempool: {passbookData.mempoolTxs} txs</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            id="simulate-inbound-btn"
            onClick={handleSimulateInboundTx}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 transition active:scale-95"
            title="Simulate incoming inbound payment"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>+150 SCY</span>
          </button>

          <button
            id="sync-node-btn"
            onClick={loadFromNode}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition active:scale-95 disabled:opacity-50"
            title="Poll Node & Increment Block Tip"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </header>

      {/* Main 100% Window Desktop Canvas */}
      <main className="max-w-7xl mx-auto">
        {/* HOLOGRAPHIC PASSBOOK CARD */}
        <section
          id="passbook-certificate-card"
          className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 p-6 sm:p-7 shadow-2xl shadow-emerald-950/20 mb-6 group"
        >
          {/* Cybernetic Ambient Glow & Grid Accent */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Card Top Metadata */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-zinc-800/80 pb-5 relative z-10">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-semibold border border-emerald-500/30">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  Cryptographic Passbook
                </span>
                <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded bg-zinc-800/90 text-zinc-300 font-mono border border-zinc-700/50">
                  {passbookData.derivationPath}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-400 font-mono border border-cyan-800/40">
                  UTXO Ledger
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-mono font-bold tracking-tight text-white mt-1 flex items-center gap-2">
                <span>{passbookData.accountNumber}</span>
                <button
                  onClick={() => copyToClipboard(passbookData.accountNumber, 'acc')}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                  title="Copy Account Number"
                >
                  {copiedKey === 'acc' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </h1>
            </div>

            <div className="flex md:flex-col items-center md:items-end justify-between md:justify-start gap-1">
              <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 px-2.5 py-1 rounded-full font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Node Synced #{passbookData.blockTip}</span>
              </div>
              <div className="text-[11px] font-mono text-zinc-400 truncate max-w-[260px] mt-1 flex items-center gap-1">
                <Server className="w-3 h-3 text-zinc-400" />
                <span>{passbookData.nodeUrl}</span>
              </div>
            </div>
          </div>

          {/* Passbook ID Banner */}
          <div className="my-4 p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between gap-3 relative z-10">
            <div className="truncate flex-1">
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-zinc-400 font-mono">
                <Lock className="w-2.5 h-2.5 text-emerald-400" />
                <span>passbook_id (Canonical Derivation)</span>
              </div>
              <div className="text-xs font-mono text-zinc-300 truncate mt-0.5 font-medium">
                {passbookData.passbookId}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                id="show-qr-btn"
                onClick={() => setShowQrModal(true)}
                className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition border border-zinc-800"
                title="Display QR code"
              >
                <QrCode className="w-3.5 h-3.5 text-cyan-400" />
              </button>
              <button
                id="copy-passbook-id-btn"
                onClick={() => copyToClipboard(passbookData.passbookId, 'pb')}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition border border-zinc-700"
              >
                {copiedKey === 'pb' ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Dual Balance Display: SCY & Quanta */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 relative z-10">
            <div className="p-4 rounded-xl bg-zinc-950/50 border border-zinc-800/60 hover:border-emerald-500/40 transition">
              <div className="flex items-center justify-between text-xs text-zinc-400 uppercase tracking-wider font-mono mb-1">
                <span>Available Balance</span>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                  8 DECIMALS
                </span>
              </div>
              <div className="text-2xl md:text-3xl font-mono font-black text-white tracking-tight break-all">
                {formatSCY(passbookData.totalQuanta)}{' '}
                <span className="text-sm font-semibold text-emerald-400 ml-1">SCY</span>
              </div>
              <div className="text-[11px] font-mono text-zinc-400 mt-1">
                Canonical Coins: {(passbookData.totalQuanta / 100000000).toFixed(4)} SCY Coin Standard
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/50 border border-zinc-800/60 hover:border-cyan-500/40 transition">
              <div className="flex items-center justify-between text-xs text-zinc-400 uppercase tracking-wider font-mono mb-1">
                <span>Quanta Integer</span>
                <span className="text-[10px] text-cyan-400 font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                  1 SCY = 10⁸ quanta
                </span>
              </div>
              <div className="text-xl md:text-2xl font-mono font-bold text-zinc-200 tracking-tight break-all">
                {formatQuanta(passbookData.totalQuanta)}{' '}
                <span className="text-xs font-mono text-cyan-400 ml-1">quanta</span>
              </div>
              <div className="text-[11px] font-mono text-zinc-400 mt-1">
                Deterministic integer for zero rounding discrepancies
              </div>
            </div>
          </div>

          {/* Quick Info Bar on Card Footer */}
          <div className="mt-4 pt-3 border-t border-zinc-800/60 flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-400 gap-2">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>Consensus: P2PKH Hash-Time Verification</span>
            </div>
            <div className="flex items-center gap-3">
              <span>UTXO Count: <strong className="text-zinc-200">{utxos.length}</strong></span>
              <span>Ledger Mutations: <strong className="text-zinc-200">{mutations.length}</strong></span>
            </div>
          </div>
        </section>

        {/* DESKTOP SPLIT VIEW: UTXO VAULT & MUTATION JOURNAL */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* UTXO VAULT BREAKDOWN */}
          <div
            id="utxo-vault-panel"
            className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-5 shadow-xl lg:col-span-1"
          >
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded bg-cyan-400 animate-pulse" />
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-cyan-400" />
                  UTXO Vault
                </h2>
              </div>
              <span className="text-xs font-mono text-zinc-400 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                {utxos.length} Outputs
              </span>
            </div>

            <p className="text-[11px] font-mono text-zinc-400 mb-3">
              Unspent Transaction Outputs ready for cryptographic spending script execution.
            </p>

            <div className="space-y-3">
              {utxos.map((utxo) => (
                <div
                  key={`${utxo.txid}-${utxo.vout}`}
                  onClick={() => setSelectedUtxo(utxo)}
                  className="p-3.5 rounded-xl bg-zinc-950/90 border border-zinc-800/80 hover:border-cyan-500/50 transition cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                    <span className="text-cyan-400 font-semibold group-hover:text-cyan-300 transition truncate max-w-[170px]" title={`${utxo.txid}:${utxo.vout}`}>
                      {utxo.txid.slice(0, 6)}...{utxo.txid.slice(-6)}:{utxo.vout}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-400 border border-emerald-800/40">
                      Block #{utxo.blockHeight}
                    </span>
                  </div>

                  <div className="text-sm font-mono font-bold text-white flex items-center justify-between">
                    <span>{formatSCY(utxo.quanta)} SCY</span>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition" />
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mt-1">
                    <span>{formatQuanta(utxo.quanta)} quanta</span>
                    <span className="text-zinc-400">{utxo.confirmations ?? 1} conf</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 rounded-xl bg-cyan-950/20 border border-cyan-900/30 text-[11px] font-mono text-zinc-400 flex items-center justify-between">
              <span>Vault Aggregate:</span>
              <span className="text-cyan-300 font-bold">
                {formatSCY(utxos.reduce((acc, u) => acc + u.quanta, 0))} SCY
              </span>
            </div>
          </div>

          {/* SYNCHRONIZED MUTATION JOURNAL */}
          <div
            id="mutations-journal-panel"
            className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-5 shadow-xl lg:col-span-2"
          >
            {/* Header & Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded bg-emerald-400 animate-pulse" />
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  Synchronized Mutations
                </h2>
                <span className="text-xs font-mono text-emerald-400/90 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                  Live Ledger
                </span>
              </div>

              {/* Filter and Search Bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-44">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Filter hash or memo..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-[10px] font-mono">
                  {(['ALL', 'INBOUND', 'OUTBOUND', 'REWARD'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setTypeFilter(type)}
                      className={`px-2 py-1 rounded transition ${
                        typeFilter === type
                          ? 'bg-zinc-800 text-white font-bold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table for Desktop */}
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="text-zinc-400 border-b border-zinc-800 text-[11px] uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Timestamp</th>
                    <th className="pb-3 font-semibold">Type</th>
                    <th className="pb-3 font-semibold">Tx Hash</th>
                    <th className="pb-3 font-semibold text-right">Quanta Delta</th>
                    <th className="pb-3 font-semibold text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {filteredMutations.map((m) => (
                    <tr key={m.id} className="hover:bg-zinc-800/30 transition group">
                      <td className="py-3 text-zinc-400 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-zinc-400" />
                          <span>{m.timestamp}</span>
                        </div>
                        {m.note && <div className="text-[10px] text-zinc-400 mt-0.5">{m.note}</div>}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                            m.type === 'INBOUND'
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                              : m.type === 'OUTBOUND'
                              ? 'bg-rose-950/60 text-rose-400 border-rose-800/50'
                              : 'bg-cyan-950/60 text-cyan-400 border-cyan-800/50'
                          }`}
                        >
                          {m.type === 'INBOUND' && <ArrowDownLeft className="w-3 h-3" />}
                          {m.type === 'OUTBOUND' && <ArrowUpRight className="w-3 h-3" />}
                          {m.type === 'REWARD' && <Gift className="w-3 h-3" />}
                          {m.type}
                        </span>
                      </td>
                      <td className="py-3 text-zinc-300">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="truncate max-w-[140px]">{m.txHash}</span>
                          <button
                            onClick={() => copyToClipboard(m.txHash, m.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                            title="Copy Tx Hash"
                          >
                            {copiedKey === m.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td
                        className={`py-3 text-right font-bold whitespace-nowrap ${
                          m.quantaDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        <div>
                          {m.quantaDelta >= 0 ? '+' : ''}
                          {formatSCY(m.quantaDelta)} SCY
                        </div>
                        <div className="text-[10px] font-normal text-zinc-400">
                          {m.quantaDelta >= 0 ? '+' : ''}
                          {formatQuanta(m.quantaDelta)} quanta
                        </div>
                      </td>
                      <td className="py-3 text-right text-zinc-200 whitespace-nowrap">
                        <div className="font-semibold">{formatSCY(m.runningBalanceQuanta)} SCY</div>
                        <div className="text-[10px] text-zinc-400">
                          {formatQuanta(m.runningBalanceQuanta)} quanta
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredMutations.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-400">
                        No ledger mutations match filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* QR Code Modal Dialog */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-mono font-bold uppercase text-white">Passbook Address QR</h3>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-zinc-400 hover:text-white text-xs font-mono p-1"
              >
                ✕ Close
              </button>
            </div>

            {/* Stylized QR Code Visual */}
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col items-center justify-center mb-4">
              <div className="w-48 h-48 bg-white p-3 rounded-lg flex items-center justify-center shadow-inner">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <rect width="100" height="100" fill="white" />
                  <rect x="10" y="10" width="25" height="25" fill="black" />
                  <rect x="14" y="14" width="17" height="17" fill="white" />
                  <rect x="18" y="18" width="9" height="9" fill="black" />
                  <rect x="65" y="10" width="25" height="25" fill="black" />
                  <rect x="69" y="14" width="17" height="17" fill="white" />
                  <rect x="73" y="18" width="9" height="9" fill="black" />
                  <rect x="10" y="65" width="25" height="25" fill="black" />
                  <rect x="14" y="69" width="17" height="17" fill="white" />
                  <rect x="18" y="73" width="9" height="9" fill="black" />
                  <rect x="42" y="12" width="6" height="6" fill="black" />
                  <rect x="52" y="12" width="6" height="6" fill="black" />
                  <rect x="42" y="24" width="6" height="12" fill="black" />
                  <rect x="52" y="30" width="6" height="6" fill="black" />
                  <rect x="12" y="42" width="6" height="6" fill="black" />
                  <rect x="24" y="42" width="12" height="6" fill="black" />
                  <rect x="42" y="42" width="16" height="16" fill="black" />
                  <rect x="65" y="42" width="6" height="6" fill="black" />
                  <rect x="78" y="42" width="12" height="6" fill="black" />
                  <rect x="65" y="52" width="12" height="6" fill="black" />
                  <rect x="12" y="52" width="6" height="6" fill="black" />
                  <rect x="24" y="52" width="6" height="6" fill="black" />
                  <rect x="42" y="65" width="6" height="12" fill="black" />
                  <rect x="52" y="72" width="6" height="6" fill="black" />
                  <rect x="65" y="65" width="12" height="6" fill="black" />
                  <rect x="78" y="72" width="12" height="12" fill="black" />
                  <rect x="65" y="78" width="6" height="6" fill="black" />
                  <rect x="52" y="84" width="6" height="6" fill="black" />
                </svg>
              </div>
              <div className="text-[10px] font-mono text-zinc-400 mt-2 text-center break-all">
                {passbookData.accountNumber} • {passbookData.passbookId.slice(0, 20)}...
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => copyToClipboard(passbookData.passbookId, 'qr-pb')}
                className="w-full py-2 px-3 text-xs font-mono font-medium rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold transition flex items-center justify-center gap-1.5"
              >
                {copiedKey === 'qr-pb' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'qr-pb' ? 'Copied Passbook ID!' : 'Copy Full Passbook ID'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UTXO Details Inspector Modal */}
      {selectedUtxo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-md w-full shadow-2xl relative font-mono text-xs">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold uppercase text-white">UTXO Output Inspector</h3>
              </div>
              <button
                onClick={() => setSelectedUtxo(null)}
                className="text-zinc-400 hover:text-white p-1"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase text-zinc-400 block mb-1">Transaction Hash (TxID)</span>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-cyan-300 break-all text-[11px]">
                  {selectedUtxo.txid}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] uppercase text-zinc-400 block mb-1">vOut Index</span>
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-white font-bold">
                    Index #{selectedUtxo.vout}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-zinc-400 block mb-1">Mined Block Height</span>
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-emerald-400 font-bold">
                    Height #{selectedUtxo.blockHeight}
                  </div>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase text-zinc-400 block mb-1">Value Breakdown</span>
                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                  <span className="text-white font-bold text-sm">{formatSCY(selectedUtxo.quanta)} SCY</span>
                  <span className="text-cyan-400">{formatQuanta(selectedUtxo.quanta)} quanta</span>
                </div>
              </div>

              {selectedUtxo.scriptPubKey && (
                <div>
                  <span className="text-[10px] uppercase text-zinc-400 block mb-1">scriptPubKey (P2PKH)</span>
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 break-all">
                    {selectedUtxo.scriptPubKey}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <button
                onClick={() => copyToClipboard(selectedUtxo.txid, 'utxo-copy')}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition text-xs flex items-center gap-1.5"
              >
                {copiedKey === 'utxo-copy' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copy TxID</span>
              </button>
              <button
                onClick={() => setSelectedUtxo(null)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold transition text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
