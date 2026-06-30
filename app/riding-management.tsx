// Powered by OnSpace.AI — Riding Management Screen
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, FlatList, Modal, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useGame } from '@/hooks/useGame';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { PARTIES } from '@/constants/parties';
import { REAL_PROVINCES, TOTAL_SEATS, MAJORITY_SEATS } from '@/constants/provinces';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface RidingData {
  id: string;
  name: string;
  provinceCode: string;
  currentHolder: string; // partyId
  marginPct: number;     // 0–50: % margin of victory; <5 = highly vulnerable
  candidateName: string | null;
  officeFunding: number; // 0–100 level
  localIssues: LocalIssue[];
  issueResponded: boolean;
  investmentLevel: number; // 0–3: none / basic / active / full office
  vulnerability: 'safe' | 'likely' | 'leaning' | 'toss-up' | 'critical';
  swingNeeded: number;   // swing % needed to flip from player perspective
}

export interface LocalIssue {
  id: string;
  ridingId: string;
  title: string;
  description: string;
  category: 'infrastructure' | 'healthcare' | 'jobs' | 'environment' | 'social';
  urgency: 'low' | 'medium' | 'high';
  electionImpact: number; // +/- swing effect if responded
  responded: boolean;
  response?: string;
}

type Tab = 'vulnerable' | 'all' | 'issues';
type SortKey = 'margin' | 'province' | 'vulnerability';

// Riding name pools by province
const RIDINGS: Record<string, string[]> = {
  ON: ['Ajax', 'Aurora—Oak Ridges', 'Barrie—Innisfil', 'Bay of Quinte', 'Brampton Centre', 'Brampton East', 'Brampton North', 'Burlington', 'Cambridge', 'Don Valley East', 'Eglinton—Lawrence', 'Etobicoke Centre', 'Guelph', 'Hamilton Centre', 'Hamilton East', 'Hamilton Mountain', 'Kingston', 'London North Centre', 'London West', 'Markham—Stouffville', 'Milton', 'Mississauga Centre', 'Mississauga East', 'Newmarket—Aurora', 'Niagara Centre', 'Niagara Falls', 'North Bay', 'Oakville', 'Oshawa', 'Ottawa Centre', 'Ottawa South', 'Ottawa West', 'Peel', 'Peterborough', 'Pickering', 'Richmond Hill', 'Scarborough Centre', 'Thornhill', 'Thunder Bay', 'Toronto Centre', 'Toronto—Danforth', 'Vaughan', 'Waterloo', 'Whitby', 'Windsor West'],
  QC: ['Abitibi', 'Ahuntsic—Cartierville', 'Beauce', 'Beloeil—Chambly', 'Brome—Missisquoi', 'Chicoutimi', 'Drummond', 'Gatineau', 'Hochelaga', 'Jonquière', 'Lac-Saint-Jean', 'Laval—Les Îles', 'Laval Nord', 'Lévis', 'Longueuil', 'Montarville', 'Mont-Royal', 'Outremont', 'Papineau', 'Québec', 'Repentigny', 'Rimouski', 'Rosemont', 'Saint-Hyacinthe', 'Sherbrooke', 'Terrebonne', 'Trois-Rivières', 'Vimy'],
  BC: ['Abbotsford', 'Burnaby North', 'Burnaby South', 'Central Okanagan', 'Chilliwack', 'Coquitlam', 'Delta South', 'Fleetwood', 'Kelowna', 'Nanaimo', 'New Westminster', 'North Island', 'North Vancouver', 'Port Moody', 'Richmond Centre', 'Saanich', 'Skeena', 'South Surrey', 'Surrey Centre', 'Vancouver Centre', 'Vancouver East', 'Vancouver Granville', 'Victoria', 'West Vancouver'],
  AB: ['Banff—Airdrie', 'Calgary Centre', 'Calgary East', 'Calgary Heritage', 'Calgary Skyview', 'Edmonton Centre', 'Edmonton Griesbach', 'Edmonton Riverbend', 'Edmonton Strathcona', 'Fort McMurray', 'Grande Prairie', 'Lethbridge', 'Medicine Hat', 'Red Deer', 'St. Albert'],
  MB: ['Brandon', 'Churchill—Keewatinook', 'Elmwood', 'Kildonan', 'Portage', 'Provencher', 'Winnipeg Centre', 'Winnipeg North', 'Winnipeg South', 'Winnipeg West'],
  SK: ['Battlefords—Lloydminster', 'Moose Jaw', 'Prince Albert', 'Regina Centre', 'Regina East', 'Saskatoon West', 'Yorkton'],
  NS: ['Cape Breton', 'Central Nova', 'Cumberland—Colchester', 'Dartmouth', 'Halifax', 'Halifax West', 'Kings—Hants'],
  NB: ['Acadie—Bathurst', 'Beauséjour', 'Fredericton', 'Fundy Royal', 'Moncton', 'Restigouche', 'Saint John'],
  NL: ['Avalon', 'Bonavista', 'Labrador', "St. John's East", "St. John's South"],
  PE: ['Cardigan', 'Charlottetown', 'Egmont', 'Malpeque'],
  YT: ['Yukon'],
  NT: ['Northwest Territories'],
  NU: ['Nunavut'],
};

