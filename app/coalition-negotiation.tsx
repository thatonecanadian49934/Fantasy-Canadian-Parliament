// Powered by OnSpace.AI — Coalition Negotiation Screen
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useGame } from '@/hooks/useGame';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { PARTIES } from '@/constants/parties';
import { MAJORITY_SEATS, TOTAL_SEATS } from '@/constants/provinces';

// ── Types ──────────────────────────────────────────────────────────────────────
export type DealType = 'supply_confidence' | 'confidence_only' | 'formal_coalition' | 'issue_by_issue';

export interface PolicyConcession {
  id: string;
  text: string;
  category: 'fiscal' | 'social' | 'environment' | 'defence' | 'indigenous' | 'justice';
  fromPlayer: boolean;  // true = player offers to partner; false = player demands
  accepted: boolean;
  weekAdded: number;
}

export interface CabinetAllocation {
  portfolio: string;
  allocatedTo: string; // partyId
  ministerName?: string;
}

export interface CoalitionDeal {
  id: string;
  partnerPartyId: string;
  dealType: DealType;
  weekSigned: number;
  weekExpires: number | null;  // null = indefinite
  status: 'proposed' | 'active' | 'suspended' | 'broken';
  confidenceLevel: number;  // 0–100 weekly indicator
  cabinetAllocations: CabinetAllocation[];
  policyConcessions: PolicyConcession[];
  weeklyConfidenceHistory: Array<{ week: number; confidence: number }>;
  note: string;
}

const DEAL_TYPE_LABELS: Record<DealType, string> = {
  supply_confidence: 'Supply & Confidence Agreement',
  confidence_only: 'Confidence-Only Agreement',
  formal_coalition: 'Formal Coalition Government',
  issue_by_issue: 'Issue-by-Issue Support',
};

const DEAL_TYPE_DESCRIPTIONS: Record<DealType, string> = {
  supply_confidence: 'Partner agrees to vote for all supply bills and not support non-confidence motions. No shared cabinet.',
  confidence_only: 'Partner agrees only to not vote non-confidence. Supply voted case-by-case. Weakest arrangement.',
  formal_coalition: 'Full merger of governing authority. Shared cabinet positions, joint policy platform, and mutual confidence commitment.',
  issue_by_issue: 'No standing agreement. Player negotiates support on each bill or vote. Unstable but flexible.',
};

const DEAL_TYPE_STABILITY: Record<DealType, number> = {
  supply_confidence: 75,
  confidence_only: 45,
  formal_coalition: 90,
  issue_by_issue: 25,
};

const CABINET_PORTFOLIOS = [
  'Finance', 'Foreign Affairs', 'Environment', 'Health', 'Justice',
  'Indigenous Affairs', 'Transport', 'Public Safety', 'Housing',
  'Immigration', 'Natural Resources', 'Labour', 'Agriculture',
];

const POLICY_TEMPLATES: Record<string, { text: string; category: PolicyConcession['category'] }[]> = {
  ndp: [
    { text: 'Expand pharmacare to cover all essential medicines', category: 'social' },
    { text: 'Introduce 1% annual wealth tax on net assets above $10M', category: 'fiscal' },
    { text: 'Ban replacement workers in federally regulated industries', category: 'social' },
    { text: 'Accelerate public housing construction to 50,000 units/year', category: 'social' },
    { text: 'Implement $22/hr federal minimum wage', category: 'fiscal' },
    { text: 'Establish rent control framework for federally regulated housing', category: 'social' },
  ],
  bloc: [
    { text: 'Transfer tax points to Quebec to reduce federal presence', category: 'fiscal' },
    { text: 'Strengthen French language requirements in federal workplaces', category: 'social' },
    { text: 'Increase Quebec\'s autonomy in immigration selection', category: 'social' },
    { text: 'Protect supply management system from trade concessions', category: 'fiscal' },
    { text: 'Recognize Quebec as a distinct nation in the Constitution', category: 'social' },
  ],
  green: [
    { text: 'Formally declare a climate emergency with binding targets', category: 'environment' },
    { text: 'Phase out fossil fuel subsidies within 2 years', category: 'environment' },
    { text: 'Mandate 100% zero-emission vehicle sales by 2030', category: 'environment' },
    { text: 'Protect 30% of land and oceans by 2030', category: 'environment' },
    { text: 'Establish a guaranteed livable income pilot', category: 'social' },
  ],
  conservative: [
    { text: 'Reduce federal spending by 15% over 3 years', category: 'fiscal' },
    { text: 'Eliminate the consumer carbon tax', category: 'environment' },
    { text: 'Fast-track pipeline and resource project approvals', category: 'environment' },
    { text: 'Reduce immigration levels to 250,000/year', category: 'social' },
    { text: 'Implement mandatory sentencing for violent repeat offenders', category: 'justice' },
  ],
  liberal: [
    { text: 'Maintain the consumer carbon price and rebate system', category: 'environment' },
    { text: 'Continue national childcare at $10/day', category: 'social' },
    { text: 'Invest $15B in clean electricity transition', category: 'environment' },
    { text: 'Maintain current immigration targets', category: 'social' },
    { text: 'Proceed with national pharmacare implementation', category: 'social' },
  ],
  ppc: [
    { text: 'Reduce federal government size by 30%', category: 'fiscal' },
    { text: 'Withdraw from NATO and multilateral agreements', category: 'defence' },
    { text: 'Eliminate all immigration for 2 years', category: 'social' },
    { text: 'Remove all federal environmental regulations', category: 'environment' },
  ],
};

