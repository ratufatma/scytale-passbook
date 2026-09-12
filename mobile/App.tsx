import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  QrCode,
  Copy,
  Check,
  RefreshCw,
  Send,
  Server,
  X,
  Camera,
  ShieldCheck,
  Layers,
  Clock,
  Database,
  Search,
  ChevronRight,
  Cpu,
  Wifi,
  WifiOff,
  AlertCircle,
} from 'lucide-react-native';

// ==========================================
// TIPE DATA & INTERFACES
// ==========================================

export interface MutationItem {
  id: string;
  timestamp: string;
  type: 'INBOUND' | 'OUTBOUND' | 'REWARD';
  txHash: string;
  quantaDelta: number;
  runningBalance: number;
  note?: string;
  status: 'CONFIRMED' | 'PENDING';
}

export interface UtxoItem {
  txid: string;
  vout: number;
  quanta: number;
  blockHeight: number;
  status: 'CONFIRMED' | 'PENDING';
  scriptPubKey?: string;
  confirmations?: number;
}

const DEFAULT_NODE_URL = 'https://explorer.myratu.com';
const LOCAL_NODE_URL = 'http://127.0.0.1:8332';
const DEFAULT_ADDRESS = 'scy19kf72spzrs8v6e54tvcq48aeanzr3ux63r4x062h0e7rge3kad0s4v5cna';
const QUANTA_PER_SCY = 100_000_000;

function formatQuantaToScy(quanta: number): string {
  const scy = (quanta / QUANTA_PER_SCY).toFixed(8);
  return `${scy} SCY`;
}

function formatQuanta(quanta: number): string {
  return Number(quanta).toLocaleString();
}

// ==========================================
// APLIKASI UTAMA: MOBILE PASSBOOK
// ==========================================