const LOCAL_ISSUE_TEMPLATES = [
  { title: 'Hospital Emergency Department Closure Threat', description: 'The regional health authority is considering closing the local ER, forcing patients 90 minutes to the nearest hospital.', category: 'healthcare' as const, urgency: 'high' as const, electionImpact: 6 },
  { title: 'Highway 11 Bridge Structural Concerns', description: 'Engineers have flagged the main bridge as a safety hazard. Residents demand federal infrastructure funding.', category: 'infrastructure' as const, urgency: 'high' as const, electionImpact: 5 },
  { title: 'Mill Closure — 400 Jobs at Risk', description: 'The local lumber mill has announced closure unless a government subsidy deal is reached within 60 days.', category: 'jobs' as const, urgency: 'high' as const, electionImpact: 7 },
  { title: 'Affordable Housing Crisis', description: 'Rental vacancy rate has hit 0.3%, with median rents up 40% in two years. Residents demand action.', category: 'social' as const, urgency: 'medium' as const, electionImpact: 4 },
  { title: 'Toxic Spill in Local Watershed', description: 'An industrial spill has contaminated the local river. Environmental groups are demanding immediate federal cleanup.', category: 'environment' as const, urgency: 'high' as const, electionImpact: 6 },
  { title: 'Broadband Dead Zone', description: 'Over 3,000 rural homes have no reliable internet access, affecting remote work and education.', category: 'infrastructure' as const, urgency: 'medium' as const, electionImpact: 3 },
  { title: 'Seniors Long-Term Care Waiting List', description: 'Over 800 seniors on a multi-year wait list for long-term care beds. Families are calling it a crisis.', category: 'healthcare' as const, urgency: 'medium' as const, electionImpact: 4 },
  { title: 'Base Closure Rumours', description: 'Media reports suggest the local Canadian Forces base may be on a closure review list. 1,200 civilian jobs depend on it.', category: 'jobs' as const, urgency: 'high' as const, electionImpact: 8 },
  { title: 'Trans-Canada Rail Line Downgrade', description: 'CN Rail has announced service cuts that will eliminate passenger service through the riding by end of year.', category: 'infrastructure' as const, urgency: 'medium' as const, electionImpact: 3 },
  { title: 'Opioid Crisis Response Funding', description: 'Local health region has declared an opioid public health emergency and is requesting urgent federal support.', category: 'healthcare' as const, urgency: 'high' as const, electionImpact: 5 },
  { title: 'Indigenous Water Advisory — 3rd Year', description: 'A First Nation community within the riding remains under a boil-water advisory. Federal inaction is a major issue.', category: 'environment' as const, urgency: 'high' as const, electionImpact: 7 },
  { title: 'Agricultural Flooding Disaster', description: 'Spring flooding has destroyed crops across 40,000 acres. Farmers demand AgriStability expansion.', category: 'jobs' as const, urgency: 'high' as const, electionImpact: 6 },
  { title: 'School Closure — Rural Consolidation', description: 'The provincial government plans to close two rural elementary schools. Parents are organizing against it.', category: 'social' as const, urgency: 'medium' as const, electionImpact: 3 },
  { title: 'Wind Farm Opposition', description: 'A proposed offshore wind project has polarized the community between jobs and environmental/visual concerns.', category: 'environment' as const, urgency: 'low' as const, electionImpact: 2 },
  { title: 'Port Expansion Approval Fight', description: 'A major shipping terminal expansion promises 600 jobs but requires federal environmental approval residents oppose.', category: 'jobs' as const, urgency: 'medium' as const, electionImpact: 4 },
];

const CANDIDATE_FIRST = ['James', 'Sarah', 'Michael', 'Jennifer', 'David', 'Lisa', 'Robert', 'Emily', 'William', 'Amanda', 'Thomas', 'Rachel', 'Kevin', 'Patricia', 'Daniel'];
const CANDIDATE_LAST = ['Chen', 'Williams', 'MacDonald', 'Tremblay', 'Singh', 'Martin', 'White', 'Harris', 'Jackson', 'Taylor', 'Anderson', 'Garcia', 'Robinson', 'Walker', 'Kim'];

function seeded(s: number) { const x = Math.sin(s + 1) * 10000; return x - Math.floor(x); }

function getVulnerability(margin: number, isPlayerRiding: boolean): RidingData['vulnerability'] {
  if (!isPlayerRiding) {
    if (margin < 3) return 'critical';
    if (margin < 7) return 'toss-up';
    if (margin < 12) return 'leaning';
    if (margin < 20) return 'likely';
    return 'safe';
  }
  if (margin < 3) return 'critical';
  if (margin < 7) return 'toss-up';
  if (margin < 12) return 'leaning';
  if (margin < 20) return 'likely';
  return 'safe';
}