function getPartyPolicies(partyId: string) {
  return POLICY_TEMPLATES[partyId] || POLICY_TEMPLATES['liberal'];
}

function getCompatibilityScore(playerPartyId: string, partnerPartyId: string): number {
  const scores: Record<string, Record<string, number>> = {
    liberal: { ndp: 72, bloc: 48, green: 65, conservative: 20, ppc: 5 },
    conservative: { ndp: 12, bloc: 35, green: 15, liberal: 20, ppc: 55 },
    ndp: { liberal: 72, bloc: 50, green: 80, conservative: 12, ppc: 5 },
    bloc: { liberal: 48, ndp: 50, green: 40, conservative: 35, ppc: 5 },
    green: { liberal: 65, ndp: 80, bloc: 40, conservative: 15, ppc: 5 },
    ppc: { conservative: 55, liberal: 5, ndp: 5, bloc: 5, green: 5 },
  };
  return scores[playerPartyId]?.[partnerPartyId] ?? 30;
}

export default function CoalitionNegotiationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { gameState, logAction } = useGame();
  const { showAlert } = useAlert();

  const [deals, setDeals] = useState<CoalitionDeal[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<CoalitionDeal | null>(null);
  const [showNewDealModal, setShowNewDealModal] = useState(false);
  const [newDealPartner, setNewDealPartner] = useState<string | null>(null);
  const [newDealType, setNewDealType] = useState<DealType>('supply_confidence');
  const [newDealNote, setNewDealNote] = useState('');
  const [selectedConcessions, setSelectedConcessions] = useState<string[]>([]);
  const [cabinetAllocations, setCabinetAllocations] = useState<CabinetAllocation[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'negotiate' | 'history'>('active');

  if (!gameState) return null;

  const party = PARTIES.find(p => p.id === gameState.playerPartyId);
  const partyColor = party?.color || Colors.primary;
  const playerSeats = gameState.seats[gameState.playerPartyId] || 0;
  const isMajority = playerSeats >= MAJORITY_SEATS;

  // All rival parties with seats
  const rivals = gameState.rivals.filter(r => (gameState.seats[r.partyId] || 0) > 0);
  const activeDeal = deals.filter(d => d.status === 'active');

  // Combined seats with active deals
  const combinedSeats = useMemo(() => {
    let total = playerSeats;
    activeDeal.forEach(d => { total += gameState.seats[d.partnerPartyId] || 0; });
    return total;
  }, [playerSeats, activeDeal, gameState.seats]);

  const hasWorkingMajority = combinedSeats >= MAJORITY_SEATS;

  // ── CREATE DEAL ─────────────────────────────────────────────────────────────
  const createDeal = () => {
    if (!newDealPartner) return;
    const partnerSeats = gameState.seats[newDealPartner] || 0;
    const compat = getCompatibilityScore(gameState.playerPartyId, newDealPartner);
    const baseConfidence = Math.round(compat * 0.8 + (newDealType === 'formal_coalition' ? 15 : newDealType === 'supply_confidence' ? 5 : -5));

    const concessions: PolicyConcession[] = selectedConcessions.map(id => {
      const [partyId, idx] = id.split('_idx_');
      const templates = getPartyPolicies(newDealPartner);
      const template = templates[parseInt(idx)];
      return {
        id: `con_${Date.now()}_${idx}`,
        text: template?.text || '',
        category: template?.category || 'social',
        fromPlayer: false, // these are partner demands we accept
        accepted: true,
        weekAdded: gameState.currentWeek,
      };
    });

    const allocations = cabinetAllocations.filter(a => a.allocatedTo === newDealPartner);

    const deal: CoalitionDeal = {
      id: `deal_${Date.now()}`,
      partnerPartyId: newDealPartner,
      dealType: newDealType,
      weekSigned: gameState.currentWeek,
      weekExpires: newDealType === 'issue_by_issue' ? gameState.currentWeek + 4 : null,
      status: 'active',
      confidenceLevel: Math.max(30, Math.min(95, baseConfidence)),
      cabinetAllocations: allocations,
      policyConcessions: concessions,
      weeklyConfidenceHistory: [{ week: gameState.currentWeek, confidence: baseConfidence }],
      note: newDealNote,
    };

    setDeals(prev => [deal, ...prev]);
    logAction?.({
      action: `Coalition Deal Signed — ${DEAL_TYPE_LABELS[newDealType]}`,
      category: 'alliance',
      description: `${party?.shortName} & ${PARTIES.find(p => p.id === newDealPartner)?.shortName}: ${DEAL_TYPE_LABELS[newDealType]}`,
      impact: `Combined seats: ${playerSeats + partnerSeats} / ${MAJORITY_SEATS} needed`,
      severity: 'critical',
    });

    setShowNewDealModal(false);
    setNewDealPartner(null);
    setNewDealType('supply_confidence');
    setNewDealNote('');
    setSelectedConcessions([]);
    setCabinetAllocations([]);

    showAlert(
      'Agreement Signed',
      `${DEAL_TYPE_LABELS[newDealType]} with ${PARTIES.find(p => p.id === newDealPartner)?.name} has been signed. Initial confidence level: ${deal.confidenceLevel}%.`
    );
  };

  const breakDeal = (dealId: string) => {
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;
    const partnerName = PARTIES.find(p => p.id === deal.partnerPartyId)?.name || deal.partnerPartyId;
    showAlert(
      `Break Agreement with ${partnerName}?`,
      'This will trigger a confidence crisis. The partner party may support a non-confidence motion.',
      [
        { text: 'Keep Agreement', style: 'cancel' },
        {
          text: 'Break Agreement',
          style: 'destructive',
          onPress: () => {
            setDeals(prev => prev.map(d => d.id === dealId ? { ...d, status: 'broken' } : d));
            setSelectedDeal(null);
            logAction?.({
              action: 'Coalition Deal Broken',
              category: 'alliance',
              description: `Agreement with ${partnerName} terminated`,
              severity: 'critical',
            });
            showAlert('Agreement Broken', `The agreement with ${partnerName} has been terminated. Confidence risk elevated.`);
          },
        },
      ]
    );
  };

  // ── CONFIDENCE INDICATOR ────────────────────────────────────────────────────
  const renderConfidenceBar = (level: number, label?: string) => {
    const color = level >= 70 ? Colors.success : level >= 50 ? Colors.gold : level >= 35 ? Colors.warning : Colors.error;
    return (
      <View style={styles.confidenceBar}>
        {label ? <Text style={styles.confidenceBarLabel}>{label}</Text> : null}
        <View style={styles.confidenceBarBg}>
          <View style={[styles.confidenceBarFill, { width: `${level}%` as any, backgroundColor: color }]} />
          <View style={[styles.confidenceMarker, { left: '50%' as any }]} />
          <View style={[styles.confidenceMarker, { left: '70%' as any }]} />
        </View>
        <Text style={[styles.confidenceValue, { color }]}>{level}%</Text>
      </View>
    );
  };

  // ── ACTIVE DEALS TAB ────────────────────────────────────────────────────────
  const renderActiveDeals = () => (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Seat arithmetic */}
      <View style={styles.seatSummary}>
        <View style={styles.seatSummaryRow}>
          <View style={styles.seatBlock}>
            <Text style={[styles.seatBlockValue, { color: partyColor }]}>{playerSeats}</Text>
            <Text style={styles.seatBlockLabel}>{party?.shortName} Seats</Text>
          </View>
          {activeDeal.map(d => {
            const dParty = PARTIES.find(p => p.id === d.partnerPartyId);
            return (
              <React.Fragment key={d.id}>
                <MaterialCommunityIcons name="plus" size={16} color={Colors.textMuted} />
                <View style={styles.seatBlock}>
                  <Text style={[styles.seatBlockValue, { color: dParty?.color || Colors.textSecondary }]}>
                    {gameState.seats[d.partnerPartyId] || 0}
                  </Text>
                  <Text style={styles.seatBlockLabel}>{dParty?.shortName}</Text>
                </View>
              </React.Fragment>
            );
          })}
          <MaterialCommunityIcons name="equal" size={16} color={Colors.textMuted} />
          <View style={styles.seatBlock}>
            <Text style={[styles.seatBlockValue, { color: hasWorkingMajority ? Colors.success : Colors.error }]}>
              {combinedSeats}
            </Text>
            <Text style={styles.seatBlockLabel}>Combined</Text>
          </View>
          <Text style={[styles.majorityNeeded, { color: hasWorkingMajority ? Colors.success : Colors.textMuted }]}>
            / {MAJORITY_SEATS}
          </Text>
        </View>
        <View style={[styles.majorityStatusBar, { backgroundColor: hasWorkingMajority ? Colors.success + '22' : Colors.error + '11', borderColor: hasWorkingMajority ? Colors.success + '44' : Colors.error + '33' }]}>
          <MaterialCommunityIcons
            name={hasWorkingMajority ? 'check-circle' : 'alert-circle'}
            size={13}
            color={hasWorkingMajority ? Colors.success : Colors.error}
          />
          <Text style={[styles.majorityStatusText, { color: hasWorkingMajority ? Colors.success : Colors.error }]}>
            {hasWorkingMajority
              ? `Working majority — ${combinedSeats - MAJORITY_SEATS} seats above threshold`
              : `Short by ${MAJORITY_SEATS - combinedSeats} seats — vulnerable to confidence votes`}
          </Text>
        </View>
      </View>

      {activeDeal.length === 0 ? (
        <View style={styles.emptyDeals}>
          <MaterialCommunityIcons name="handshake-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyDealsTitle}>No Active Agreements</Text>
          <Text style={styles.emptyDealsText}>
            {isMajority
              ? 'You hold a majority government. Coalition agreements are not required.'
              : 'As a minority government, negotiate supply-and-confidence agreements or a formal coalition to maintain stability.'}
          </Text>
          {!isMajority ? (
            <Pressable
              onPress={() => setActiveTab('negotiate')}
              style={({ pressed }) => [styles.negotiateNowBtn, { backgroundColor: partyColor }, pressed && { opacity: 0.85 }]}
            >
              <MaterialCommunityIcons name="handshake" size={16} color="#fff" />
              <Text style={styles.negotiateNowBtnText}>Begin Negotiations</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        activeDeal.map(deal => {
          const dParty = PARTIES.find(p => p.id === deal.partnerPartyId);
          const dSeats = gameState.seats[deal.partnerPartyId] || 0;
          const stability = DEAL_TYPE_STABILITY[deal.dealType];

          return (
            <Pressable
              key={deal.id}
              onPress={() => setSelectedDeal(deal)}
              style={({ pressed }) => [styles.dealCard, pressed && { opacity: 0.9 }]}
            >
              <View style={styles.dealCardHeader}>
                <View style={[styles.dealPartyColor, { backgroundColor: dParty?.color || Colors.textMuted }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dealCardTitle}>{DEAL_TYPE_LABELS[deal.dealType]}</Text>
                  <Text style={styles.dealCardPartner}>with {dParty?.name || deal.partnerPartyId}</Text>
                </View>
                <View style={[styles.dealStatusBadge, { backgroundColor: Colors.success + '22' }]}>
                  <View style={styles.dealStatusDot} />
                  <Text style={styles.dealStatusText}>Active</Text>
                </View>
              </View>

              <View style={styles.dealStats}>
                <View style={styles.dealStat}>
                  <Text style={[styles.dealStatValue, { color: dParty?.color }]}>{dSeats}</Text>
                  <Text style={styles.dealStatLabel}>Seats Added</Text>
                </View>
                <View style={styles.dealStat}>
                  <Text style={styles.dealStatValue}>W{deal.weekSigned}</Text>
                  <Text style={styles.dealStatLabel}>Signed</Text>
                </View>
                <View style={styles.dealStat}>
                  <Text style={styles.dealStatValue}>{deal.cabinetAllocations.length}</Text>
                  <Text style={styles.dealStatLabel}>Cabinet Seats</Text>
                </View>
                <View style={styles.dealStat}>
                  <Text style={styles.dealStatValue}>{deal.policyConcessions.length}</Text>
                  <Text style={styles.dealStatLabel}>Concessions</Text>
                </View>
              </View>

              {renderConfidenceBar(deal.confidenceLevel, 'Partner Confidence')}

              <View style={styles.dealStabilityRow}>
                <Text style={styles.dealStabilityLabel}>Agreement Stability:</Text>
                <View style={styles.dealStabilityBar}>
                  <View style={[styles.dealStabilityFill, { width: `${stability}%` as any, backgroundColor: stability >= 70 ? Colors.success : stability >= 45 ? Colors.gold : Colors.warning }]} />
                </View>
                <Text style={styles.dealStabilityValue}>{stability}%</Text>
              </View>

              {deal.note ? <Text style={styles.dealNote}>"{deal.note}"</Text> : null}

              <View style={styles.dealCardActions}>
                <Pressable
                  onPress={() => setSelectedDeal(deal)}
                  style={({ pressed }) => [styles.dealActionBtn, pressed && { opacity: 0.8 }]}
                >
                  <MaterialCommunityIcons name="eye" size={13} color={Colors.info} />
                  <Text style={[styles.dealActionBtnText, { color: Colors.info }]}>Details</Text>
                </Pressable>
                <Pressable
                  onPress={() => breakDeal(deal.id)}
                  style={({ pressed }) => [styles.dealActionBtn, { backgroundColor: Colors.error + '11', borderColor: Colors.error + '33' }, pressed && { opacity: 0.8 }]}
                >
                  <MaterialCommunityIcons name="handshake-off" size={13} color={Colors.error} />
                  <Text style={[styles.dealActionBtnText, { color: Colors.error }]}>Break</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        })
      )}

      {/* Broken/Historical deals */}
      {deals.filter(d => d.status === 'broken').length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>PAST AGREEMENTS</Text>
          {deals.filter(d => d.status === 'broken').map(deal => {
            const dParty = PARTIES.find(p => p.id === deal.partnerPartyId);
            return (
              <View key={deal.id} style={[styles.dealCard, { opacity: 0.6 }]}>
                <View style={styles.dealCardHeader}>
                  <View style={[styles.dealPartyColor, { backgroundColor: dParty?.color || Colors.textMuted, opacity: 0.5 }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dealCardTitle}>{DEAL_TYPE_LABELS[deal.dealType]}</Text>
                    <Text style={styles.dealCardPartner}>with {dParty?.name}</Text>
                  </View>
                  <View style={[styles.dealStatusBadge, { backgroundColor: Colors.error + '22' }]}>
                    <Text style={[styles.dealStatusText, { color: Colors.error }]}>Broken</Text>
                  </View>
                </View>
                <Text style={styles.dealCardPartner}>Signed W{deal.weekSigned} · Terminated</Text>
              </View>
            );
          })}
        </>
      ) : null}
    </ScrollView>
  );

  // ── NEGOTIATE TAB ────────────────────────────────────────────────────────────
  const renderNegotiateTab = () => (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
      showsVerticalScrollIndicator={false}
    >
      {isMajority ? (
        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information" size={13} color={Colors.info} />
          <Text style={styles.infoBoxText}>You hold a majority government. Coalition agreements are optional and may be used to lock in policy support for difficult legislation.</Text>
        </View>
      ) : (
        <View style={styles.urgencyBox}>
          <MaterialCommunityIcons name="alert" size={13} color={Colors.warning} />
          <Text style={styles.urgencyBoxText}>
            Minority government — {MAJORITY_SEATS - playerSeats} more seats needed for a working majority. Secure at least one agreement to govern effectively.
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>AVAILABLE PARTNERS</Text>

      {rivals.map(rival => {
        const rivalParty = PARTIES.find(p => p.id === rival.partyId);
        const rivalSeats = gameState.seats[rival.partyId] || 0;
        if (rivalSeats === 0) return null;
        const compat = getCompatibilityScore(gameState.playerPartyId, rival.partyId);
        const existingDeal = activeDeal.find(d => d.partnerPartyId === rival.partyId);
        const combined = playerSeats + rivalSeats;

        return (
          <View key={rival.partyId} style={styles.partnerCard}>
            <View style={styles.partnerCardHeader}>
              <View style={[styles.partyDot, { backgroundColor: rivalParty?.color || Colors.textMuted }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.partnerName}>{rival.name.split(' (')[0]}</Text>
                <Text style={styles.partnerParty}>{rivalParty?.name}</Text>
              </View>
              <View style={styles.partnerSeats}>
                <Text style={[styles.partnerSeatCount, { color: rivalParty?.color }]}>{rivalSeats}</Text>
                <Text style={styles.partnerSeatLabel}>seats</Text>
              </View>
            </View>

            <View style={styles.partnerMetrics}>
              <View style={styles.partnerMetric}>
                <Text style={styles.partnerMetricLabel}>With this party:</Text>
                <Text style={[styles.partnerMetricValue, { color: combined >= MAJORITY_SEATS ? Colors.success : Colors.warning }]}>
                  {combined} seats {combined >= MAJORITY_SEATS ? '✓ Majority' : `(${MAJORITY_SEATS - combined} short)`}
                </Text>
              </View>
              <View style={styles.partnerMetric}>
                <Text style={styles.partnerMetricLabel}>Ideological compatibility:</Text>
                <View style={styles.compatBarRow}>
                  <View style={styles.compatBarBg}>
                    <View style={[styles.compatBarFill, {
                      width: `${compat}%` as any,
                      backgroundColor: compat >= 60 ? Colors.success : compat >= 40 ? Colors.gold : Colors.warning,
                    }]} />
                  </View>
                  <Text style={[styles.compatPct, {
                    color: compat >= 60 ? Colors.success : compat >= 40 ? Colors.gold : Colors.warning,
                  }]}>{compat}%</Text>
                </View>
              </View>
            </View>

            {existingDeal ? (
              <View style={styles.existingDealBadge}>
                <MaterialCommunityIcons name="handshake" size={12} color={Colors.success} />
                <Text style={styles.existingDealText}>Active: {DEAL_TYPE_LABELS[existingDeal.dealType]}</Text>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setNewDealPartner(rival.partyId);
                  setNewDealType('supply_confidence');
                  setSelectedConcessions([]);
                  setCabinetAllocations([]);
                  setNewDealNote('');
                  setShowNewDealModal(true);
                }}
                style={({ pressed }) => [styles.negotiateBtn, { borderColor: rivalParty?.color + '66' }, pressed && { opacity: 0.85 }]}
              >
                <MaterialCommunityIcons name="handshake" size={14} color={rivalParty?.color || Colors.gold} />
                <Text style={[styles.negotiateBtnText, { color: rivalParty?.color || Colors.gold }]}>
                  Begin Negotiations
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </ScrollView>
  );

  // ── NEW DEAL MODAL ──────────────────────────────────────────────────────────
  const renderNewDealModal = () => {
    if (!newDealPartner) return null;
    const partner = PARTIES.find(p => p.id === newDealPartner);
    const partnerPolicies = getPartyPolicies(newDealPartner);
    const partnerSeats = gameState.seats[newDealPartner] || 0;

    return (
      <Modal visible={showNewDealModal} transparent animationType="slide" onRequestClose={() => setShowNewDealModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.dealModal} contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md, paddingBottom: 60 }}>
            {/* Header */}
            <View style={styles.dealModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dealModalTitle}>Negotiate with {partner?.name}</Text>
                <Text style={styles.dealModalSub}>{partnerSeats} seats · {partner?.ideology}</Text>
              </View>
              <Pressable onPress={() => setShowNewDealModal(false)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>

            {/* Deal Type */}
            <View>
              <Text style={styles.dealSectionTitle}>AGREEMENT TYPE</Text>
              {(['supply_confidence', 'confidence_only', 'formal_coalition', 'issue_by_issue'] as DealType[]).map(type => (
                <Pressable
                  key={type}
                  onPress={() => setNewDealType(type)}
                  style={[styles.dealTypeOption, newDealType === type && { borderColor: partyColor, backgroundColor: partyColor + '0D' }]}
                >
                  <View style={styles.dealTypeOptionLeft}>
                    <MaterialCommunityIcons
                      name={type === 'formal_coalition' ? 'handshake' : type === 'supply_confidence' ? 'currency-usd' : type === 'confidence_only' ? 'shield-check' : 'file-question'}
                      size={20}
                      color={newDealType === type ? partyColor : Colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dealTypeLabel, newDealType === type && { color: partyColor }]}>
                        {DEAL_TYPE_LABELS[type]}
                      </Text>
                      <Text style={styles.dealTypeDesc}>{DEAL_TYPE_DESCRIPTIONS[type]}</Text>
                    </View>
                  </View>
                  <View style={styles.dealTypeStability}>
                    <Text style={styles.dealTypeStabilityLabel}>Stability</Text>
                    <Text style={[styles.dealTypeStabilityValue, {
                      color: DEAL_TYPE_STABILITY[type] >= 70 ? Colors.success : Colors.warning,
                    }]}>{DEAL_TYPE_STABILITY[type]}%</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            {/* Policy Concessions */}
            <View>
              <Text style={styles.dealSectionTitle}>POLICY CONCESSIONS (Partner Demands)</Text>
              <Text style={styles.dealSectionSub}>Select which policy concessions you will offer to secure this agreement.</Text>
              {partnerPolicies.map((policy, idx) => {
                const key = `${newDealPartner}_idx_${idx}`;
                const selected = selectedConcessions.includes(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => setSelectedConcessions(prev =>
                      selected ? prev.filter(k => k !== key) : [...prev, key]
                    )}
                    style={[styles.concessionOption, selected && { borderColor: Colors.success + '66', backgroundColor: Colors.success + '0A' }]}
                  >
                    <MaterialCommunityIcons
                      name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={18}
                      color={selected ? Colors.success : Colors.textMuted}
                    />
                    <Text style={[styles.concessionText, selected && { color: Colors.textPrimary }]}>{policy.text}</Text>
                    <View style={[styles.categoryBadge, { backgroundColor: Colors.info + '22' }]}>
                      <Text style={[styles.categoryBadgeText, { color: Colors.info }]}>{policy.category}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Cabinet Allocations (Coalition only) */}
            {newDealType === 'formal_coalition' ? (
              <View>
                <Text style={styles.dealSectionTitle}>CABINET PORTFOLIO ALLOCATIONS</Text>
                <Text style={styles.dealSectionSub}>For a formal coalition, allocate cabinet portfolios to the partner party.</Text>
                {CABINET_PORTFOLIOS.slice(0, 6).map(portfolio => {
                  const allocated = cabinetAllocations.find(a => a.portfolio === portfolio && a.allocatedTo === newDealPartner);
                  return (
                    <Pressable
                      key={portfolio}
                      onPress={() => {
                        if (allocated) {
                          setCabinetAllocations(prev => prev.filter(a => !(a.portfolio === portfolio && a.allocatedTo === newDealPartner)));
                        } else {
                          setCabinetAllocations(prev => [...prev, { portfolio, allocatedTo: newDealPartner }]);
                        }
                      }}
                      style={[styles.portfolioOption, allocated && { borderColor: partner?.color + '66', backgroundColor: partner?.color + '0A' }]}
                    >
                      <MaterialCommunityIcons
                        name={allocated ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={16}
                        color={allocated ? (partner?.color || Colors.gold) : Colors.textMuted}
                      />
                      <Text style={[styles.portfolioText, allocated && { color: partner?.color || Colors.gold }]}>
                        Minister of {portfolio}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* Note */}
            <View>
              <Text style={styles.dealSectionTitle}>AGREEMENT NOTES (OPTIONAL)</Text>
              <TextInput
                style={styles.noteInput}
                value={newDealNote}
                onChangeText={setNewDealNote}
                placeholder="Record the terms, context, or conditions of this agreement..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>

            <Pressable
              onPress={createDeal}
              style={({ pressed }) => [styles.signDealBtn, { backgroundColor: partyColor }, pressed && { opacity: 0.85 }]}
            >
              <MaterialCommunityIcons name="handshake" size={18} color="#fff" />
              <Text style={styles.signDealBtnText}>Sign Agreement</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  // ── DEAL DETAIL MODAL ───────────────────────────────────────────────────────
  const renderDealDetail = () => {
    if (!selectedDeal) return null;
    const dParty = PARTIES.find(p => p.id === selectedDeal.partnerPartyId);
    const dSeats = gameState.seats[selectedDeal.partnerPartyId] || 0;

    return (
      <Modal visible transparent animationType="slide" onRequestClose={() => setSelectedDeal(null)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.dealModal} contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md, paddingBottom: 60 }}>
            <View style={styles.dealModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dealModalTitle}>{DEAL_TYPE_LABELS[selectedDeal.dealType]}</Text>
                <Text style={styles.dealModalSub}>with {dParty?.name} · Signed Week {selectedDeal.weekSigned}</Text>
              </View>
              <Pressable onPress={() => setSelectedDeal(null)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>

            {/* Partner confidence */}
            <View style={styles.detailSection}>
              <Text style={styles.dealSectionTitle}>WEEKLY CONFIDENCE INDICATOR</Text>
              {renderConfidenceBar(selectedDeal.confidenceLevel)}
              <Text style={styles.dealSectionSub}>
                {selectedDeal.confidenceLevel >= 70 ? 'Agreement is stable. Partner is committed.' :
                 selectedDeal.confidenceLevel >= 50 ? 'Moderate confidence. Monitor policy delivery.' :
                 selectedDeal.confidenceLevel >= 35 ? 'Strained relationship. Risk of withdrawal.' :
                 'Critical — agreement near collapse. Act immediately.'}
              </Text>
            </View>

            {/* Combined strength */}
            <View style={styles.combinedSeatBox}>
              <Text style={styles.combinedSeatLabel}>Combined Parliamentary Strength</Text>
              <View style={styles.combinedSeatRow}>
                <Text style={[styles.combinedSeatNum, { color: partyColor }]}>{playerSeats}</Text>
                <MaterialCommunityIcons name="plus" size={16} color={Colors.textMuted} />
                <Text style={[styles.combinedSeatNum, { color: dParty?.color }]}>{dSeats}</Text>
                <MaterialCommunityIcons name="equal" size={16} color={Colors.textMuted} />
                <Text style={[styles.combinedSeatNum, { color: (playerSeats + dSeats) >= MAJORITY_SEATS ? Colors.success : Colors.warning }]}>
                  {playerSeats + dSeats}
                </Text>
                <Text style={styles.majorityNeeded}>/ {MAJORITY_SEATS}</Text>
              </View>
            </View>

            {/* Policy concessions */}
            {selectedDeal.policyConcessions.length > 0 ? (
              <View style={styles.detailSection}>
                <Text style={styles.dealSectionTitle}>POLICY CONCESSIONS</Text>
                {selectedDeal.policyConcessions.map(c => (
                  <View key={c.id} style={styles.concessionDetail}>
                    <MaterialCommunityIcons name="check-circle" size={14} color={Colors.success} />
                    <Text style={styles.concessionDetailText}>{c.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Cabinet allocations */}
            {selectedDeal.cabinetAllocations.length > 0 ? (
              <View style={styles.detailSection}>
                <Text style={styles.dealSectionTitle}>CABINET ALLOCATIONS</Text>
                {selectedDeal.cabinetAllocations.map((alloc, idx) => (
                  <View key={idx} style={styles.cabinetAlloc}>
                    <MaterialCommunityIcons name="briefcase" size={14} color={dParty?.color || Colors.gold} />
                    <Text style={styles.cabinetAllocText}>Minister of {alloc.portfolio}</Text>
                    <Text style={[styles.cabinetAllocParty, { color: dParty?.color }]}>{dParty?.shortName}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Note */}
            {selectedDeal.note ? (
              <View style={styles.dealNoteBox}>
                <MaterialCommunityIcons name="note-text" size={14} color={Colors.textMuted} />
                <Text style={styles.dealNoteBoxText}>"{selectedDeal.note}"</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => { setSelectedDeal(null); breakDeal(selectedDeal.id); }}
              style={({ pressed }) => [styles.breakDealBtn, pressed && { opacity: 0.85 }]}
            >
              <MaterialCommunityIcons name="handshake-off" size={16} color={Colors.error} />
              <Text style={styles.breakDealBtnText}>Terminate Agreement</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: partyColor + '44' }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <MaterialCommunityIcons name="close" size={22} color={Colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Coalition Negotiation</Text>
          <Text style={styles.headerSub}>
            {isMajority ? 'Majority Government' : `Minority — ${MAJORITY_SEATS - playerSeats} seats short of majority`}
          </Text>
        </View>
        <View style={[styles.statusPill, {
          backgroundColor: hasWorkingMajority ? Colors.success + '22' : Colors.error + '22',
        }]}>
          <Text style={[styles.statusPillText, { color: hasWorkingMajority ? Colors.success : Colors.error }]}>
            {combinedSeats}/{MAJORITY_SEATS}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {([['active', 'handshake', `Active (${activeDeal.length})`], ['negotiate', 'account-group', 'Negotiate'], ['history', 'history', 'History']] as ['active' | 'negotiate' | 'history', string, string][]).map(([tab, icon, label]) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tabBtn, activeTab === tab && { borderBottomColor: partyColor, borderBottomWidth: 2 }]}
          >
            <MaterialCommunityIcons name={icon as any} size={13} color={activeTab === tab ? partyColor : Colors.textMuted} />
            <Text style={[styles.tabBtnText, activeTab === tab && { color: partyColor }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'active' ? renderActiveDeals() : null}
      {activeTab === 'negotiate' ? renderNegotiateTab() : null}
      {activeTab === 'history' ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}>
          {deals.length === 0 ? (
            <View style={styles.emptyDeals}>
              <MaterialCommunityIcons name="history" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyDealsText}>No coalition agreements have been negotiated yet.</Text>
            </View>
          ) : deals.map(deal => {
            const dParty = PARTIES.find(p => p.id === deal.partnerPartyId);
            return (
              <View key={deal.id} style={[styles.dealCard, deal.status === 'broken' && { opacity: 0.6 }]}>
                <View style={styles.dealCardHeader}>
                  <View style={[styles.dealPartyColor, { backgroundColor: dParty?.color || Colors.textMuted }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dealCardTitle}>{DEAL_TYPE_LABELS[deal.dealType]}</Text>
                    <Text style={styles.dealCardPartner}>with {dParty?.name}</Text>
                  </View>
                  <View style={[styles.dealStatusBadge, {
                    backgroundColor: deal.status === 'active' ? Colors.success + '22' : Colors.error + '22',
                  }]}>
                    <Text style={[styles.dealStatusText, {
                      color: deal.status === 'active' ? Colors.success : Colors.error,
                    }]}>{deal.status}</Text>
                  </View>
                </View>
                <Text style={styles.dealCardPartner}>Signed W{deal.weekSigned} · {deal.policyConcessions.length} concessions · {deal.cabinetAllocations.length} cabinet seats</Text>
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      {renderNewDealModal()}
      {renderDealDetail()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, backgroundColor: Colors.surface },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  headerSub: { fontSize: FontSize.xs, color: Colors.textSecondary },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  statusPillText: { fontSize: FontSize.xs, fontWeight: FontWeight.extrabold },
  tabRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted },
  content: { padding: Spacing.md, gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 1.5, marginTop: 4 },
  seatSummary: { backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, gap: Spacing.sm },
  seatSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  seatBlock: { alignItems: 'center' },
  seatBlockValue: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold },
  seatBlockLabel: { fontSize: 9, color: Colors.textMuted },
  majorityNeeded: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.textMuted },
  majorityStatusBar: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.sm, padding: 8, borderWidth: 1 },
  majorityStatusText: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  emptyDeals: { alignItems: 'center', paddingVertical: 50, gap: 12 },
  emptyDealsTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  emptyDealsText: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.lg, lineHeight: 18 },
  negotiateNowBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 12, borderRadius: Radius.md, marginTop: 8 },
  negotiateNowBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff' },
  dealCard: { backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, gap: Spacing.sm },
  dealCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  dealPartyColor: { width: 4, borderRadius: 2, alignSelf: 'stretch', minHeight: 36 },
  dealCardTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  dealCardPartner: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  dealStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, flexDirection: 'row', alignItems: 'center', gap: 4 },
  dealStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  dealStatusText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success },
  dealStats: { flexDirection: 'row' },
  dealStat: { flex: 1, alignItems: 'center' },
  dealStatValue: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  dealStatLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 1 },
  confidenceBar: { gap: 4 },
  confidenceBarLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold },
  confidenceBarBg: { height: 8, backgroundColor: Colors.surfaceBorder, borderRadius: 4, overflow: 'visible', position: 'relative', flexDirection: 'row' },
  confidenceBarFill: { height: '100%', borderRadius: 4, position: 'absolute', left: 0 },
  confidenceMarker: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: Colors.background },
  confidenceValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, alignSelf: 'flex-end' },
  dealStabilityRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dealStabilityLabel: { fontSize: 9, color: Colors.textMuted },
  dealStabilityBar: { flex: 1, height: 4, backgroundColor: Colors.surfaceBorder, borderRadius: 2, overflow: 'hidden' },
  dealStabilityFill: { height: '100%', borderRadius: 2 },
  dealStabilityValue: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textMuted, minWidth: 28, textAlign: 'right' },
  dealNote: { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic', lineHeight: 17 },
  dealCardActions: { flexDirection: 'row', gap: 8 },
  dealActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: Colors.info + '11', borderWidth: 1, borderColor: Colors.info + '33' },
  dealActionBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.info + '0D', borderRadius: Radius.sm, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.info + '33' },
  infoBoxText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
  urgencyBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.warning + '0D', borderRadius: Radius.sm, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '33' },
  urgencyBoxText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 17 },
  partnerCard: { backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, gap: Spacing.sm },
  partnerCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  partyDot: { width: 10, height: 10, borderRadius: 5 },
  partnerName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  partnerParty: { fontSize: FontSize.xs, color: Colors.textSecondary },
  partnerSeats: { alignItems: 'center' },
  partnerSeatCount: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold },
  partnerSeatLabel: { fontSize: 9, color: Colors.textMuted },
  partnerMetrics: { gap: 6 },
  partnerMetric: { gap: 2 },
  partnerMetricLabel: { fontSize: 10, color: Colors.textMuted },
  partnerMetricValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  compatBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compatBarBg: { flex: 1, height: 6, backgroundColor: Colors.surfaceBorder, borderRadius: 3, overflow: 'hidden' },
  compatBarFill: { height: '100%', borderRadius: 3 },
  compatPct: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, minWidth: 32, textAlign: 'right' },
  existingDealBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.success + '0D', borderRadius: Radius.sm, padding: 8, borderWidth: 1, borderColor: Colors.success + '33' },
  existingDealText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.medium },
  negotiateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, backgroundColor: Colors.gold + '0A' },
  negotiateBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  // Deal Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  dealModal: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  dealModalHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  dealModalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  dealModalSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dealSectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 1.5, marginBottom: 6 },
  dealSectionSub: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, marginBottom: 8 },
  dealTypeOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.sm, gap: 10, marginBottom: 6 },
  dealTypeOptionLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dealTypeLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  dealTypeDesc: { fontSize: 10, color: Colors.textMuted, lineHeight: 15, marginTop: 2 },
  dealTypeStability: { alignItems: 'center' },
  dealTypeStabilityLabel: { fontSize: 8, color: Colors.textMuted },
  dealTypeStabilityValue: { fontSize: FontSize.sm, fontWeight: FontWeight.extrabold },
  concessionOption: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.card, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.sm, marginBottom: 4 },
  concessionText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
  categoryBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  categoryBadgeText: { fontSize: 8, fontWeight: FontWeight.bold },
  portfolioOption: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.card, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.sm, marginBottom: 4 },
  portfolioText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  noteInput: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.sm, fontSize: FontSize.xs, color: Colors.textPrimary, minHeight: 80, textAlignVertical: 'top' },
  signDealBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: Radius.md },
  signDealBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#fff' },
  // Deal detail
  detailSection: { gap: 6 },
  combinedSeatBox: { backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, gap: 6, alignItems: 'center' },
  combinedSeatLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  combinedSeatRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  combinedSeatNum: { fontSize: 28, fontWeight: FontWeight.extrabold },
  concessionDetail: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.success + '0A', borderRadius: Radius.sm, padding: 8, marginBottom: 4 },
  concessionDetailText: { flex: 1, fontSize: FontSize.xs, color: Colors.textPrimary, lineHeight: 17 },
  cabinetAlloc: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.card, borderRadius: Radius.sm, padding: 8, marginBottom: 4, borderWidth: 1, borderColor: Colors.surfaceBorder },
  cabinetAllocText: { flex: 1, fontSize: FontSize.xs, color: Colors.textPrimary },
  cabinetAllocParty: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  dealNoteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm, padding: 8 },
  dealNoteBoxText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic', lineHeight: 17 },
  breakDealBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.error + '11', borderWidth: 1, borderColor: Colors.error + '44' },
  breakDealBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.error },
});