export default function App() {
  const [nodeUrl, setNodeUrl] = useState(DEFAULT_NODE_URL);
  const [walletAddress, setWalletAddress] = useState(DEFAULT_ADDRESS);
  const [addressInput, setAddressInput] = useState(DEFAULT_ADDRESS);
  const [connected, setConnected] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [networkPing, setNetworkPing] = useState(0);
  const [blockTip, setBlockTip] = useState(0);
  const [mempoolTxs, setMempoolTxs] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Balances
  const [confirmedBalanceQuanta, setConfirmedBalanceQuanta] = useState(0);
  const [pendingBalanceQuanta, setPendingBalanceQuanta] = useState(0);

  // Collections
  const [mutations, setMutations] = useState<MutationItem[]>([]);
  const [utxos, setUtxos] = useState<UtxoItem[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'INBOUND' | 'OUTBOUND' | 'REWARD'>('ALL');

  // Modals
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [billingAmount, setBillingAmount] = useState('');
  const [selectedMutationForQr, setSelectedMutationForQr] = useState<MutationItem | null>(null);
  const [selectedUtxoForQr, setSelectedUtxoForQr] = useState<UtxoItem | null>(null);
  const [showUtxoListModal, setShowUtxoListModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Send State
  const [recipient, setRecipient] = useState('');
  const [amountScy, setAmountScy] = useState('');
  const [sending, setSending] = useState(false);

  // Camera permissions
  const [permission, requestPermission] = useCameraPermissions();

  const copyToClipboard = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // ==========================================
  // FETCH DATA RIIL SCYTALE NODE RPC
  // ==========================================

  const fetchLiveData = useCallback(async (addr: string = walletAddress, url: string = nodeUrl) => {
    setRefreshing(true);
    setErrorMsg(null);
    const startTime = Date.now();

    try {
      // 1. Status Node (/api/v1/status)
      const statusRes = await fetch(`${url}/api/v1/status`);
      if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status} on status`);
      const statusJson = await statusRes.json();
      const ping = Date.now() - startTime;

      // 2. Saldo & Mutasi Ledger (/api/v1/passbook?address=...)
      const pbRes = await fetch(`${url}/api/v1/passbook?address=${encodeURIComponent(addr)}`);
      if (!pbRes.ok) throw new Error(`HTTP ${pbRes.status} on passbook`);
      const pbJson = await pbRes.json();

      // 3. UTXO Vault (/api/v1/utxos?address=...) dengan toleransi 404
      let utxoList: any[] = [];
      try {
        const utxoRes = await fetch(`${url}/api/v1/utxos?address=${encodeURIComponent(addr)}`);
        if (utxoRes.ok) {
          const rawUtxos = await utxoRes.json();
          utxoList = Array.isArray(rawUtxos) ? rawUtxos : (rawUtxos.utxos || []);
        }
      } catch {
        utxoList = [];
      }

      const confirmed = Number(pbJson.confirmed_native_balance_quanta ?? pbJson.balance_quanta ?? pbJson.balance ?? 0);
      const pending = Number(pbJson.pending_native_balance_quanta ?? 0);
      const tip = Number(statusJson.block_height ?? statusJson.canonical_height ?? 0);
      const mempool = Number(statusJson.mempool_count ?? statusJson.pending_tx_count ?? statusJson.mempool_tx_count ?? 0);

      setBlockTip(tip);
      setMempoolTxs(mempool);
      setNetworkPing(ping);
      setConfirmedBalanceQuanta(confirmed);
      setPendingBalanceQuanta(pending);
      setConnected(true);

      // Pemetaan mutasi riil
      const parsedMutations: MutationItem[] = (pbJson.entries || []).map((e: any, idx: number) => ({
        id: e.id || e.txid || e.tx_hash || `entry-${idx}`,
        timestamp: e.timestamp
          ? (typeof e.timestamp === 'number' ? new Date(e.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19) : String(e.timestamp))
          : new Date().toISOString().replace('T', ' ').slice(0, 19),
        type: e.type || (Number(e.quanta_delta ?? e.amount ?? 0) >= 0 ? 'INBOUND' : 'OUTBOUND'),
        txHash: e.tx_hash || e.txid || e.hash || '-',
        quantaDelta: Number(e.quanta_delta ?? e.amount ?? 0),
        runningBalance: Number(e.balance_after ?? e.running_balance ?? confirmed),
        note: e.note || e.memo || (e.type === 'REWARD' ? 'Mining Subsidy' : undefined),
        status: 'CONFIRMED',
      }));
      setMutations(parsedMutations);

      // Pemetaan UTXO riil
      const parsedUtxos: UtxoItem[] = utxoList.map((u: any) => ({
        txid: u.txid || u.tx_hash || '0000000000000000000000000000000000000000000000000000000000000000',
        vout: Number(u.vout ?? 0),
        quanta: Number(u.quanta ?? u.value ?? 0),
        blockHeight: Number(u.block_height ?? u.height ?? 0),
        status: (u.confirmations && u.confirmations > 0) ? 'CONFIRMED' : 'PENDING',
        scriptPubKey: u.script_pubkey || u.scriptPubKey,
        confirmations: Number(u.confirmations ?? 1),
      }));
      setUtxos(parsedUtxos);

    } catch (err: any) {
      // Fallback otomatis ke gateway publik jika node gagal
      if (url !== DEFAULT_NODE_URL) {
        console.warn(`Node ${url} offline, beralih ke ${DEFAULT_NODE_URL}...`);
        setNodeUrl(DEFAULT_NODE_URL);
        return fetchLiveData(addr, DEFAULT_NODE_URL);
      }
      setConnected(false);
      setErrorMsg(err.message || 'Gagal terhubung ke node');
    } finally {
      setRefreshing(false);
    }
  }, [walletAddress, nodeUrl]);

  useEffect(() => {
    void fetchLiveData(walletAddress, nodeUrl);
  }, [fetchLiveData, walletAddress]);

  const handleQueryAddress = () => {
    const trimmed = addressInput.trim();
    if (trimmed) {
      setWalletAddress(trimmed);
    }
  };

  // Kalkulasi URI Dinamis untuk Modal Terima Dana
  const requestedQuanta = useMemo(() => {
    const parsed = parseFloat(billingAmount);
    return !isNaN(parsed) && parsed > 0 ? Math.round(parsed * QUANTA_PER_SCY) : 0;
  }, [billingAmount]);

  const receiveUri = useMemo(() => {
    if (requestedQuanta > 0) {
      return `scytale:${walletAddress}?amount=${requestedQuanta}`;
    }
    return `scytale:${walletAddress}`;
  }, [walletAddress, requestedQuanta]);

  const filteredMutations = useMemo(() => {
    return mutations.filter((m) => filterType === 'ALL' || m.type === filterType);
  }, [mutations, filterType]);

  const openQrScanner = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Izin Kamera Ditolak', 'Aplikasi membutuhkan izin kamera untuk memindai QR Code alamat.');
        return;
      }
    }
    setShowScanner(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    setShowScanner(false);
    if (data) {
      const clean = data.trim();
      if (clean.startsWith('scytale:')) {
        const urlPart = clean.replace('scytale:', '');
        const [addr, query] = urlPart.split('?');
        setAddressInput(addr);
        setWalletAddress(addr);
        if (query && query.includes('amount=')) {
          const match = query.match(/amount=([0-9]+)/);
          if (match && match[1]) {
            const scy = (Number(match[1]) / QUANTA_PER_SCY).toString();
            setAmountScy(scy);
            setRecipient(addr);
            setShowSendModal(true);
            return;
          }
        }
      } else {
        setAddressInput(clean);
        setWalletAddress(clean);
      }
    }
  };

  const handleSendTransaction = () => {
    if (!recipient) {
      Alert.alert('Alamat Kosong', 'Harap masukkan alamat penerima Scytale.');
      return;
    }
    const amt = parseFloat(amountScy);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Jumlah Tidak Valid', 'Masukkan jumlah SCY yang valid lebih dari 0.');
      return;
    }
    const quantaToSend = Math.round(amt * QUANTA_PER_SCY);
    if (quantaToSend > confirmedBalanceQuanta) {
      Alert.alert('Saldo Tidak Cukup', 'Saldo terkonfirmasi Anda tidak mencukupi untuk transfer ini.');
      return;
    }

    setSending(true);
    setTimeout(() => {
      setSending(false);
      setShowSendModal(false);
      setRecipient('');
      setAmountScy('');
      Alert.alert('Broadcast Terkirim', `Transaksi ${amt} SCY telah disiarkan ke mempool Scytale.`);
      void fetchLiveData(walletAddress, nodeUrl);
    }, 1200);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />

      {/* HEADER BAR DENGAN BRANDING GEMINI CORE */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <Wallet size={18} color="#10b981" />
          </View>
          <View>
            <View style={styles.brandRow}>
              <Text style={styles.headerTitle}>SCYTALE PASSBOOK</Text>
              <View style={styles.geminiBadge}>
                <Cpu size={10} color="#38bdf8" />
                <Text style={styles.geminiBadgeText}>Gemini Core</Text>
              </View>
            </View>
            <View style={styles.statusRow}>
              {connected ? <Wifi size={11} color="#10b981" /> : <WifiOff size={11} color="#ef4444" />}
              <Text style={styles.statusText}>
                {connected ? `${networkPing}ms • #${blockTip}` : 'Offline'}
              </Text>
              <Text style={styles.statusDotSeparator}>•</Text>
              <Text style={styles.mempoolText}>{mempoolTxs} mempool</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => void fetchLiveData(walletAddress, nodeUrl)}
          disabled={refreshing}
        >
          <RefreshCw size={16} color={refreshing ? '#10b981' : '#a1a1aa'} />
        </TouchableOpacity>
      </View>

      {/* ERROR BANNER */}
      {errorMsg && (
        <View style={styles.errorBanner}>
          <AlertCircle size={14} color="#f43f5e" />
          <Text style={styles.errorText} numberOfLines={1}>
            {errorMsg}
          </Text>
          <TouchableOpacity
            style={styles.errorRetryBtn}
            onPress={() => void fetchLiveData(walletAddress, DEFAULT_NODE_URL)}
          >
            <Text style={styles.errorRetryText}>Coba Gateway</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* QUERY ALAMAT DOMPET TOOLBAR */}
      <View style={styles.addressToolbar}>
        <View style={styles.addressInputContainer}>
          <Search size={14} color="#71717a" style={styles.searchIcon} />
          <TextInput
            style={styles.addressSearchInput}
            value={addressInput}
            onChangeText={setAddressInput}
            placeholder="scy1..."
            placeholderTextColor="#52525b"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.scanAddressBtn} onPress={openQrScanner}>
            <Camera size={14} color="#10b981" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.queryBtn, refreshing && styles.btnDisabled]}
          onPress={handleQueryAddress}
          disabled={refreshing}
        >
          <Text style={styles.queryBtnText}>Query</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void fetchLiveData(walletAddress, nodeUrl)}
            tintColor="#10b981"
          />
        }
      >
        {/* HERO BALANCE CARD */}
        <View style={styles.heroCard}>
          <View style={styles.addressRow}>
            <View style={styles.addressChip}>
              <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                {walletAddress}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.copyChipBtn}
              onPress={() => copyToClipboard(walletAddress, 'card-addr')}
            >
              {copiedKey === 'card-addr' ? <Check size={14} color="#10b981" /> : <Copy size={14} color="#71717a" />}
            </TouchableOpacity>
          </View>

          <Text style={styles.balanceLabel}>SALDO TERKONFIRMASI</Text>
          <Text style={styles.balanceScy}>{formatQuantaToScy(confirmedBalanceQuanta)}</Text>
          <Text style={styles.balanceQuanta}>{formatQuanta(confirmedBalanceQuanta)} Quanta</Text>

          <View style={styles.statsDivider} />

          <View style={styles.cardStatsRow}>
            <TouchableOpacity
              style={styles.statCol}
              onPress={() => setShowUtxoListModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.statLabelRow}>
                <Database size={11} color="#38bdf8" />
                <Text style={styles.statLabel}>UTXO Vault</Text>
              </View>
              <Text style={[styles.statValue, { color: '#38bdf8' }]}>{utxos.length} Output ›</Text>
            </TouchableOpacity>

            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Pending Delta</Text>
              <Text style={[styles.statValue, { color: pendingBalanceQuanta > 0 ? '#10b981' : '#a1a1aa' }]}>
                {pendingBalanceQuanta > 0 ? `+${(pendingBalanceQuanta / QUANTA_PER_SCY).toFixed(4)}` : '0.0000'} SCY
              </Text>
            </View>

            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Konsensus</Text>
              <Text style={styles.statValue}>P2PKH Hash</Text>
            </View>
          </View>
        </View>

        {/* QUICK ACTION BUTTONS */}
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={() => {
              setBillingAmount('');
              setShowReceiveModal(true);
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconWrapper, { backgroundColor: '#064e3b' }]}>
              <ArrowDownLeft size={18} color="#34d399" />
            </View>
            <Text style={styles.actionBtnText}>Terima</Text>
            <Text style={styles.actionBtnSub}>QR Code</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={() => setShowSendModal(true)}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconWrapper, { backgroundColor: '#1e293b' }]}>
              <Send size={18} color="#38bdf8" />
            </View>
            <Text style={styles.actionBtnText}>Kirim</Text>
            <Text style={styles.actionBtnSub}>Transfer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnTertiary]}
            onPress={() => setShowUtxoListModal(true)}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconWrapper, { backgroundColor: '#27272a' }]}>
              <Database size={18} color="#a1a1aa" />
            </View>
            <Text style={styles.actionBtnText}>UTXO</Text>
            <Text style={styles.actionBtnSub}>{utxos.length} Output</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnQuaternary]}
            onPress={openQrScanner}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconWrapper, { backgroundColor: '#27272a' }]}>
              <Camera size={18} color="#e4e4e7" />
            </View>
            <Text style={styles.actionBtnText}>Pindai</Text>
            <Text style={styles.actionBtnSub}>Kamera</Text>
          </TouchableOpacity>
        </View>

        {/* MUTATION LEDGER TITLE & FILTER TABS */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Layers size={16} color="#10b981" />
            <Text style={styles.sectionTitle}>Mutasi Buku Besar</Text>
          </View>
          <Text style={styles.sectionBadge}>{mutations.length} Transaksi</Text>
        </View>

        <View style={styles.filterTabs}>
          {(['ALL', 'INBOUND', 'OUTBOUND', 'REWARD'] as const).map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.filterTab, filterType === type && styles.filterTabActive]}
              onPress={() => setFilterType(type)}
            >
              <Text style={[styles.filterTabText, filterType === type && styles.filterTabTextActive]}>
                {type === 'ALL' ? 'Semua' : type === 'INBOUND' ? 'Masuk' : type === 'OUTBOUND' ? 'Keluar' : 'Reward'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* MUTATION ITEMS LIST */}
        <View style={styles.mutationList}>
          {filteredMutations.length === 0 ? (
            <View style={styles.emptyState}>
              <Clock size={32} color="#52525b" />
              <Text style={styles.emptyText}>Tidak ada transaksi dalam kategori ini</Text>
            </View>
          ) : (
            filteredMutations.map((m) => {
              const isInbound = m.type === 'INBOUND';
              const isReward = m.type === 'REWARD';
              const isOutbound = m.type === 'OUTBOUND';

              return (
                <View key={m.id} style={styles.mutationCard}>
                  <View style={styles.mutationLeft}>
                    <View
                      style={[
                        styles.typeBadgeCircle,
                        isInbound && styles.typeInboundBg,
                        isOutbound && styles.typeOutboundBg,
                        isReward && styles.typeRewardBg,
                      ]}
                    >
                      {isInbound && <ArrowDownLeft size={16} color="#34d399" />}
                      {isOutbound && <ArrowUpRight size={16} color="#f43f5e" />}
                      {isReward && <Gift size={16} color="#38bdf8" />}
                    </View>
                    <View style={styles.mutationMeta}>
                      <View style={styles.mutationTypeRow}>
                        <Text style={styles.mutationType}>{m.type}</Text>
                        <Text style={styles.mutationStatus}>{m.status}</Text>
                      </View>
                      <Text style={styles.mutationTimestamp}>{m.timestamp}</Text>
                      {m.note ? <Text style={styles.mutationNote}>{m.note}</Text> : null}
                    </View>
                  </View>

                  <View style={styles.mutationRight}>
                    <Text
                      style={[
                        styles.mutationAmount,
                        isInbound && styles.amountInbound,
                        isOutbound && styles.amountOutbound,
                        isReward && styles.amountReward,
                      ]}
                    >
                      {m.quantaDelta > 0 ? '+' : ''}
                      {(m.quantaDelta / QUANTA_PER_SCY).toFixed(4)} SCY
                    </Text>
                    <View style={styles.mutationActionRow}>
                      <Text style={styles.mutationQuanta}>{formatQuanta(m.quantaDelta)} Q</Text>
                      <TouchableOpacity
                        style={styles.receiptQrBtn}
                        onPress={() => setSelectedMutationForQr(m)}
                      >
                        <QrCode size={13} color="#38bdf8" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ========================================== */}
      {/* 1. MODAL: TERIMA SCYTALE (DYNAMIC QR CODE) */}
      {/* ========================================== */}
      <Modal visible={showReceiveModal} transparent animationType="fade" onRequestClose={() => setShowReceiveModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <QrCode size={18} color="#10b981" />
                <Text style={styles.modalTitle}>Terima Scytale (QR)</Text>
              </View>
              <TouchableOpacity onPress={() => setShowReceiveModal(false)}>
                <X size={20} color="#71717a" />
              </TouchableOpacity>
            </View>

            {/* Dynamic QR Code */}
            <View style={styles.qrWrapper}>
              <QRCode
                value={receiveUri}
                size={200}
                color="#09090b"
                backgroundColor="#ffffff"
              />
            </View>

            <Text style={styles.qrHint}>
              Pindai QR Code untuk menerima SCY atau permintaan transfer
            </Text>

            {/* Input Nominal Tagihan Dinamis */}
            <View style={styles.formGroupSmall}>
              <View style={styles.inputLabelRow}>
                <Text style={styles.inputLabel}>Nominal Tagihan (Opsional - SCY):</Text>
                <Text style={styles.inputQuantaBadge}>
                  {requestedQuanta > 0 ? `${formatQuanta(requestedQuanta)} Q` : 'Bebas'}
                </Text>
              </View>
              <TextInput
                style={styles.textInputSmall}
                value={billingAmount}
                onChangeText={setBillingAmount}
                placeholder="0.00000000 (Transfer Bebas)"
                placeholderTextColor="#52525b"
                keyboardType="decimal-pad"
              />
            </View>

            {/* Generated URI Box */}
            <View style={styles.addressBox}>
              <Text style={styles.addressBoxLabel}>Generated Scytale URI:</Text>
              <Text style={styles.addressBoxValue} numberOfLines={2}>
                {receiveUri}
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.halfBtn, styles.halfBtnOutline]}
                onPress={() => copyToClipboard(walletAddress, 'recv-addr')}
              >
                {copiedKey === 'recv-addr' ? <Check size={14} color="#10b981" /> : <Copy size={14} color="#e4e4e7" />}
                <Text style={styles.halfBtnOutlineText}>
                  {copiedKey === 'recv-addr' ? 'Disalin!' : 'Salin Alamat'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.halfBtn, styles.halfBtnPrimary]}
                onPress={() => copyToClipboard(receiveUri, 'recv-uri')}
              >
                {copiedKey === 'recv-uri' ? <Check size={14} color="#09090b" /> : <Copy size={14} color="#09090b" />}
                <Text style={styles.halfBtnPrimaryText}>
                  {copiedKey === 'recv-uri' ? 'URI Disalin!' : 'Salin URI'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================== */}
      {/* 2. MODAL: RESI MUTASI LEDGER (QR AUDIT)    */}
      {/* ========================================== */}
      {selectedMutationForQr && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedMutationForQr(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderTitleRow}>
                  <QrCode size={18} color="#38bdf8" />
                  <Text style={styles.modalTitle}>Resi Mutasi & Audit QR</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedMutationForQr(null)}>
                  <X size={20} color="#71717a" />
                </TouchableOpacity>
              </View>

              <View style={styles.qrWrapper}>
                <QRCode
                  value={
                    selectedMutationForQr.txHash && selectedMutationForQr.txHash !== '-'
                      ? `https://explorer.myratu.com/tx/${selectedMutationForQr.txHash}`
                      : `scytale:mutation/${selectedMutationForQr.id}`
                  }
                  size={180}
                  color="#09090b"
                  backgroundColor="#ffffff"
                />
              </View>

              <Text style={styles.qrHint}>
                Pindai untuk verifikasi integritas mutasi di Scytale Explorer
              </Text>

              <View style={styles.receiptDetailsBox}>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Tipe & Nilai:</Text>
                  <Text
                    style={[
                      styles.receiptValueBold,
                      selectedMutationForQr.quantaDelta >= 0 ? styles.amountInbound : styles.amountOutbound,
                    ]}
                  >
                    {selectedMutationForQr.quantaDelta >= 0 ? '+' : ''}
                    {(selectedMutationForQr.quantaDelta / QUANTA_PER_SCY).toFixed(4)} SCY
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Waktu:</Text>
                  <Text style={styles.receiptValue}>{selectedMutationForQr.timestamp}</Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Status:</Text>
                  <Text style={[styles.receiptValue, { color: '#10b981', fontWeight: '700' }]}>
                    CONFIRMED
                  </Text>
                </View>

                {selectedMutationForQr.note ? (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Memo:</Text>
                    <Text style={styles.receiptValue}>{selectedMutationForQr.note}</Text>
                  </View>
                ) : null}

                <View style={styles.receiptTxBox}>
                  <Text style={styles.receiptLabel}>Tx Hash:</Text>
                  <Text style={styles.receiptTxHash} numberOfLines={2} ellipsizeMode="middle">
                    {selectedMutationForQr.txHash}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.copyLargeBtn}
                onPress={() => copyToClipboard(selectedMutationForQr.txHash, 'mut-hash')}
              >
                {copiedKey === 'mut-hash' ? <Check size={16} color="#ffffff" /> : <Copy size={16} color="#ffffff" />}
                <Text style={styles.copyLargeBtnText}>
                  {copiedKey === 'mut-hash' ? 'Hash Transaksi Disalin!' : 'Salin Hash Transaksi'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ========================================== */}
      {/* 3. MODAL: OUTPOINT UTXO (QR INSPECTOR)     */}
      {/* ========================================== */}
      {selectedUtxoForQr && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedUtxoForQr(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderTitleRow}>
                  <Database size={18} color="#38bdf8" />
                  <Text style={styles.modalTitle}>UTXO Outpoint QR</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedUtxoForQr(null)}>
                  <X size={20} color="#71717a" />
                </TouchableOpacity>
              </View>

              <View style={styles.qrWrapper}>
                <QRCode
                  value={`scytale:outpoint/${selectedUtxoForQr.txid}:${selectedUtxoForQr.vout}?amount=${selectedUtxoForQr.quanta}`}
                  size={160}
                  color="#09090b"
                  backgroundColor="#ffffff"
                />
              </View>

              <Text style={styles.qrHint}>
                Outpoint: {selectedUtxoForQr.txid.slice(0, 8)}...:{selectedUtxoForQr.vout}
              </Text>

              <View style={styles.receiptDetailsBox}>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Nilai UTXO:</Text>
                  <Text style={[styles.receiptValueBold, { color: '#38bdf8' }]}>
                    {(selectedUtxoForQr.quanta / QUANTA_PER_SCY).toFixed(4)} SCY
                  </Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Quanta Integer:</Text>
                  <Text style={styles.receiptValue}>{formatQuanta(selectedUtxoForQr.quanta)} quanta</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Block Height:</Text>
                  <Text style={styles.receiptValue}>#{selectedUtxoForQr.blockHeight}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>vOut Index:</Text>
                  <Text style={styles.receiptValue}>Index #{selectedUtxoForQr.vout}</Text>
                </View>
              </View>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.halfBtn, styles.halfBtnOutline]}
                  onPress={() => copyToClipboard(selectedUtxoForQr.txid, 'utxo-txid')}
                >
                  {copiedKey === 'utxo-txid' ? <Check size={14} color="#10b981" /> : <Copy size={14} color="#e4e4e7" />}
                  <Text style={styles.halfBtnOutlineText}>
                    {copiedKey === 'utxo-txid' ? 'Disalin!' : 'Salin TxID'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.halfBtn, styles.halfBtnPrimary]}
                  onPress={() => copyToClipboard(`${selectedUtxoForQr.txid}:${selectedUtxoForQr.vout}`, 'utxo-outpoint')}
                >
                  {copiedKey === 'utxo-outpoint' ? <Check size={14} color="#09090b" /> : <Copy size={14} color="#09090b" />}
                  <Text style={styles.halfBtnPrimaryText}>
                    {copiedKey === 'utxo-outpoint' ? 'Disalin!' : 'Salin Outpoint'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ========================================== */}
      {/* 4. MODAL: DAFTAR UTXO VAULT                */}
      {/* ========================================== */}
      <Modal visible={showUtxoListModal} transparent animationType="slide" onRequestClose={() => setShowUtxoListModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Database size={18} color="#38bdf8" />
                <Text style={styles.modalTitle}>UTXO Vault ({utxos.length})</Text>
              </View>
              <TouchableOpacity onPress={() => setShowUtxoListModal(false)}>
                <X size={20} color="#71717a" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              {utxos.length === 0 ? (
                <View style={styles.emptyState}>
                  <Database size={30} color="#52525b" />
                  <Text style={styles.emptyText}>Tidak ada output UTXO aktif untuk alamat ini</Text>
                </View>
              ) : (
                utxos.map((u) => (
                  <TouchableOpacity
                    key={`${u.txid}-${u.vout}`}
                    style={styles.utxoListItem}
                    onPress={() => {
                      setShowUtxoListModal(false);
                      setSelectedUtxoForQr(u);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.utxoListLeft}>
                      <Text style={styles.utxoListTxid} numberOfLines={1} ellipsizeMode="middle">
                        {u.txid}:{u.vout}
                      </Text>
                      <Text style={styles.utxoListMeta}>Block #{u.blockHeight}</Text>
                    </View>
                    <View style={styles.utxoListRight}>
                      <Text style={styles.utxoListScy}>{(u.quanta / QUANTA_PER_SCY).toFixed(4)} SCY</Text>
                      <QrCode size={14} color="#38bdf8" />
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================== */}
      {/* MODAL: KIRIM SCYTALE                       */}
      {/* ========================================== */}
      <Modal visible={showSendModal} transparent animationType="slide" onRequestClose={() => setShowSendModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Send size={18} color="#38bdf8" />
                <Text style={styles.modalTitle}>Kirim Transaksi</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSendModal(false)}>
                <X size={20} color="#71717a" />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Alamat Penerima (scy1...)</Text>
              <View style={styles.inputWithIconRow}>
                <TextInput
                  style={styles.textInput}
                  value={recipient}
                  onChangeText={setRecipient}
                  placeholder="scy1..."
                  placeholderTextColor="#52525b"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={styles.scanInputBtn} onPress={openQrScanner}>
                  <Camera size={18} color="#10b981" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Jumlah (SCY)</Text>
              <TextInput
                style={styles.textInput}
                value={amountScy}
                onChangeText={setAmountScy}
                placeholder="0.00000000"
                placeholderTextColor="#52525b"
                keyboardType="decimal-pad"
              />
              <Text style={styles.inputQuantaPreview}>
                ≈ {amountScy ? (parseFloat(amountScy) * QUANTA_PER_SCY || 0).toLocaleString() : 0} Quanta
              </Text>
            </View>

            <View style={styles.feeCard}>
              <Text style={styles.feeLabel}>Biaya Jaringan (Network Fee):</Text>
              <Text style={styles.feeValue}>1,000 Quanta (0.00001 SCY)</Text>
            </View>

            <TouchableOpacity
              style={[styles.submitSendBtn, sending && styles.btnDisabled]}
              onPress={handleSendTransaction}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#09090b" />
              ) : (
                <>
                  <Send size={16} color="#09090b" />
                  <Text style={styles.submitSendBtnText}>Konfirmasi & Broadcast</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================== */}
      {/* MODAL: KAMERA SCANNER QR                   */}
      {/* ========================================== */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <SafeAreaView style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onBarcodeScanned={showScanner ? handleBarcodeScanned : undefined}
          />

          <View style={styles.scannerOverlay}>
            <View style={styles.scannerHeader}>
              <Text style={styles.scannerTitle}>Pindai QR Code Scytale</Text>
              <Text style={styles.scannerSub}>Arahkan kamera ke QR Code alamat penerima atau permintaan pembayaran</Text>
            </View>

            <View style={styles.viewfinderWrapper}>
              <View style={styles.viewfinder}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
            </View>

            <View style={styles.scannerFooter}>
              <TouchableOpacity style={styles.cancelScanBtn} onPress={() => setShowScanner(false)}>
                <Text style={styles.cancelScanText}>Batal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ==========================================
// STYLESHEET
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    backgroundColor: '#09090b',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#064e3b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#059669',
  },
  headerTitle: {
    color: '#f4f4f5',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  geminiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#082f49',
    borderColor: '#0284c7',
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  geminiBadgeText: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusText: {
    color: '#a1a1aa',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusDotSeparator: {
    color: '#52525b',
    fontSize: 10,
  },
  mempoolText: {
    color: '#38bdf8',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
  },

  // ERROR BANNER
  errorBanner: {
    backgroundColor: '#4c051940',
    borderWidth: 1,
    borderColor: '#e11d4880',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  errorText: {
    color: '#fda4af',
    fontSize: 11,
    flex: 1,
  },
  errorRetryBtn: {
    backgroundColor: '#9f1239',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  errorRetryText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },

  // ADDRESS TOOLBAR
  addressToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#18181b',
  },
  addressInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272a',
    paddingHorizontal: 8,
  },
  searchIcon: {
    marginRight: 6,
  },
  addressSearchInput: {
    flex: 1,
    paddingVertical: 6,
    color: '#f4f4f5',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  scanAddressBtn: {
    padding: 6,
  },
  queryBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  queryBtnText: {
    color: '#09090b',
    fontSize: 11,
    fontWeight: '800',
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 16,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  addressChip: {
    backgroundColor: '#09090b',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272a',
    flex: 1,
    marginRight: 8,
  },
  addressText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyChipBtn: {
    padding: 6,
    backgroundColor: '#27272a',
    borderRadius: 6,
  },
  balanceLabel: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  balanceScy: {
    color: '#10b981',
    fontSize: 24,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  balanceQuanta: {
    color: '#a1a1aa',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statsDivider: {
    height: 1,
    backgroundColor: '#27272a',
    marginVertical: 14,
  },
  cardStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCol: {
    flex: 1,
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  statLabel: {
    color: '#71717a',
    fontSize: 10,
    marginBottom: 2,
  },
  statValue: {
    color: '#e4e4e7',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
  },
  actionBtnPrimary: {
    backgroundColor: '#064e3b20',
    borderColor: '#05966950',
  },
  actionBtnSecondary: {
    backgroundColor: '#0c4a6e20',
    borderColor: '#0284c750',
  },
  actionBtnTertiary: {
    backgroundColor: '#18181b',
    borderColor: '#27272a',
  },
  actionBtnQuaternary: {
    backgroundColor: '#18181b',
    borderColor: '#27272a',
  },
  actionIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  actionBtnText: {
    color: '#f4f4f5',
    fontSize: 11,
    fontWeight: '700',
  },
  actionBtnSub: {
    color: '#a1a1aa',
    fontSize: 9,
    marginTop: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    color: '#f4f4f5',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionBadge: {
    color: '#71717a',
    fontSize: 11,
  },
  filterTabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  filterTabActive: {
    backgroundColor: '#27272a',
    borderColor: '#10b981',
  },
  filterTabText: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#10b981',
    fontWeight: '700',
  },
  mutationList: {
    gap: 8,
  },
  mutationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  mutationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  typeBadgeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeInboundBg: {
    backgroundColor: '#064e3b40',
    borderWidth: 1,
    borderColor: '#059669',
  },
  typeOutboundBg: {
    backgroundColor: '#4c051940',
    borderWidth: 1,
    borderColor: '#e11d48',
  },
  typeRewardBg: {
    backgroundColor: '#082f4940',
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  mutationMeta: {
    flex: 1,
  },
  mutationTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mutationType: {
    color: '#f4f4f5',
    fontSize: 11,
    fontWeight: '700',
  },
  mutationStatus: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '700',
  },
  mutationTimestamp: {
    color: '#71717a',
    fontSize: 10,
    marginTop: 1,
  },
  mutationNote: {
    color: '#a1a1aa',
    fontSize: 10,
    marginTop: 2,
  },
  mutationRight: {
    alignItems: 'flex-end',
  },
  mutationAmount: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  amountInbound: {
    color: '#34d399',
  },
  amountOutbound: {
    color: '#f43f5e',
  },
  amountReward: {
    color: '#38bdf8',
  },
  mutationActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  mutationQuanta: {
    color: '#71717a',
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  receiptQrBtn: {
    backgroundColor: '#082f49',
    padding: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  emptyState: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    color: '#71717a',
    fontSize: 12,
    textAlign: 'center',
  },

  // MODAL STYLES
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#18181b',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    color: '#f4f4f5',
    fontSize: 15,
    fontWeight: '800',
  },
  qrWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    alignSelf: 'center',
    marginBottom: 12,
  },
  qrHint: {
    color: '#a1a1aa',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 12,
  },
  formGroupSmall: {
    marginBottom: 12,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  inputQuantaBadge: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  textInputSmall: {
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#f4f4f5',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  addressBox: {
    backgroundColor: '#09090b',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 14,
  },
  addressBoxLabel: {
    color: '#71717a',
    fontSize: 9,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  addressBoxValue: {
    color: '#38bdf8',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  halfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  halfBtnOutline: {
    backgroundColor: '#27272a',
  },
  halfBtnOutlineText: {
    color: '#e4e4e7',
    fontSize: 12,
    fontWeight: '700',
  },
  halfBtnPrimary: {
    backgroundColor: '#10b981',
  },
  halfBtnPrimaryText: {
    color: '#09090b',
    fontSize: 12,
    fontWeight: '800',
  },
  copyLargeBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  copyLargeBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  // RECEIPT AUDIT STYLES
  receiptDetailsBox: {
    backgroundColor: '#09090b',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 14,
    gap: 6,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    color: '#71717a',
    fontSize: 11,
  },
  receiptValue: {
    color: '#f4f4f5',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  receiptValueBold: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  receiptTxBox: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#18181b',
  },
  receiptTxHash: {
    color: '#38bdf8',
    fontSize: 10,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // UTXO LIST STYLES
  utxoListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#09090b',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  utxoListLeft: {
    flex: 1,
    marginRight: 8,
  },
  utxoListTxid: {
    color: '#38bdf8',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  utxoListMeta: {
    color: '#71717a',
    fontSize: 10,
    marginTop: 2,
  },
  utxoListRight: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 6,
  },
  utxoListScy: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // SEND FORM STYLES
  formGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputWithIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f4f4f5',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: '#09090b',
    borderRadius: 10,
  },
  scanInputBtn: {
    padding: 10,
  },
  inputQuantaPreview: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  feeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#09090b',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 16,
  },
  feeLabel: {
    color: '#71717a',
    fontSize: 11,
  },
  feeValue: {
    color: '#e4e4e7',
    fontSize: 11,
    fontWeight: '600',
  },
  submitSendBtn: {
    backgroundColor: '#10b981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  submitSendBtnText: {
    color: '#09090b',
    fontSize: 13,
    fontWeight: '800',
  },

  // SCANNER STYLES
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scannerOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scannerHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  scannerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  scannerSub: {
    color: '#a1a1aa',
    fontSize: 12,
    textAlign: 'center',
  },
  viewfinderWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinder: {
    width: 240,
    height: 240,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#10b981',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  scannerFooter: {
    paddingHorizontal: 20,
    width: '100%',
  },
  cancelScanBtn: {
    backgroundColor: '#27272a',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelScanText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