function generateRidings(
  playerPartyId: string,
  seats: Record<string, number>,
  currentWeek: number
): RidingData[] {
  const ridings: RidingData[] = [];
  const partyIds = Object.keys(seats).filter(id => (seats[id] || 0) > 0);
  const provinces = REAL_PROVINCES;
  let ridingIdx = 0;

  for (const prov of provinces) {
    const provRidings = RIDINGS[prov.code] || [`${prov.name} Riding 1`];
    const seatsInProv = Math.min(prov.seats, provRidings.length);

    for (let i = 0; i < seatsInProv; i++) {
      const seed = ridingIdx * 13 + i * 7 + currentWeek;
      const r1 = seeded(seed);
      const r2 = seeded(seed + 1);
      const r3 = seeded(seed + 2);
      const r4 = seeded(seed + 3);
      const r5 = seeded(seed + 4);

      // Assign party holding this seat proportionally
      const holderParty = partyIds[Math.floor(r1 * partyIds.length)];

      const margin = Math.round(r2 * 30 + 1); // 1–31% margin
      const isPlayerRiding = holderParty === playerPartyId;
      const issueCount = r3 > 0.6 ? 1 : r3 > 0.85 ? 2 : 0;

      const issues: LocalIssue[] = [];
      for (let j = 0; j < issueCount; j++) {
        const tmpl = LOCAL_ISSUE_TEMPLATES[Math.floor(seeded(seed + j + 5) * LOCAL_ISSUE_TEMPLATES.length)];
        issues.push({
          id: `issue_${ridingIdx}_${j}`,
          ridingId: `riding_${ridingIdx}`,
          title: tmpl.title,
          description: tmpl.description,
          category: tmpl.category,
          urgency: tmpl.urgency,
          electionImpact: tmpl.electionImpact,
          responded: false,
        });
      }

      ridings.push({
        id: `riding_${ridingIdx}`,
        name: provRidings[i] || `${prov.name} Riding ${i + 1}`,
        provinceCode: prov.code,
        currentHolder: holderParty,
        marginPct: margin,
        candidateName: null,
        officeFunding: 0,
        localIssues: issues,
        issueResponded: false,
        investmentLevel: 0,
        vulnerability: getVulnerability(margin, isPlayerRiding),
        swingNeeded: isPlayerRiding ? margin : -margin,
      });

      ridingIdx++;
    }
  }

  return ridings;
}

const VULNERABILITY_COLORS: Record<RidingData['vulnerability'], string> = {
  safe: Colors.success,
  likely: '#6BCB77',
  leaning: Colors.gold,
  'toss-up': Colors.warning,
  critical: Colors.error,
};

const CATEGORY_ICONS: Record<LocalIssue['category'], string> = {
  infrastructure: 'road-variant',
  healthcare: 'hospital-box',
  jobs: 'briefcase',
  environment: 'leaf',
  social: 'account-group',
};

const INVESTMENT_LABELS = ['No Office', 'Basic (1 Staff)', 'Active (3 Staff)', 'Full Office (5 Staff)'];
const INVESTMENT_COSTS = [0, 50000, 150000, 350000];

export default function RidingManagementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { gameState, logAction } = useGame();
  const { showAlert } = useAlert();

  const [activeTab, setActiveTab] = useState<Tab>('vulnerable');
  const [sortKey, setSortKey] = useState<SortKey>('margin');
  const [selectedRiding, setSelectedRiding] = useState<RidingData | null>(null);
  const [localRidings, setLocalRidings] = useState<RidingData[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [candidateInput, setCandidateInput] = useState('');
  const [showCandidateInput, setShowCandidateInput] = useState(false);

  if (!gameState) return null;

  const party = PARTIES.find(p => p.id === gameState.playerPartyId);
  const partyColor = party?.color || Colors.primary;

  const baseRidings = useMemo(() => generateRidings(
    gameState.playerPartyId,
    gameState.seats,
    gameState.currentWeek
  ), [gameState.playerPartyId, gameState.seats, gameState.currentWeek]);

  const ridings = localRidings || baseRidings;

  const updateRiding = useCallback((id: string, update: Partial<RidingData>) => {
    setLocalRidings(prev => (prev || baseRidings).map(r => r.id === id ? { ...r, ...update } : r));
  }, [baseRidings]);

  const updateIssue = useCallback((ridingId: string, issueId: string, update: Partial<LocalIssue>) => {
    setLocalRidings(prev => (prev || baseRidings).map(r =>
      r.id === ridingId
        ? { ...r, localIssues: r.localIssues.map(i => i.id === issueId ? { ...i, ...update } : i) }
        : r
    ));
  }, [baseRidings]);

  // ── TABS ────────────────────────────────────────────────────────────────────
  const playerRidings = ridings.filter(r => r.currentHolder === gameState.playerPartyId);

  const top20Vulnerable = useMemo(() => {
    const vulnerable = playerRidings
      .filter(r => r.vulnerability !== 'safe')
      .sort((a, b) => a.marginPct - b.marginPct)
      .slice(0, 20);
    return vulnerable;
  }, [playerRidings]);

  const sortedAll = useMemo(() => {
    let filtered = ridings.filter(r =>
      searchQuery === '' ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.provinceCode.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (sortKey === 'margin') filtered = filtered.sort((a, b) => a.marginPct - b.marginPct);
    else if (sortKey === 'province') filtered = filtered.sort((a, b) => a.provinceCode.localeCompare(b.provinceCode));
    else if (sortKey === 'vulnerability') {
      const order: Record<RidingData['vulnerability'], number> = { critical: 0, 'toss-up': 1, leaning: 2, likely: 3, safe: 4 };
      filtered = filtered.sort((a, b) => order[a.vulnerability] - order[b.vulnerability]);
    }
    return filtered;
  }, [ridings, searchQuery, sortKey]);

  const ridingsWithIssues = useMemo(() =>
    ridings.filter(r => r.localIssues.length > 0 && r.localIssues.some(i => !i.responded)),
  [ridings]);

  // ── ACTIONS ─────────────────────────────────────────────────────────────────
  const handleAppointCandidate = (riding: RidingData, name: string) => {
    if (!name.trim()) return;
    updateRiding(riding.id, { candidateName: name.trim() });
    logAction?.({
      action: 'Candidate Appointed',
      category: 'election',
      description: `${name.trim()} appointed as candidate in ${riding.name}, ${riding.provinceCode}`,
      severity: 'low',
    });
    setShowCandidateInput(false);
    setCandidateInput('');
    showAlert('Candidate Set', `${name.trim()} is now the candidate for ${riding.name}.`);
  };

  const handleInvestInOffice = (riding: RidingData, level: number) => {
    const cost = INVESTMENT_COSTS[level];
    showAlert(
      `Upgrade to ${INVESTMENT_LABELS[level]}?`,
      `Annual cost: $${cost.toLocaleString()}. Improves local visibility and issue response capacity, increasing election support in this riding.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Invest',
          onPress: () => {
            const marginBonus = level - riding.investmentLevel;
            updateRiding(riding.id, {
              investmentLevel: level,
              officeFunding: level * 25,
              marginPct: Math.min(45, riding.marginPct + marginBonus),
            });
            logAction?.({
              action: 'Constituency Office Upgraded',
              category: 'election',
              description: `${riding.name}, ${riding.provinceCode} — ${INVESTMENT_LABELS[level]} ($${cost.toLocaleString()}/yr)`,
              impact: `+${marginBonus}% margin support`,
              severity: 'low',
            });
            if (selectedRiding?.id === riding.id) {
              setSelectedRiding(prev => prev ? { ...prev, investmentLevel: level, officeFunding: level * 25, marginPct: Math.min(45, prev.marginPct + marginBonus) } : prev);
            }
            showAlert('Office Upgraded', `${riding.name} now has a ${INVESTMENT_LABELS[level]} — local support improved.`);
          },
        },
      ]
    );
  };

  const handleRespondToIssue = (riding: RidingData, issue: LocalIssue, response: string) => {
    const newMargin = Math.min(45, riding.marginPct + issue.electionImpact);
    updateIssue(riding.id, issue.id, { responded: true, response });
    updateRiding(riding.id, { marginPct: newMargin });
    logAction?.({
      action: 'Local Issue Addressed',
      category: 'election',
      description: `${issue.title} — ${riding.name}, ${riding.provinceCode}`,
      impact: `+${issue.electionImpact}% local support`,
      severity: issue.urgency === 'high' ? 'high' : 'medium',
    });
    setSelectedRiding(prev => prev ? {
      ...prev,
      marginPct: newMargin,
      localIssues: prev.localIssues.map(i => i.id === issue.id ? { ...i, responded: true, response } : i),
    } : prev);
    showAlert('Issue Addressed', `Your response to "${issue.title}" has been noted. Local support in ${riding.name} improved by +${issue.electionImpact}%.`);
  };

  // ── RIDING CARD ─────────────────────────────────────────────────────────────
  const renderRidingCard = (riding: RidingData, showIssues = false) => {
    const vColor = VULNERABILITY_COLORS[riding.vulnerability];
    const holderParty = PARTIES.find(p => p.id === riding.currentHolder);
    const isPlayerRiding = riding.currentHolder === gameState.playerPartyId;
    const hasUnrespondedIssues = riding.localIssues.some(i => !i.responded);

    return (
      <Pressable
        key={riding.id}
        onPress={() => setSelectedRiding(riding)}
        style={({ pressed }) => [
          styles.ridingCard,
          { borderLeftColor: vColor, borderLeftWidth: 3 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={styles.ridingCardTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.ridingNameRow}>
              <Text style={styles.ridingName}>{riding.name}</Text>
              {hasUnrespondedIssues ? (
                <View style={styles.issueDot}>
                  <Text style={styles.issueDotText}>!</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.ridingProv}>{riding.provinceCode} — {isPlayerRiding ? `Held by ${party?.shortName}` : `Held by ${holderParty?.shortName || riding.currentHolder.toUpperCase()}`}</Text>
          </View>
          <View style={styles.ridingRight}>
            <Text style={[styles.ridingMargin, { color: vColor }]}>{riding.marginPct}%</Text>
            <Text style={styles.ridingMarginLabel}>margin</Text>
            <View style={[styles.vulnBadge, { backgroundColor: vColor + '22' }]}>
              <Text style={[styles.vulnBadgeText, { color: vColor }]}>{riding.vulnerability.replace('-', '‑')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.ridingCardBottom}>
          {riding.candidateName ? (
            <View style={styles.candidatePill}>
              <MaterialCommunityIcons name="account-check" size={10} color={Colors.success} />
              <Text style={styles.candidatePillText}>{riding.candidateName}</Text>
            </View>
          ) : isPlayerRiding ? (
            <View style={[styles.candidatePill, { backgroundColor: Colors.warning + '22' }]}>
              <MaterialCommunityIcons name="account-question" size={10} color={Colors.warning} />
              <Text style={[styles.candidatePillText, { color: Colors.warning }]}>No candidate yet</Text>
            </View>
          ) : null}

          {riding.investmentLevel > 0 ? (
            <View style={styles.officePill}>
              <MaterialCommunityIcons name="office-building" size={10} color={Colors.info} />
              <Text style={styles.officePillText}>{INVESTMENT_LABELS[riding.investmentLevel]}</Text>
            </View>
          ) : null}

          {showIssues && riding.localIssues.filter(i => !i.responded).map(issue => (
            <View key={issue.id} style={[styles.issuePill, {
              backgroundColor: issue.urgency === 'high' ? Colors.error + '22' : Colors.warning + '22',
            }]}>
              <MaterialCommunityIcons
                name={CATEGORY_ICONS[issue.category] as any}
                size={10}
                color={issue.urgency === 'high' ? Colors.error : Colors.warning}
              />
              <Text style={[styles.issuePillText, {
                color: issue.urgency === 'high' ? Colors.error : Colors.warning,
              }]} numberOfLines={1}>{issue.title}</Text>
            </View>
          ))}
        </View>
      </Pressable>
    );
  };

  // ── RIDING DETAIL MODAL ─────────────────────────────────────────────────────
  const renderRidingDetail = () => {
    if (!selectedRiding) return null;
    const vColor = VULNERABILITY_COLORS[selectedRiding.vulnerability];
    const isPlayerRiding = selectedRiding.currentHolder === gameState.playerPartyId;

    return (
      <Modal visible transparent animationType="slide" onRequestClose={() => setSelectedRiding(null)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.detailModal} contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md, paddingBottom: 60 }}>
            {/* Header */}
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailName}>{selectedRiding.name}</Text>
                <Text style={styles.detailProv}>{selectedRiding.provinceCode} — {selectedRiding.vulnerability.toUpperCase()}</Text>
              </View>
              <Pressable onPress={() => setSelectedRiding(null)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>

            {/* Margin bar */}
            <View style={styles.marginSection}>
              <View style={styles.marginBarBg}>
                <View style={[styles.marginBarFill, { width: `${Math.min(100, selectedRiding.marginPct * 2)}%` as any, backgroundColor: vColor }]} />
              </View>
              <View style={styles.marginLabels}>
                <Text style={[styles.marginValue, { color: vColor }]}>{selectedRiding.marginPct}% margin</Text>
                <Text style={styles.marginSwing}>
                  {isPlayerRiding
                    ? `Safe if margin ≥ 5%`
                    : `Need ${selectedRiding.marginPct}% swing to flip`}
                </Text>
              </View>
            </View>

            {/* Candidate */}
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>LOCAL CANDIDATE</Text>
              {selectedRiding.candidateName ? (
                <View style={styles.candidateCard}>
                  <MaterialCommunityIcons name="account-circle" size={32} color={partyColor} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.candidateCardName}>{selectedRiding.candidateName}</Text>
                    <Text style={styles.candidateCardRole}>{party?.shortName} Candidate — {selectedRiding.name}</Text>
                  </View>
                  <Pressable
                    onPress={() => { setCandidateInput(selectedRiding.candidateName || ''); setShowCandidateInput(true); }}
                    style={styles.editCandidateBtn}
                  >
                    <MaterialCommunityIcons name="pencil" size={14} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.noCandidateCard}>
                  <MaterialCommunityIcons name="account-plus" size={20} color={Colors.warning} />
                  <Text style={styles.noCandidateText}>No candidate appointed for this riding.</Text>
                </View>
              )}

              {showCandidateInput ? (
                <View style={styles.candidateInputRow}>
                  <TextInput
                    style={styles.candidateInput}
                    value={candidateInput}
                    onChangeText={setCandidateInput}
                    placeholder="Enter candidate full name..."
                    placeholderTextColor={Colors.textMuted}
                    autoFocus
                  />
                  <Pressable
                    onPress={() => handleAppointCandidate(selectedRiding, candidateInput)}
                    style={[styles.candidateInputBtn, { backgroundColor: partyColor }]}
                  >
                    <Text style={styles.candidateInputBtnText}>Set</Text>
                  </Pressable>
                  <Pressable onPress={() => setShowCandidateInput(false)} style={styles.candidateInputCancel}>
                    <MaterialCommunityIcons name="close" size={16} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ) : !selectedRiding.candidateName ? (
                <Pressable
                  onPress={() => {
                    const rn = seeded(selectedRiding.name.length * 7);
                    const defaultName = `${CANDIDATE_FIRST[Math.floor(rn * CANDIDATE_FIRST.length)]} ${CANDIDATE_LAST[Math.floor(seeded(selectedRiding.name.length * 13) * CANDIDATE_LAST.length)]}`;
                    setCandidateInput(defaultName);
                    setShowCandidateInput(true);
                  }}
                  style={({ pressed }) => [styles.appointBtn, { backgroundColor: partyColor }, pressed && { opacity: 0.85 }]}
                >
                  <MaterialCommunityIcons name="account-plus" size={16} color="#fff" />
                  <Text style={styles.appointBtnText}>Appoint Candidate</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Constituency Office */}
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>CONSTITUENCY OFFICE</Text>
              <Text style={styles.detailSectionSub}>Investing in office capacity improves local visibility, issue response speed, and election margin.</Text>
              <View style={styles.officeGrid}>
                {INVESTMENT_LABELS.map((label, level) => (
                  <Pressable
                    key={level}
                    onPress={() => level > selectedRiding.investmentLevel ? handleInvestInOffice(selectedRiding, level) : null}
                    style={[
                      styles.officeCard,
                      selectedRiding.investmentLevel === level && { borderColor: partyColor, backgroundColor: partyColor + '11' },
                      level < selectedRiding.investmentLevel && { opacity: 0.4 },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={level === 0 ? 'close-circle' : level === 1 ? 'home' : level === 2 ? 'office-building' : 'office-building-marker'}
                      size={20}
                      color={selectedRiding.investmentLevel === level ? partyColor : Colors.textMuted}
                    />
                    <Text style={[styles.officeLevelLabel, selectedRiding.investmentLevel === level && { color: partyColor }]}>
                      {label}
                    </Text>
                    <Text style={styles.officeCost}>
                      {level === 0 ? 'Free' : `$${INVESTMENT_COSTS[level].toLocaleString()}/yr`}
                    </Text>
                    {level > selectedRiding.investmentLevel ? (
                      <View style={[styles.officeUpgradeBadge, { backgroundColor: Colors.success + '22' }]}>
                        <Text style={styles.officeUpgradeBadgeText}>+{level - selectedRiding.investmentLevel}% margin</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Local Issues */}
            {selectedRiding.localIssues.length > 0 ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>LOCAL ISSUES</Text>
                <Text style={styles.detailSectionSub}>Responding to local issues improves election outcomes in this riding.</Text>
                {selectedRiding.localIssues.map(issue => (
                  <View key={issue.id} style={[
                    styles.issueCard,
                    issue.responded && { opacity: 0.6 },
                    { borderColor: issue.urgency === 'high' ? Colors.error + '44' : Colors.warning + '44' },
                  ]}>
                    <View style={styles.issueCardHeader}>
                      <View style={[styles.issueIconBox, {
                        backgroundColor: issue.urgency === 'high' ? Colors.error + '22' : Colors.warning + '22',
                      }]}>
                        <MaterialCommunityIcons
                          name={CATEGORY_ICONS[issue.category] as any}
                          size={16}
                          color={issue.urgency === 'high' ? Colors.error : Colors.warning}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.issueTitle}>{issue.title}</Text>
                        <View style={styles.issueMetaRow}>
                          <View style={[styles.urgencyBadge, {
                            backgroundColor: issue.urgency === 'high' ? Colors.error + '22' : Colors.warning + '22',
                          }]}>
                            <Text style={[styles.urgencyText, {
                              color: issue.urgency === 'high' ? Colors.error : Colors.warning,
                            }]}>{issue.urgency.toUpperCase()}</Text>
                          </View>
                          <Text style={styles.issueImpactText}>+{issue.electionImpact}% if resolved</Text>
                        </View>
                      </View>
                    </View>

                    <Text style={styles.issueDesc}>{issue.description}</Text>

                    {issue.responded ? (
                      <View style={styles.respondedBadge}>
                        <MaterialCommunityIcons name="check-circle" size={13} color={Colors.success} />
                        <Text style={styles.respondedText}>Addressed — {issue.response}</Text>
                      </View>
                    ) : (
                      <View style={styles.issueResponses}>
                        {issue.category === 'healthcare' ? (
                          <>
                            <Pressable
                              onPress={() => handleRespondToIssue(selectedRiding, issue, 'Announced federal funding for healthcare infrastructure')}
                              style={({ pressed }) => [styles.issueResponseBtn, pressed && { opacity: 0.8 }]}
                            >
                              <Text style={styles.issueResponseBtnText}>Pledge Federal Funding</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleRespondToIssue(selectedRiding, issue, 'Ordered ministerial review of situation')}
                              style={({ pressed }) => [styles.issueResponseBtn, styles.issueResponseBtnSecondary, pressed && { opacity: 0.8 }]}
                            >
                              <Text style={[styles.issueResponseBtnText, { color: Colors.textSecondary }]}>Request Review</Text>
                            </Pressable>
                          </>
                        ) : issue.category === 'jobs' ? (
                          <>
                            <Pressable
                              onPress={() => handleRespondToIssue(selectedRiding, issue, 'Secured federal economic development package')}
                              style={({ pressed }) => [styles.issueResponseBtn, pressed && { opacity: 0.8 }]}
                            >
                              <Text style={styles.issueResponseBtnText}>Economic Package</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleRespondToIssue(selectedRiding, issue, 'Met with business leaders; exploratory discussions ongoing')}
                              style={({ pressed }) => [styles.issueResponseBtn, styles.issueResponseBtnSecondary, pressed && { opacity: 0.8 }]}
                            >
                              <Text style={[styles.issueResponseBtnText, { color: Colors.textSecondary }]}>Meet Stakeholders</Text>
                            </Pressable>
                          </>
                        ) : issue.category === 'infrastructure' ? (
                          <>
                            <Pressable
                              onPress={() => handleRespondToIssue(selectedRiding, issue, 'Fast-tracked federal infrastructure funding approval')}
                              style={({ pressed }) => [styles.issueResponseBtn, pressed && { opacity: 0.8 }]}
                            >
                              <Text style={styles.issueResponseBtnText}>Approve Funding</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleRespondToIssue(selectedRiding, issue, 'Ordered engineering review; committed to action')}
                              style={({ pressed }) => [styles.issueResponseBtn, styles.issueResponseBtnSecondary, pressed && { opacity: 0.8 }]}
                            >
                              <Text style={[styles.issueResponseBtnText, { color: Colors.textSecondary }]}>Engineering Review</Text>
                            </Pressable>
                          </>
                        ) : issue.category === 'environment' ? (
                          <>
                            <Pressable
                              onPress={() => handleRespondToIssue(selectedRiding, issue, 'Launched federal emergency environmental response')}
                              style={({ pressed }) => [styles.issueResponseBtn, pressed && { opacity: 0.8 }]}
                            >
                              <Text style={styles.issueResponseBtnText}>Emergency Response</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleRespondToIssue(selectedRiding, issue, 'Commissioned independent environmental assessment')}
                              style={({ pressed }) => [styles.issueResponseBtn, styles.issueResponseBtnSecondary, pressed && { opacity: 0.8 }]}
                            >
                              <Text style={[styles.issueResponseBtnText, { color: Colors.textSecondary }]}>Commission Study</Text>
                            </Pressable>
                          </>
                        ) : (
                          <>
                            <Pressable
                              onPress={() => handleRespondToIssue(selectedRiding, issue, 'Committed federal resources to address community concern')}
                              style={({ pressed }) => [styles.issueResponseBtn, pressed && { opacity: 0.8 }]}
                            >
                              <Text style={styles.issueResponseBtnText}>Commit Resources</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleRespondToIssue(selectedRiding, issue, 'Held public town hall; acknowledged the issue')}
                              style={({ pressed }) => [styles.issueResponseBtn, styles.issueResponseBtnSecondary, pressed && { opacity: 0.8 }]}
                            >
                              <Text style={[styles.issueResponseBtnText, { color: Colors.textSecondary }]}>Town Hall</Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    );
  };

  // ── SUMMARY STATS ─────────────────────────────────────────────────────────
  const criticalCount = playerRidings.filter(r => r.vulnerability === 'critical').length;
  const tossUpCount = playerRidings.filter(r => r.vulnerability === 'toss-up').length;
  const issueCount = ridingsWithIssues.length;
  const candidatesSet = playerRidings.filter(r => r.candidateName).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: partyColor + '44' }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <MaterialCommunityIcons name="close" size={22} color={Colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Riding Management</Text>
          <Text style={styles.headerSub}>{party?.shortName} — {playerRidings.length} ridings held</Text>
        </View>
        <MaterialCommunityIcons name="map-marker-multiple" size={22} color={partyColor} />
      </View>

      {/* Summary strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.error }]}>{criticalCount}</Text>
          <Text style={styles.summaryLabel}>Critical</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.warning }]}>{tossUpCount}</Text>
          <Text style={styles.summaryLabel}>Toss-Up</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.error }]}>{issueCount}</Text>
          <Text style={styles.summaryLabel}>Unresolved Issues</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.success }]}>{candidatesSet}</Text>
          <Text style={styles.summaryLabel}>Candidates Set</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {([['vulnerable', 'map-marker-alert', `Top 20 Vulnerable`], ['all', 'map', 'All Ridings'], ['issues', 'alert-circle', `Issues (${issueCount})`]] as [Tab, string, string][]).map(([tab, icon, label]) => (
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

      {/* Content */}
      {activeTab === 'vulnerable' ? (
        <ScrollView
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 30 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.infoBox}>
            <MaterialCommunityIcons name="information" size={13} color={Colors.info} />
            <Text style={styles.infoBoxText}>
              Top 20 ridings at greatest risk — ranked by smallest margin. Tap to appoint candidates, fund offices, and respond to local issues.
            </Text>
          </View>
          {top20Vulnerable.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="check-decagram" size={40} color={Colors.success} />
              <Text style={styles.emptyText}>All ridings are secure. No critical vulnerabilities detected.</Text>
            </View>
          ) : top20Vulnerable.map(riding => renderRidingCard(riding, false))}
        </ScrollView>
      ) : null}

      {activeTab === 'all' ? (
        <>
          <View style={styles.searchRow}>
            <View style={styles.searchBar}>
              <MaterialCommunityIcons name="magnify" size={15} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search riding or province..."
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={styles.sortBtns}>
              {(['margin', 'province', 'vulnerability'] as SortKey[]).map(key => (
                <Pressable
                  key={key}
                  onPress={() => setSortKey(key)}
                  style={[styles.sortBtn, sortKey === key && { backgroundColor: partyColor + '22', borderColor: partyColor }]}
                >
                  <Text style={[styles.sortBtnText, sortKey === key && { color: partyColor }]}>
                    {key === 'margin' ? 'Margin' : key === 'province' ? 'Province' : 'Vuln.'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <FlatList
            data={sortedAll}
            keyExtractor={r => r.id}
            renderItem={({ item }) => renderRidingCard(item, false)}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 30 }]}
            showsVerticalScrollIndicator={false}
          />
        </>
      ) : null}

      {activeTab === 'issues' ? (
        <ScrollView
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 30 }]}
          showsVerticalScrollIndicator={false}
        >
          {ridingsWithIssues.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="check-circle" size={40} color={Colors.success} />
              <Text style={styles.emptyText}>No unresolved local issues at this time.</Text>
            </View>
          ) : ridingsWithIssues.map(riding => renderRidingCard(riding, true))}
        </ScrollView>
      ) : null}

      {renderRidingDetail()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, backgroundColor: Colors.surface },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  headerSub: { fontSize: FontSize.xs, color: Colors.textSecondary },
  summaryStrip: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, paddingVertical: 10 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold },
  summaryLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center' },
  summaryDivider: { width: 1, height: 28, backgroundColor: Colors.surfaceBorder },
  tabRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnText: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted },
  listContent: { padding: Spacing.sm, gap: 6 },
  searchRow: { padding: Spacing.sm, gap: 6, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: Colors.surfaceBorder },
  searchInput: { flex: 1, fontSize: FontSize.xs, color: Colors.textPrimary },
  sortBtns: { flexDirection: 'row', gap: 6 },
  sortBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder },
  sortBtnText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.info + '0D', borderRadius: Radius.sm, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.info + '33', marginBottom: 4 },
  infoBoxText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
  ridingCard: { backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.sm, gap: 6 },
  ridingCardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  ridingNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ridingName: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, flex: 1 },
  issueDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center' },
  issueDotText: { fontSize: 9, fontWeight: FontWeight.extrabold, color: '#fff' },
  ridingProv: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  ridingRight: { alignItems: 'flex-end', gap: 2 },
  ridingMargin: { fontSize: FontSize.lg, fontWeight: FontWeight.extrabold },
  ridingMarginLabel: { fontSize: 9, color: Colors.textMuted },
  vulnBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  vulnBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, textTransform: 'uppercase' },
  ridingCardBottom: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  candidatePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.success + '22', paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  candidatePillText: { fontSize: 9, color: Colors.success, fontWeight: FontWeight.bold },
  officePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.info + '22', paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  officePillText: { fontSize: 9, color: Colors.info, fontWeight: FontWeight.bold },
  issuePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, maxWidth: 200 },
  issuePillText: { fontSize: 9, fontWeight: FontWeight.bold },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.lg },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  detailModal: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  detailName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  detailProv: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  marginSection: { gap: 6 },
  marginBarBg: { height: 10, backgroundColor: Colors.surfaceElevated, borderRadius: 5, overflow: 'hidden' },
  marginBarFill: { height: '100%', borderRadius: 5 },
  marginLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  marginValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  marginSwing: { fontSize: FontSize.xs, color: Colors.textMuted },
  detailSection: { gap: Spacing.sm },
  detailSectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 1.5 },
  detailSectionSub: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
  candidateCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.sm },
  candidateCardName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  candidateCardRole: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  editCandidateBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  noCandidateCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.warning + '0D', borderRadius: Radius.sm, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '33' },
  noCandidateText: { fontSize: FontSize.xs, color: Colors.warning },
  candidateInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  candidateInput: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.surfaceBorder, paddingHorizontal: 12, paddingVertical: 10, fontSize: FontSize.sm, color: Colors.textPrimary },
  candidateInputBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.sm },
  candidateInputBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff' },
  candidateInputCancel: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appointBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.md },
  appointBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff' },
  officeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  officeCard: { flex: 1, minWidth: '45%', alignItems: 'center', gap: 4, backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.sm },
  officeLevelLabel: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textSecondary, textAlign: 'center' },
  officeCost: { fontSize: 9, color: Colors.textMuted, textAlign: 'center' },
  officeUpgradeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  officeUpgradeBadgeText: { fontSize: 8, color: Colors.success, fontWeight: FontWeight.bold },
  issueCard: { backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.sm, gap: Spacing.sm },
  issueCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  issueIconBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  issueTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 17 },
  issueMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  urgencyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  urgencyText: { fontSize: 8, fontWeight: FontWeight.extrabold },
  issueImpactText: { fontSize: 9, color: Colors.success, fontWeight: FontWeight.bold },
  issueDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
  respondedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.success + '0D', borderRadius: Radius.sm, padding: 6 },
  respondedText: { fontSize: FontSize.xs, color: Colors.success },
  issueResponses: { flexDirection: 'row', gap: 8 },
  issueResponseBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radius.sm, backgroundColor: Colors.primary + '22', borderWidth: 1, borderColor: Colors.primary + '44' },
  issueResponseBtnSecondary: { backgroundColor: Colors.surfaceElevated, borderColor: Colors.surfaceBorder },
  issueResponseBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, textAlign: 'center' },
});
